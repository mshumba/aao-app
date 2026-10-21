import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { BlessingScreen, takeOpening } from "../blessing";

/**
 * The blessing screen, opened by Home when one is due (src/blessing). How
 * it's presented is registered in the root layout (blessingPresentation).
 */
export default function BlessingRoute() {
  const native = Platform.OS !== "web";
  const [opening] = useState(takeOpening);
  // Native: at a launch it opens with no animation (the splash lifts onto
  // it); once it's up, or from the start when coming back to the app, it
  // fades, so it always fades away on Continue.
  const [fade, setFade] = useState(opening === "return");
  useEffect(() => {
    if (fade || !native) return;
    const timer = setTimeout(() => setFade(true), 600);
    return () => clearTimeout(timer);
  }, [fade, native]);
  return (
    <>
      {native && fade ? <Stack.Screen options={{ animation: "fade" }} /> : null}
      <BlessingScreen opening={opening} />
    </>
  );
}
