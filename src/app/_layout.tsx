import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { MotionProvider, useReducedMotion } from "../motion";
import { PlayerHost } from "../player/PlayerHost";
import { PlayerProvider } from "../player/PlayerProvider";
import { DemoProvider } from "../state/demo";
import { c } from "../theme";

// Keep the dark native splash up until Manrope is ready, so a cold start never
// shows white, then a spinner, then content.
SplashScreen.preventAutoHideAsync().catch(() => {});

// A link straight to a sermon or topic still opens over the tabs, so Back,
// swipe-back and the "Browse" exits all land on Home rather than leaving it.
export const unstable_settings = { anchor: "(tabs)" };

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  const ready = loaded || !!error;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  // Web has no native splash, so it shows a plain dark frame meanwhile.
  if (!ready) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  return (
    <MotionProvider>
      <DemoProvider>
        <PlayerProvider>
          <StatusBar style="light" />
          {/* The scrubber's drag and the page's scroll share touches. */}
          <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
            <Screens />
            {/* One player for the whole app, above every screen. */}
            <PlayerHost />
          </GestureHandlerRootView>
        </PlayerProvider>
      </DemoProvider>
    </MotionProvider>
  );
}

function Screens() {
  const reduced = useReducedMotion();
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
      {/* Sign-in, sign-up and reset swap in place. */}
      <Stack.Screen name="account/[mode]" options={{ animation: "fade" }} />
    </Stack>
  );
}
