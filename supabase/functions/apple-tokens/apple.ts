// Sign in with Apple's REST API, for the apple-tokens function: the client
// secret, swapping an authorization code for a refresh token, and revoking a
// refresh token. Only web standards (fetch, Web Crypto), no Deno globals, so
// the app's Node tests run this file too (tests/apple-tokens.spec.ts).
//
// Apple's documentation: "Creating a client secret", "Token validation"
// (/auth/token) and "Token revocation" (/auth/revoke), and TN3194 on
// account deletion.

export const APPLE_ISSUER = "https://appleid.apple.com";
export const TOKEN_URL = "https://appleid.apple.com/auth/token";
export const REVOKE_URL = "https://appleid.apple.com/auth/revoke";

/** The Edge Function secrets the owner sets (docs/development/apple-token-revocation.md). */
export const SECRET_NAMES = ["APPLE_SIGNIN_KEY_P8", "APPLE_SIGNIN_KEY_ID", "APPLE_TEAM_ID", "APPLE_CLIENT_ID"] as const;

/**
 * Each client secret is made for one request, so it only needs to outlive
 * that request. Apple refuses any that expire more than six months
 * (15,777,000 s) ahead.
 */
export const CLIENT_SECRET_TTL_S = 300;

/** How long a call to Apple may take before it counts as failed. */
export const APPLE_TIMEOUT_MS = 6000;

export type AppleConfig = {
  /** The Sign in with Apple private key: the .p8 file's text (PKCS #8 PEM). */
  keyP8: string;
  /** The key's 10-character Key ID. */
  keyId: string;
  /** The developer team's 10-character Team ID. */
  teamId: string;
  /** The App ID native sign-in's tokens are issued to: the app's bundle ID. */
  clientId: string;
};

/**
 * The secrets as a config, or the names of those missing or malformed
 * (never their values).
 */
export function readConfig(env: (name: string) => string | undefined): { config: AppleConfig } | { missing: string[] } {
  const value = (name: string) => env(name)?.trim() ?? "";
  const keyP8 = value("APPLE_SIGNIN_KEY_P8");
  const keyId = value("APPLE_SIGNIN_KEY_ID");
  const teamId = value("APPLE_TEAM_ID");
  const clientId = value("APPLE_CLIENT_ID");
  const missing: string[] = [];
  if (!/PRIVATE KEY/.test(keyP8) && !/^[A-Za-z0-9+/=\s]{100,}$/.test(keyP8)) missing.push("APPLE_SIGNIN_KEY_P8");
  if (!/^[A-Z0-9]{10}$/.test(keyId)) missing.push("APPLE_SIGNIN_KEY_ID");
  if (!/^[A-Z0-9]{10}$/.test(teamId)) missing.push("APPLE_TEAM_ID");
  if (!/^[A-Za-z0-9.-]{1,255}$/.test(clientId)) missing.push("APPLE_CLIENT_ID");
  return missing.length ? { missing } : { config: { keyP8, keyId, teamId, clientId } };
}

/** A failed call to Apple. `code` is Apple's error code or one of ours; it never holds a token. */
export class AppleError extends Error {
  /**
   * Apple's error (invalid_grant, invalid_client, invalid_request …), or
   * network, timeout, http_<status>, bad_response or invalid_key.
   */
  code: string;
  status: number;
  constructor(code: string, status = 0) {
    super(`apple: ${code}`);
    this.code = code;
    this.status = status;
  }
}

/** The error code to record for a failure, whatever was thrown. */
export function failureCode(error: unknown): string {
  return error instanceof AppleError ? error.code : "error";
}

// JWT pieces ------------------------------------------------------------------

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

const jsonPart = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));

