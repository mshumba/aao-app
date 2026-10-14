// First, so crashes during start-up are reported too.
import { Sentry } from "../lib/monitoring";
import { Stack, router, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";
import {
  Newsreader_500Medium,
  Newsreader_500Medium_Italic,
  Newsreader_600SemiBold,
} from "@expo-google-fonts/newsreader";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AccountProvider, useAccount } from "../auth/AccountProvider";
import { IntentRunner } from "../auth/gate";
import { CatalogueProvider, useCatalogue } from "../catalogue/CatalogueProvider";
import { MotionProvider, useReducedMotion } from "../motion";
import { TAB_PATHS } from "../player/layout";
import { PlayerHost } from "../player/PlayerHost";
import { PlayerProvider } from "../player/PlayerProvider";
import { c } from "../theme";
import { ToastProvider } from "../toast";

// Keep the native splash up until fonts, the saved session, the first-run
// state and the library's on-device copy are ready, so a cold start never
// shows a blank frame, then a spinner, then content.
SplashScreen.preventAutoHideAsync().catch(() => {});

// A link straight to a sermon or topic still opens over the tabs, so Back,
// swipe-back and the "Browse" exits all land on Home rather than leaving it.
export const unstable_settings = { anchor: "(tabs)" };

function RootLayout() {
  const [loaded, error] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    Newsreader_500Medium,
    Newsreader_500Medium_Italic,
    Newsreader_600SemiBold,
  });
  // Web has no native splash, so it shows a plain ivory frame meanwhile.
  if (!loaded && !error) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  return (
    <MotionProvider>
      <CatalogueProvider>
        <AccountProvider>
          <PlayerProvider>
            <ToastProvider>
              {/* Dark clock and icons on the ivory page. A screen drawn under
                  the status bar over dark artwork sets its own. */}
              <StatusBar style="dark" />
              {/* The scrubber's drag and the page's scroll share touches. */}
              <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
                <Screens />
                {/* One player for the whole app, above every screen. */}
                <PlayerHost />
                <IntentRunner />
                <FirstRun />
              </GestureHandlerRootView>
            </ToastProvider>
          </PlayerProvider>
        </AccountProvider>
      </CatalogueProvider>
    </MotionProvider>
  );
}

/**
 * Once the session and first-run state are known: a first launch onto the
 * tabs opens the welcome. Links to a sermon (including shared links) skip
 * it. The splash (native) or a plain cover (web) stays until then, so Home
 * never flashes first.
 */
function FirstRun() {
  const account = useAccount();
  const catalogue = useCatalogue();
  const pathname = usePathname();
  const [covered, setCovered] = useState(true);
  const decided = useRef(false);
  useEffect(() => {
    if (!account.ready || !catalogue.hydrated || decided.current) return;
    decided.current = true;
    const first = !account.welcomed && !account.user && TAB_PATHS.includes(pathname);
    if (first) router.push("/welcome");
    // One frame for the welcome to mount under the cover.
    requestAnimationFrame(() => {
      setCovered(false);
      SplashScreen.hideAsync().catch(() => {});
    });
  }, [account.ready, catalogue.hydrated, account.welcomed, account.user, pathname]);
  if (!covered) return null;
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }]} />;
}

function Screens() {
  const reduced = useReducedMotion();
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
        // Platform push transitions (and iOS swipe-back) unless the system
        // asks for reduced motion, which gets a plain fade.
        animation: reduced ? "fade" : "default",
      }}
    >
      <Stack.Screen name="(tabs)" />
      {/* First run: a full screen with no way to swipe back past it. */}
      <Stack.Screen
        name="welcome"
        options={{ animation: "fade", gestureEnabled: false }}
      />
      <Stack.Screen name="onboarding/done" options={{ gestureEnabled: false }} />
      <Stack.Screen name="join" options={sheet} />
      <Stack.Screen name="auth/email" options={modal} />
      <Stack.Screen name="auth/password" options={modal} />
      <Stack.Screen name="auth/code" options={modal} />
      <Stack.Screen name="auth/reset" options={modal} />
      <Stack.Screen name="auth/new-password" options={{ ...modal, gestureEnabled: false }} />
      <Stack.Screen name="auth/callback" options={{ animation: "none" }} />
      <Stack.Screen name="s/[id]" options={{ animation: "none" }} />
    </Stack>
  );
}

// Reports render crashes from release builds (src/lib/monitoring.ts).
export default Sentry.wrap(RootLayout);
