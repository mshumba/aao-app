import { expect, test } from "@playwright/test";
import {
  HLS_CHECK_MS,
  HLS_MISSING_FOR_MS,
  chooseEngine,
  hlsCheck,
  hlsUrl,
  type HlsCheckDeps,
} from "../src/player/media";
import type { EmbedHandle, PlayerEvent } from "../src/player/types";
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

// The app's own video player for sermons on R2, run in Node: what's on R2
// and how long that's believed, which player plays a sermon (and the hand
// over to YouTube when the app's own player fails), and how the app's own
// player reports in YouTube's terms.

const SERMON: HarnessSermon = { id: "test-sermon", source: "https://www.youtube.com/watch?v=test-sermon" };

/** Watch, the player becomes ready, and the sermon plays four seconds in. */
const watchFourSeconds = (player: MountedPlayer, from = 0) => playFourSeconds(player, SERMON, from);
// ---- What's on R2 (media.ts) -------------------------------------------------------------

type Answer = { ok: boolean; status: number } | "hang" | "offline";

/** R2 as a test wants it to answer, with a clock and timers the test moves. */
function r2(answer: Answer) {
  const timers = fakeTimers();
  let now = 1_000_000;
  const asked: string[] = [];
  const deps: HlsCheckDeps = {
    fetch: (url, init) => {
      asked.push(`${init.method} ${url}`);
      if (answer === "offline") return Promise.reject(new Error("offline"));
      if (answer === "hang")
        return new Promise((_resolve, reject) =>
          init.signal.addEventListener("abort", () => reject(new Error("aborted"))),
        );
      return Promise.resolve(answer);
    },
    now: () => now,
    setTimeout: timers.setTimeout as unknown as HlsCheckDeps["setTimeout"],
    clearTimeout: timers.clearTimeout as unknown as HlsCheckDeps["clearTimeout"],
  };
  return {
    check: hlsCheck(deps),
    asked,
    timers,
    later: (ms: number) => {
      now += ms;
    },
  };
}

test("a sermon's HLS is asked for at its R2 address", async () => {
  expect(hlsUrl("nUW8NT2Pe88")).toBe("https://audio.aaolearning.com/video/nUW8NT2Pe88/master.m3u8");
  const { check, asked } = r2({ ok: true, status: 200 });
  expect(await check.has("nUW8NT2Pe88")).toBe(true);
  expect(asked).toEqual(["HEAD https://audio.aaolearning.com/video/nUW8NT2Pe88/master.m3u8"]);
});

test("a sermon on R2 is remembered for the rest of the session", async () => {
  const { check, asked, later } = r2({ ok: true, status: 200 });
  expect(check.known(SERMON.id)).toBeUndefined();
  expect(await check.has(SERMON.id)).toBe(true);
  later(24 * 60 * 60 * 1000);
  expect(check.known(SERMON.id)).toBe(true);
  expect(await check.has(SERMON.id)).toBe(true);
  expect(asked).toHaveLength(1);
});

test("a sermon not uploaded yet is believed missing for ten minutes, then asked about again", async () => {
  const { check, asked, later } = r2({ ok: false, status: 404 });
  expect(await check.has(SERMON.id)).toBe(false);
  later(HLS_MISSING_FOR_MS - 1000);
  expect(check.known(SERMON.id)).toBe(false);
  expect(await check.has(SERMON.id)).toBe(false);
  expect(asked).toHaveLength(1);
  later(1000);
  expect(check.known(SERMON.id)).toBeUndefined();
  expect(await check.has(SERMON.id)).toBe(false);
  expect(asked).toHaveLength(2);
});

test("an answer slower than two seconds counts as no, and isn't remembered", async () => {
  const { check, asked, timers } = r2("hang");
  const answer = check.has(SERMON.id);
  expect(timers.waiting(HLS_CHECK_MS)).toBe(1);
  timers.fire(HLS_CHECK_MS);
  expect(await answer).toBe(false);
  expect(check.known(SERMON.id)).toBeUndefined();
  void check.has(SERMON.id);
  expect(asked).toHaveLength(2);
});

