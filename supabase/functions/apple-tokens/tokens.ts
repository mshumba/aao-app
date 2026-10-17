// What the apple-tokens function does, apart from HTTP and the database:
// keeping an account's Apple refresh token, revoking it before the account is
// deleted, and retrying tokens that couldn't be revoked at the time. The
// database and Apple come in as stand-ins, so the order of every step is
// tested in Node (tests/apple-tokens.spec.ts).

import type { Exchanged } from "./apple.ts";

/** A row of public.apple_tokens, as the function reads it. */
export type TokenRow = { id: number; client_id: string; refresh_token: string };

/** public.apple_tokens, reached with the service role. */
export type Store = {
  /** The account's stored token, if it has one. */
  find(userId: string): Promise<TokenRow | null>;
  /**
   * Keeps the newest token for the account, in place of any earlier one.
   * False when the account no longer exists.
   */
  save(userId: string, clientId: string, refreshToken: string): Promise<boolean>;
  /** Forgets a token Apple has revoked, unless the row has since been given a newer one. */
  remove(id: number, refreshToken: string): Promise<void>;
  /** Records a failed revocation (apple_tokens_failed): why, and when to try again. */
  failed(id: number, reason: string): Promise<void>;
  /**
   * Keeps a token whose account is already gone, as a first failed try, so
   * `sweep` revokes it like the tokens deleted accounts leave.
   */
  orphan(clientId: string, refreshToken: string, reason: string): Promise<void>;
  /** Up to `max` tokens of deleted accounts that are due another try (apple_tokens_due). */
  due(max: number): Promise<TokenRow[]>;
  /** The Apple user IDs linked to the account, or null when the account no longer exists. */
  appleSubs(userId: string): Promise<string[] | null>;
};

/** Apple's REST API with the owner's key (apple.ts appleClient), or null when the secrets aren't set. */
export type Apple = {
  /** The client ID new tokens are issued to. */
  clientId: string;
  exchange(code: string): Promise<Exchanged>;
  revoke(clientId: string, refreshToken: string): Promise<void>;
};

/** Apple's error code, or ours, for a failure; never a token. */
function reasonFor(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" && code ? code : "error";
}

export type StoreError =
  | "invalid_code"
  | "identity_mismatch"
  | "account_gone"
  | "apple_unavailable"
  | "not_configured";
export type StoreResult = { ok: true } | { ok: false; error: StoreError; reason?: string };

/**
 * After a native Sign in with Apple: swaps the authorization code for a
 * refresh token, checks the token belongs to an Apple ID linked to this
 * account, and keeps it. A code for anyone else's Apple ID is refused and
 * nothing is kept. If the account was deleted while the code was on its way
 * (deleting straight after signing in), the new token is revoked at once, or
 * kept without an account for `sweep` when Apple can't be reached.
 */
export async function storeCode(apple: Apple | null, store: Store, userId: string, code: string): Promise<StoreResult> {
  if (!apple) return { ok: false, error: "not_configured" };
  let exchanged: Exchanged;
  try {
    exchanged = await apple.exchange(code);
  } catch (error) {
    const reason = reasonFor(error);
    // invalid_grant: the code was used already, expired (after five
    // minutes) or was issued to another app.
    return { ok: false, error: reason === "invalid_grant" ? "invalid_code" : "apple_unavailable", reason };
  }
  const subs = await store.appleSubs(userId);
  if (subs && !subs.includes(exchanged.sub)) return { ok: false, error: "identity_mismatch" };
  if (subs && (await store.save(userId, apple.clientId, exchanged.refreshToken))) return { ok: true };
  // The account is gone, so nothing would revoke this token later.
  const reason = await apple.revoke(apple.clientId, exchanged.refreshToken).then(
    () => "revoked",
    reasonFor,
  );
  if (reason === "revoked") return { ok: false, error: "account_gone", reason };
  // Kept for the sweep; if even that fails, say so, since the token is then
  // neither revoked nor kept.
  const kept = await store.orphan(apple.clientId, exchanged.refreshToken, reason).then(() => true, () => false);
  return { ok: false, error: "account_gone", reason: kept ? reason : `${reason}, not kept` };
}

/**
 * Revokes one token with Apple, then forgets it. Null when Apple confirmed;
 * otherwise the row stays, with the reason and a later time to try again,
 * and the reason is returned.
 */
async function revokeRow(apple: Apple | null, store: Store, row: TokenRow): Promise<string | null> {
  let reason: string | null = null;
  if (!apple) {
    reason = "not_configured";
  } else {
    try {
      await apple.revoke(row.client_id, row.refresh_token);
    } catch (error) {
      reason = reasonFor(error);
    }
  }
  if (reason) {
    await store.failed(row.id, reason);
    return reason;
  }
  await store.remove(row.id, row.refresh_token);
  return null;
}

export type RevokeResult =
  /** Nothing was stored for the account: it never signed in with Apple on iPhone since tokens were kept. */
  | { revoked: false; stored: false }
  /** Apple revoked the token and it's forgotten. */
  | { revoked: true; stored: true }
  /** Apple couldn't be reached or refused. The token is kept and tried again after the account is gone. */
  | { revoked: false; stored: true; retry: true; reason: string };

/**
 * Before the account is deleted (the app calls this, then delete_account()):
 * revokes the account's Apple token, then forgets it. Never stands in the
 * deletion's way. A token that can't be revoked now stays behind when the
 * account goes (apple_tokens.user_id becomes null) and `sweep` retries it.
 */
export async function revokeForDeletion(apple: Apple | null, store: Store, userId: string): Promise<RevokeResult> {
  const row = await store.find(userId);
  if (!row) return { revoked: false, stored: false };
  const reason = await revokeRow(apple, store, row);
  return reason ? { revoked: false, stored: true, retry: true, reason } : { revoked: true, stored: true };
}

/**
 * Retries tokens left by deleted accounts. Each try that fails waits longer
 * before the next (apple_tokens_failed). Without Apple's secrets nothing is
 * claimed, so the rows wait for them.
 */
export async function sweep(
  apple: Apple | null,
  store: Store,
  max: number,
): Promise<{ tried: number; revoked: number; reasons: string[] }> {
  if (!apple) return { tried: 0, revoked: 0, reasons: [] };
  const rows = await store.due(max);
  const reasons = await Promise.all(rows.map((row) => revokeRow(apple, store, row).catch(reasonFor)));
  const failed = reasons.filter((reason): reason is string => reason !== null);
  return { tried: rows.length, revoked: rows.length - failed.length, reasons: [...new Set(failed)] };
}