/** A JWT's claims, unverified, or null when it can't be read. */
export function jwtClaims(jwt: string): Record<string, unknown> | null {
  const part = jwt.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const value = JSON.parse(new TextDecoder().decode(fromBase64(base64)));
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * The client secret's header and claims, as "Creating a client secret"
 * lists them. `sub` is the client ID the request names; Apple matches them.
 */
export function clientSecretParts(config: AppleConfig, clientId: string, nowSeconds: number) {
  return {
    header: { alg: "ES256", kid: config.keyId },
    payload: {
      iss: config.teamId,
      iat: nowSeconds,
      exp: nowSeconds + CLIENT_SECRET_TTL_S,
      aud: APPLE_ISSUER,
      sub: clientId,
    },
  };
}

/** The DER bytes of a PEM key. Takes the .p8 file as is, with "\n" escapes, or just its base64 body. */
export function pemBody(pem: string): Uint8Array<ArrayBuffer> {
  const base64 = pem
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END) [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new AppleError("invalid_key");
  return fromBase64(base64);
}

const signingKeys = new WeakMap<AppleConfig, Promise<CryptoKey>>();

function signingKey(config: AppleConfig): Promise<CryptoKey> {
  let key = signingKeys.get(config);
  if (!key) {
    key = Promise.resolve()
      .then(() =>
        crypto.subtle.importKey("pkcs8", pemBody(config.keyP8), { name: "ECDSA", namedCurve: "P-256" }, false, [
          "sign",
        ])
      )
      // Never the key's text or the underlying message, which could quote it.
      .catch(() => {
        throw new AppleError("invalid_key");
      });
    signingKeys.set(config, key);
  }
  return key;
}

/**
 * A client secret for `clientId`: a JWT signed with ES256 (ECDSA on P-256
 * with SHA-256). Web Crypto gives the signature as r and s side by side,
 * which is the form a JWT uses.
 */
export async function clientSecret(config: AppleConfig, clientId: string, nowMs = Date.now()): Promise<string> {
  const { header, payload } = clientSecretParts(config, clientId, Math.floor(nowMs / 1000));
  const input = `${jsonPart(header)}.${jsonPart(payload)}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    await signingKey(config),
    new TextEncoder().encode(input),
  );
  return `${input}.${base64url(new Uint8Array(signature))}`;
}

// Requests ----------------------------------------------------------------------

/**
 * Validating a native sign-in's authorization code. No redirect_uri: native
 * sign-in didn't send one, and Apple wants it only when the first request
 * had one.
 */
export function tokenRequestBody(clientId: string, secret: string, code: string): URLSearchParams {
  return new URLSearchParams({ client_id: clientId, client_secret: secret, code, grant_type: "authorization_code" });
}

/** Revoking a refresh token, which ends the app's authorization for that Apple ID. */
export function revokeRequestBody(clientId: string, secret: string, refreshToken: string): URLSearchParams {
  return new URLSearchParams({
    client_id: clientId,
    client_secret: secret,
    token: refreshToken,
    token_type_hint: "refresh_token",
  });
}

export type AppleOptions = {
  fetch?: typeof fetch;
  /** The time in milliseconds, for the client secret. */
  now?: () => number;
  timeoutMs?: number;
};

/** Posts a form to Apple. Its JSON answer, or an AppleError with Apple's error code. */
async function post(url: string, body: URLSearchParams, options: AppleOptions): Promise<Record<string, unknown>> {
  const send = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await send(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
      signal: AbortSignal.timeout(options.timeoutMs ?? APPLE_TIMEOUT_MS),
    });
  } catch (error) {
    throw new AppleError((error as Error)?.name === "TimeoutError" ? "timeout" : "network");
  }
  let data: Record<string, unknown> = {};
  try {
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : {};
    if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
  } catch (error) {
    if ((error as Error)?.name === "TimeoutError") throw new AppleError("timeout");
    // Not JSON: judged by the status alone.
  }
  if (!response.ok) {
    const code = typeof data.error === "string" && /^[a-z_]{1,64}$/.test(data.error) ? data.error : null;
    throw new AppleError(code ?? `http_${response.status}`, response.status);
  }
  return data;
}

export type Exchanged = {
  refreshToken: string;
  /** The Apple user ID the tokens belong to (the ID token's sub). */
  sub: string;
};

/**
 * Swaps a native sign-in's authorization code (valid for five minutes, once)
 * for Apple's tokens and returns the refresh token. The ID token came
 * straight from Apple over TLS, so its claims are read without checking the
 * signature again (OpenID Connect Core 3.1.3.7), but its issuer and audience
 * must still be Apple's and this app's.
 */
export async function exchangeCode(config: AppleConfig, code: string, options: AppleOptions = {}): Promise<Exchanged> {
  const secret = await clientSecret(config, config.clientId, options.now?.());
  const data = await post(TOKEN_URL, tokenRequestBody(config.clientId, secret, code), options);
  const refreshToken = data.refresh_token;
  const claims = typeof data.id_token === "string" ? jwtClaims(data.id_token) : null;
  const audience = Array.isArray(claims?.aud) ? claims.aud : [claims?.aud];
  if (
    typeof refreshToken !== "string" ||
    !refreshToken ||
    claims?.iss !== APPLE_ISSUER ||
    !audience.includes(config.clientId) ||
    typeof claims.sub !== "string" ||
    !claims.sub
  ) {
    throw new AppleError("bad_response");
  }
  return { refreshToken, sub: claims.sub };
}

/**
 * Revokes a refresh token issued to `clientId`. Apple answers 200 both when
 * it revokes the token and when the token was already revoked (by the viewer
 * in Settings, say), so either way the token is finished with.
 */
export async function revokeToken(
  config: AppleConfig,
  clientId: string,
  refreshToken: string,
  options: AppleOptions = {},
): Promise<void> {
  const secret = await clientSecret(config, clientId, options.now?.());
  await post(REVOKE_URL, revokeRequestBody(clientId, secret, refreshToken), options);
}

/** Apple's two calls with the owner's key, as the function uses them (tokens.ts). */
export function appleClient(config: AppleConfig, options: AppleOptions = {}) {
  return {
    clientId: config.clientId,
    exchange: (code: string) => exchangeCode(config, code, options),
    revoke: (clientId: string, refreshToken: string) => revokeToken(config, clientId, refreshToken, options),
  };
}
