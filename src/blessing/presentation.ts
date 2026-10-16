import { Platform } from "react-native";
import { c } from "../theme";
import { peekOpening } from "./schedule";

/**
 * How the blessing screen is presented, registered with the other modals in
 * the root layout: over everything, as a full-screen modal on iOS and
 * Android (no swipe back past it), and on the web a see-through layer over
 * Home that draws its own page and fades away to it.
 *
 * Native: at a launch it's simply there (the splash lifts onto it); coming
 * back to the app it fades in over Home. Once it's up the route switches to
 * a fade, so it always fades away on Continue (src/app/blessing.tsx).
 */
export function blessingPresentation() {
  const native = Platform.OS !== "web";
  return {
    presentation: native ? "fullScreenModal" : "transparentModal",
    animation: native && peekOpening() === "return" ? "fade" : "none",
    gestureEnabled: false,
    contentStyle: { backgroundColor: native ? c.bg : "transparent" },
  } as const;
}
