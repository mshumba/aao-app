import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  deleteInOrder,
  linkedToApple,
  revokeAppleTokens,
  sendAppleCode,
} from "../src/auth/appleTokens";
import {
  AppleError,
  REVOKE_URL,
  TOKEN_URL,
  appleClient,
  clientSecret,
  exchangeCode,
  jwtClaims,
  readConfig,
  revokeToken,
  type AppleConfig,
} from "../supabase/functions/apple-tokens/apple";
import {
  revokeForDeletion,
  storeCode,
  sweep,
  type Apple,
  type Store,
  type TokenRow,
} from "../supabase/functions/apple-tokens/tokens";

// Sign in with Apple token revocation (docs/development/apple-token-revocation.md):
// the apple-tokens Edge Function's Apple calls and the order of its steps,
// and the app's half (src/auth/appleTokens.ts), run in Node with stand-ins
// for Apple, the database and the function. Nothing here reaches Apple or
// Supabase, and every key is made by the test.

const TEAM_ID = "5NCVJZM8RL";
const KEY_ID = "ABC123DEFG";
const BUNDLE_ID = "com.mshumba.aao";
const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);

function base64(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function fromBase64url(part: string) {
  const padded = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

/** A Sign in with Apple key as Apple hands it out: a .p8 file (PKCS #8 PEM). */
async function appleKey() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const body = base64(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
  return { pem, body, publicKey: pair.publicKey };
}

async function setup() {
  const key = await appleKey();
  const config: AppleConfig = { keyP8: key.pem, keyId: KEY_ID, teamId: TEAM_ID, clientId: BUNDLE_ID };
  return { key, config };
}

/** The client secret's header and claims, after checking its signature with the key's public half. */
async function openSecret(secret: string, publicKey: CryptoKey) {
  const [header, payload, signature] = secret.split(".");
  const signatureBytes = fromBase64url(signature);
  expect(signatureBytes.length, "ES256 signatures are r and s side by side").toBe(64);
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    signatureBytes,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  expect(valid, "signed with the Sign in with Apple key").toBe(true);
  return {
    header: JSON.parse(new TextDecoder().decode(fromBase64url(header))),
    claims: jwtClaims(secret)!,
  };
}

/** An unsigned JWT with these claims, standing in for Apple's ID token. */
function idToken(claims: Record<string, unknown>) {
  const part = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, "");
  return `${part({ alg: "RS256", kid: "apple" })}.${part(claims)}.c2lnbmF0dXJl`;
}

type Sent = { url: string; method?: string; headers: Headers; form: Record<string, string> };

/** A stand-in for Apple's servers that records each request and answers with `answer`. */
function fakeApple(answer: (sent: Sent) => Response | Promise<Response>) {
  const sent: Sent[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request: Sent = {
      url: String(input),
      method: init?.method,
      headers: new Headers(init?.headers),
      form: Object.fromEntries(new URLSearchParams(String(init?.body ?? ""))),
    };
    sent.push(request);
    return answer(request);
  }) as typeof globalThis.fetch;
  return { sent, fetch };
}

const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