test("being offline or a server error counts as no for now, not for ten minutes", async () => {
  for (const answer of ["offline", { ok: false, status: 503 }] as const) {
    const { check, timers } = r2(answer);
    expect(await check.has(SERMON.id)).toBe(false);
    expect(check.known(SERMON.id)).toBeUndefined();
    // The two-second limit is cleared once there's an answer.
    expect(timers.waiting()).toBe(0);
  }
});

test("asking about a sermon again while it's being asked shares the one request", async () => {
  const { check, asked } = r2({ ok: true, status: 200 });
  check.prefetch(SERMON.id);
  const [first, second] = await Promise.all([check.has(SERMON.id), check.has(SERMON.id)]);
  expect([first, second]).toEqual([true, true]);
  expect(asked).toHaveLength(1);
});

test("the app's own player plays what's on R2, YouTube the rest and what it failed on", () => {
  expect(chooseEngine(true, false)).toBe("native");
  expect(chooseEngine(false, false)).toBe("youtube");
  expect(chooseEngine(undefined, false)).toBeNull();
  expect(chooseEngine(true, true)).toBe("youtube");
  expect(chooseEngine(undefined, true)).toBe("youtube");
});

// ---- Which player plays it (PlayerProvider) ----------------------------------------------

test("a sermon on R2 plays in the app's own player, and one that isn't from YouTube", () => {
  const onR2 = mountPlayer([], { hls: true });
  onR2.session.load(SERMON);
  onR2.flush();
  expect(onR2.session.engine).toBe("native");

  const notYet = mountPlayer([], { hls: false });
  notYet.session.load(SERMON);
  notYet.flush();
  expect(notYet.session.engine).toBe("youtube");
});

test("until it's known whether the sermon is on R2 nothing plays, then the answer picks the player", async () => {
  for (const has of [true, false]) {
    const player = mountPlayer([], { hls: "ask" });
    player.session.load(SERMON);
    player.flush();
    expect(player.session.engine).toBeNull();
    expect(player.session.phase).toBe("loading");
    await player.answerHls(has);
    expect(player.session.engine).toBe(has ? "native" : "youtube");
    expect(player.session.phase).toBe("loading");
  }
});

test("an answer for a load that has been closed or replaced changes nothing", async () => {
  const player = mountPlayer([], { hls: "ask" });
  player.session.load(SERMON);
  player.flush();
  player.session.close();
  player.flush();
  await player.answerHls(true);
  expect(player.session.engine).toBeNull();

  player.session.load(SERMON);
  player.flush();
  player.session.load({ ...SERMON, id: "another-sermon" });
  player.flush();
  await player.answerHls(true);
  expect(player.session.engine).toBeNull();
  await player.answerHls(false);
  expect(player.session.engine).toBe("youtube");
});

test("the web keeps the YouTube embed without asking R2", () => {
  const player = mountPlayer([], { hls: true, platform: "web" });
  player.session.load(SERMON);
  player.flush();
  expect(player.session.engine).toBe("youtube");
});

test("the app's own player failing before the sermon plays hands it to YouTube at the same place, for the session", () => {
  const player = mountPlayer([], { hls: true });
  player.session.load(SERMON, 300);
  player.flush();
  const attempt = player.session.attempt;
  player.session.onEvent({ type: "ready", duration: 600 });
  player.flush();
  player.session.onEvent({ type: "error", code: 0 });
  player.flush();
  expect(player.session.engine).toBe("youtube");
  expect(player.session.phase).toBe("loading");
  expect(player.session.error).toBeNull();
  expect(player.session.attempt).toBe(attempt + 1);
  expect(player.session.start).toBe(300);
  // YouTube is ready: it starts there, as the viewer asked.
  player.session.onEvent({ type: "ready", duration: 600 });
  player.flush();
  expect(player.commands).toEqual(["play", "play"]);
  // Loaded again later in the session, it's YouTube's straight away.
  player.session.close();
  player.flush();
  player.session.load(SERMON);
  player.flush();
  expect(player.session.engine).toBe("youtube");
});

