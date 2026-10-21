/**
 * Requests with a deadline, for search, quotes and the learning tables (and
 * the blessing, through fetchWithTimeout). fetch resolves when the headers
 * arrive, so a deadline that ends there leaves the body unguarded: a
 * connection that stalls mid-body would keep a search loading for good, and
 * cancelling it then wouldn't stop the transfer. Here the deadline and the
 * caller's cancellation last until the body has been read.
 *
 * No React Native imports, so the tests run it in Node (network-deadline.spec.ts).
 */

export type Timed = RequestInit & { timeoutMs?: number };

/** What a stopped request rejects with. */
function stopError(name: "TimeoutError" | "AbortError", message: string) {
  const error = new Error(message);
  error.name = name;
  return error;
}

/**
 * Fetches `url` and hands the response to `read` (status checks, error
 * bodies, parsing), all under one deadline that also honours the caller's
 * AbortSignal. Rejects with an Error named TimeoutError or AbortError when
 * either stops it first, and aborts the transfer then.
 */
export async function request<T>(
  url: string,
  init: Timed,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  const { timeoutMs = 15_000, signal, ...rest } = init;
  const controller = new AbortController();
  let stop!: (error: Error) => void;
  const halted = new Promise<never>((_, reject) => {
    stop = (error) => {
      reject(error);
      controller.abort(error);
    };
  });
  const timer = setTimeout(() => stop(stopError("TimeoutError", `Timed out after ${timeoutMs}ms`)), timeoutMs);
  const forward = () => stop(stopError("AbortError", "Cancelled"));
  if (signal?.aborted) forward();
  else signal?.addEventListener("abort", forward);
  try {
    // Aborting errors a body being read in browsers; the race settles on
    // time even where it doesn't.
    return await Promise.race([fetch(url, { ...rest, signal: controller.signal }).then(read), halted]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forward);
  }
}

/**
 * The same for callers that read the Response themselves: it resolves once
 * the whole body has arrived, so reading it afterwards can't stall. Prefer
 * `request`, which parses under the deadline too.
 */
export function fetchWithTimeout(url: string, init: Timed): Promise<Response> {
  return request(url, init, async (response) => {
    // Reading a copy to the end buffers the original's body as well.
    await response.clone().text();
    return response;
  });
}