test.describe("Apple's client secret", () => {
  test("is an ES256 JWT with the claims Apple lists, signed with the owner's key", async () => {
    const { key, config } = await setup();
    const secret = await clientSecret(config, BUNDLE_ID, NOW);
    const { header, claims } = await openSecret(secret, key.publicKey);
    expect(header).toEqual({ alg: "ES256", kid: KEY_ID });
    const iat = Math.floor(NOW / 1000);
    expect(claims).toEqual({
      iss: TEAM_ID,
      iat,
      exp: iat + 300,
      aud: "https://appleid.apple.com",
      sub: BUNDLE_ID,
    });
    // Apple refuses a secret that expires more than six months ahead.
    expect((claims.exp as number) - iat).toBeLessThanOrEqual(15_777_000);
  });

  test("names the client the request is for", async () => {
    const { key, config } = await setup();
    const secret = await clientSecret(config, "com.mshumba.aao.web", NOW);
    expect((await openSecret(secret, key.publicKey)).claims.sub).toBe("com.mshumba.aao.web");
  });

  test("reads the .p8 key as the file is, with \\n escapes, or as its base64 body alone", async () => {
    const { key, config } = await setup();
    for (const keyP8 of [key.pem, key.pem.replace(/\n/g, "\\n"), key.body]) {
      const secret = await clientSecret({ ...config, keyP8 }, BUNDLE_ID, NOW);
      await openSecret(secret, key.publicKey);
    }
  });

  test("a key that isn't one fails as invalid_key, without quoting it", async () => {
    const { config } = await setup();
    const keyP8 = "-----BEGIN PRIVATE KEY-----\nbm90IGEga2V5IGF0IGFsbA==\n-----END PRIVATE KEY-----";
    const error = await clientSecret({ ...config, keyP8 }, BUNDLE_ID, NOW).catch((e) => e);
    expect(error).toBeInstanceOf(AppleError);
    expect((error as AppleError).code).toBe("invalid_key");
    expect(String(error.message)).not.toContain("bm90");
  });

  test("the secrets are read by name, and missing or malformed ones are named but never shown", async () => {
    const { key } = await setup();
    const env: Record<string, string> = {
      APPLE_SIGNIN_KEY_P8: key.pem,
      APPLE_SIGNIN_KEY_ID: ` ${KEY_ID}\n`,
      APPLE_TEAM_ID: TEAM_ID,
      APPLE_CLIENT_ID: BUNDLE_ID,
    };
    expect(readConfig((name) => env[name])).toEqual({
      config: { keyP8: key.pem.trim(), keyId: KEY_ID, teamId: TEAM_ID, clientId: BUNDLE_ID },
    });
    const broken: Record<string, string> = { ...env, APPLE_TEAM_ID: "team", APPLE_CLIENT_ID: "" };
    delete broken.APPLE_SIGNIN_KEY_P8;
    const result = readConfig((name) => broken[name]);
    expect(result).toEqual({ missing: ["APPLE_SIGNIN_KEY_P8", "APPLE_TEAM_ID", "APPLE_CLIENT_ID"] });
  });
});