test("a place chosen while the app's own player loads is kept when YouTube takes over", () => {
  const player = mountPlayer([], { hls: true });
  player.session.load(SERMON);
  player.flush();
  player.playback.seek(120);
  player.flush();
  player.session.onEvent({ type: "error", code: 0 });
  player.flush();
  expect(player.session.engine).toBe("youtube");
  expect(player.session.start).toBe(120);
  expect(player.playback.seconds).toBe(120);
});

test("the app's own player failing after the sermon has played shows the error, and Try again uses it again", () => {
  const player = mountPlayer([], { hls: true });
  watchFourSeconds(player, 100);
  player.session.onEvent({ type: "error", code: 0 });
  player.flush();
  expect(player.session.phase).toBe("error");
  expect(player.session.error).toBe(0);
  player.session.retry();
  player.flush();
  expect(player.session.engine).toBe("native");
  expect(player.session.start).toBe(104);
});

test("the app's own player that never finishes loading hands over to YouTube, and YouTube gets its own time", () => {
  const player = mountPlayer([], { hls: true });
  player.session.load(SERMON);
  player.flush();
  player.timers.fire(15000);
  player.flush();
  expect(player.session.engine).toBe("youtube");
  expect(player.session.phase).toBe("loading");
  player.timers.fire(15000);
  player.flush();
  expect(player.session.phase).toBe("error");
});

test("leaving the app keeps the app's own player playing, and pauses YouTube", () => {
  const native = mountPlayer([], { hls: true });
  watchFourSeconds(native, 300);
  native.background();
  expect(native.commands).toEqual(["play"]);
  // Its place is saved all the same, in case the app is closed meanwhile.
  expect(native.saves).toEqual([304]);

  const youtube = mountPlayer([], { hls: false });
  watchFourSeconds(youtube, 300);
  youtube.background();
  expect(youtube.commands).toEqual(["play", "pause"]);
  expect(youtube.saves).toEqual([304]);
});

test("Try again gives the app's own player another go after it handed the sermon to YouTube", () => {
  const player = mountPlayer([], { hls: true });
  player.session.load(SERMON);
  player.flush();
  // A moment offline: the app's own player fails, then YouTube does too.
  player.session.onEvent({ type: "error", code: 0 });
  player.flush();
  expect(player.session.engine).toBe("youtube");
  player.session.onEvent({ type: "error", code: 0 });
  player.flush();
  expect(player.session.phase).toBe("error");
  player.session.retry();
  player.flush();
  expect(player.session.engine).toBe("native");
  expect(player.session.phase).toBe("loading");
});

test("the app's own player failing while the app is away, after the sermon has played, loads again paused at the place when the viewer is back", () => {
  const player = mountPlayer([], { hls: true });
  watchFourSeconds(player, 300);
  player.session.onEvent({ type: "state", state: 2, seconds: 304, duration: 600 });
  player.flush();
  const attempt = player.session.attempt;
  player.background();
  // iOS dropped the paused video's decoder.
  player.session.onEvent({ type: "error", code: 0 });
  player.flush();
  expect(player.session.phase).toBe("ready");
  expect(player.session.attempt).toBe(attempt);

  player.foreground();
  expect(player.session.engine).toBe("native");
  expect(player.session.phase).toBe("loading");
  expect(player.session.error).toBeNull();
  expect(player.session.attempt).toBe(attempt + 1);
  expect(player.session.start).toBe(304);
  // Ready again, it waits for the viewer: no second play.
  player.session.onEvent({ type: "ready", duration: 600 });
  player.flush();
  expect(player.commands).toEqual(["play"]);
  expect(player.playback.status).toBe("Press play to start");

  // The failure only reported as the app comes back counts the same.
  const late = mountPlayer([], { hls: true });
  watchFourSeconds(late, 300);
  late.background();
  late.foreground();
  late.session.onEvent({ type: "error", code: 0 });
  late.flush();
  expect(late.session.phase).toBe("loading");
  expect(late.session.engine).toBe("native");
  expect(late.session.start).toBe(304);
});

