// First, so crashes during start-up are reported too.
import { Sentry } from "../lib/monitoring";
import { Stack, router, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AccountProvider, useAccount } from "../auth/AccountProvider";
import { IntentRunner } from "../auth/gate";
import { blessingPresentation } from "../blessing/presentation";
import { blessingIsOnScreen, coverState, subscribeCover } from "../blessing/schedule";
import { CatalogueProvider, useCatalogue } from "../catalogue/CatalogueProvider";
import { useAppFonts } from "../fonts";
import { heroDrawn, onHeroDrawn } from "../home/Hero";
import { firstScreenShown } from "../kit/Artwork";
import { LearningProvider } from "../learning";
import { MotionProvider, useReducedMotion } from "../motion";
import { TAB_PATHS } from "../player/layout";
import { PlayerHost } from "../player/PlayerHost";
import { PlayerProvider } from "../player/PlayerProvider";
import { c } from "../theme";
import { ToastProvider } from "../toast";

// Keep the native splash up until fonts, the saved session, the first-run
// state and the library's on-device copy are ready, and the first screen
// is drawn in full (FirstRun), so a cold start never shows a blank frame,
// then a spinner, then content.
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * The splash waits this long at most for the first screen, then lifts
 * regardless: opening onto Home, for the blessing screen to appear (Home
 * decides whether it opens: src/blessing; Home stays covered in ivory
 * meanwhile) or, when none opens, for the hero to be drawn in full; on a
 * first launch, for the welcome to be pushed.
 */
const WAIT_MS = { blessing: 2500, hero: 500, welcome: 1000 } as const;

/** A value that changes once, for useSyncExternalStore. */
function flag() {
  let on = false;
  const listeners = new Set<() => void>();
  return {
    get: () => on,
    set() {
      if (on) return;
      on = true;
      for (const listener of Array.from(listeners)) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
/** The splash (or the web's cover) has lifted: the welcome fades from then on (see Screens). */
const lifted = flag();
/** The welcome is on screen (native: its push has finished; see Screens). */
const welcomeUp = flag();

// A link straight to a sermon or topic still opens over the tabs, so Back,
// swipe-back and the "Browse" exits all land on Home rather than leaving it.
export const unstable_settings = { anchor: "(tabs)" };

function RootLayout() {
  // Native: the fonts ship in the app and the splash stays until they're in.
  // Web: at most 600 ms, then size-matched stand-ins until the files arrive
  // (src/fonts). Web has no native splash, so it shows a plain ivory frame
  // meanwhile. Only the screens wait: the session, the library and the
  // paths load from the device alongside the fonts.
  const fontsReady = useAppFonts();
  return (
    <MotionProvider>
      <CatalogueProvider>
        <AccountProvider>
          {/* Needs, paths, moments and path progress (needs the account and
              the catalogue above it). */}
          <LearningProvider>
            <PlayerProvider>
              <ToastProvider>
                {fontsReady ? (
                  // The scrubber's drag and the page's scroll share touches.
                  <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
                    <Screens />
                    {/* One player for the whole app, above every screen. */}
                    <PlayerHost />
                    <IntentRunner />
                    <FirstRun />
                  </GestureHandlerRootView>
                ) : (
                  <View style={{ flex: 1, backgroundColor: c.bg }} />
                )}
              </ToastProvider>
            </PlayerProvider>
          </LearningProvider>
        </AccountProvider>
      </CatalogueProvider>
    </MotionProvider>
  );
}

/**
 * Once the session and first-run state are known: a first launch onto the
 * tabs opens the welcome. Links to a sermon (including shared links) skip
 * it. The splash (native) or a plain cover (web) stays until the first
 * screen is ready, so it lifts straight onto it and Home never flashes
 * first:
 * - opening onto Home, until the blessing screen has appeared, finished,
 *   or, when none opens, until the hero is drawn in full;
 * - on a first launch, until the welcome is in place (it opens without a
 *   transition, so nothing shows through it; see Screens);
 * - otherwise (a link) one frame, for that screen to mount.
 */
function FirstRun() {
  const account = useAccount();
  const catalogue = useCatalogue();
  const pathname = usePathname();
  const cover = useSyncExternalStore(subscribeCover, coverState, coverState);
  // null until the session and first-run state are known; then where the
  // launch lands.
  const [launch, setLaunch] = useState<"welcome" | "home" | "link" | null>(null);
  const hero = useSyncExternalStore(onHeroDrawn, heroDrawn, heroDrawn);
  const welcome = useSyncExternalStore(welcomeUp.subscribe, welcomeUp.get, welcomeUp.get);
  const [covered, setCovered] = useState(true);
  const decided = useRef(false);
  useEffect(() => {
    if (!account.ready || !catalogue.hydrated || decided.current) return;
    decided.current = true;
    const first = !account.welcomed && !account.user && TAB_PATHS.includes(pathname);
    if (first) router.push("/welcome");
    setLaunch(first ? "welcome" : pathname === "/" ? "home" : "link");
  }, [account.ready, catalogue.hydrated, account.welcomed, account.user, pathname]);

  // What the launch waits for now: the session, the welcome, the blessing
  // (or Home's decision that none opens), the hero, or nothing.
  const waiting =
    launch == null
      ? "ready"
      : launch === "welcome"
        ? welcome || (Platform.OS === "web" && pathname === "/welcome")
          ? null
          : "welcome"
        : launch === "link"
          ? null
          : cover !== "done"
            ? "blessing"
            : blessingIsOnScreen() || hero
              ? null
              : "hero";
  useEffect(() => {
    if (!covered || waiting === "ready") return;
    const lift = () => {
      // One frame for the screen underneath to be drawn.
      requestAnimationFrame(() => {
        setCovered(false);
        SplashScreen.hideAsync().catch(() => {});
        lifted.set();
        firstScreenShown();
      });
    };
    if (!waiting) return lift();
    const timer = setTimeout(lift, WAIT_MS[waiting]);
    return () => clearTimeout(timer);
  }, [covered, waiting]);
  if (!covered) return null;
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }]} />;
}

