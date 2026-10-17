import { useSyncExternalStore } from "react";
import { StyleSheet, type View } from "react-native";

// Shared geometry so the sermon screen's player slot and the app-wide player
// agree on exactly where the video sits, without measuring during transitions.
/**
 * The sermon stage's light header between the status bar and the video: 44pt
 * of round buttons (Back and the days/moments drawer) and 12pt of air.
 */
export const STAGE_BAR = 56;
// Pill 56 (plus its hairline border) + 8 above + 8 below. Used until measured.
const TAB_BAR_HEIGHT = 72 + StyleSheet.hairlineWidth * 2;
const DOCK_BAR_HEIGHT = 48;
export const DOCK_MARGIN = 12;
/** Round the docked video: none, so it sits flush in the dock's top corners. */
export const DOCK_PAD = 0;
const MIN_PLAYER = 200; // YouTube's minimum embedded player size
// Space kept for the page itself: under the full player for the title and
// controls to scroll in, and beside the dock for the page being browsed.
const PAGE_ROOM = 160;

/** Routes that show the tab bar, so the dock sits above it. */
export const TAB_PATHS = ["/", "/paths", "/search", "/account"];

type Size = { width: number; height: number };
type Insets = { top: number; bottom: number };

/**
 * Heights that grow with the system text size: the tab bar (including its
 * safe-area padding) and the dock's title bar. Measured where they render.
 */
export type Chrome = { tabBar: number | null; dockBar: number };
let chrome: Chrome = { tabBar: null, dockBar: DOCK_BAR_HEIGHT };
const listeners = new Set<() => void>();
export function setChrome(key: keyof Chrome, value: number) {
  const current = chrome[key];
  if (current !== null && Math.abs(current - value) < 0.5) return;
  chrome = { ...chrome, [key]: value };
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useChrome() {
  return useSyncExternalStore(subscribe, () => chrome, () => chrome);
}

export type StageMarks = {
  moments: readonly { key: string; at: number }[];
  activeKey?: string | null;
  estimate: number;
};

export type StageOverlayState = {
  marks: StageMarks;
  glideKey: number;
  fullscreen: boolean;
  focusToggleKey: number;
};

const EMPTY_MARKS: StageMarks = { moments: [], activeKey: null, estimate: 0 };
let stageOverlay: StageOverlayState = {
  marks: EMPTY_MARKS,
  glideKey: 0,
  fullscreen: false,
  focusToggleKey: 0,
};

/** Shared ref to the Play/Pause button on the stage overlay, for focus management. */
export const stageToggleRef: { current: View | null } = { current: null };
let pendingToggleFocus = false;

export function setStageOverlay(partial: Partial<StageOverlayState>) {
  stageOverlay = { ...stageOverlay, ...partial };
  listeners.forEach((listener) => listener());
}

export function bumpStageFocusToggle() {
  pendingToggleFocus = true;
  stageOverlay = { ...stageOverlay, focusToggleKey: stageOverlay.focusToggleKey + 1 };
  listeners.forEach((listener) => listener());
}

export function consumeStageFocusToggle() {
  if (!pendingToggleFocus) return false;
  pendingToggleFocus = false;
  return true;
}

export function clearStageFocusToggle() {
  pendingToggleFocus = false;
}

export function useStageOverlay() {
  return useSyncExternalStore(subscribe, () => stageOverlay, () => stageOverlay);
}

/**
 * Where the video sits on the sermon (Now Playing) screen: flush under the
 * stage bar, edge to edge on a phone (the stage is the whole width). On a
 * wide or short window it keeps 16:9 at a height that leaves room for the
 * page below, centred on the page.
 */
export function fullFrame(window: Size, insets: Insets) {
  const top = insets.top + STAGE_BAR;
  let width = window.width;
  let height = Math.max(MIN_PLAYER, Math.round((width * 9) / 16));
  // At most 45% of the window (a desktop browser), and never so tall on a
  // short window that the title and controls can't scroll into view.
  const room = Math.max(
    MIN_PLAYER,
    Math.min(window.height * 0.45, window.height - top - PAGE_ROOM),
  );
  if (height > room) {
    height = room;
    width = Math.min(width, Math.max(MIN_PLAYER, (height * 16) / 9));
  }
  return {
    left: (window.width - width) / 2,
    top,
    width,
    height,
    radius: width >= window.width ? 0 : 12,
  };
}

/**
 * The stage's text column (title, transport, the panel below): the video's
 * width on a wide window so they line up, and at least a comfortable
 * reading width when a short window shrinks the video.
 */
export function stageColumn(window: Size, frame: { width: number }) {
  return Math.min(window.width, Math.max(frame.width, 560));
}

/** From this width the dock is a small card in the bottom-right corner. */
const WIDE = 768;

/**
 * The docked player: a card above the tab bar (or the home indicator), its
 * video flush at the top at YouTube's 200pt minimum height, a slim bar
 * under it. On a wide window it sits in the
 * bottom-right corner. Where the window is too short to show a video and
 * still leave the page usable, it's compact: just the bar, with the video
 * hidden and paused.
 */
export function dockFrame(
  window: Size,
  insets: Insets,
  aboveTabs: boolean,
  { tabBar, dockBar }: Chrome,
) {
  const bottom = aboveTabs
    ? (tabBar ?? TAB_BAR_HEIGHT + insets.bottom)
    : DOCK_MARGIN + insets.bottom;
  const widest = Math.min(window.width - DOCK_MARGIN * 2, 560);
  const videoHeight = MIN_PLAYER;
  let width = Math.min(widest, (videoHeight * 16) / 9 + DOCK_PAD * 2);
  if (width - DOCK_PAD * 2 < MIN_PLAYER) width = window.width;
  const video = Math.max(MIN_PLAYER, width - DOCK_PAD * 2);
  const full = DOCK_PAD + videoHeight + dockBar;
  const compact =
    window.height - insets.top - bottom - full - DOCK_MARGIN < PAGE_ROOM;
  const wide = window.width >= WIDE;
  return {
    left: wide
      ? window.width - width - DOCK_MARGIN * 2
      : (window.width - width) / 2,
    width,
    bottom,
    height: compact ? dockBar : full,
    video,
    videoHeight,
    compact,
  };
}
