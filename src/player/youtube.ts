import { YOUTUBE_CHECK, type PlayerCommand } from "./types";

/**
 * Rules for the YouTube embed on a phone, where it runs in a web view
 * (Embed.tsx), the fallback for sermons not on R2 yet (media.ts). No React
 * Native here, so the tests run it as it is.
 */

/** What the embed's web view does with a page load. */
export type EmbedNavigation =
  /** The player's own loads: our page, YouTube's player and what it frames. */
  | "allow"
  /** A YouTube link the viewer tapped (the title, the logo): the YouTube app or site, outside this app. */
  | "open"
  /** Google's sign-in or a consent page: never shown in the player. */
  | "signin"
  /** Anything else: ignored. */
  | "block";

export type EmbedRequest = {
  url: string;
  /** iOS only: whether the load is for the page itself rather than a frame in it. */
  isTopFrame?: boolean;
  /** iOS only: false for a link that asks for a new window. */
  hasTargetFrame?: boolean;
  /** iOS only: "click" when the viewer tapped a link. */
  navigationType?: string;
};

const PLAYER = /^https:\/\/(?:www\.)?(?:youtube\.com|youtube-nocookie\.com)\/embed\//i;
const SIGN_IN =
  /^https:\/\/(?:accounts\.google\.[a-z.]+|accounts\.youtube\.com|consent\.(?:youtube|google)\.[a-z.]+|(?:www\.|m\.)?youtube\.com\/(?:signin|login|logout))(?:[/?#]|$)/i;
const YOUTUBE = /^https:\/\/(?:(?:www\.|m\.)?youtube\.com|youtu\.be)(?:[/?#]|$)/i;

/**
 * Keeps the embed's web view on the player. Its page (`page`, the base URL
 * it loads from; about:blank without one) and YouTube's player, with the
 * frames it opens inside itself, load; the page itself never goes anywhere
 * else. A YouTube link the viewer taps opens outside the app, and Google's
 * sign-in or consent pages, which YouTube's "Sign in to confirm you're not
 * a bot" leads to, never open inside the player.
 *
 * iOS says which frame a load is for and whether the viewer tapped a link.
 * Android only asks about the page itself, and always after a tap, since a
 * frame can't move the page on its own; `framesKnown` is false there. Links
 * that ask for a new window never load at all (embedNewWindow).
 */
export function embedNavigation(
  request: EmbedRequest,
  { page, framesKnown }: { page?: string; framesKnown: boolean },
): EmbedNavigation {
  const { url } = request;
  if (/^about:(?:blank|srcdoc)$/i.test(url) || (page && url === page)) return "allow";
  // A new window always follows a tap: the web view doesn't let scripts open them.
  const newWindow = request.hasTargetFrame === false;
  const inFrame = framesKnown && !newWindow && request.isTopFrame === false;
  const tapped = !framesKnown || newWindow || request.navigationType === "click";
  if (SIGN_IN.test(url)) return tapped ? "signin" : "block";
  // YouTube's player in our page's frame. Android can't tell frames apart,
  // so there it loads wherever it's asked for.
  if (PLAYER.test(url) && (inFrame || !framesKnown)) return "allow";
  if (tapped) return YOUTUBE.test(url) ? "open" : "block";
  // The frames YouTube's player loads inside itself; the page stays put.
  return inFrame ? "allow" : "block";
}

/**
 * A link in the embed that asks for a new window, such as YouTube's title or
 * the "Sign in" of its check. The web view never opens one (it cancels them
 * itself and asks Embed.tsx, on both platforms), so a late answer can't let
 * one load; this says what the app does instead: "open" outside the app,
 * "signin", or nothing. It always follows a tap: the web view doesn't let
 * scripts open windows.
 */
export function embedNewWindow(url: string, page?: string): EmbedNavigation {
  return embedNavigation({ url, hasTargetFrame: false }, { page, framesKnown: true });
}

/** YouTube's own errors that mean it held the sermon back from this app, not that it's gone. */
const HELD_BACK = [150, 152, 153];

/**
 * The code the app shows for a YouTube error: a refusal to play here
 * (embedding, or its check of the device) offers Watch on YouTube and Try
 * again (YOUTUBE_CHECK).
 */
export function youtubeErrorCode(code: number) {
  return HELD_BACK.includes(code) ? YOUTUBE_CHECK : code;
}

/** How long YouTube has to answer Play once its player is ready (playing, or at least buffering). */
export const START_DEADLINE_MS = 10_000;
/** The longest a start may take from the first Play, buffering or not. */
export const BUFFER_DEADLINE_MS = 30_000;

type Timer = ReturnType<typeof setTimeout>;

/**
 * Notices a YouTube player that won't start the sermon. That's YouTube
 * checking the device ("Sign in to confirm you're not a bot") or refusing
 * it, which it doesn't report as an error, and its player may never even
 * say it's ready. Two waits run from the first Play:
 * - a start that has had BUFFER_DEADLINE_MS without playing is stuck, however
 *   often YouTube says it's buffering in between;
 * - once YouTube's player is ready, it has START_DEADLINE_MS to answer Play,
 *   and buffering counts as an answer.
 * Playing, ending, a pause or an error ends the waits. Once the sermon has
 * played YouTube has let this device through, so a slow restart after that
 * is only the network and isn't watched.
 */
export function startWatch(
  onStuck: () => void,
  timers: { setTimeout: (run: () => void, ms: number) => Timer; clearTimeout: (timer: Timer) => void } = {
    setTimeout: (run, ms) => setTimeout(run, ms),
    clearTimeout: (timer) => clearTimeout(timer),
  },
) {
  let start: Timer | null = null;
  let cap: Timer | null = null;
  // YouTube's player has loaded: before that, the page drops Play.
  let ready = false;
  let played = false;
  // Asked to play and not yet answered.
  let wanted = false;
  const clear = (timer: Timer | null) => {
    if (timer != null) timers.clearTimeout(timer);
    return null;
  };
  const stop = () => {
    start = clear(start);
    cap = clear(cap);
    wanted = false;
  };
  const stuck = () => {
    stop();
    onStuck();
  };
  const waitForAnswer = () => {
    start = clear(start);
    start = timers.setTimeout(stuck, START_DEADLINE_MS);
  };
  return {
    /** YouTube's player is ready for commands. */
    ready() {
      ready = true;
      if (wanted && !played) waitForAnswer();
    },
    /** Whether the sermon has played, so YouTube has let this device through. */
    played: () => played,
    command(command: PlayerCommand) {
      if (command.type === "pause") stop();
      if (command.type !== "play" || played) return;
      wanted = true;
      if (cap == null) cap = timers.setTimeout(stuck, BUFFER_DEADLINE_MS);
      if (ready) waitForAnswer();
    },
    /** A state YouTube reported (1 playing, 0 ended, 3 buffering). */
    state(state: number) {
      if (state === 1) played = true;
      if (state === 1 || state === 0) stop();
      // Buffering answers Play; the cap from the first Play still runs.
      else if (state === 3) start = clear(start);
    },
    stop,
  };
}

/** The sermon's YouTube link at `seconds` in, for watching on in the YouTube app or site. */
export function youtubeAt(url: string, seconds: number) {
  const at = Math.floor(seconds);
  const [base, hash] = url.split("#", 2);
  // Any time already in the link gives way to this one.
  const plain = base
    .replace(/([?&])t=[^&]*(&|$)/, (_match, lead: string, tail: string) => (tail ? lead : ""))
    .replace(/[?&]$/, "");
  const time = at >= 1 ? `${plain.includes("?") ? "&" : "?"}t=${at}s` : "";
  return plain + time + (hash ? `#${hash}` : "");
}
