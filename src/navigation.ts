import { Href, router, useNavigation } from "expo-router";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Platform } from "react-native";

/**
 * Runs `effect` each time the screen comes to the front, and its cleanup
 * when the screen leaves it (React Navigation's own useFocusEffect).
 * expo-router's version first waits for the navigation state with a state
 * update, which drew every caller twice as it mounted: each screen, and
 * each row and button that navigates (useGo).
 */
export function useFocusEffect(effect: () => void | (() => void)) {
  const navigation = useNavigation();
  useEffect(() => {
    let focused = false;
    let cleanup: void | (() => void);
    const enter = () => {
      if (focused) return;
      cleanup?.();
      cleanup = effect();
      focused = true;
    };
    const leave = () => {
      cleanup?.();
      cleanup = undefined;
      focused = false;
    };
    if (navigation.isFocused()) enter();
    const offFocus = navigation.addListener("focus", enter);
    const offBlur = navigation.addListener("blur", leave);
    return () => {
      cleanup?.();
      offFocus();
      offBlur();
    };
  }, [effect, navigation]);
}

// Web: the second tap of a double tap lands on whatever the next screen has
// right there (a row, a card), since nothing blocks touches while it opens.
// A press on another control that starts where, and just after, the press
// that navigated is that second tap, and is dropped.
type Down = { t: number; x: number; y: number };
let down: Down | null = null;
let navDown: Down | null = null;
/** Which control (its useNavigate) navigated last. */
let navOwner: object | null = null;
if (Platform.OS === "web" && typeof document !== "undefined")
  document.addEventListener(
    "pointerdown",
    (e) => {
      down = { t: Date.now(), x: e.clientX, y: e.clientY };
    },
    true,
  );
function secondTap() {
  if (!down || !navDown || down === navDown) return false;
  return down.t - navDown.t < 400 && Math.abs(down.x - navDown.x) < 30 && Math.abs(down.y - navDown.y) < 30;
}

/**
 * Navigation that ignores repeated taps. After one push, replace or back,
 * further calls from the same control are dropped until its screen is focused
 * again, so a double tap can't stack duplicate screens (nor, on the web, open
 * whatever the next screen has under the second tap). The lock also lifts
 * after 700ms in case an action didn't leave the screen.
 */
export function useNavigate() {
  const self = useRef({});
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
      if (locked.current || (secondTap() && navOwner !== self.current)) return;
      locked.current = true;
      // Started by a new press: remember it. Otherwise (a key, Escape) it
      // ends any double tap.
      const pressed = down !== navDown;
      navDown = pressed ? down : null;
      navOwner = pressed ? self.current : null;
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

/** The same object for the control's life, so callbacks built on it can be kept. */
export function useGo() {
  const once = useNavigate();
  return useMemo(
    () => ({
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
    }),
    [once],
  );
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

// Continue watching opens a sermon and resumes it in one tap. The sermon's
// screen starts the player once it has settled, so the player never flashes
// in the dock first. A request left by a swallowed tap expires.
let watchRequest: { id: string; at: number } | null = null;
export function requestWatch(sermonId: string) {
  watchRequest = { id: sermonId, at: Date.now() };
}
export function watchRequested(sermonId: string) {
  const request = watchRequest;
  return !!request && request.id === sermonId && Date.now() - request.at < 5000;
}
export function clearWatchRequest() {
  watchRequest = null;
}
