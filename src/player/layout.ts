import { useSyncExternalStore } from "react";
import { StyleSheet } from "react-native";
import { space } from "../theme";

// Shared geometry so the sermon screen's player slot and the app-wide player
// agree on exactly where the video sits, without measuring during transitions.
export const HEADER_HEIGHT = 64; // Header minHeight 56 + marginBottom 8
// Pill 56 (plus its hairline border) + 8 above + 8 below. Used until measured.
const TAB_BAR_HEIGHT = 72 + StyleSheet.hairlineWidth * 2;
const DOCK_BAR_HEIGHT = 56;
export const DOCK_MARGIN = 12;
export const DOCK_PAD = 8;
const MIN_PLAYER = 200; // YouTube's minimum embedded player size
// Space kept for the page itself: under the full player for the title and
// controls to scroll in, and beside the dock for the page being browsed.
const PAGE_ROOM = 160;

/** Routes that show the tab bar, so the dock sits above it. */
export const TAB_PATHS = ["/", "/topics", "/search", "/account"];

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

/** Where the video sits on the sermon (Now Playing) screen. */
export function fullFrame(window: Size, insets: Insets) {
  const page = Math.min(window.width, 760);
  let width = page - space.gutter * 2;
  let left = (window.width - page) / 2 + space.gutter;
  // Below YouTube's minimum width, run the player edge to edge.
  if (width < MIN_PLAYER) {
    width = window.width;
    left = 0;
  }
  let height = Math.max(MIN_PLAYER, (width * 9) / 16);
  // Keep room below for the title and controls: at most 45% of the window
  // (a desktop browser), and never so tall on a short window that they can't
  // scroll into view.
  const room = Math.max(
    MIN_PLAYER,
    Math.min(
      window.height * 0.45,
      window.height - insets.top - HEADER_HEIGHT - PAGE_ROOM,
    ),
  );
  if (height > room) {
    height = room;
    // Narrower to keep 16:9, still aligned with the text column below.
    width = Math.min(width, Math.max(MIN_PLAYER, (height * 16) / 9));
  }
  return {
    left,
    top: insets.top + HEADER_HEIGHT,
    width,
    height,
    radius: width === window.width ? 0 : 12,
  };
}

/** From this width the dock is a small card in the bottom-right corner. */
const WIDE = 768;

/**
 * The docked player: a card above the tab bar (or the home indicator), its
 * video at YouTube's 200pt minimum height. On a wide window it sits in the
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