test("a slow restart keeps the tap catcher over the app's own player, so its controls can come back; over YouTube taps reach its player", () => {
  for (const hls of [true, false]) {
    const player = mountPlayer([], { hls });
    watchFourSeconds(player);
    player.session.onEvent({ type: "state", state: 2, seconds: 4, duration: 600 });
    player.flush();
    // Continue watching, on a slow network: it buffers.
    player.session.playWhenReady();
    player.session.onEvent({ type: "state", state: 3, seconds: 4, duration: 600 });
    player.flush();
    player.timers.fire(3000);
    player.flush();
    expect(player.playback.playing).toBe(true);
    expect(player.playback.status).toBe("Still loading. If it doesn’t start, tap Play.");
    expect(player.tapsReachPlayer(player.session.engine, player.playback.status)).toBe(!hls);
  }
});

// ---- The app's own player (NativeVideo.tsx) ----------------------------------------------

type Listener = (payload?: unknown) => void;

/**
 * An expo-video player as the app sees it, moved by the test. Like
 * expo-video it only reports a change: the same status or playing again
 * says nothing. Setting the speed is recorded ("rate:1.5"), since on iOS
 * that alone starts a paused player.
 */
function fakeVideoPlayer() {
  const listeners = new Map<string, Set<Listener>>();
  let rate = 1;
  const player = {
    playing: false,
    status: "idle" as string,
    currentTime: 0,
    duration: 0,
    get playbackRate() {
      return rate;
    },
    set playbackRate(next: number) {
      player.calls.push(`rate:${next}`);
      if (next === rate) return;
      rate = next;
      player.emit("playbackRateChange", { playbackRate: next });
    },
    timeUpdateEventInterval: 0,
    staysActiveInBackground: false,
    showNowPlayingNotification: false,
    preservesPitch: false,
    calls: [] as string[],
    play() {
      player.calls.push("play");
    },
    pause() {
      player.calls.push("pause");
    },
    addListener(name: string, listener: Listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(listener);
      return { remove: () => listeners.get(name)!.delete(listener) };
    },
    /** The native player reports something. */
    emit(name: string, payload?: unknown) {
      for (const listener of Array.from(listeners.get(name) ?? [])) listener(payload);
    },
    listening: () => Array.from(listeners.values()).reduce((n, set) => n + set.size, 0),
    /** Its status changes, as statusChange reports. */
    status_(status: string) {
      if (player.status === status) return;
      player.status = status;
      player.emit("statusChange", { status });
    },
    /** It starts or stops, as playingChange reports. */
    playing_(isPlaying: boolean) {
      if (player.playing === isPlaying) return;
      player.playing = isPlaying;
      player.emit("playingChange", { isPlaying });
    },
  };
  return player;
}

/** The states among `events`, as numbers, and the other events by type. */
const kinds = (events: PlayerEvent[]) => events.map((e) => (e.type === "state" ? e.state : e.type));

/** NativeVideo.tsx with a stand-in expo-video, and the source and setup it asked for. */
function loadNativeVideo() {
  const host = hookHost();
  const made: { source: unknown; player: ReturnType<typeof fakeVideoPlayer> }[] = [];
  const load = sourceLoader({
    react: () => host.React,
    "react/jsx-runtime": () => jsxRuntime,
    "expo-video": () => ({
      VideoView: "VideoView",
      useVideoPlayer: (source: unknown, setup: (player: unknown) => void) => {
        if (!made[0]) {
          const player = fakeVideoPlayer();
          setup(player);
          made.push({ source, player });
        }
        return made[0].player;
      },
    }),
    "./media": (load) => load("player/media.ts"),
    "./types": (load) => load("player/types.ts"),
  });
  const mod = load("player/NativeVideo.tsx");
  return {
    host,
    made,
    connect: mod.connect as (
      player: ReturnType<typeof fakeVideoPlayer>,
      start: number,
      emit: (event: PlayerEvent) => void,
    ) => { command: EmbedHandle["command"]; disconnect: () => void },
    NativeVideo: mod.default as (props: Record<string, unknown>) => { type: unknown; props: Record<string, unknown> },
  };
}

