import { AppState, Platform } from "react-native";

/**
 * When the blessing screen shows (decided 15 October 2026): when the app
 * starts (a cold start), and when it comes back after 30 minutes or more in
 * the background; never on a quick switch to another app and back. Home
 * decides where (never over a link, the welcome or a sign-in): see
 * useBlessingOnOpen.
 */

/** Away at least this long, and coming back brings a new blessing. */
export const AWAY_MS = 30 * 60 * 1000;

/** How the blessing screen was asked for: the app starting, or coming back. */
export type Opening = "launch" | "return";

// A cold start is due from the moment the app's code runs.
let due: Opening | null = "launch";
let awayAt: number | null = null;
let opening: Opening | null = null;
const listeners = new Set<() => void>();

function emit(set: Set<() => void>) {
  for (const listener of Array.from(set)) listener();
}

let watching = false;

/**
 * Starts noting when the app goes to the background and, coming back, makes
 * the blessing due if it was away long enough. Once per launch; the
 * subscription lasts as long as the app.
 */
export function watchAway() {
  if (watching) return;
  watching = true;
  AppState.addEventListener("change", (next) => {
    // "inactive" (Control Centre, a call's banner, the app switcher) isn't
    // leaving; iOS passes through it on the way to "background".
    if (next === "background") {
      awayAt ??= Date.now();
      // Leaving ends the visit the blessing greeted (see blessingGreeted).
      if (greeted) {
        greeted = false;
        emit(coverListeners);
      }
    } else if (next === "active") {
      const left = awayAt;
      awayAt = null;
      if (left != null && Date.now() - left >= AWAY_MS) {
        due = "return";
        emit(listeners);
      }
    }
  });
}

/** Whether a blessing is due now, and why. */
export function dueOpening() {
  return due;
}

/** Called when Home has acted on the due blessing (shown it or passed it by). */
export function settleDue() {
  due = null;
}

/** Calls `listener` when a blessing becomes due on coming back. */
export function onDue(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Home is opening the blessing screen, for this reason. */
export function markOpening(why: Opening) {
  opening = why;
}

/** How the blessing screen now opening was asked for, without taking it (see blessingPresentation). */
export function peekOpening() {
  return opening;
}

/** How the blessing screen now opening was asked for (once; null for a link straight to it). */
export function takeOpening() {
  const why = opening;
  opening = null;
  return why;
}

// ---- Home's cover at a cold start ----------------------------------------------------

/**
 * At a cold start Home stays covered while it decides whether the blessing
 * opens, and until the blessing screen has appeared, finished, if it does;
 * the splash stays up over all of it meanwhile (src/app/_layout.tsx), so
 * it lifts straight onto the blessing or onto Home, never Home first.
 */
export type Cover = "deciding" | "opening" | "done";

/** Home stays covered this long at most while the blessing screen opens. */
const OPENING_MAX_MS = 2000;

let cover: Cover = "deciding";
let onScreen = false;
let greeted = false;
const coverListeners = new Set<() => void>();

export function setCover(next: Cover) {
  if (cover === next || cover === "done") return;
  cover = next;
  if (cover === "opening") setTimeout(() => setCover("done"), OPENING_MAX_MS);
  emit(coverListeners);
}

/** For useSyncExternalStore: whether Home is covered now. */
export function coverState(): Cover {
  return automatedSkip() ? "done" : cover;
}

export function subscribeCover(listener: () => void) {
  coverListeners.add(listener);
  return () => {
    coverListeners.delete(listener);
  };
}

/** The blessing screen is mounted (true) or has gone (false). */
export function setBlessingOnScreen(up: boolean) {
  onScreen = up;
  if (up && !greeted) {
    greeted = true;
    emit(coverListeners);
  }
}

/**
 * Whether the blessing screen has greeted the viewer on this visit to the
 * app (from its appearing until the app next goes to the background), so
 * Home's hero doesn't say "Good morning" a second time a moment later.
 * Subscribe with subscribeCover.
 */
export function blessingGreeted() {
  return greeted;
}

/**
 * The blessing screen opened at a launch is on screen with everything in
 * it (native: its modal has been presented, which a mounted screen alone
 * doesn't promise), so Home's cover and the splash can go.
 */
export function blessingAppeared() {
  if (cover === "opening") setCover("done");
}

export function blessingIsOnScreen() {
  return onScreen;
}

/**
 * Automated browsers (the end-to-end tests) skip the blessing, so tests of
 * other screens open straight onto Home; a test opts in by setting
 * `window.__aaoBlessing = "on"` before the app loads.
 */
export function automatedSkip() {
  if (Platform.OS !== "web" || typeof navigator === "undefined") return false;
  return navigator.webdriver === true && (globalThis as { __aaoBlessing?: string }).__aaoBlessing !== "on";
}
