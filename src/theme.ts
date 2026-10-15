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

  // ---- Immersive (approved 14 October 2026) --------------------------------
  /** Progress tracks, the path timeline and upcoming rings. Decorative only. */
  track: "#d8d0c1",
  /** Chips and pills sitting on white cards (sand would vanish there). */
  featureOnSurface: "#f3eee5",
  /** The search field's clear button. */
  clearWell: "#e9e4da",
  /** The ring of an upcoming day on the path timeline. */
  nodeRing: "#cfc7b8",
  /** Gold that holds on the dark stage (focus segment). Never text. */
  goldOnDark: "#b8954a",
  /** Kickers on the dark hero, path cards and the stage. */
  onMediaKicker: "rgba(255, 255, 255, 0.78)",
  /** Gold small text on the dark hero (a blessing's Bible reference), 8:1 on c.media. */
  goldOnMedia: "#c8a65e",
  /** Subtitles on the dark hero. */
  onMediaSoft: "rgba(255, 255, 255, 0.82)",
  /** Upcoming segments of a path's progress on dark. */
  onMediaTrack: "rgba(255, 255, 255, 0.18)",
  /** The scrubber's track on the stage. */
  onMediaRail: "rgba(255, 255, 255, 0.22)",
  /** The inner "play today" panel inside a dark path card. */
  onMediaPanel: "rgba(255, 255, 255, 0.08)",
  onMediaHairline: "rgba(255, 255, 255, 0.10)",
  /** Round buttons over artwork and the stage. */
  glass: "rgba(15, 17, 21, 0.42)",
  glassBorder: "rgba(255, 255, 255, 0.22)",
  /** Round buttons on the stage's dark panel (save, share). */
  glassOnStage: "rgba(255, 255, 255, 0.10)",
  /** Hairline round the tilted artwork in a fan. */
  artEdge: "rgba(255, 255, 255, 0.20)",
  /** Behind artwork while it loads, when the sermon has no sampled tint. */
  artTint: "#1c2230",
  /** Track of the progress bar along the bottom of artwork. */
  artTrack: "rgba(255, 255, 255, 0.35)",
  /** Path progress on sand ("part of your path"). */
  accentTrack: "rgba(31, 58, 95, 0.16)",
};

/**
 * The approved concept's dark surfaces and fades, as CSS background-image
 * strings. Apply with `gradient()` from ui.tsx (CSS on web,
 * experimental_backgroundImage on native). Values are the concept's own.
 */
export const gradients = {
  /** Home hero: a wash under the status bar, dark on the left for the title. */
  heroScrim:
    "linear-gradient(180deg, rgba(15,17,21,0.62) 0px, rgba(15,17,21,0) 130px), " +
    "linear-gradient(90deg, rgba(15,17,21,0.99) 0%, rgba(15,17,21,0.98) 51%, rgba(15,17,21,0.6) 61%, rgba(15,17,21,0.15) 71%, rgba(15,17,21,0) 80%), " +
    "linear-gradient(180deg, rgba(15,17,21,0) 40%, rgba(15,17,21,0.5) 70%, rgba(15,17,21,0.3) 84%)",
  /** The bottom 68pt of the Home hero, melting into the ivory page. */
  heroFade:
    "linear-gradient(180deg, rgba(247,244,238,0) 0%, rgba(247,244,238,0.85) 60%, #f7f4ee 100%)",
  /** Home's "Your path" card: navy light from the top right, a little gold low left. */
  pathCard:
    "radial-gradient(260px 200px at 92% 0%, rgba(31,58,95,0.95) 0%, rgba(31,58,95,0) 70%), " +
    "radial-gradient(200px 160px at 0% 100%, rgba(133,103,42,0.28) 0%, rgba(133,103,42,0) 70%)",
  /** Search's compact "A path for this" card. */
  pathCompact:
    "radial-gradient(240px 140px at 100% 0%, rgba(31,58,95,0.95) 0%, rgba(31,58,95,0) 70%)",
  /** The path page's dark cover behind the fan. */
  pathCover:
    "radial-gradient(380px 260px at 50% 30%, rgba(31,58,95,0.95) 0%, rgba(31,58,95,0) 72%), " +
    "radial-gradient(300px 200px at 50% 105%, rgba(133,103,42,0.35) 0%, rgba(133,103,42,0) 70%)",
  /** The sermon stage's navy light. */
  stage:
    "radial-gradient(420px 300px at 70% 60%, rgba(31,58,95,0.85) 0%, rgba(31,58,95,0) 70%)",
  /** The bottom of the video frame on the stage. */
  videoShade: "linear-gradient(180deg, rgba(15,17,21,0) 60%, rgba(15,17,21,0.55) 100%)",
  /** Behind the floating tab bar. */
  tabFade:
    "linear-gradient(180deg, rgba(247,244,238,0) 0%, rgba(247,244,238,0.92) 55%, #f7f4ee 100%)",
  /** Behind the sticky call to action. */
  ctaFade:
    "linear-gradient(180deg, rgba(247,244,238,0) 0%, rgba(247,244,238,0.96) 34%, #f7f4ee 100%)",
  /** The last 44pt of a page with no tab bar. */
  pageEnd: "linear-gradient(180deg, rgba(247,244,238,0) 0%, #f7f4ee 70%)",
} as const;