test("the app's own player reports in YouTube's terms and carries out the app's commands", () => {
  const { connect } = loadNativeVideo();
  const video = fakeVideoPlayer();
  const events: PlayerEvent[] = [];
  const link = connect(video, 120, (event) => events.push(event));
  const next = () => events.splice(0);

  video.status_("loading");
  video.emit("sourceLoad", { duration: 600 });
  expect(next()).toEqual([]);
  video.status_("readyToPlay");
  // Ready at the place it was asked to start from.
  expect(video.currentTime).toBe(120);
  expect(next()).toEqual([{ type: "ready", duration: 600 }]);

  link.command({ type: "play" });
  expect(video.calls).toEqual(["play"]);
  video.duration = 600;
  video.currentTime = 120.4;
  video.playing_(true);
  expect(next()).toEqual([{ type: "state", state: 1, seconds: 120.4, duration: 600 }]);
  video.emit("timeUpdate", { currentTime: 121 });
  expect(next()).toEqual([{ type: "state", state: 1, seconds: 121, duration: 600 }]);

  // Faster while it plays: the player takes it at once, and says so.
  link.command({ type: "rate", rate: 1.5 });
  expect(video.playbackRate).toBe(1.5);
  expect(next()).toEqual([{ type: "rate", rate: 1.5 }]);

  // It runs out of video while playing: buffering, not a pause.
  video.status_("loading");
  video.playing_(false);
  expect(kinds(next())).toEqual([3]);
  video.status_("readyToPlay");
  expect(next()).toEqual([]);
  video.playing_(true);
  expect(kinds(next())).toEqual([1]);

  link.command({ type: "pause" });
  expect(video.calls).toEqual(["play", "rate:1.5", "pause"]);
  video.playing_(false);
  expect(kinds(next())).toEqual([2]);
  // Not playing: no times.
  video.emit("timeUpdate", { currentTime: 121 });
  expect(next()).toEqual([]);

  link.command({ type: "seek", seconds: 300 });
  expect(video.currentTime).toBe(300);
  // No caption track on R2 yet: CC does nothing (and isn't offered).
  link.command({ type: "captions", enabled: true });
  expect(next()).toEqual([]);

  // Played to the end, once, at its length.
  link.command({ type: "play" });
  video.playing_(true);
  next();
  video.emit("playToEnd");
  video.playing_(false);
  expect(next()).toEqual([{ type: "state", state: 0, seconds: 600, duration: 600 }]);
  // Play then starts it again from the beginning.
  link.command({ type: "play" });
  expect(video.currentTime).toBe(0);
  expect(video.calls.at(-1)).toBe("play");
});

test("a player paused by the lock screen reports paused, and one paused before it ever played reports unstarted", () => {
  const { connect } = loadNativeVideo();
  const video = fakeVideoPlayer();
  const events: PlayerEvent[] = [];
  connect(video, 0, (event) => events.push(event));
  video.status_("readyToPlay");
  // The lock screen's Play, then its Pause.
  video.playing_(true);
  video.playing_(false);
  expect(kinds(events)).toEqual(["ready", 1, 2]);

  // Asked to play, it buffers before it has played, and is paused.
  const fresh = fakeVideoPlayer();
  const freshEvents: PlayerEvent[] = [];
  const link = connect(fresh, 0, (event) => freshEvents.push(event));
  fresh.status_("readyToPlay");
  link.command({ type: "play" });
  fresh.status_("loading");
  link.command({ type: "pause" });
  expect(kinds(freshEvents)).toEqual(["ready", 3, -1]);
});

test("pausing while it buffers reports paused, as expo-video says nothing then, and Play still plays", () => {
  const { connect } = loadNativeVideo();
  const video = fakeVideoPlayer();
  const events: PlayerEvent[] = [];
  const link = connect(video, 0, (event) => events.push(event));
  video.status_("readyToPlay");
  link.command({ type: "play" });
  video.playing_(true);
  // A stall: it stops playing while it loads more.
  video.status_("loading");
  video.playing_(false);
  expect(kinds(events.splice(0))).toEqual(["ready", 1, 3]);

  link.command({ type: "pause" });
  expect(video.calls).toEqual(["play", "pause"]);
  // It wasn't playing, so the player reports no change, only that it's ready.
  video.playing_(false);
  video.status_("readyToPlay");
  expect(kinds(events.splice(0))).toEqual([2]);

  link.command({ type: "play" });
  video.playing_(true);
  expect(kinds(events)).toEqual([1]);
});

