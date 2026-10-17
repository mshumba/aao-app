import { useCallback, useEffect, useRef, useState } from "react";
import { quotes, search } from "./client";
import { LearningError, type SearchResponse } from "./types";

/**
 * Runs a search for `query` (the submitted question; pass null or "" for
 * none) and keeps the result. Moments that come back without a quote get
 * theirs from the quotes function; until it answers their ids are in
 * `pendingQuotes` (show the static placeholder), then the quote appears in
 * `data` (MomentCard crossfades it in). The last 12 results are kept for the
 * session, so going back is instant; a stand-in answer from when search
 * couldn't search by meaning (`fallback`) isn't, so the next visit tries again.
 *
 * Each search is a numbered request. A newer query, or none (the field
 * cleared), aborts the one before; and an answer that arrives anyway for a
 * request that is no longer the latest is ignored, so an old question's
 * results never replace a newer one's.
 */

export type SearchStatus = "idle" | "loading" | "success" | "error";

export type SearchState = {
  status: SearchStatus;
  data: SearchResponse | null;
  error: LearningError | null;
  /** Moment ids whose quote is being fetched. */
  pendingQuotes: ReadonlySet<string>;
};

const NONE: ReadonlySet<string> = new Set();
const IDLE: SearchState = { status: "idle", data: null, error: null, pendingQuotes: NONE };
const LOADING: SearchState = { status: "loading", data: null, error: null, pendingQuotes: NONE };

const memory = new Map<string, SearchResponse>();
function remember(key: string, data: SearchResponse) {
  memory.delete(key);
  memory.set(key, data);
  if (memory.size > 12) memory.delete(memory.keys().next().value!);
}

/** Which search a stored state belongs to (the query and the retry count). */
type Slot = SearchState & { slot: string };

export function useSearch(query: string | null | undefined) {
  const q = query?.trim() ?? "";
  const key = q.toLocaleLowerCase();
  const [attempt, setAttempt] = useState(0);
  const slot = `${key}#${attempt}`;
  const [state, setState] = useState<Slot>({ ...IDLE, slot: "" });
  const latest = useRef(0);

  useEffect(() => {
    const id = ++latest.current;
    if (!key) return;
    const controller = new AbortController();
    const stale = () => controller.signal.aborted || id !== latest.current;
    const known = memory.get(key);
    (known ? Promise.resolve(known) : search(q, controller.signal))
      .then((data) => {
        if (stale()) return;
        if (!data.fallback) remember(key, data);
        const missing = data.moments.filter((m) => m.quote == null).map((m) => m.id);
        setState({
          slot,
          status: "success",
          data,
          error: null,
          pendingQuotes: missing.length ? new Set(missing) : NONE,
        });
        if (!missing.length) return;
        quotes(missing, q, controller.signal)
          .then((found) => {
            if (stale()) return;
            const next: SearchResponse = {
              ...data,
              moments: data.moments.map((m) => {
                const hit = m.quote == null ? found[m.id] : null;
                // Play starts where the quote does, not where the passage did.
                return hit
                  ? { ...m, quote: hit.quote, at: Number.isFinite(hit.at) ? hit.at : m.at }
                  : m;
              }),
            };
            remember(key, next);
            setState({ slot, status: "success", data: next, error: null, pendingQuotes: NONE });
          })
          .catch(() => {
            // No quote this time: those moments show without one.
            if (!stale()) setState((was) => (was.slot === slot ? { ...was, pendingQuotes: NONE } : was));
          });
      })
      .catch((error: unknown) => {
        const typed = error instanceof LearningError ? error : new LearningError("unavailable");
        if (typed.code === "aborted" || stale()) return;
        setState({ slot, status: "error", data: null, error: typed, pendingQuotes: NONE });
      });
    return () => controller.abort();
    // `q` only changes with `key` (and `slot`), which are listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, slot]);

  /** Searches again (after an error), skipping the session's copy. */
  const retry = useCallback(() => {
    memory.delete(key);
    setAttempt((n) => n + 1);
  }, [key]);

  let shown: SearchState;
  if (!key) shown = IDLE;
  else if (state.slot === slot) shown = state;
  else {
    // A new question: a result from this session shows at once.
    const known = memory.get(key);
    shown = known ? { status: "success", data: known, error: null, pendingQuotes: NONE } : LOADING;
  }
  return { status: shown.status, data: shown.data, error: shown.error, pendingQuotes: shown.pendingQuotes, retry };
}
