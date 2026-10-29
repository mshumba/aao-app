import { Href, router, useNavigation, useNavigationContainerRef } from "expo-router";
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

/** As much of the navigation state as useExitTo reads and resets. */
type Route = {
  key?: string;
  name: string;
  path?: string;
  state?: { index?: number; routes: Route[] };
};
type MainStack = {
  getState(): { routes: Route[] } | undefined;
  reset(state: { index: number; routes: Route[] }): void;
};

/** The route with this key, however deep in `state`. */
function routeWithKey(state: { routes: Route[] } | undefined, key: string): Route | undefined {
  for (const route of state?.routes ?? []) {
    if (route.key === key) return route;
    const found = routeWithKey(route.state, key);
    if (found) return found;
  }
}

/**
 * Leaves the screens opened over the tabs for a tab root ("Browse all
 * sermons", "See all paths"). For screens of the app's main stack.
 *
 * On the web, closing screens steps back through the browser's history, and
 * expo-router waits only 100ms for the browser to get there: a step that
 * lands later, as on a busy phone, is taken for the viewer's own Back and
 * puts the app back on the page it landed on, after the tab has changed. So
 * it steps back only to the tab's own page, when the screens were opened
 * from that tab, as Back would. Otherwise the tab takes this page's place
 * in the history (a reset, which expo-router records as a replace), so the
 * browser's Back returns to where the screens were opened from.
 */
export function useExitTo() {
  const navigation = useNavigation<MainStack>();
  const container = useNavigationContainerRef();
  return useCallback(
    (href: "/" | "/search" | "/paths") => {
      if (Platform.OS !== "web") return router.dismissTo(href);
      const name = href.slice(1) || "index";
      const routes = navigation.getState()?.routes ?? [];
      const at = routes.findIndex((route) => route.name === "(tabs)");
      const tabs = at < 0 ? undefined : routes[at];
      // The tabs as they're drawn, which the container asks each navigator
      // for. Until the viewer first switches tab, the stack's own copy is
      // only what the address said: the one tab, with no key.
      const shown = tabs?.key ? routeWithKey(container.getRootState(), tabs.key)?.state : undefined;
      // A screen opened from an address (a link, a reload) sits over tabs
      // that have no page of their own in the history.
      const fromTab = !!tabs && !routes[at + 1]?.path;
      if (fromTab && shown?.routes[shown.index ?? 0].name === name) return router.dismissAll();
      // The same tabs, by key so none is drawn afresh, with this one in front.
      const kept = shown?.routes ?? [];
      const index = kept.findIndex((route) => route.name === name);
      navigation.reset({
        index: 0,
        routes: [
          {
            ...(tabs ?? { name: "(tabs)" }),
            state: index < 0 ? { routes: [...kept, { name }], index: kept.length } : { routes: kept, index },
          },
        ],
      });
    },
    [navigation, container],
  );
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
