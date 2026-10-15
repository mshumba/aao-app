// CORS, JSON responses and request checks shared by the search and quotes
// functions.

// Browsers on these origins may call the functions: local development ports,
// the website (aaolearning.com, served by Cloudflare Pages as aao-web.pages.dev),
// and this project's EAS Hosting deployments: production
// (aao-app.expo.app) plus its preview deployments and aliases
// (aao-app--<id or alias>.expo.app). Any other *.expo.app site belongs to
// someone else's project and is refused.
// The native app sends no Origin header and is always allowed.
const ALLOWED_ORIGINS: RegExp[] = [
  /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/,
  /^https:\/\/(www\.)?aaolearning\.com$/,
  /^https:\/\/aao-app(--[a-z0-9-]+)?\.expo\.app$/,
  // The Cloudflare Pages site and its per-deploy preview addresses.
  /^https:\/\/([a-z0-9]+\.)?aao-web\.pages\.dev$/,
];

export function originAllowed(origin: string | null): boolean {
  return origin === null || ALLOWED_ORIGINS.some((re) => re.test(origin));
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = { Vary: "Origin" };
  if (origin && originAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "authorization, apikey, content-type, x-client-info, x-region";
    headers["Access-Control-Expose-Headers"] = "retry-after";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}

export function json(req: Request, status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extra,
    },
  });
}

/**
 * The checks every request goes through before any work: CORS preflight,
 * origin, method, and the project's publishable (or legacy anon) key on the
 * apikey header. Returns the response to send, or null to carry on.
 */
export function gate(req: Request): Response | null {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response(null, { status: originAllowed(origin) ? 204 : 403, headers: corsHeaders(req) });
  }
  if (!originAllowed(origin)) return json(req, 403, { error: "origin_not_allowed" });
  if (req.method !== "POST") return json(req, 405, { error: "method_not_allowed" }, { Allow: "POST, OPTIONS" });
  if (!apiKeyOk(req.headers.get("apikey"))) return json(req, 401, { error: "unauthorized" });
  return null;
}

let knownKeys: string[] | null = null;

/** The project's client keys: every publishable key plus the legacy anon key. */
function clientKeys(): string[] {
  if (knownKeys) return knownKeys;
  const keys: string[] = [];
  try {
    const named = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}") as Record<string, unknown>;
    for (const value of Object.values(named)) if (typeof value === "string" && value) keys.push(value);
  } catch {
    // not set or not JSON
  }
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (anon) keys.push(anon);
  knownKeys = keys;
  return keys;
}

function sameText(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function apiKeyOk(apikey: string | null): boolean {
  if (!apikey) return false;
  return clientKeys().some((key) => sameText(apikey, key));
}

/** The request body as JSON, or null when it is missing, too big or not JSON. */
export async function readJson(req: Request, maxBytes: number): Promise<Record<string, unknown> | null> {
  try {
    const text = await req.text();
    if (!text || text.length > maxBytes) return null;
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Runs after the response is sent when the runtime allows it (cache writes). */
export function later(task: Promise<unknown>): void {
  const guarded = task.catch((error) => console.error("background task failed", String(error?.message ?? error)));
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(guarded);
}
