import { useFonts } from "expo-font";
import { FONT_FILES } from "./files";

/**
 * iOS and Android: the fonts ship inside the app and load in moments, so
 * start-up waits for them under the native splash (the layout keeps it up
 * until this is true). A failed load doesn't hold the app back; the system
 * font stands in. The web has its own version (index.web.ts) that never
 * waits more than 400 ms.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(FONT_FILES);
  return loaded || !!error;
}
