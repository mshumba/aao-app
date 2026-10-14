import { cubicBezier } from "react-native-reanimated";

// Direction B palette. Values are unchanged from the approved style lock.
export const c = {
  bg: "#0e1515",
  surface: "#1c2829",
  feature: "#25494a",
  text: "#f5f3eb",
  muted: "#a9bbba",
  mint: "#c9e8d8",
  ink: "#11211b",
  border: "#3b5454",
  error: "#ffb7ad",
  // Secondary text on feature (teal) surfaces, where muted is too faint.
  mutedOnFeature: "#c8d9d7",
  // Hairline between rows that share one surface. Decorative only.
  divider: "#2a3a3b",
  // Behind small labels laid over artwork (duration chips).
  scrim: "rgba(10, 16, 16, 0.84)",
};

// One spacing step per level of subordination; gaps between groups are at
// least double the gaps inside them.
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  gutter: 22,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

export const font = {
  regular: "Manrope_400Regular",
  medium: "Manrope_500Medium",
  semibold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
  extrabold: "Manrope_800ExtraBold",
};

/**
 * Type roles. Every text style in the app starts from one of these. Kickers
 * are written in sentence case and uppercased here; verified sermon titles
 * are never transformed or re-tracked.
 */
export const type = {
  display: {
    fontFamily: font.extrabold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.6,
  },
  sermonTitle: {
    fontFamily: font.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  heading: { fontFamily: font.bold, fontSize: 19, lineHeight: 26 },
  lead: { fontFamily: font.regular, fontSize: 16, lineHeight: 25 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 24 },
  label: { fontFamily: font.semibold, fontSize: 15, lineHeight: 21 },
  caption: { fontFamily: font.regular, fontSize: 13, lineHeight: 19 },
  kicker: {
    fontFamily: font.bold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const,
  },
};

// Strong ease-out for UI state changes (Emil Kowalski, animate-expo).
export const easeOut = cubicBezier(0.23, 1, 0.32, 1);

/** Press feedback: small controls 0.97, full-width surfaces 0.98, 120ms. */
export const press = { scale: 0.97, scaleLarge: 0.98, duration: 120 };
