// The service-role client. The functions read passages, quotes and caches,
// which anon and authenticated can't reach (see migration need_search).

// Deno specifier; the app's ESLint resolver only knows Node modules.
// eslint-disable-next-line import/no-unresolved
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";

/** The project's secret key (sb_secret_…), or the legacy service_role key. */
export function secretKey(): string {
  try {
    const named = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, unknown>;
    if (typeof named.default === "string" && named.default) return named.default;
    const first = Object.values(named).find((v) => typeof v === "string" && v);
    if (typeof first === "string") return first;
  } catch {
    // not set or not JSON
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!legacy) throw new Error("no secret key in the environment");
  return legacy;
}

let client: SupabaseClient | null = null;

export function admin(): SupabaseClient {
  client ??= createClient(Deno.env.get("SUPABASE_URL") ?? "", secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

/** Abort signal for one database call. */
export const dbTimeout = (ms: number) => AbortSignal.timeout(ms);

export type Limit = { key: string; max: number; windowSeconds: number };
export type RateResult = { ok: true } | { ok: false; retryAfter: number };

/**
 * search_rate_ok(): true (and the call counted) while `key` is under `max`
 * calls in the last `windowSeconds`. When it says no, also how many seconds
 * until the oldest counted call leaves the window.
 */
async function checkOne({ key, max, windowSeconds }: Limit): Promise<RateResult> {
  const db = admin();
  const { data, error } = await db
    .rpc("search_rate_ok", { key, max_hits: max, window_seconds: windowSeconds })
    .abortSignal(dbTimeout(4000));
  if (error) throw new Error(`rate limit: ${error.code ?? error.message}`);
  if (data === true) return { ok: true };
  let retryAfter = 60;
  const oldest = await db
    .from("search_hits")
    .select("at")
    .eq("key", key)
    .order("at", { ascending: true })
    .limit(1)
    .abortSignal(dbTimeout(3000));
  const at = oldest.data?.[0]?.at;
  if (at) retryAfter = Math.ceil((Date.parse(at) + windowSeconds * 1000 - Date.now()) / 1000);
  return { ok: false, retryAfter: Math.min(Math.max(retryAfter, 1), windowSeconds) };
}

/**
 * Every limit must allow the call. They are checked in order and stop at the
 * first refusal, so calls refused by a caller's own limit never use up the
 * shared ceiling that follows it.
 */
export async function rateLimit(limits: Limit[]): Promise<RateResult> {
  for (const limit of limits) {
    const result = await checkOne(limit);
    if (!result.ok) return result;
  }
  return { ok: true };
}

/** A whole number from a secret, or the default. */
export function envInt(name: string, fallback: number): number {
  const n = Number(Deno.env.get(name));
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
