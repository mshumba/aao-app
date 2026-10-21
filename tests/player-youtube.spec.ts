import { expect, test } from "@playwright/test";
import {
  PLAYER_STOPPED,
  YOUTUBE_CHECK,
  canRetry,
  canWatchOnYouTube,
  playerError,
  type EmbedHandle,
  type PlayerEvent,
} from "../src/player/types";
import {
  START_DEADLINE_MS,
  embedNavigation,
  startWatch,
  youtubeAt,
  youtubeErrorCode,
  type EmbedRequest,
} from "../src/player/youtube";
import {
  fakeTimers,
  hookHost,
  jsxRuntime,
  mountPlayer,
  playFourSeconds,
  sourceLoader,
  type HarnessSermon,
  type MountedPlayer,
} from "./player-harness";

// The YouTube embed on a phone, run in Node: it keeps to the player (never
// Google's sign-in inside the app), notices YouTube holding a sermon back
// ("Sign in to confirm you're not a bot", a refusal, no start after Play)
// and offers Watch on YouTube, at the viewer's place, and Try again.

const SERMON: HarnessSermon = { id: "test-sermon", source: "https://www.youtube.com/watch?v=test-sermon" };

/** Watch, the player becomes ready, and the sermon plays four seconds in. */
const watchFourSeconds = (player: MountedPlayer, from = 0) => playFourSeconds(player, SERMON, from);

// ---- Keeping the embed on the player (youtube.ts) ----------------------------------------

const PAGE = "https://com.mshumba.aao/";
const ios = (request: EmbedRequest) => embedNavigation(request, { page: PAGE, framesKnown: true });
const android = (url: string) => embedNavigation({ url, isTopFrame: true }, { page: PAGE, framesKnown: false });
const SIGN_IN = "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com";
const WATCH = "https://www.youtube.com/watch?v=test-sermon";
const EMBED = "https://www.youtube.com/embed/test-sermon?autoplay=0&controls=0";

test("the embed loads our page, YouTube's player and the frames inside it", () => {
  expect(ios({ url: PAGE, isTopFrame: true, hasTargetFrame: true, navigationType: "other" })).toBe("allow");
  expect(ios({ url: "about:blank", isTopFrame: false, hasTargetFrame: true, navigationType: "other" })).toBe("allow");
  expect(ios({ url: EMBED, isTopFrame: false, hasTargetFrame: true, navigationType: "other" })).toBe("allow");
  expect(
    ios({ url: "https://www.youtube-nocookie.com/embed/x", isTopFrame: false, hasTargetFrame: true, navigationType: "other" }),
  ).toBe("allow");
  expect(
    ios({ url: "https://googleads.g.doubleclick.net/pagead/id", isTopFrame: false, hasTargetFrame: true, navigationType: "other" }),
  ).toBe("allow");
  // Expo Go has no page address of its own: about:blank.
  expect(embedNavigation({ url: "about:blank", isTopFrame: true }, { framesKnown: true })).toBe("allow");
});

test("the embed's page never leaves the player", () => {
  expect(ios({ url: "https://example.com/", isTopFrame: true, hasTargetFrame: true, navigationType: "other" })).toBe("block");
  expect(ios({ url: EMBED, isTopFrame: true, hasTargetFrame: true, navigationType: "other" })).toBe("block");
  expect(ios({ url: WATCH, isTopFrame: true, hasTargetFrame: true, navigationType: "other" })).toBe("block");
});

test("Google's sign-in and consent pages never open in the player; tapped, they mean YouTube is checking the device", () => {
  // "Sign in" in YouTube's "confirm you're not a bot", as a new window or in its frame.
  expect(ios({ url: SIGN_IN, isTopFrame: true, hasTargetFrame: false, navigationType: "click" })).toBe("signin");
  expect(ios({ url: SIGN_IN, isTopFrame: false, hasTargetFrame: true, navigationType: "click" })).toBe("signin");
  expect(ios({ url: "https://consent.youtube.com/m?continue=x", isTopFrame: true, hasTargetFrame: false })).toBe("signin");
  // Sent there by a script, with no tap: quietly refused.
  expect(ios({ url: SIGN_IN, isTopFrame: false, hasTargetFrame: true, navigationType: "other" })).toBe("block");
  expect(ios({ url: SIGN_IN, isTopFrame: true, hasTargetFrame: true, navigationType: "other" })).toBe("block");
  expect(android(SIGN_IN)).toBe("signin");
});