test.describe("Apple's REST calls", () => {
  test("swapping a code posts Apple's form to /auth/token and returns the refresh token", async () => {
    const { key, config } = await setup();
    const apple = fakeApple(() =>
      reply(200, {
        access_token: "access",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "refresh-1",
        id_token: idToken({ iss: "https://appleid.apple.com", aud: BUNDLE_ID, sub: "001234.apple" }),
      }),
    );
    const result = await exchangeCode(config, "code-1", { fetch: apple.fetch, now: () => NOW });
    expect(result).toEqual({ refreshToken: "refresh-1", sub: "001234.apple" });

    expect(apple.sent).toHaveLength(1);
    const [request] = apple.sent;
    expect(request.url).toBe(TOKEN_URL);
    expect(request.url).toBe("https://appleid.apple.com/auth/token");
    expect(request.method).toBe("POST");
    expect(request.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    // Native sign-in sent no redirect_uri, so the swap mustn't either.
    expect(Object.keys(request.form).sort()).toEqual(["client_id", "client_secret", "code", "grant_type"]);
    expect(request.form).toMatchObject({ client_id: BUNDLE_ID, code: "code-1", grant_type: "authorization_code" });
    const { claims } = await openSecret(request.form.client_secret, key.publicKey);
    expect(claims.sub).toBe(BUNDLE_ID);
  });

  test("a refused code, a token for another app or a broken answer is an error with Apple's code", async () => {
    const { config } = await setup();
    const fails = async (answer: () => Response | Promise<Response>, timeoutMs?: number) => {
      const apple = fakeApple(answer);
      const error = await exchangeCode(config, "code-1", { fetch: apple.fetch, now: () => NOW, timeoutMs }).catch(
        (e) => e,
      );
      expect(error).toBeInstanceOf(AppleError);
      return { code: (error as AppleError).code, status: (error as AppleError).status };
    };
    const good = { iss: "https://appleid.apple.com", aud: BUNDLE_ID, sub: "001234.apple" };

    expect(await fails(() => reply(400, { error: "invalid_grant" }))).toEqual({ code: "invalid_grant", status: 400 });
    expect(await fails(() => reply(401, { error: "invalid_client" }))).toEqual({ code: "invalid_client", status: 401 });
    expect(
      await fails(() => new Response("<html>Service Unavailable</html>", { status: 503 })),
    ).toEqual({ code: "http_503", status: 503 });
    expect(
      (await fails(() => reply(200, { refresh_token: "r", id_token: idToken({ ...good, aud: "com.other.app" }) })))
        .code,
    ).toBe("bad_response");
    expect(
      (await fails(() => reply(200, { refresh_token: "r", id_token: idToken({ ...good, iss: "https://evil" }) })))
        .code,
    ).toBe("bad_response");
    expect((await fails(() => reply(200, { id_token: idToken(good) }))).code).toBe("bad_response");
    expect(
      (
        await fails(() => {
          throw new TypeError("fetch failed");
        })
      ).code,
    ).toBe("network");
  });

  test("Apple taking too long is a timeout", async () => {
    const { config } = await setup();
    const slow = (async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      })) as typeof fetch;
    const started = Date.now();
    const error = await revokeToken(config, BUNDLE_ID, "refresh-1", { fetch: slow, timeoutMs: 50 }).catch((e) => e);
    expect((error as AppleError).code).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test("revoking posts the refresh token to /auth/revoke as the client it was issued to", async () => {
    const { key, config } = await setup();
    const apple = fakeApple(() => new Response(null, { status: 200 }));
    await revokeToken(config, "com.mshumba.aao.web", "refresh-1", { fetch: apple.fetch, now: () => NOW });

    const [request] = apple.sent;
    expect(request.url).toBe(REVOKE_URL);
    expect(request.url).toBe("https://appleid.apple.com/auth/revoke");
    expect(request.method).toBe("POST");
    expect(request.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(Object.keys(request.form).sort()).toEqual(["client_id", "client_secret", "token", "token_type_hint"]);
    expect(request.form).toMatchObject({
      client_id: "com.mshumba.aao.web",
      token: "refresh-1",
      token_type_hint: "refresh_token",
    });
    const { claims } = await openSecret(request.form.client_secret, key.publicKey);
    expect(claims).toMatchObject({ iss: TEAM_ID, sub: "com.mshumba.aao.web", aud: "https://appleid.apple.com" });

    const refused = fakeApple(() => reply(400, { error: "invalid_client" }));
    const error = await revokeToken(config, BUNDLE_ID, "refresh-1", { fetch: refused.fetch }).catch((e) => e);
    expect((error as AppleError).code).toBe("invalid_client");
  });

  test("appleClient issues new tokens to APPLE_CLIENT_ID and revokes with the row's client", async () => {
    const { key, config } = await setup();
    const apple = fakeApple(() => new Response(null, { status: 200 }));
    const client = appleClient(config, { fetch: apple.fetch, now: () => NOW });
    expect(client.clientId).toBe(BUNDLE_ID);
    await client.revoke("com.mshumba.aao.web", "refresh-1");
    expect(apple.sent[0].form.client_id).toBe("com.mshumba.aao.web");
    expect((await openSecret(apple.sent[0].form.client_secret, key.publicKey)).claims.sub).toBe(
      "com.mshumba.aao.web",
    );
  });
});

/** public.apple_tokens and Apple, as stand-ins that write down every step in order. */
function standIns(options: {
  row?: TokenRow | null;
  due?: TokenRow[];
  /** The account's Apple IDs; null once the account is gone. */
  subs?: string[] | null;
  /** What saving answers: false once the account is gone. */
  saved?: boolean;
  exchange?: () => Promise<{ refreshToken: string; sub: string }>;
  revoke?: (clientId: string, token: string) => Promise<void>;
}) {
  const steps: string[] = [];
  const store: Store = {
    async find(userId) {
      steps.push(`find ${userId}`);
      return options.row ?? null;
    },
    async save(userId, clientId, refreshToken) {
      steps.push(`save ${userId} ${clientId} ${refreshToken}`);
      return options.saved ?? true;
    },
    async remove(id, refreshToken) {
      steps.push(`remove ${id} ${refreshToken}`);
    },
    async failed(id, reason) {
      steps.push(`failed ${id} ${reason}`);
    },
    async due(max) {
      steps.push(`due ${max}`);
      return options.due ?? [];
    },
    async appleSubs(userId) {
      steps.push(`appleSubs ${userId}`);
      return options.subs === undefined ? ["001234.apple"] : options.subs;
    },
  };
  const apple: Apple = {
    clientId: BUNDLE_ID,
    async exchange(code) {
      steps.push(`exchange ${code}`);
      return options.exchange ? options.exchange() : { refreshToken: "refresh-new", sub: "001234.apple" };
    },
    async revoke(clientId, token) {
      steps.push(`revoke ${clientId} ${token}`);
      if (options.revoke) await options.revoke(clientId, token);
    },
  };
  return { steps, store, apple };
}

const ROW: TokenRow = { id: 7, client_id: BUNDLE_ID, refresh_token: "refresh-1" };

test.describe("the apple-tokens function", () => {
  test("store: swaps the code, checks the Apple ID is the account's, then keeps the token", async () => {
    const { steps, store, apple } = standIns({});
    expect(await storeCode(apple, store, "user-1", "code-1")).toEqual({ ok: true });
    expect(steps).toEqual([
      "exchange code-1",
      "appleSubs user-1",
      `save user-1 ${BUNDLE_ID} refresh-new`,
    ]);
  });

  test("store: another Apple ID's code, a spent code or missing secrets keep nothing", async () => {
    const other = standIns({ subs: ["000999.someone-else"] });
    expect(await storeCode(other.apple, other.store, "user-1", "code-1")).toEqual({
      ok: false,
      error: "identity_mismatch",
    });
    expect(other.steps.some((step) => step.startsWith("save"))).toBe(false);

    const spent = standIns({ exchange: () => Promise.reject(new AppleError("invalid_grant", 400)) });
    expect(await storeCode(spent.apple, spent.store, "user-1", "code-1")).toEqual({
      ok: false,
      error: "invalid_code",
      reason: "invalid_grant",
    });
    expect(spent.steps).toEqual(["exchange code-1"]);

    const down = standIns({ exchange: () => Promise.reject(new AppleError("timeout")) });
    expect(await storeCode(down.apple, down.store, "user-1", "code-1")).toMatchObject({
      ok: false,
      error: "apple_unavailable",
      reason: "timeout",
    });

    const unset = standIns({});
    expect(await storeCode(null, unset.store, "user-1", "code-1")).toEqual({ ok: false, error: "not_configured" });
    expect(unset.steps).toEqual([]);
  });

  test("store: an account deleted while its code was on the way gets the new token revoked at once", async () => {
    // Gone before the Apple IDs were looked up.
    const before = standIns({ subs: null });
    expect(await storeCode(before.apple, before.store, "user-1", "code-1")).toEqual({
      ok: false,
      error: "account_gone",
      reason: "revoked",
    });
    expect(before.steps).toEqual(["exchange code-1", "appleSubs user-1", `revoke ${BUNDLE_ID} refresh-new`]);

    // Gone between the look-up and saving (the row's foreign key refused it).
    const between = standIns({ saved: false });
    expect(await storeCode(between.apple, between.store, "user-1", "code-1")).toMatchObject({
      error: "account_gone",
    });
    expect(between.steps).toEqual([
      "exchange code-1",
      "appleSubs user-1",
      `save user-1 ${BUNDLE_ID} refresh-new`,
      `revoke ${BUNDLE_ID} refresh-new`,
    ]);

    const down = standIns({ subs: null, revoke: () => Promise.reject(new AppleError("timeout")) });
    expect(await storeCode(down.apple, down.store, "user-1", "code-1")).toEqual({
      ok: false,
      error: "account_gone",
      reason: "timeout",
    });
  });

  test("revoke: Apple revokes the token before its row is deleted", async () => {
    const { steps, store, apple } = standIns({ row: ROW });
    expect(await revokeForDeletion(apple, store, "user-1")).toEqual({ revoked: true, stored: true });
    expect(steps).toEqual(["find user-1", `revoke ${BUNDLE_ID} refresh-1`, "remove 7 refresh-1"]);
  });

  test("revoke: an account that never stored a token is a quick no, without Apple", async () => {
    const { steps, store, apple } = standIns({ row: null });
    expect(await revokeForDeletion(apple, store, "user-1")).toEqual({ revoked: false, stored: false });
    expect(steps).toEqual(["find user-1"]);
    // The same with Apple's secrets unset.
    expect(await revokeForDeletion(null, store, "user-1")).toEqual({ revoked: false, stored: false });
  });

  test("revoke: when Apple can't be reached the token is kept for a retry and the deletion goes on", async () => {
    const down = standIns({ row: ROW, revoke: () => Promise.reject(new AppleError("timeout")) });
    expect(await revokeForDeletion(down.apple, down.store, "user-1")).toEqual({
      revoked: false,
      stored: true,
      retry: true,
      reason: "timeout",
    });
    expect(down.steps).toEqual(["find user-1", `revoke ${BUNDLE_ID} refresh-1`, "failed 7 timeout"]);

    const refused = standIns({ row: ROW, revoke: () => Promise.reject(new AppleError("invalid_client", 400)) });
    expect(await revokeForDeletion(refused.apple, refused.store, "user-1")).toMatchObject({ reason: "invalid_client" });
    expect(refused.steps.at(-1)).toBe("failed 7 invalid_client");

    const unset = standIns({ row: ROW });
    expect(await revokeForDeletion(null, unset.store, "user-1")).toMatchObject({ retry: true, reason: "not_configured" });
    expect(unset.steps).toEqual(["find user-1", "failed 7 not_configured"]);
  });

  test("sweep: retries the tokens deleted accounts left, forgetting each Apple confirms", async () => {
    const rows: TokenRow[] = [
      { id: 1, client_id: BUNDLE_ID, refresh_token: "refresh-a" },
      { id: 2, client_id: BUNDLE_ID, refresh_token: "refresh-b" },
      { id: 3, client_id: "com.mshumba.aao.web", refresh_token: "refresh-c" },
    ];
    const { steps, store, apple } = standIns({
      due: rows,
      revoke: async (_client, token) => {
        if (token === "refresh-b") throw new AppleError("http_503", 503);
      },
    });
    expect(await sweep(apple, store, 20)).toEqual({ tried: 3, revoked: 2, reasons: ["http_503"] });
    expect(steps[0]).toBe("due 20");
    expect(steps.slice(1).sort()).toEqual(
      [
        `revoke ${BUNDLE_ID} refresh-a`,
        "remove 1 refresh-a",
        `revoke ${BUNDLE_ID} refresh-b`,
        "failed 2 http_503",
        "revoke com.mshumba.aao.web refresh-c",
        "remove 3 refresh-c",
      ].sort(),
    );
    // Each row is removed only after its own revocation.
    for (const id of [1, 3]) {
      const token = rows.find((row) => row.id === id)!.refresh_token;
      expect(steps.indexOf(`revoke ${rows.find((row) => row.id === id)!.client_id} ${token}`)).toBeLessThan(
        steps.indexOf(`remove ${id} ${token}`),
      );
    }
  });

  test("sweep: without Apple's secrets nothing is claimed", async () => {
    const { steps, store } = standIns({ due: [ROW] });
    expect(await sweep(null, store, 20)).toEqual({ tried: 0, revoked: 0, reasons: [] });
    expect(steps).toEqual([]);
  });
});

type Invoked = { url: string; headers: Headers; body: unknown };

/** The app's Supabase client, with a stand-in server for its Edge Functions. */
function appClient(answer: (sent: Invoked, signal?: AbortSignal | null) => Promise<Response>) {
  const sent: Invoked[] = [];
  const client = createClient("https://example.supabase.co", "sb_publishable_test", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = {
          url: String(input),
          headers: new Headers(init?.headers),
          body: init?.body ? JSON.parse(String(init.body)) : null,
        };
        sent.push(request);
        return answer(request, init?.signal);
      }) as typeof fetch,
    },
  });
  return { sent, functions: client.functions };
}

