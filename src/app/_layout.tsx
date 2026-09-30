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
import { useEffect, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, View } from "react-native";
import { DemoProvider } from "../state/demo";
import { c } from "../theme";
export default function RootLayout() {
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReducedMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReducedMotion,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  const [loaded, error] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  if (!loaded && !error)
    return (
      <View
        style={{ flex: 1, backgroundColor: c.bg, justifyContent: "center" }}
      >
        <ActivityIndicator color={c.mint} accessibilityLabel="Loading fonts" />
      </View>
    );
  return (
    <DemoProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
          animation: reducedMotion ? "fade" : "fade_from_bottom",
        }}
      />
    </DemoProvider>
  );
}