/** The concept's elevations, as React Native boxShadow strings. */
export const shadows = {
  /** White cards on ivory (search results). */
  card: "0 1px 0 rgba(226,220,208,0.9), 0 8px 22px rgba(27,30,36,0.06)",
  /** Today's lifted day on the path timeline. */
  lifted: "0 1px 0 rgba(226,220,208,0.9), 0 10px 26px rgba(27,30,36,0.08)",
  /** The "coming up" moment row. */
  row: "0 8px 22px rgba(27,30,36,0.08)",
  /** The tab bar pill. */
  floating: "0 12px 32px rgba(27,30,36,0.16), 0 0 0 1px rgba(226,220,208,0.9)",
  /** Home's question field, floating over the hero's edge. */
  field: "0 14px 34px rgba(27,30,36,0.18), 0 0 0 1px rgba(226,220,208,0.8)",
  /** Search's field while focused: a soft navy ring. */
  fieldFocus: "0 0 0 4px rgba(31,58,95,0.10), 0 10px 24px rgba(27,30,36,0.08)",
  /** Search's field at rest. */
  fieldRest: "0 10px 24px rgba(27,30,36,0.08)",
  /** The dark path card. */
  pathCard: "0 18px 40px rgba(15,17,21,0.22)",
  /** The sticky navy call to action. */
  cta: "0 12px 28px rgba(31,58,95,0.32)",
  /** Artwork in a fan: printed posters lifted off the surface. */
  fanCard: "0 10px 24px rgba(0,0,0,0.45)",
  fanCompact: "0 6px 14px rgba(0,0,0,0.5)",
  fanCover: "0 18px 36px rgba(0,0,0,0.55)",
  /** Artwork on ivory (the doc's Art level). */
  art: "0 6px 18px rgba(15,17,21,0.18)",
  /** The avatar's white ring on the dark hero. */
  avatarRing: "0 0 0 2px rgba(255,255,255,0.9)",
  /** The scrubber's thumb. */
  knob: "0 2px 8px rgba(0,0,0,0.5)",
} as const;

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
  /** Card insets on the concept's screens (Home path card, search results). */
  s20: 20,
  /** Between sections of a page. */
  section: 40,
  huge: 64,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
  /** Today's lifted day card; the "coming up" moment row. */
  r18: 18,
  /** Sand cards, the compact path card, the search field. */
  r20: 20,
  /** Search result cards. */
  r22: 22,
  /** Home's dark path card. */
  r26: 26,
  /** The ivory panel over the dark path cover and sermon stage (top corners). */
  r28: 28,
};

/**
 * Artwork corners by width (the concept's ladder): a 192pt cover tile 14, a
 * 96pt thumbnail 10, a 62pt fan card 6. Fans may override.
 */
export function artRadius(width: number) {
  if (width >= 300) return 16;
  if (width >= 150) return 14;
  if (width >= 110) return 12;
  if (width >= 90) return 10;
  if (width >= 50) return 6;
  return 4;
}

