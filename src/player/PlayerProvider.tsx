import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AccessibilityInfo, AppState, Linking, Platform } from "react-native";
import { useAccount, useWatchProgress } from "../auth/AccountProvider";
import type { WatchProgress } from "../auth/types";
import { Sermon } from "../data/sermons";
import { useCompleteDay } from "../learning/completeDay";
import { MIN_RESUME, SAVE_EVERY, isFinished, resumePoint } from "./progress";
import { EmbedHandle, PlayerCommand, PlayerEvent, playerError } from "./types";

export type Phase = "idle" | "loading" | "ready" | "error";

/** The day of a path (or teaching series) the loaded sermon plays as. */
export type PlayingDay = { pathId: string; day: number; sermonId: string };

export const RATES = [1, 1.25, 1.5, 2, 0.75];

/** Slow-changing session facts: which sermon is loaded and where it shows. */
type Session = {
  sermon: Sermon | null;
  phase: Phase;
  error: number | null;
  attempt: number;
  start: number;
  /**
   * Where this sermon picked up from the viewer's saved progress, until they
   * start over or are well past it; 0 when it started from the beginning.
   */
  resumedFrom: number;
  /** Back to the beginning of a resumed sermon. */
  startOver: () => void;
  cover: "on" | "fading" | "off";
  /** The sermon screen currently showing (and ready for) the full player. */
  stage: string | null;
  setStage: (update: (current: string | null) => string | null) => void;
  /**
   * Set while a sermon screen is closing back onto the tabs (an iOS
   * swipe-back is mid-gesture), so the dock takes its place above the tab bar
   * straight away instead of jumping up when the gesture ends.
   */
  dockAboveTabs: boolean;
  setDockAboveTabs: (value: boolean) => void;
  /**
   * Loads and starts a sermon. A signed-in viewer picks up where they left
   * off, unless `from` (seconds) asks for a place: a moment, a path day's
   * focus, a shared time.
   */
  load: (sermon: Sermon, from?: number) => void;
  /** Plays the loaded sermon, waiting for readiness when it is still loading. */
  playWhenReady: () => void;
  retry: () => void;
  close: () => void;
  /** Pause, and cancel a start still waiting for the player to load. */
  hold: () => void;
  /** Moves keyboard focus into the provider's player (web). */
  focusPlayer: () => void;
  /**
   * Which path day the loaded sermon plays as. The sermon's page sets it;
   * it stays while the sermon plays on docked, so finishing it there still
   * marks the day done. Loading another sermon (or closing) clears it.
   */
  setPathDay: (day: PlayingDay | null) => void;
  /** The last day playback marked done (`key` tells repeats apart), for a quiet notice. */
  dayDone: { pathId: string; day: number; key: number } | null;
  watchOnYouTube: () => void;
  onEvent: (event: PlayerEvent) => void;
  /** Callback ref for the embed, so the context holds no ref object. */
  attach: (handle: EmbedHandle | null) => void;
};

/** Fast-changing playback facts, updated every second while playing. */
type Playback = {
  state: number; // YouTube: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
  /** Playing, or buffering after it has started (not the first buffer of a start). */
  playing: boolean;
  seconds: number;
  duration: number;
  rate: number;
  captionsOn: boolean;
  status: string;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  skip: (delta: number) => void;
  cycleRate: () => void;
  toggleCaptions: () => void;
};

const SessionContext = createContext<Session | null>(null);
const PlaybackContext = createContext<Playback | null>(null);

// Kept with the provider's own record of the loaded sermon, for callbacks
// that only need its id when they run (Home's Watch), so the screens they
// belong to needn't re-render with every change to the session.
let loadedId: string | null = null;

/** The id of the sermon loaded in the player (playing, paused or docked), if any. */
export function loadedSermonId() {
  return loadedId;
}

