// Who is calling, for rate limits: the signed-in viewer's user id when the
// Authorization header carries a valid Supabase session token, otherwise a
// keyed hash of the client IP (the raw IP is never stored).

// Deno specifier; the app's ESLint resolver only knows Node modules.
// eslint-disable-next-line import/no-unresolved
import { createLocalJWKSet, createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "npm:jose@5.9.6";
import { secretKey } from "./db.ts";

let keySet: JWTVerifyGetKey | null = null;

function jwks(): JWTVerifyGetKey {
  if (keySet) return keySet;
  try {
    const local = JSON.parse(Deno.env.get("SUPABASE_JWKS") ?? "");
    if (Array.isArray(local?.keys) && local.keys.length) {
      keySet = createLocalJWKSet(local);
      return keySet;
    }
  } catch {
    // fall through to the published key set
  }
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  keySet = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`));
  return keySet;
}

/** The user id from a valid session token, or null (guests send the publishable key). */
export async function userId(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token || token.split(".").length !== 3) return null;
  try {
    const { payload } = await jwtVerify(token, jwks(), { algorithms: ["ES256", "RS256", "EdDSA"] });
    if (payload.role !== "authenticated" || typeof payload.sub !== "string" || !payload.sub) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || req.headers.get("cf-connecting-ip")?.trim() || "unknown";
}

let hmacKey: Promise<CryptoKey> | null = null;

async function hashIp(ip: string): Promise<string> {
  hmacKey ??= crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`rate-limit:${secretKey()}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", await hmacKey, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(mac).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** "<scope>:u:<user id>" or "<scope>:ip:<hash>", the key search_rate_ok counts under. */
export async function callerKey(req: Request, scope: string): Promise<string> {
  const id = await userId(req);
  return id ? `${scope}:u:${id}` : `${scope}:ip:${await hashIp(clientIp(req))}`;
}
