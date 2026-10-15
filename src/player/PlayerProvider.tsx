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
import { useAccount } from "../auth/AccountProvider";
import type { WatchProgress } from "../auth/types";
import { Sermon } from "../data/sermons";
import { MIN_RESUME, SAVE_EVERY, isFinished, resumePoint } from "./progress";
import { EmbedHandle, PlayerCommand, PlayerEvent, playerError } from "./types";

export type Phase = "idle" | "loading" | "ready" | "error";

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
  retry: () => void;
  close: () => void;
  /** Pause, and cancel a start still waiting for the player to load. */
  hold: () => void;
  /** Moves keyboard focus into the provider's player (web). */
  focusPlayer: () => void;
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
  status: string;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  skip: (delta: number) => void;
  cycleRate: () => void;
};

const SessionContext = createContext<Session | null>(null);
const PlaybackContext = createContext<Playback | null>(null);

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
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const embed = useRef<EmbedHandle>(null);
  const account = useAccount();
  // Read when saving, so saves never re-create the player's callbacks.
  const accountRef = useRef(account);
  useEffect(() => {
    accountRef.current = account;
  }, [account]);
  const [sermon, setSermon] = useState<Sermon | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  const [error, setError] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [start, setStart] = useState(0);
  const [resumedFrom, setResumedFrom] = useState(0);
  const [cover, setCover] = useState<"on" | "fading" | "off">("off");
  const [stage, setStageState] = useState<string | null>(null);
  const [dockAboveTabs, setDockAboveTabs] = useState(false);
  const [state, setState] = useState(-1);
  const [seconds, setSeconds] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [status, setStatus] = useState("");
  const [started, setStarted] = useState(false);
  const position = useRef(0);
  // The loaded sermon and its length, for saves made from callbacks.
  const current = useRef<Sermon | null>(null);
  const length = useRef(0);
  const savedAt = useRef(0);
  const resumeNote = useRef(0);
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
  }, [clearBlockedCheck]);

  const begin = useCallback((next: Sermon, from: number) => {
    // Keep the place in the sermon being replaced.
    if (current.current && current.current.id !== next.id) persist("moment");
    current.current = next;
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
    setStatus(LOADING);
    // iOS has no live regions, so the loading step is announced there.
    if (Platform.OS === "ios")
      AccessibilityInfo.announceForAccessibility("Loading the sermon.");
  }, [clearBlockedCheck, persist]);

  /**
   * The account's progress arrived after this sermon started loading (a
   * Watch straight after signing in). Jump to the saved place, unless the
   * viewer has already moved on from the start.
   */
  const catchUp = useCallback(
    (id: string, items: WatchProgress[]) => {
      const loaded = current.current;
      if (!loaded || loaded.id !== id) return;
      const from = resumePoint(items.find((item) => item.sermonId === id) ?? null);
      if (!from || position.current >= MIN_RESUME) return;
      resumeNote.current = from;
      setResumedFrom(from);
      if (phaseRef.current === "loading") return begin(loaded, from);
      position.current = from;
      if (phaseRef.current !== "ready") return; // Try again starts there.
      setSeconds(from);
      command({ type: "seek", seconds: from });
    },
    [begin, command],
  );

  const load = useCallback(
    (next: Sermon, at?: number) => {
      if (pending.current && sermon?.id === next.id) return;
      // Asked for a place: start there, with no "Resuming at" note.
      if (at != null && Number.isFinite(at) && at >= 0) {
        resumeNote.current = 0;
        setResumedFrom(0);
        begin(next, Math.floor(at));
        return;
      }
      // A signed-in viewer picks up where they left off.
      const viewer = accountRef.current;
      let from = 0;
      if (viewer.user && viewer.progressReady)
        from = resumePoint(viewer.progressFor(next.id));
      else if (viewer.user)
        viewer.whenProgressReady().then((items) => items && catchUp(next.id, items));
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
    current.current = null;
    resumeNote.current = 0;
    setResumedFrom(0);
    clearBlockedCheck();
    pending.current = false;
    autoplay.current = false;
    setSermon(null);
    setPhase("idle");
    setError(null);
    setCover("off");
    setStatus("");
    setState(-1);
  }, [clearBlockedCheck, persist]);

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
        // The viewer pressed Watch, so start as soon as the provider can,
        // unless the app has gone to the background meanwhile. Until it
        // actually plays, keep saying it's loading; if it hasn't played after
        // a few seconds, say what to do.
        if (autoplay.current && AppState.currentState !== "background") {
          starting.current = true;
          const check = (first: boolean) => {
            blockedCheck.current = setTimeout(
              () => {
                const s = latestState.current;
                if (s === 1 || s === 0) return;
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
      setState(e.state);
      if (Platform.OS === "ios" && e.state === 0)
        AccessibilityInfo.announceForAccessibility("Sermon ended.");
      // A start still resolving keeps its message; a refused one keeps its
      // advice until the video really plays.
      if (starting.current) return;
      setStatus(blocked.current ? BLOCKED : statusFor(e.state));
    },
    [command, fail, clearBlockedCheck, persist],
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
      retry,
      close,
      hold,
      focusPlayer,
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
      retry,
      close,
      hold,
      focusPlayer,
      watchOnYouTube,
      onEvent,
      attach,
    ],
  );

  const playing = state === 1 || (state === 3 && started);
  const playback = useMemo<Playback>(() => {
    const clamp = (s: number) =>
      Math.max(0, duration ? Math.min(s, duration - 1) : s);
    return {
      state,
      playing,
      seconds,
      duration,
      rate,
      status,
      play: () => command({ type: "play" }),
      pause: hold,
      toggle: () => (playing ? hold() : command({ type: "play" })),
      seek: (s) => {
        const to = clamp(s);
        position.current = to;
        setSeconds(to);
        command({ type: "seek", seconds: to });
      },
      skip: (delta) => {
        const to = clamp(position.current + delta);
        position.current = to;
        setSeconds(to);
        command({ type: "seek", seconds: to });
      },
      cycleRate: () => {
        const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length] ?? 1;
        setRate(next);
        command({ type: "rate", rate: next });
      },
    };
  }, [state, seconds, duration, rate, status, command, hold, playing]);

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