export const font = {
  regular: "Manrope_400Regular",
  medium: "Manrope_500Medium",
  semibold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
  extrabold: "Manrope_800ExtraBold",
  // A text serif for a few emotional moments only (welcome, onboarding
  // questions, the sign-up sheet). Everything else stays in Manrope.
  serif: "Newsreader_500Medium",
  /** Quotes, prose, the greeting: the concept's Newsreader 400. */
  serifRegular: "Newsreader_400Regular",
  serifRegularItalic: "Newsreader_400Regular_Italic",
  serifItalic: "Newsreader_500Medium_Italic",
  serifSemibold: "Newsreader_600SemiBold",
};

/**
 * The type scale: twelve sizes, and every role below uses one of them.
 * Readable text is never under 13pt; only tab labels use 11.
 */
export const fontSize = {
  tab: 11,
  small: 13,
  body: 15,
  lead: 16,
  quote: 17,
  heading: 19,
  card: 22,
  section: 24,
  sermon: 27,
  question: 30,
  title: 34,
  hero: 38,
} as const;

/**
 * Type roles. Every text style in the app starts from one of these. Kickers
 * are written in sentence case and uppercased here; verified sermon titles
 * are never transformed or re-tracked.
 */
export const type = {
  /**
   * Retired (the design doc's "generic bold page title"): kept for older
   * screens, now the serif question size so nothing still using it looks
   * like a template.
   */
  display: {
    fontFamily: font.serif,
    fontSize: fontSize.question,
    lineHeight: 36,
    letterSpacing: -0.4,
  },
  /**
   * The title of the sermon you are on, on its own page (Newsreader, from the
   * approved concept). The words are the verified headline, never changed.
   */
  sermonTitle: {
    fontFamily: font.serif,
    fontSize: fontSize.sermon,
    lineHeight: 32,
    letterSpacing: -0.5,
  },
  /** Welcome headline. One per screen at most. */
  hero: {
    fontFamily: font.serif,
    fontSize: fontSize.hero,
    lineHeight: 42,
    letterSpacing: -0.6,
  },
  /** Onboarding and sign-in questions, the sign-up sheet's headline. */
  question: {
    fontFamily: font.serif,
    fontSize: fontSize.question,
    lineHeight: 36,
    letterSpacing: -0.4,
  },
  /** Sheet titles only. */
  heading: { fontFamily: font.bold, fontSize: fontSize.heading, lineHeight: 26 },
  lead: { fontFamily: font.regular, fontSize: fontSize.lead, lineHeight: 25 },
  body: { fontFamily: font.regular, fontSize: fontSize.body, lineHeight: 24 },
  label: { fontFamily: font.semibold, fontSize: fontSize.body, lineHeight: 21 },
  caption: { fontFamily: font.regular, fontSize: fontSize.small, lineHeight: 19 },
  kicker: {
    fontFamily: font.bold,
    fontSize: fontSize.small,
    lineHeight: 17,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const,
  },

  // ---- Immersive roles (approved concept, 14 October 2026) -----------------
  /** Home hero's sermon title over the dark stage ("The Heavenly *Calling*"). */
  masthead: {
    fontFamily: font.serif,
    fontSize: fontSize.hero,
    lineHeight: 41,
    letterSpacing: -0.8,
  },
  /** Root page titles and questions ("What are you *going through?*"). */
  title: {
    fontFamily: font.serif,
    fontSize: fontSize.title,
    lineHeight: 37,
    letterSpacing: -0.6,
  },
  /** A path's name on its dark cover. */
  coverTitle: {
    fontFamily: font.serif,
    fontSize: fontSize.question,
    lineHeight: 34,
    letterSpacing: -0.6,
  },
  /** "Good afternoon, *Mufaro*" on the hero. */
  greeting: {
    fontFamily: font.serifRegular,
    fontSize: fontSize.card,
    lineHeight: 28,
    letterSpacing: -0.2,
  },
  /** Section headings ("Continue watching", "Moments in this sermon"). */
  section: {
    fontFamily: font.serif,
    fontSize: fontSize.section,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  /** Smaller serif headings: a state's title, a list's heading, a card's name. */
  sectionSmall: {
    fontFamily: font.serif,
    fontSize: fontSize.card,
    lineHeight: 28,
    letterSpacing: -0.2,
  },
  /** A path's name inside a card. */
  pathName: {
    fontFamily: font.serif,
    fontSize: fontSize.card,
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  /** Short display quotes (three lines or fewer), italic. */
  quoteLarge: {
    fontFamily: font.serifItalic,
    fontSize: fontSize.section,
    lineHeight: 32,
    letterSpacing: -0.2,
  },
  /** Moment quotes in result cards. Upright: italic tires after two lines. */
  quote: {
    fontFamily: font.serifRegular,
    fontSize: fontSize.quote,
    lineHeight: 24,
    letterSpacing: -0.1,
  },
  /** Quotes inside rows (moments in a sermon). */
  quoteSmall: {
    fontFamily: font.serifRegular,
    fontSize: fontSize.lead,
    lineHeight: 22,
  },
  /** The screen's one block of serif prose ("Why this path", a blessing). */
  prose: {
    fontFamily: font.serifRegular,
    fontSize: fontSize.quote,
    lineHeight: 24,
    letterSpacing: -0.1,
  },
  /** The serif-italic prompt in the search field. */
  prompt: {
    fontFamily: font.serifRegularItalic,
    fontSize: fontSize.heading,
    lineHeight: 24,
    letterSpacing: -0.1,
  },
  /** Sermon titles in cards, rows and day rows (see SermonTitle). */
  cardTitle: { fontFamily: font.bold, fontSize: fontSize.body, lineHeight: 20 },
  /** Moment titles inside the moments list. */
  rowTitle: { fontFamily: font.bold, fontSize: fontSize.small, lineHeight: 18 },
  /** Typed text in the search field and the sign-in fields. */
  field: { fontFamily: font.semibold, fontSize: fontSize.lead, lineHeight: 22 },
  /** Navy pills ("Play from 1:52:27"). Tabular figures where it counts. */
  labelSmall: { fontFamily: font.bold, fontSize: fontSize.small, lineHeight: 18 },
  /** Chips ("The same sin again"). */
  chip: { fontFamily: font.semibold, fontSize: fontSize.small, lineHeight: 18 },
  /** Lines under titles: "48 min left · 2 of 7 done". */
  meta: { fontFamily: font.medium, fontSize: fontSize.small, lineHeight: 18 },
  /** Metadata that sits a step quieter: dates in results, counts. */
  metaSmall: { fontFamily: font.semibold, fontSize: fontSize.small, lineHeight: 17 },
  /** The concept's eyebrow: tracked, uppercase, at the smallest readable size. */
  overline: {
    fontFamily: font.bold,
    fontSize: fontSize.small,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
  },
  /** Pill buttons ("Watch", "Continue Day 3"). */
  button: { fontFamily: font.bold, fontSize: fontSize.body, lineHeight: 20 },
  buttonLarge: { fontFamily: font.bold, fontSize: fontSize.lead, lineHeight: 22 },
  /** Tab labels: the one size under 13pt. */
  tab: { fontFamily: font.semibold, fontSize: fontSize.tab, lineHeight: 13 },
};

/**
 * Dynamic Type ceilings: display serif stops at 1.3×, section heads and
 * quotes at 1.5×, tab labels at 1.4×. Body, labels and captions are uncapped.
 */
export const textCap = { display: 1.3, section: 1.5, quote: 1.5, tab: 1.4, chip: 1.6 };

/** Numbers that change as you watch (times, counts) keep their width. */
export const tabular = { fontVariant: ["tabular-nums" as const] };

/** Artwork fades in from its tint over this long. */
export const artFade = 200;

// Strong ease-out for UI state changes (Emil Kowalski, animate-expo).
export const easeOut = cubicBezier(0.23, 1, 0.32, 1);

/** Press feedback: small controls 0.97, full-width surfaces 0.98, 120ms. */
export const press = { scale: 0.97, scaleLarge: 0.98, duration: 120 };