const LOADING = "Loading the sermon…";
const READY = "Press play to start";
// Some browsers (Safari, for one) won't start sound they didn't see the tap
// for, and the tap on Watch happened before the player existed. YouTube's own
// play button always works.
const BLOCKED = "Tap play in the video to start";
const STILL = "Still loading. If it doesn’t start, tap play in the video.";
const ENDED = "Sermon ended";

/** Statuses that ask something of the viewer, so they're shown, not just announced. */
export function asksViewer(status: string) {
  return [LOADING, READY, BLOCKED, STILL, ENDED].includes(status);
}

function statusFor(state: number) {
  switch (state) {
    case 1:
      return "Playing";
    case 2:
      return "Paused";
    case 0:
      return ENDED;
    case 3:
      return "Buffering…";
    default:
      return READY;
  }
}

/** How far past the resume point the "Resuming at" note stays. */
const RESUME_NOTE_FOR = 120;

/**
 * One YouTube player for the whole app, so a sermon keeps playing (docked)
 * while the viewer browses. It pauses when the app goes to the background;
 * there is no background audio.
 *
 * For a signed-in viewer it also keeps their place: a sermon starts where
 * they left it, and the position is saved every 15 seconds while playing,
 * on pause, when the player docks or closes, when another sermon loads and
 * when the app goes to the background. Saving never waits on the network.
 *
 * Playing a day of a path, it marks the day done once the sermon has been
 * watched (95%, the rule Continue watching uses, or played to the end),
 * wherever the viewer is in the app by then.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const embed = useRef<EmbedHandle>(null);
  const { user } = useAccount();
  const progress = useWatchProgress();
  // Read when saving, so saves never re-create the player's callbacks.
  const accountRef = useRef({ user, ...progress });
  // The load still waiting on the account's progress for its saved place
  // (catchUp), as a ticket only that load holds, with the place it started
  // from. Anything that settles the place first drops it: the viewer
  // seeking, skipping or starting over, closing, another load, or another
  // viewer signing in.
  const lateResume = useRef<{ from: number } | null>(null);
  useEffect(() => {
    if (accountRef.current.user?.id !== user?.id) lateResume.current = null;
    accountRef.current = { user, ...progress };
  }, [user, progress]);
  const [sermon, setSermon] = useState<Sermon | null>(null);
  const [phase, setPhaseState] = useState<Phase>("idle");
  // Kept in step with every change, not after the next render: progress
  // arriving just after a load starts must see that it's loading (catchUp).
  const phaseRef = useRef<Phase>("idle");
  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);
  const [error, setError] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [start, setStart] = useState(0);
  const [resumedFrom, setResumedFrom] = useState(0);
  const [cover, setCover] = useState<"on" | "fading" | "off">("off");
  const [stage, setStageState] = useState<string | null>(null);
  const [dockAboveTabs, setDockAboveTabs] = useState(false);
  const pathDayRef = useRef<PlayingDay | null>(null);
  const [dayDone, setDayDone] = useState<Session["dayDone"]>(null);
  const completeDay = useCompleteDay();
  const completeRef = useRef(completeDay);
  useEffect(() => {
    completeRef.current = completeDay;
  }, [completeDay]);
  const [state, setState] = useState(-1);
  const [seconds, setSeconds] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [status, setStatus] = useState("");
  const [started, setStarted] = useState(false);
  const position = useRef(0);
  // The loaded sermon and its length, for saves made from callbacks.
  const current = useRef<Sermon | null>(null);
  const length = useRef(0);
  const savedAt = useRef(0);
  const resumeNote = useRef(0);
  // A saved place that arrived while the player was still loading: moved to
  // as soon as it's ready.
  const seekOnReady = useRef<number | null>(null);
  const autoplay = useRef(false);
  // A second tap on Watch before the first one renders must not load twice.
  const pending = useRef(false);
  const latestState = useRef(-1);
  // The app's own start (after Watch) hasn't resolved yet.
  const starting = useRef(false);
  // The browser refused that start; only YouTube's play button will work.
  const blocked = useRef(false);
  const blockedCheck = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearBlockedCheck = useCallback(() => {
    if (blockedCheck.current) clearTimeout(blockedCheck.current);
    blockedCheck.current = null;
  }, []);

  const command = useCallback((c: PlayerCommand) => {
    embed.current?.command(c);
  }, []);

  /**
   * Saves the viewer's place in the loaded sermon. A "tick" (every second
   * while playing) saves at most every SAVE_EVERY; other moments save at
   * once. Nothing is sent when the place hasn't changed, before the length
   * is known, or for a sermon only just started and never saved before.
   */
  const persist = useCallback((reason: "tick" | "moment" | "ended") => {
    const sermon = current.current;
    const viewer = accountRef.current;
    const total = Math.floor(length.current);
    if (!sermon || !viewer.user || !total) return;
    const now = Date.now();
    if (reason === "tick" && now - savedAt.current < SAVE_EVERY) return;
    const at = Math.min(total, Math.floor(reason === "ended" ? total : position.current));
    const finished = reason === "ended" || isFinished(at, total);
    const before = viewer.progressFor(sermon.id);
    if (!before && !finished && at < MIN_RESUME) return;
    if (
      before &&
      before.finished === finished &&
      Math.abs(before.positionSeconds - at) < 1
    )
      return;
    savedAt.current = now;
    viewer.saveProgress({
      sermonId: sermon.id,
      positionSeconds: at,
      durationSeconds: total,
      finished,
    });
  }, []);

  /**
   * Marks the playing path day done once its sermon has been watched (or
   * played to the end). Learning only marks the next day due on a path
   * the viewer is on, and only once, so this can run on every tick.
   */
  const checkDay = useCallback((ended = false) => {
    const day = pathDayRef.current;
    const loaded = current.current;
    if (!day || !loaded || loaded.id !== day.sermonId) return;
    if (!ended && !isFinished(position.current, length.current)) return;
    if (!completeRef.current(day.pathId, day.day)) return;
    setDayDone({ pathId: day.pathId, day: day.day, key: Date.now() });
  }, []);

  const setPathDay = useCallback(
    (next: PlayingDay | null) => {
      if (next && current.current?.id !== next.sermonId) return;
      pathDayRef.current = next;
      // Already watched past the line (a place far into it): done now.
      checkDay();
    },
    [checkDay],
  );

  // Shared helper that sends play and watches for refused autoplay so both
  // initial ready-autoplay and playWhenReady surface the "Tap play in the video
  // to start" / "Still loading..." guidance when the browser blocks playback.
  const startWithCheck = useCallback(() => {
    clearBlockedCheck();
    if (latestState.current !== 1) starting.current = true;
    blocked.current = false;
    const check = (first: boolean) => {
      blockedCheck.current = setTimeout(
        () => {
          const s = latestState.current;
          if (s === 1 || s === 0) {
            starting.current = false;
            return;
          }
          if (s === 3 && first) {
            setStatus(STILL);
            return check(false);
          }
          starting.current = false;
          blocked.current = true;
          setStatus(BLOCKED);
        },
        first ? 3000 : 5000,
      );
    };
    check(true);
    command({ type: "play" });
  }, [clearBlockedCheck, command]);

  // An explicit play request can arrive after hold cancelled the initial
  // start, while the same embed is still loading. Keep that intent for ready;
  // another hold (backgrounding or hiding the video) can still cancel it.
  const playWhenReady = useCallback(() => {
    // A route's transition can settle after the app has already left focus.
    if (AppState.currentState === "background") return;
    if (phaseRef.current === "loading") autoplay.current = true;
    else if (phaseRef.current === "ready") startWithCheck();
  }, [startWithCheck]);

  // The provider drops commands until it's ready, so a pause while loading
  // must also cancel the start that Watch queued.
  const hold = useCallback(() => {
    autoplay.current = false;
    starting.current = false;
    blocked.current = false;
    clearBlockedCheck();
    command({ type: "pause" });
  }, [command, clearBlockedCheck]);

  const focusPlayer = useCallback(() => embed.current?.focus(), []);

  const fail = useCallback((code: number) => {
    clearBlockedCheck();
    pending.current = false;
    autoplay.current = false;
    setPhase("error");
    setError(code);
    setStatus("");
    setCover("off");
    AccessibilityInfo.announceForAccessibility(playerError(code));
  }, [clearBlockedCheck, setPhase]);

  const begin = useCallback((next: Sermon, from: number) => {
    // Keep the place in the sermon being replaced.
    if (current.current && current.current.id !== next.id) persist("moment");
    // Another sermon isn't that path day.
    if (pathDayRef.current?.sermonId !== next.id) pathDayRef.current = null;
    current.current = next;
    loadedId = next.id;
    length.current = 0;
    savedAt.current = Date.now();
    clearBlockedCheck();
    latestState.current = -1;
    starting.current = false;
    blocked.current = false;
    setStarted(false);
    pending.current = true;
    autoplay.current = true;
    position.current = from;
    seekOnReady.current = null;
    setSermon(next);
    setError(null);
    setPhase("loading");
    setStart(Math.floor(from));
    setAttempt((a) => a + 1);
    setCover("on");
    setState(-1);
    setSeconds(Math.floor(from));
    setDuration(0);
    setRate(1);
    setCaptionsOn(false);
    setStatus(LOADING);
    // iOS has no live regions, so the loading step is announced there.
    if (Platform.OS === "ios")
      AccessibilityInfo.announceForAccessibility("Loading the sermon.");
  }, [clearBlockedCheck, persist, setPhase]);

  /**
   * The account's progress arrived from the server after this sermon started
   * loading: from the start (a Watch straight after signing in), or from
   * this device's older copy of the place (see load). Jump to the saved
   * place, unless that's where it started, the viewer has already watched
   * on from there or chose a place meanwhile (even the start itself), or
   * this load has been replaced.
   */
  const catchUp = useCallback(
    (ticket: { from: number }, id: string, items: WatchProgress[]) => {
      if (lateResume.current !== ticket) return;
      lateResume.current = null;
      const loaded = current.current;
      if (!loaded || loaded.id !== id) return;
      const from = resumePoint(items.find((item) => item.sermonId === id) ?? null);
      if (from === ticket.from || position.current - ticket.from >= MIN_RESUME) return;
      resumeNote.current = from;
      setResumedFrom(from);
      position.current = from;
      setSeconds(from);
      // Still loading: it moves there once ready (starting the load again
      // would race the first player's own ready). After an error, Try again
      // starts there.
      if (phaseRef.current === "loading") seekOnReady.current = from;
      else if (phaseRef.current === "ready") command({ type: "seek", seconds: from });
    },
    [command],
  );

  const load = useCallback(
    (next: Sermon, at?: number) => {
      if (pending.current && sermon?.id === next.id) return;
      // An earlier load's saved place, still on its way, isn't for this one.
      lateResume.current = null;
      // Asked for a place: start there, with no "Resuming at" note.
      if (at != null && Number.isFinite(at) && at >= 0) {
        resumeNote.current = 0;
        setResumedFrom(0);
        begin(next, Math.floor(at));
        return;
      }
      // A signed-in viewer picks up where they left off. Until the account's
      // progress has been read from the server, that's where this device
      // last knew (all an offline launch has), and the server's place, if
      // another device saved a newer one, follows (catchUp).
      const viewer = accountRef.current;
      let from = 0;
      if (viewer.user) {
        from = resumePoint(viewer.progressFor(next.id));
        if (!viewer.progressReady) {
          const ticket = { from };
          lateResume.current = ticket;
          viewer
            .whenProgressReady()
            .then((items) => items && catchUp(ticket, next.id, items));
        }
      }
      resumeNote.current = from;
      setResumedFrom(from);
      begin(next, from);
    },
    [begin, catchUp, sermon],
  );

  const retry = useCallback(() => {
    if (sermon && !pending.current) begin(sermon, position.current);
  }, [begin, sermon]);

  const close = useCallback(() => {
    persist("moment");
    pathDayRef.current = null;
    current.current = null;
    loadedId = null;
    lateResume.current = null;
    resumeNote.current = 0;
    setResumedFrom(0);
    clearBlockedCheck();
    pending.current = false;
    autoplay.current = false;
    setSermon(null);
    setPhase("idle");
    setError(null);
    setCover("off");
    setCaptionsOn(false);
    setStatus("");
    setState(-1);
  }, [clearBlockedCheck, persist, setPhase]);

  const watchOnYouTube = useCallback(() => {
    if (!sermon) return;
    hold();
    Linking.openURL(sermon.source).catch(() =>
      AccessibilityInfo.announceForAccessibility("Couldn’t open YouTube."),
    );
  }, [hold, sermon]);

  const onEvent = useCallback(
    (e: PlayerEvent) => {
      if (e.type === "error") return fail(e.code);
      if (e.type === "rate") return setRate(e.rate);
      pending.current = false;
      setCover((c) => (c === "on" ? "fading" : c));
      setPhase("ready");
      if (e.duration) {
        length.current = e.duration;
        setDuration(e.duration);
      }
      if (e.type === "ready") {
        if (seekOnReady.current != null) {
          command({ type: "seek", seconds: seekOnReady.current });
          seekOnReady.current = null;
        }
        // The viewer pressed Watch, so start as soon as the provider can,
        // unless the app has gone to the background meanwhile. Until it
        // actually plays, keep saying it's loading; if it hasn't played after
        // a few seconds, say what to do.
        if (autoplay.current && AppState.currentState !== "background") {
          startWithCheck();
        } else setStatus(READY);
        autoplay.current = false;
        return;
      }
      latestState.current = e.state;
      if (e.state === 1) {
        clearBlockedCheck();
        starting.current = false;
        blocked.current = false;
        setStarted(true);
      } else if (e.state === 0) {
        clearBlockedCheck();
        starting.current = false;
      }
      if (typeof e.seconds === "number") {
        position.current = e.seconds;
        setSeconds(e.seconds);
        // Well past the resume point: the "Resuming at" note has done its job.
        if (resumeNote.current && e.seconds > resumeNote.current + RESUME_NOTE_FOR) {
          resumeNote.current = 0;
          setResumedFrom(0);
        }
      }
      if (e.state === 1) persist("tick");
      else if (e.state === 2) persist("moment");
      else if (e.state === 0) persist("ended");
      checkDay(e.state === 0);
      setState(e.state);
      if (Platform.OS === "ios" && e.state === 0)
        AccessibilityInfo.announceForAccessibility("Sermon ended.");
      // A start still resolving keeps its message; a refused one keeps its
      // advice until the video really plays.
      if (starting.current) return;
      setStatus(blocked.current ? BLOCKED : statusFor(e.state));
    },
    [command, fail, clearBlockedCheck, persist, checkDay, setPhase, startWithCheck],
  );

  // Loading can't hang forever.
  useEffect(() => {
    if (phase !== "loading") return;
    const timer = setTimeout(() => fail(0), 15000);
    return () => clearTimeout(timer);
  }, [phase, attempt, fail]);

  useEffect(() => clearBlockedCheck, [clearBlockedCheck]);

  useEffect(() => {
    if (cover !== "fading") return;
    const timer = setTimeout(() => setCover("off"), 220);
    return () => clearTimeout(timer);
  }, [cover]);

  // No background audio: leaving the app pauses the sermon. iOS also reports
  // "inactive" for Control Center and Notification Center, which isn't leaving.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "background") return;
      // Saved straight away: the app may be suspended before the pause lands.
      persist("moment");
      hold();
    });
    return () => sub.remove();
  }, [hold, persist]);

  // Docking (leaving the sermon's screen) is a natural place to stop.
  const full = !!sermon && stage === sermon.id;
  const wasFull = useRef(false);
  useEffect(() => {
    if (wasFull.current && !full) persist("moment");
    wasFull.current = full;
  }, [full, persist]);

  const startOver = useCallback(() => {
    lateResume.current = null;
    resumeNote.current = 0;
    setResumedFrom(0);
    const loaded = current.current;
    if (!loaded) return;
    // The provider drops commands while it loads, so start it again from 0.
    if (phase !== "ready") return begin(loaded, 0);
    position.current = 0;
    setSeconds(0);
    command({ type: "seek", seconds: 0 });
  }, [begin, command, phase]);

  const attach = useCallback((handle: EmbedHandle | null) => {
    embed.current = handle;
  }, []);

  const setStage = useCallback(
    (update: (current: string | null) => string | null) =>
      setStageState(update),
    [],
  );

  const session = useMemo<Session>(
    () => ({
      sermon,
      phase,
      error,
      attempt,
      start,
      resumedFrom,
      startOver,
      cover,
      stage,
      setStage,
      dockAboveTabs,
      setDockAboveTabs,
      load,
      playWhenReady,
      retry,
      close,
      hold,
      focusPlayer,
      setPathDay,
      dayDone,
      watchOnYouTube,
      onEvent,
      attach,
    }),
    [
      sermon,
      phase,
      error,
      attempt,
      start,
      resumedFrom,
      startOver,
      cover,
      stage,
      setStage,
      dockAboveTabs,
      load,
      playWhenReady,
      retry,
      close,
      hold,
      focusPlayer,
      setPathDay,
      dayDone,
      watchOnYouTube,
      onEvent,
      attach,
    ],
  );

  const playing = state === 1 || (state === 3 && started);
  const playback = useMemo<Playback>(() => {
    const clamp = (s: number) =>
      Math.max(0, duration ? Math.min(s, duration - 1) : s);
    // The viewer's own choice of place: a saved one arriving late (or
    // waiting for the player to be ready) mustn't move them afterwards.
    const moveTo = (to: number) => {
      lateResume.current = null;
      // The player ignores commands until it's ready, so a choice made
      // while it loads is kept for then.
      seekOnReady.current = phaseRef.current === "loading" ? to : null;
      position.current = to;
      setSeconds(to);
      command({ type: "seek", seconds: to });
    };
    return {
      state,
      playing,
      seconds,
      duration,
      rate,
      captionsOn,
      status,
      play: () => command({ type: "play" }),
      pause: hold,
      toggle: () => (playing ? hold() : command({ type: "play" })),
      seek: (s) => moveTo(clamp(s)),
      skip: (delta) => moveTo(clamp(position.current + delta)),
      cycleRate: () => {
        const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length] ?? 1;
        setRate(next);
        command({ type: "rate", rate: next });
      },
      toggleCaptions: () => {
        const next = !captionsOn;
        setCaptionsOn(next);
        command({ type: "captions", enabled: next });
      },
    };
  }, [state, seconds, duration, rate, captionsOn, status, command, hold, playing]);

  return (
    <SessionContext.Provider value={session}>
      <PlaybackContext.Provider value={playback}>
        {children}
      </PlaybackContext.Provider>
    </SessionContext.Provider>
  );
}

export function usePlayerSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("usePlayerSession needs PlayerProvider.");
  return value;
}

export function usePlayback() {
  const value = useContext(PlaybackContext);
  if (!value) throw new Error("usePlayback needs PlayerProvider.");
  return value;
}

/** "1:05:09" or "4:07". */
export function clock(total: number) {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** "1 hour 5 minutes" for screen readers. */
export function spokenClock(total: number) {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (h) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (m) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  if (!h && sec) parts.push(`${sec} second${sec === 1 ? "" : "s"}`);
  return parts.join(" ") || "0 seconds";
}
