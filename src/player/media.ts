/**
 * The sermons' own copies of their videos: each one is uploaded from
 * YouTube to the ministry's storage (Cloudflare R2) as HLS, in 720p and
 * 360p, under its YouTube ID. Every guided path's sermons are there; the
 * rest are still arriving over the coming days, so whether a sermon is there
 * yet is asked of the server (a HEAD request, a 404 until it's uploaded) and
 * remembered: yes for the rest of the session, no for ten minutes.
 *
 * The native apps play these with their own video player (NativeVideo.tsx)
 * and fall back to the YouTube embed for anything not there yet. The web
 * keeps the YouTube embed for now (Embed.web.tsx): it never asks.
 *
 * No React Native here, so the tests run it as it is.
 */

export const VIDEO_ORIGIN = "https://audio.aaolearning.com";

/** Where a sermon's HLS playlist is, whether or not it has been uploaded yet. */
export function hlsUrl(id: string) {
  return `${VIDEO_ORIGIN}/video/${encodeURIComponent(id)}/master.m3u8`;
}

/** How long Watch waits for the answer before playing from YouTube instead. */
export const HLS_CHECK_MS = 2000;
/** How long a "not uploaded yet" is believed before asking again. */
export const HLS_MISSING_FOR_MS = 10 * 60 * 1000;

/** Which player plays a sermon: the app's own (from R2) or the YouTube embed. */
export type Engine = "native" | "youtube";

/**
 * The engine for a sermon: the YouTube embed once the app's own player has
 * failed on it this session, or when it isn't uploaded yet; the app's own
 * player when it is; null while that's still being asked.
 */
export function chooseEngine(hls: boolean | undefined, fellBack: boolean): Engine | null {
  if (fellBack || hls === false) return "youtube";
  return hls ? "native" : null;
}

type Timer = ReturnType<typeof setTimeout>;
export type HlsCheckDeps = {
  fetch: (url: string, init: { method: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number }>;
  now: () => number;
  setTimeout: (run: () => void, ms: number) => Timer;
  clearTimeout: (timer: Timer) => void;
};

const defaults: HlsCheckDeps = {
  // Looked up when called, so whatever fetch the app has installed by then is used.
  fetch: (url, init) => fetch(url, init),
  now: () => Date.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (timer) => clearTimeout(timer),
};

/**
 * Asks whether sermons are on R2, remembering the answers. A slow or failed
 * answer (offline, a timeout, a server error) counts as no for that ask but
 * isn't remembered, so the next one asks again. Asks for the same sermon
 * share one request.
 */
export function hlsCheck(deps: HlsCheckDeps = defaults) {
  const answers = new Map<string, { has: boolean; at: number }>();
  const asking = new Map<string, Promise<boolean>>();

  /** What's known now: true, false, or undefined when it has to be asked. */
  const known = (id: string) => {
    const answer = answers.get(id);
    if (!answer) return undefined;
    if (answer.has || deps.now() - answer.at < HLS_MISSING_FOR_MS) return answer.has;
    answers.delete(id);
    return undefined;
  };

  const ask = async (id: string) => {
    const controller = new AbortController();
    const timer = deps.setTimeout(() => controller.abort(), HLS_CHECK_MS);
    try {
      const response = await deps.fetch(hlsUrl(id), { method: "HEAD", signal: controller.signal });
      // Any other client error is also "not there": the storage answers
      // 404 for a sermon that hasn't been uploaded yet.
      const has = response.ok;
      if (has || (response.status >= 400 && response.status < 500))
        answers.set(id, { has, at: deps.now() });
      return has;
    } catch {
      return false;
    } finally {
      deps.clearTimeout(timer);
    }
  };

  /** Whether the sermon is on R2: at once when known, else after at most HLS_CHECK_MS. */
  const has = (id: string): Promise<boolean> => {
    const answer = known(id);
    if (answer !== undefined) return Promise.resolve(answer);
    const pending = asking.get(id);
    if (pending) return pending;
    const request = ask(id).finally(() => asking.delete(id));
    asking.set(id, request);
    return request;
  };

  /** Asks ahead (a sermon's page has opened), so Watch needn't wait. */
  const prefetch = (id: string) => {
    void has(id);
  };

  return { has, known, prefetch };
}

const shared = hlsCheck();
export const hasHls = shared.has;
export const knownHls = shared.known;
export const prefetchHls = shared.prefetch;