test("a speed chosen while paused waits for Play, since on iOS setting it would start the sermon", () => {
  const { connect } = loadNativeVideo();
  const video = fakeVideoPlayer();
  const events: PlayerEvent[] = [];
  const link = connect(video, 0, (event) => events.push(event));
  video.status_("readyToPlay");
  link.command({ type: "play" });
  video.playing_(true);
  link.command({ type: "pause" });
  video.playing_(false);
  events.splice(0);
  video.calls.splice(0);

  link.command({ type: "rate", rate: 1.5 });
  // Nothing set on the player, so nothing starts it; the app shows the speed at once.
  expect(video.calls).toEqual([]);
  expect(video.playbackRate).toBe(1);
  expect(events.splice(0)).toEqual([{ type: "rate", rate: 1.5 }]);

  // Play: at that speed.
  link.command({ type: "play" });
  expect(video.calls.splice(0)).toEqual(["rate:1.5", "play"]);
  video.playing_(true);

  // Paused, another speed, then the lock screen's Play: it takes the speed as it starts.
  link.command({ type: "pause" });
  video.playing_(false);
  link.command({ type: "rate", rate: 2 });
  video.calls.splice(0);
  events.splice(0);
  video.playing_(true);
  expect(video.calls).toEqual(["rate:2"]);
  expect(kinds(events)).toEqual(["rate", 1]);
});

test("after an error the app's own player says nothing more and ignores commands", () => {
  const { connect } = loadNativeVideo();
  const video = fakeVideoPlayer();
  const events: PlayerEvent[] = [];
  const link = connect(video, 0, (event) => events.push(event));
  video.status_("readyToPlay");
  video.status_("error");
  video.playing_(false);
  video.emit("timeUpdate", { currentTime: 3 });
  link.command({ type: "play" });
  expect(events).toEqual([{ type: "ready", duration: undefined }, { type: "error", code: 0 }]);
  expect(video.calls).toEqual([]);
});

test("a player that was ready or failed before it was listened to says so at once, and disconnecting stops it", () => {
  const { connect } = loadNativeVideo();
  const ready = fakeVideoPlayer();
  ready.status = "readyToPlay";
  ready.duration = 600;
  const events: PlayerEvent[] = [];
  const link = connect(ready, 0, (event) => events.push(event));
  expect(events).toEqual([{ type: "ready", duration: 600 }]);
  link.disconnect();
  expect(ready.listening()).toBe(0);

  const failed = fakeVideoPlayer();
  failed.status = "error";
  const failures: PlayerEvent[] = [];
  connect(failed, 0, (event) => failures.push(event));
  expect(failures).toEqual([{ type: "error", code: 0 }]);
});

test("the app's own player plays the sermon's HLS from R2, in the background and on the lock screen, without native controls", () => {
  const { host, made, NativeVideo } = loadNativeVideo();
  const ref: { current: EmbedHandle | null } = { current: null };
  const nowPlaying = { title: "The Heart of the Father", artist: "Apostle Arome Osayi", artwork: "https://i.ytimg.com/x.jpg" };
  const view = host.flush(() =>
    NativeVideo({ videoId: "test-sermon", height: 211, startSeconds: 0, onEvent: () => {}, nowPlaying, ref }),
  );
  expect(made).toHaveLength(1);
  expect(made[0].source).toEqual({
    uri: "https://audio.aaolearning.com/video/test-sermon/master.m3u8",
    contentType: "hls",
    metadata: nowPlaying,
  });
  const video = made[0].player;
  expect(video.timeUpdateEventInterval).toBe(0.5);
  expect(video.staysActiveInBackground).toBe(true);
  expect(video.showNowPlayingNotification).toBe(true);
  // Faster or slower, the voice keeps its pitch (Android's default doesn't).
  expect(video.preservesPitch).toBe(true);
  expect(view.type).toBe("VideoView");
  expect(view.props).toMatchObject({
    nativeControls: false,
    allowsPictureInPicture: true,
    startsPictureInPictureAutomatically: true,
    surfaceType: "textureView",
  });
  ref.current!.command({ type: "play" });
  expect(video.calls).toEqual(["play"]);
  // Unmounted: no longer listening to the player.
  host.unmount();
  expect(video.listening()).toBe(0);
});
