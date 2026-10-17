import { usePathname } from "expo-router";
import { useLayoutEffect, useSyncExternalStore } from "react";
import { TAB_PATHS } from "./layout";
import { usePlayerSession } from "./PlayerProvider";

/** Whether the dock sits above the tab bar: on a tab, or while returning to one. */
export function useDockAboveTabs() {
  const pathname = usePathname();
  const { dockAboveTabs } = usePlayerSession();
  return TAB_PATHS.includes(pathname) || dockAboveTabs;
}

// The dock's inset, worked out once where the dock is placed (PlayerHost)
// rather than on every screen, so a screen re-renders only when the inset
// itself changes: not on each navigation, nor each change to the player.
let inset = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function currentInset() {
  return inset;
}

/**
 * PlayerHost's: hands the screens the room the dock takes. Screens already
 * up re-render with it before the frame is drawn, so their padding moves
 * with the dock rather than after it.
 */
export function usePublishDockInset(next: number) {
  useLayoutEffect(() => {
    if (next === inset) return;
    inset = next;
    listeners.forEach((listener) => listener());
  }, [next]);
}

/** Extra bottom space a screen needs so its content can scroll clear of the dock. */
export function useDockInset() {
  return useSyncExternalStore(subscribe, currentInset, currentInset);
}
