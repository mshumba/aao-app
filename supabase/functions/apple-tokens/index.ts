// POST /functions/v1/apple-tokens
//   {"action": "store", "code": "<authorization code>"} -> {"stored": true}
//   {"action": "revoke"}                                -> {"revoked": true, "stored": true}
//                                                          {"revoked": false, "stored": false}
//                                                          {"revoked": false, "stored": true, "retry": true}
//   {"action": "sweep"}                                 -> {"ok": true}
//
// Sign in with Apple token revocation (App Store guideline 5.1.1(v)). After a
// native sign-in the app sends Apple's one-time authorization code ("store");
// this function swaps it for a refresh token (https://appleid.apple.com/auth/token)
// and keeps that in public.apple_tokens, which only the service role can
// read. Before deleting the account the app asks for "revoke": the token is
// revoked (https://appleid.apple.com/auth/revoke) and its row deleted, and
// then the app calls delete_account(). If Apple can't be reached, the row is
// kept, outlives the account (user_id becomes null) and is retried with a
// back-off: a few along with every "store" and "revoke", and on "sweep",
// which a pg_cron job can call. "store" and "revoke" need the viewer's
// session; "sweep" only retries what is already due, so it needs nothing
// more than the publishable key.
//
// Secrets: APPLE_SIGNIN_KEY_P8, APPLE_SIGNIN_KEY_ID, APPLE_TEAM_ID and
// APPLE_CLIENT_ID (docs/development/apple-token-revocation.md). Codes,
// tokens, secrets and user ids are never logged.

import { callerKey, userId } from "../_shared/auth.ts";
import { admin, dbTimeout, rateLimit, type RateResult, withRetry } from "../_shared/db.ts";
import { gate, json, later, readJson } from "../_shared/http.ts";
import { appleClient, readConfig } from "./apple.ts";
import { revokeForDeletion, type Store, storeCode, type StoreError, sweep } from "./tokens.ts";

const RATE_MAX = 10;
const RATE_WINDOW_S = 600;
/** "sweep" calls an hour, per caller and in all. The hourly pg_cron job needs one. */
const SWEEP_RATE_MAX = 6;
const SWEEP_GLOBAL_MAX = 60;
/** Tokens of deleted accounts retried alongside each call, and on "sweep". */
const SWEEP_ALONG = 3;
const SWEEP_MAX = 20;

const setup = readConfig((name) => Deno.env.get(name));
const apple = "config" in setup ? appleClient(setup.config) : null;
if ("missing" in setup) {
  console.error(JSON.stringify({ fn: "apple-tokens", not_configured: setup.missing }));
}

function dbError(what: string, error: { code?: string; message?: string }): Error {
  return new Error(`${what}: ${error.code ?? error.message}`);
}

const store: Store = {
  async find(userId) {
    const { data, error } = await withRetry(() =>
      admin()
        .from("apple_tokens")
        .select("id,client_id,refresh_token")
        .eq("user_id", userId)
        .abortSignal(dbTimeout(4000))
        .maybeSingle()
    );
    if (error) throw dbError("apple_tokens", error);
    return data;
  },
  async save(userId, clientId, refreshToken) {
    const row = {
      user_id: userId,
      client_id: clientId,
      refresh_token: refreshToken,
      attempts: 0,
      last_error: null,
      next_attempt_at: null,
    };
    const { error } = await withRetry(() =>
      admin().from("apple_tokens").upsert(row, { onConflict: "user_id" }).abortSignal(dbTimeout(4000))
    );
    // foreign_key_violation: the account was deleted meanwhile.
    if (error?.code === "23503") return false;
    if (error) throw dbError("apple_tokens", error);
    return true;
  },
  async remove(id, refreshToken) {
    const { error } = await withRetry(() =>
      admin()
        .from("apple_tokens")
        .delete()
        .eq("id", id)
        .eq("refresh_token", refreshToken)
        .abortSignal(dbTimeout(4000))
    );
    if (error) throw dbError("apple_tokens", error);
  },
  async failed(id, reason) {
    const { error } = await admin()
      .rpc("apple_tokens_failed", { row_id: id, reason })
      .abortSignal(dbTimeout(4000));
    if (error) throw dbError("apple_tokens_failed", error);
  },
  async due(max) {
    const { data, error } = await admin()
      .rpc("apple_tokens_due", { max_rows: max })
      .abortSignal(dbTimeout(4000));
    if (error) throw dbError("apple_tokens_due", error);
    return data ?? [];
  },
  async appleSubs(userId) {
    const { data, error } = await admin().auth.admin.getUserById(userId);
    if (error?.status === 404 || error?.code === "user_not_found") return null;
    if (error) throw new Error(`auth user: ${error.code ?? error.status ?? error.message}`);
    if (!data.user) return null;
    return (data.user.identities ?? [])
      .filter((identity) => identity.provider === "apple")
      .flatMap((identity) => [identity.id, identity.identity_data?.sub])
      .filter((sub): sub is string => typeof sub === "string" && sub !== "");
  },
};

