import { Href, router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";

/**
 * Navigation that ignores repeated taps. After one push, replace or back,
 * further calls from the same control are dropped until its screen is focused
 * again, so a double tap can't stack duplicate screens. The lock also lifts
 * after 700ms in case an action didn't leave the screen.
 */
export function useNavigate() {
  const locked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const release = useCallback(() => {
    locked.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useFocusEffect(release);
  useEffect(() => release, [release]);
  return useCallback(
    (action: () => void) => {
      if (locked.current) return;
      locked.current = true;
      timer.current = setTimeout(release, 700);
      action();
    },
    [release],
  );
}

// Back buttons sit in the same place on every screen, so the second tap of a
// double tap lands on the next screen's Back. One app-wide window stops it
// from popping two levels.
let lastBack = 0;
const BACK_WINDOW = 350;

export function useGo() {
  const once = useNavigate();
  return {
    push: (href: Href) => once(() => router.push(href)),
    replace: (href: Href) => once(() => router.replace(href)),
    // A tap swallowed by the window takes no lock, so a deliberate Back on
    // the next screen works as soon as the window closes.
    back: () => {
      if (Date.now() - lastBack < BACK_WINDOW) return;
      once(() => {
        lastBack = Date.now();
        if (router.canGoBack()) router.back();
        else router.replace("/");
      });
    },
    run: once,
  };
}

/**
 * Leaves the screens opened over the tabs for a tab root ("Browse all
 * sermons", "Continue as guest"). On web it's two steps, close then switch
 * tab, so the browser keeps an entry per place instead of rewriting the tab's
 * entry (which made the first browser Back do nothing).
 */
export function exitTo(href: "/" | "/topics") {
  if (Platform.OS !== "web") return router.dismissTo(href);
  router.dismissAll();
  setTimeout(() => router.navigate(href), 0);
}

const APP_NAME = "AAO";

/**
 * Names the browser tab and history entry after the screen on the web
 * ("Search · AAO"), so pages are told apart in tabs, history and by screen
 * readers. Set each time the screen comes to the front, since screens under
 * it (and other tabs) stay mounted.
 */
export function usePageTitle(title?: string | null) {
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "web" || !title) return;
      document.title = `${title} · ${APP_NAME}`;
    }, [title]),
  );
}

/** Route params can repeat (?q=a&q=b) and arrive as arrays; use the first. */
export function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

// Home's search field asks the Search tab to focus its input when it opens,
// without leaving a marker in the URL.
let searchFocusRequested = false;
export function requestSearchFocus() {
  searchFocusRequested = true;
}
export function takeSearchFocus() {
  const requested = searchFocusRequested;
  searchFocusRequested = false;
  return requested;
}
