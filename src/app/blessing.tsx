import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { BlessingScreen, takeOpening } from "../blessing";
import { c } from "../theme";

/**
 * The blessing screen, opened by Home when one is due (src/blessing). Over
 * everything: a full-screen modal on iOS and Android (no swipe back past
 * it), a full page over Home on the web that fades away to it.
 */
export default function BlessingRoute() {
  const native = Platform.OS !== "web";
  const [opening] = useState(takeOpening);
  // At a launch it's simply there (the splash lifts onto it); coming back
  // to the app it fades in over Home. Either way it fades away on Continue.
  const [fade, setFade] = useState(opening === "return");
  useEffect(() => {
    if (fade) return;
    const timer = setTimeout(() => setFade(true), 600);
    return () => clearTimeout(timer);
  }, [fade]);
  return (
    <>
      <Stack.Screen
        options={{
          presentation: native ? "fullScreenModal" : "transparentModal",
          animation: native && fade ? "fade" : "none",
          gestureEnabled: false,
          contentStyle: { backgroundColor: native ? c.bg : "transparent" },
        }}
      />
      <BlessingScreen opening={opening} />
    </>
  );
}