test.describe("the app's half", () => {
  test("after signing in, the authorization code goes once to apple-tokens", async () => {
    const app = appClient(async () => reply(200, { stored: true }));
    expect(await sendAppleCode(app.functions, "code-1")).toBe(true);
    expect(app.sent).toHaveLength(1);
    expect(app.sent[0].url).toBe("https://example.supabase.co/functions/v1/apple-tokens");
    expect(app.sent[0].body).toEqual({ action: "store", code: "code-1" });
    expect(app.sent[0].headers.get("apikey")).toBe("sb_publishable_test");

    // No code (Apple gave none), nothing sent.
    expect(await sendAppleCode(app.functions, null)).toBe(false);
    expect(app.sent).toHaveLength(1);
  });

  test("a code that can't be kept never fails the sign-in", async () => {
    const refused = appClient(async () => reply(503, { error: "not_configured" }));
    expect(await sendAppleCode(refused.functions, "code-1")).toBe(false);
    const offline = appClient(async () => {
      throw new TypeError("Network request failed");
    });
    expect(await sendAppleCode(offline.functions, "code-1")).toBe(false);
  });

  test("revoking asks apple-tokens and says whether Apple confirmed", async () => {
    const confirmed = appClient(async () => reply(200, { revoked: true, stored: true }));
    expect(await revokeAppleTokens(confirmed.functions)).toBe(true);
    expect(confirmed.sent[0].body).toEqual({ action: "revoke" });
    expect(confirmed.sent[0].url).toBe("https://example.supabase.co/functions/v1/apple-tokens");

    const none = appClient(async () => reply(200, { revoked: false, stored: false }));
    expect(await revokeAppleTokens(none.functions)).toBe(false);
    const retry = appClient(async () => reply(200, { revoked: false, stored: true, retry: true }));
    expect(await revokeAppleTokens(retry.functions)).toBe(false);
    const missing = appClient(async () => reply(404, { code: "NOT_FOUND" }));
    expect(await revokeAppleTokens(missing.functions)).toBe(false);
  });

  test("revoking gives up at its deadline", async () => {
    const hanging = appClient(
      (_sent, signal) =>
        new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason ?? new Error("aborted")));
        }),
    );
    const started = Date.now();
    expect(await revokeAppleTokens(hanging.functions, 100)).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test("deleting revokes Apple's token first, then deletes the account", async () => {
    const steps: string[] = [];
    await deleteInOrder({
      revokeApple: async () => {
        steps.push("revoke started");
        await new Promise((resolve) => setTimeout(resolve, 20));
        steps.push("revoke done");
      },
      deleteAccount: async () => {
        steps.push("delete_account");
      },
    });
    expect(steps).toEqual(["revoke started", "revoke done", "delete_account"]);
  });

  test("deleting straight after signing in waits for the code on its way, then revokes", async () => {
    const steps: string[] = [];
    let arrive: () => void = () => {};
    const storing = new Promise<boolean>((resolve) => {
      arrive = () => {
        steps.push("code stored");
        resolve(true);
      };
    });
    setTimeout(() => arrive(), 30);
    await deleteInOrder({
      storing,
      revokeApple: async () => {
        steps.push("revoke");
      },
      deleteAccount: async () => {
        steps.push("delete_account");
      },
    });
    expect(steps).toEqual(["code stored", "revoke", "delete_account"]);

    // A code that never arrives holds the deletion up only so long.
    steps.length = 0;
    const started = Date.now();
    await deleteInOrder({
      storing: new Promise(() => {}),
      waitMs: 50,
      revokeApple: async () => {
        steps.push("revoke");
      },
      deleteAccount: async () => {
        steps.push("delete_account");
      },
    });
    expect(steps).toEqual(["revoke", "delete_account"]);
    expect(Date.now() - started).toBeLessThan(2000);

    // A code that failed to send doesn't stop it either.
    steps.length = 0;
    await deleteInOrder({
      storing: Promise.reject(new Error("offline")),
      revokeApple: async () => {
        steps.push("revoke");
      },
      deleteAccount: async () => {
        steps.push("delete_account");
      },
    });
    expect(steps).toEqual(["revoke", "delete_account"]);
  });

  test("the account is deleted even when revoking fails, and without it when there's no Apple ID", async () => {
    const steps: string[] = [];
    await deleteInOrder({
      revokeApple: async () => {
        steps.push("revoke");
        throw new Error("Apple unreachable");
      },
      deleteAccount: async () => {
        steps.push("delete_account");
      },
    });
    expect(steps).toEqual(["revoke", "delete_account"]);

    steps.length = 0;
    await deleteInOrder({
      revokeApple: null,
      deleteAccount: async () => {
        steps.push("delete_account");
      },
    });
    expect(steps).toEqual(["delete_account"]);

    // A deletion that fails still says so.
    await expect(
      deleteInOrder({ revokeApple: null, deleteAccount: () => Promise.reject(new Error("offline")) }),
    ).rejects.toThrow("offline");
  });

  test("only accounts with an Apple ID linked ask for revocation", async () => {
    const user = (identities: string[], app_metadata: Record<string, unknown> = {}) =>
      ({
        user: {
          id: "user-1",
          aud: "authenticated",
          created_at: "",
          app_metadata,
          user_metadata: {},
          identities: identities.map((provider) => ({
            id: `${provider}-id`,
            identity_id: `${provider}-identity`,
            user_id: "user-1",
            provider,
          })),
        },
      }) as unknown as Parameters<typeof linkedToApple>[0];
    expect(linkedToApple(user(["apple"]))).toBe(true);
    expect(linkedToApple(user(["email", "apple"]))).toBe(true);
    expect(linkedToApple(user([], { provider: "email", providers: ["email", "apple"] }))).toBe(true);
    expect(linkedToApple(user(["google"], { provider: "google", providers: ["google"] }))).toBe(false);
    expect(linkedToApple(user(["email"], { provider: "email" }))).toBe(false);
    expect(linkedToApple(null)).toBe(false);
  });
});
