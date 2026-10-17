/**
 * The font files the app uses, by the family names in theme.ts `font`.
 * Only these are bundled and loaded: each file is required directly, so the
 * weights the app doesn't use (Manrope 200 and 300, Newsreader 600 and up)
 * stay out of the build.
 */
export const FONT_FILES = {
  Manrope_400Regular: require("@expo-google-fonts/manrope/400Regular/Manrope_400Regular.ttf"),
  Manrope_500Medium: require("@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf"),
  Manrope_600SemiBold: require("@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf"),
  Manrope_700Bold: require("@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf"),
  Manrope_800ExtraBold: require("@expo-google-fonts/manrope/800ExtraBold/Manrope_800ExtraBold.ttf"),
  Newsreader_400Regular: require("@expo-google-fonts/newsreader/400Regular/Newsreader_400Regular.ttf"),
  Newsreader_400Regular_Italic: require("@expo-google-fonts/newsreader/400Regular_Italic/Newsreader_400Regular_Italic.ttf"),
  Newsreader_500Medium: require("@expo-google-fonts/newsreader/500Medium/Newsreader_500Medium.ttf"),
  Newsreader_500Medium_Italic: require("@expo-google-fonts/newsreader/500Medium_Italic/Newsreader_500Medium_Italic.ttf"),
} as const;

export type FontFamily = keyof typeof FONT_FILES;
