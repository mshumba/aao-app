import { cubicBezier } from "react-native-reanimated";

// Ivory and navy (chosen 14 October 2026): a light, warm page with one
// deep navy accent for actions and selection, and a little gold for
// editorial labels. Video and artwork stay dark: c.media and c.onMedia.
export const c = {
  bg: "#f7f4ee",
  surface: "#ffffff",
  // Sheets, toasts and the tab bar: white, lifted by a hairline and shadow.
  raised: "#ffffff",
  // Sand: the featured card, chips and artwork fallbacks.
  feature: "#efe9de",
  text: "#1b1e24",
  muted: "#5b616a",
  // Primary actions, links, selection and focus.
  accent: "#1f3a5f",
  onAccent: "#ffffff",
  // Editorial eyebrows ("Featured"). Small text only where 4.5:1 holds.
  gold: "#85672a",
  border: "#e2dcd0",
  error: "#b3261e",
  // Secondary text on feature (sand) surfaces.
  mutedOnFeature: "#4f555e",
  // Hairline between rows that share one surface. Decorative only.
  divider: "#ece6db",
  // Behind small labels laid over artwork (duration chips).
  scrim: "rgba(17, 20, 26, 0.72)",
  // The player and anything drawn over video or artwork.
  media: "#0f1115",
  onMedia: "#ffffff",
  onMediaMuted: "rgba(255, 255, 255, 0.74)",
  // Soft elevation for raised surfaces on the light page.
  shadow: "rgba(27, 30, 36, 0.12)",
  white: "#ffffff",
  black: "#000000",
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
  // The one page gutter: app pages, onboarding and sign-in steps and the
  // sign-up sheet all start their content here, on the 4pt scale.
  gutter: 24,
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
  // A text serif for a few emotional moments only (welcome, onboarding
  // questions, the sign-up sheet). Everything else stays in Manrope.
  serif: "Newsreader_500Medium",
  serifItalic: "Newsreader_500Medium_Italic",
  serifSemibold: "Newsreader_600SemiBold",
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
  /** Welcome headline. One per screen at most. */
  hero: {
    fontFamily: font.serif,
    fontSize: 38,
    lineHeight: 42,
    letterSpacing: -0.6,
  },
  /** Onboarding questions and the sign-up sheet's headline. */
  question: {
    fontFamily: font.serif,
    fontSize: 30,
    lineHeight: 35,
    letterSpacing: -0.4,
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