test("a YouTube link the viewer taps opens outside the app; any other is ignored", () => {
  expect(ios({ url: WATCH, isTopFrame: true, hasTargetFrame: false, navigationType: "click" })).toBe("open");
  expect(ios({ url: WATCH, isTopFrame: false, hasTargetFrame: true, navigationType: "click" })).toBe("open");
  expect(ios({ url: "https://youtu.be/test-sermon", isTopFrame: true, hasTargetFrame: false })).toBe("open");
  expect(ios({ url: "https://support.google.com/youtube", isTopFrame: true, hasTargetFrame: false })).toBe("block");
  expect(android(WATCH)).toBe("open");
  expect(android("https://example.com/")).toBe("block");
  // Android can't tell frames apart: YouTube's player loads wherever it's asked for.
  expect(android(EMBED)).toBe("allow");
});

// ---- YouTube holding a sermon back -------------------------------------------------------

test("YouTube not playing within ten seconds of Play is noticed; playing, a pause or the end stops the wait", () => {
  const timers = fakeTimers();
  let stuck = 0;
  const watch = startWatch(() => stuck++, timers as unknown as Parameters<typeof startWatch>[1]);
  watch.command({ type: "play" });
  timers.fire(START_DEADLINE_MS);
  expect(stuck).toBe(1);

  for (const [name, settle] of [
    ["playing", () => watch.state(1)],
    ["ended", () => watch.state(0)],
    ["paused", () => watch.command({ type: "pause" })],
  ] as const) {
    watch.command({ type: "play" });
    // Buffering isn't playing yet.
    watch.state(3);
    settle();
    timers.fire(START_DEADLINE_MS);
    expect(stuck, name).toBe(1);
  }

  // Each Play gives it the full ten seconds again.
  watch.command({ type: "play" });
  watch.command({ type: "seek", seconds: 30 });
  watch.command({ type: "play" });
  expect(timers.waiting(START_DEADLINE_MS)).toBe(1);
});

test("YouTube refusing to play here offers Watch on YouTube and Try again, with its own message", () => {
  for (const code of [150, 152, 153]) expect(youtubeErrorCode(code)).toBe(YOUTUBE_CHECK);
  for (const code of [2, 5, 100, 101, PLAYER_STOPPED]) expect(youtubeErrorCode(code)).toBe(code);
  expect(playerError(YOUTUBE_CHECK)).toBe(
    "YouTube wants to check this device before playing. You can watch it on YouTube, or try again.",
  );
  expect(canRetry(YOUTUBE_CHECK)).toBe(true);
  expect(canWatchOnYouTube(YOUTUBE_CHECK)).toBe(true);
});

/** Embed.tsx on an iPhone, with a stand-in web view and timers the test moves. */
function mountEmbed() {
  const host = hookHost();
  const timers = fakeTimers();
  const opened: string[] = [];
  const load = sourceLoader(
    {
      react: () => host.React,
      "react/jsx-runtime": () => jsxRuntime,
      "react-native": () => ({
        Platform: { OS: "ios" },
        Linking: {
          openURL: (url: string) => {
            opened.push(url);
            return Promise.resolve();
          },
        },
      }),
      "react-native-webview": () => ({ WebView: "WebView" }),
      "expo-constants": () => ({
        __esModule: true,
        default: { executionEnvironment: "standalone", expoConfig: { ios: { bundleIdentifier: "com.mshumba.aao" } } },
      }),
      "./types": (load) => load("player/types.ts"),
      "./youtube": (load) => load("player/youtube.ts"),
    },
    timers,
  );
  const Embed = load("player/Embed.tsx").default as (props: Record<string, unknown>) => {
    props: Record<string, (event: unknown) => unknown>;
  };
  const events: PlayerEvent[] = [];
  const ref: { current: EmbedHandle | null } = { current: null };
  const view = host.flush(() =>
    Embed({ videoId: "test-sermon", height: 211, startSeconds: 0, onEvent: (e: PlayerEvent) => events.push(e), ref }),
  );
  return {
    view: view.props,
    events,
    opened,
    timers,
    command: (command: Parameters<EmbedHandle["command"]>[0]) => ref.current!.command(command),
    /** A message from the page in the web view. */
    message: (data: unknown) => view.props.onMessage({ nativeEvent: { data: JSON.stringify(data) } }),
    navigate: (request: EmbedRequest) => view.props.onShouldStartLoadWithRequest(request),
  };
}