function Screens() {
  const reduced = useReducedMotion();
  const launched = useSyncExternalStore(lifted.subscribe, lifted.get, lifted.get);
  const web = Platform.OS === "web";
  const sheet = {
    // Sign-up asks over the screen it came from, which stays visible. The
    // web stack has no form sheet, so there the screen is a see-through
    // layer and join draws its own sheet and scrim.
    presentation: web ? "transparentModal" : "formSheet",
    sheetAllowedDetents: "fitToContents",
    sheetGrabberVisible: true,
    sheetCornerRadius: 24,
    contentStyle: { backgroundColor: web ? "transparent" : c.raised },
  } as const;
  const modal = {
    presentation: "modal",
    contentStyle: { backgroundColor: c.bg },
  } as const;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.bg },
        // Dark clock and icons on the ivory page. A screen drawn under the
        // status bar over dark artwork sets its own (src/kit/statusBar.ts).
        statusBarStyle: "dark",
        // Platform push transitions (and iOS swipe-back) unless the system
        // asks for reduced motion, which gets a plain fade.
        animation: reduced ? "fade" : "default",
      }}
      screenListeners={({ route }) => ({
        transitionEnd: (e) => {
          if (route.name === "welcome" && !e.data.closing) welcomeUp.set();
        },
      })}
    >
      <Stack.Screen name="(tabs)" />
      {/* First run: a full screen with no way to swipe back past it. Opened
          at a launch, under the splash, which lifts straight onto it (no
          transition, so Home never shows through); it fades away. */}
      <Stack.Screen
        name="welcome"
        options={{ animation: launched ? "fade" : "none", gestureEnabled: false }}
      />
      <Stack.Screen name="onboarding/done" options={{ gestureEnabled: false }} />
      {/* The blessing on opening the app: over everything, no swipe back. */}
      <Stack.Screen name="blessing" options={blessingPresentation} />
      <Stack.Screen name="join" options={sheet} />
      <Stack.Screen name="auth/email" options={modal} />
      <Stack.Screen name="auth/password" options={modal} />
      <Stack.Screen name="auth/code" options={modal} />
      <Stack.Screen name="auth/reset" options={modal} />
      <Stack.Screen name="auth/new-password" options={{ ...modal, gestureEnabled: false }} />
      <Stack.Screen name="auth/callback" options={{ animation: "none" }} />
      <Stack.Screen name="s/[id]" options={{ animation: "none" }} />
      {/* Sermon stage: keep edge swipe-back, but don't let mid-screen scrubber drags trigger back. */}
      <Stack.Screen name="sermon/[id]" options={{ fullScreenGestureEnabled: false }} />
      {/* A guided path: its dark cover runs under the status bar. */}
      <Stack.Screen name="path/[id]" />
      {/* Development only: every shared component with test data. */}
      <Stack.Screen name="kit" />
    </Stack>
  );
}

// Reports render crashes from release builds (src/lib/monitoring.ts).
export default Sentry.wrap(RootLayout);
