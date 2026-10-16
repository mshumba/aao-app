import { fakeQuotes, fakeSearch } from "./fixtures";
import { authHeaders, fetchWithTimeout, functionsBase, learningMode } from "./session";
import { LearningError, type QuoteResult, type SearchResponse } from "./types";

/**
 * The two Edge Functions behind "What are you going through?": search finds
 * moments by meaning; quotes extracts verbatim quotes for moments search
 * returned without one. Both are called as the signed-in viewer when there
 * is one (publishable key otherwise). In local mode they are the
 * deterministic fakes in fixtures.ts.
 */

const SEARCH_TIMEOUT = 20_000;
const QUOTES_TIMEOUT = 25_000;

/**
 * Both functions run in the database's region. Left to choose, Supabase runs
 * them nearest the caller, and from far away (Nigeria) every database call
 * then crosses an ocean: cached answers were 3-4 times slower. Every platform
 * asks with the x-region header; the functions' CORS list allows it, so a
 * browser's preflight passes too.
 */
const regionHeaders = { "x-region": "us-east-1" };

/** Turns a failed request into a typed error the screens can explain. */
async function failure(response: Response): Promise<LearningError> {
  let body: { error?: string; retryAfter?: number } = {};
  try {
    body = await response.json();
  } catch {
    // Not JSON (a gateway page): judged by status alone.
  }
  if (response.status === 429 || body.error === "rate_limited") {
    const header = Number(response.headers.get("retry-after"));
    const retryAfter = body.retryAfter ?? (Number.isFinite(header) && header > 0 ? header : 30);
    return new LearningError("rate_limited", "Too many searches", retryAfter);
  }
  if (response.status === 400 || body.error === "bad_query")
    return new LearningError("bad_query", "That question can't be searched");
  // 404 (not deployed yet), 503 and anything else: calm "unavailable".
  return new LearningError("unavailable", `Search is unavailable (${response.status})`);
}

function thrown(error: unknown, signal?: AbortSignal): LearningError {
  if (error instanceof LearningError) return error;
  if (signal?.aborted) return new LearningError("aborted");
  // A timeout or no connection: fetch rejects with a TypeError or AbortError.
  return new LearningError("offline", error instanceof Error ? error.message : String(error));
}

async function post<T>(name: string, body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetchWithTimeout(`${functionsBase}/${name}`, {
      method: "POST",
      headers: { ...(await authHeaders()), ...regionHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
      timeoutMs,
    });
  } catch (error) {
    throw thrown(error, signal);
  }
  if (!response.ok) throw await failure(response);
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw thrown(error, signal);
  }
}

/**
 * Moments (and sermons, and a path) that speak to a question, 1-200
 * characters. Throws LearningError: offline, rate_limited (with retryAfter),
 * unavailable, bad_query, or aborted when `signal` fires. `care` is always a
 * boolean here (false from a search that predates it).
 */
export async function search(q: string, signal?: AbortSignal): Promise<SearchResponse> {
  const query = q.trim();
  if (!query || query.length > 200) throw new LearningError("bad_query");
  if (learningMode === "local") return fakeSearch(query, signal);
  const data = await post<SearchResponse>("search", { q: query }, SEARCH_TIMEOUT, signal);
  if (!data || !Array.isArray(data.moments)) throw new LearningError("unavailable", "Unexpected response");
  return {
    ...data,
    understood: data.understood ?? { theme: query, related: [] },
    sermons: data.sermons ?? [],
    path: data.path ?? null,
    care: data.care === true,
  };
}

/**
 * Verbatim quotes for up to 14 moment ids (search moments whose quote was
 * null). An id maps to null when no quote passed the check: show nothing for
 * it then, never the raw transcript.
 */
export async function quotes(
  ids: string[],
  q?: string,
  signal?: AbortSignal,
): Promise<Record<string, QuoteResult>> {
  const wanted = [...new Set(ids)].slice(0, 14);
  if (!wanted.length) return {};
  if (learningMode === "local") return fakeQuotes(wanted, q, signal);
  const data = await post<{ quotes?: Record<string, QuoteResult> }>(
    "quotes",
    q ? { ids: wanted, q } : { ids: wanted },
    QUOTES_TIMEOUT,
    signal,
  );
  return data.quotes ?? {};
}