test("YouTube's embed that won't start after Play reports YouTube checking the device", () => {
  const stuck = mountEmbed();
  stuck.command({ type: "play" });
  stuck.message({ type: "state", state: -1, seconds: 0, duration: 600 });
  stuck.timers.fire(START_DEADLINE_MS);
  expect(stuck.events.at(-1)).toEqual({ type: "error", code: YOUTUBE_CHECK });

  const plays = mountEmbed();
  plays.command({ type: "play" });
  plays.message({ type: "state", state: 1, seconds: 1, duration: 600 });
  plays.timers.fire(START_DEADLINE_MS);
  expect(plays.events.some((e) => e.type === "error")).toBe(false);

  // YouTube's own refusal says the same.
  const refused = mountEmbed();
  refused.message({ type: "error", code: 152 });
  expect(refused.events).toEqual([{ type: "error", code: YOUTUBE_CHECK }]);
});

test("tapping Sign in in YouTube's check stays out of the player and shows the app's message; other links open outside", () => {
  const embed = mountEmbed();
  expect(embed.view.setSupportMultipleWindows).toBe(false);
  expect(embed.navigate({ url: PAGE, isTopFrame: true, hasTargetFrame: true, navigationType: "other" })).toBe(true);
  expect(embed.navigate({ url: SIGN_IN, isTopFrame: true, hasTargetFrame: false, navigationType: "click" })).toBe(false);
  expect(embed.events).toEqual([{ type: "error", code: YOUTUBE_CHECK }]);
  expect(embed.opened).toEqual([]);

  expect(embed.navigate({ url: WATCH, isTopFrame: true, hasTargetFrame: false, navigationType: "click" })).toBe(false);
  expect(embed.opened).toEqual([WATCH]);

  // Once it has played, a sign-in link is only YouTube's menu: ignored, nothing shown.
  const playing = mountEmbed();
  playing.message({ type: "state", state: 1, seconds: 1, duration: 600 });
  expect(playing.navigate({ url: SIGN_IN, isTopFrame: true, hasTargetFrame: false, navigationType: "click" })).toBe(false);
  expect(playing.events.filter((e) => e.type === "error")).toEqual([]);
});

test("YouTube checking the device shows the app's message, and Watch on YouTube carries on at the place", () => {
  const player = mountPlayer([], { hls: false });
  watchFourSeconds(player, 60);
  player.session.onEvent({ type: "error", code: YOUTUBE_CHECK });
  player.flush();
  expect(player.session.phase).toBe("error");
  expect(player.session.error).toBe(YOUTUBE_CHECK);
  player.session.watchOnYouTube();
  expect(player.opened).toEqual(["https://www.youtube.com/watch?v=test-sermon&t=64s"]);
});

test("Watch on YouTube opens YouTube at the viewer's place", () => {
  const player = mountPlayer([], { hls: false });
  watchFourSeconds(player, 300);
  player.session.watchOnYouTube();
  expect(player.opened).toEqual(["https://www.youtube.com/watch?v=test-sermon&t=304s"]);
  expect(youtubeAt("https://www.youtube.com/watch?v=x&t=9s", 0)).toBe("https://www.youtube.com/watch?v=x");
  expect(youtubeAt("https://youtu.be/x?t=9", 61.8)).toBe("https://youtu.be/x?t=61s");
});
