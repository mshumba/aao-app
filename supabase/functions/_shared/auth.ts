// Who is calling, for rate limits: the signed-in viewer's user id when the
// Authorization header carries a valid Supabase session token, otherwise a
// keyed hash of the client IP (the raw IP is never stored or logged).

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

// Addresses a proxy inside the platform may add: private, loopback,
// link-local, carrier-grade NAT and unique-local ranges. No client reaches the
// platform from one of these, so they are skipped when reading from the right.
const INTERNAL =
  /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|::$|f[cd][0-9a-f]{0,2}:|fe[89ab][0-9a-f]?:|::ffff:(10|127|192\.168)\.)/i;

/** How the client's address was found; logged (never the address itself). */
export type IpSource = "xff" | "cf" | "real-ip" | "none";

/**
 * The client's address as the platform saw it. A client can write its own
 * x-forwarded-for header; the proxies in front of the function append the
 * address they actually received the request from, so the left-most entry is
 * the client's to choose and the right-most entry that isn't internal is the
 * platform's. Supabase doesn't document a client-IP header for Edge
 * Functions; reports from its API show `x-forwarded-for: <client's own
 * value>, <real address>` with the real address also in cf-connecting-ip.
 * CLIENT_IP_SOURCE=cf reads cf-connecting-ip first instead (see the
 * functions README for how to check which is right after a deploy).
 */
export function clientIp(headers: Headers, source = Deno.env.get("CLIENT_IP_SOURCE")): {
  ip: string;
  from: IpSource;
  hops: number;
} {
  const hops = (headers.get("x-forwarded-for") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (source === "cf" && cf) return { ip: cf, from: "cf", hops: hops.length };
  for (let i = hops.length - 1; i >= 0; i--) {
    if (!INTERNAL.test(hops[i])) return { ip: hops[i], from: "xff", hops: hops.length };
  }
  if (cf) return { ip: cf, from: "cf", hops: hops.length };
  const real = headers.get("x-real-ip")?.trim();
  if (real) return { ip: real, from: "real-ip", hops: hops.length };
  return { ip: "unknown", from: "none", hops: hops.length };
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

export type Caller = {
  /** "<scope>:u:<user id>" or "<scope>:ip:<hash>", the key search_rate_ok counts under. */
  key: string;
  signedIn: boolean;
  /**
   * For a guest, how the address was found (for the log; no address): `cf`
   * says whether cf-connecting-ip agrees with it (null: no such header).
   */
  ip?: { from: IpSource; hops: number; cf: boolean | null };
};

export async function caller(req: Request, scope: string): Promise<Caller> {
  const id = await userId(req);
  if (id) return { key: `${scope}:u:${id}`, signedIn: true };
  const found = clientIp(req.headers);
  // Whether cf-connecting-ip agrees with the address used: after a deploy, the
  // log shows which header carries the client's address.
  const cfHeader = req.headers.get("cf-connecting-ip")?.trim();
  const cf = cfHeader ? cfHeader === found.ip : null;
  return {
    key: `${scope}:ip:${await hashIp(found.ip)}`,
    signedIn: false,
    ip: { from: found.from, hops: found.hops, cf },
  };
}

/** caller()'s key alone, for functions that only count requests (apple-tokens imports it). */
export async function callerKey(req: Request, scope: string): Promise<string> {
  return (await caller(req, scope)).key;
}