const STORE_STATUS: Record<StoreError, number> = {
  invalid_code: 400,
  identity_mismatch: 403,
  account_gone: 410,
  apple_unavailable: 502,
  not_configured: 503,
};

Deno.serve(async (req) => {
  const t0 = performance.now();
  const blocked = gate(req);
  if (blocked) return blocked;

  const body = await readJson(req, 4096);
  const action = body?.action;
  const log: Record<string, unknown> = { fn: "apple-tokens", action: typeof action === "string" ? action : null };
  const answer = (status: number, out: unknown, extra?: Record<string, string>) => {
    log.status = status;
    log.ms = Math.round(performance.now() - t0);
    (status >= 500 || log.error ? console.error : console.log)(JSON.stringify(log));
    return json(req, status, out, extra);
  };
  const limited = (rate: Extract<RateResult, { ok: false }>) =>
    answer(429, { error: "rate_limited", retryAfter: rate.retryAfter }, { "Retry-After": String(rate.retryAfter) });

  try {
    if (action === "sweep") {
      // Anyone with the publishable key may ask, so it's limited, and the
      // answer says nothing about what was pending; the log does.
      const rate = await rateLimit([
        { key: await callerKey(req, "apple-tokens-sweep"), max: SWEEP_RATE_MAX, windowSeconds: 3600 },
        { key: "apple-tokens-sweep:all", max: SWEEP_GLOBAL_MAX, windowSeconds: 3600 },
      ]);
      if (!rate.ok) return limited(rate);
      const { tried, revoked, reasons } = await sweep(apple, store, SWEEP_MAX);
      Object.assign(log, { tried, revoked, reasons });
      return answer(200, { ok: true });
    }
    if (action !== "store" && action !== "revoke") return answer(400, { error: "bad_request" });
    const code = body?.code;
    if (action === "store" && (typeof code !== "string" || !/^[\x21-\x7e]{1,1024}$/.test(code))) {
      return answer(400, { error: "bad_request" });
    }

    const uid = await userId(req);
    if (!uid) return answer(401, { error: "unauthorized" });
    const rate = await rateLimit([{ key: `apple-tokens:u:${uid}`, max: RATE_MAX, windowSeconds: RATE_WINDOW_S }]);
    if (!rate.ok) return limited(rate);

    // Tokens of deleted accounts that are due another try go along with every call.
    later(
      sweep(apple, store, SWEEP_ALONG).then(({ tried, revoked, reasons }) => {
        if (tried) console.log(JSON.stringify({ fn: "apple-tokens", action: "sweep", tried, revoked, reasons }));
      }),
    );

    if (action === "store") {
      const result = await storeCode(apple, store, uid, code as string);
      if (result.ok) return answer(200, { stored: true });
      log.error = result.error === "account_gone" ? `account_gone: ${result.reason}` : result.reason ?? result.error;
      return answer(STORE_STATUS[result.error], { error: result.error });
    }

    const result = await revokeForDeletion(apple, store, uid);
    Object.assign(log, { stored: result.stored, revoked: result.revoked });
    if ("reason" in result) {
      // The deletion goes ahead; the token is retried once the account is gone.
      log.error = result.reason;
      return answer(200, { revoked: false, stored: true, retry: true });
    }
    return answer(200, result);
  } catch (error) {
    log.error = String((error as Error)?.message ?? error);
    return answer(503, { error: "unavailable" });
  }
});
