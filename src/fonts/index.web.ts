import { Asset } from "expo-asset";
import { useSyncExternalStore } from "react";
import { FONT_FILES, type FontFamily } from "./files";

/**
 * The web's first frame doesn't wait for the font files (about 1 MB, several
 * seconds on a slow phone connection). Under each of the app's font names a
 * stand-in is registered at once: a system face (Arial, Georgia, or the
 * nearest one the device has) resized so that words take the room Manrope
 * and Newsreader take, with the same height above and below the line. The
 * real files download meanwhile and replace the stand-ins in one go, so the
 * page changes face once and the words stay where they are.
 *
 * The app waits up to WAIT_MS for the real files first: a repeat visit has
 * them cached and never shows the stand-ins.
 */
const WAIT_MS = 600;

const SANS = ["Arial", "ArialMT", "Roboto", "Helvetica"];
const SANS_BOLD = ["Arial Bold", "Arial-BoldMT", "Roboto Bold", "Roboto-Bold", "Helvetica Bold", "Helvetica-Bold"];
const SERIF = ["Georgia", "Noto Serif", "NotoSerif", "Times New Roman", "TimesNewRomanPSMT"];
const SERIF_ITALIC = [
  "Georgia Italic",
  "Georgia-Italic",
  "Noto Serif Italic",
  "NotoSerif-Italic",
  "Times New Roman Italic",
  "TimesNewRomanPS-ItalicMT",
];

/**
 * Each stand-in: local faces, then size-adjust, ascent-override and
 * descent-override in percent (line gap 0, as both families have). Measured
 * from the font files against Arial and Georgia: size-adjust matches the
 * advance width of running English text, the overrides match hhea ascent and
 * descent divided by it.
 */
const STAND_INS: Record<FontFamily, [string[], number, number, number]> = {
  Manrope_400Regular: [SANS, 102.48, 104.02, 29.27],
  Manrope_500Medium: [SANS, 104.28, 102.22, 28.77],
  Manrope_600SemiBold: [SANS_BOLD, 98.89, 107.8, 30.34],
  Manrope_700Bold: [SANS_BOLD, 100.55, 106.02, 29.84],
  Manrope_800ExtraBold: [SANS_BOLD, 102.23, 104.28, 29.35],
  Newsreader_400Regular: [SERIF, 96.72, 75.99, 27.4],
  Newsreader_400Regular_Italic: [SERIF_ITALIC, 88.86, 82.71, 29.82],
  Newsreader_500Medium: [SERIF, 98.95, 74.28, 26.78],
  Newsreader_500Medium_Italic: [SERIF_ITALIC, 92.3, 79.64, 28.71],
};

const listeners = new Set<() => void>();
let ready =
  typeof document === "undefined" || !document.fonts || typeof FontFace === "undefined";

function settle() {
  if (ready) return;
  ready = true;
  listeners.forEach((listener) => listener());
}

function start() {
  const set = document.fonts;
  const families = Object.keys(FONT_FILES) as FontFamily[];
  const standIns = families.map((family) => {
    const [names, size, ascent, descent] = STAND_INS[family];
    // size-adjust isn't in TypeScript's DOM types yet.
    const descriptors: FontFaceDescriptors & { sizeAdjust: string } = {
      sizeAdjust: `${size}%`,
      ascentOverride: `${ascent}%`,
      descentOverride: `${descent}%`,
      lineGapOverride: "0%",
    };
    const face = new FontFace(family, names.map((n) => `local("${n}")`).join(", "), descriptors);
    set.add(face);
    return face;
  });
  const standInsLoaded = Promise.allSettled(standIns.map((face) => face.load()));
  const real = families.map(
    (family) => new FontFace(family, `url("${Asset.fromModule(FONT_FILES[family]).uri}")`),
  );
  // Added only once loaded: a face in the set that is still downloading would
  // hide its stand-in (the browser would fall back to its default font).
  const swapped = Promise.allSettled(real.map((face) => face.load())).then((results) =>
    results.forEach((result, i) => {
      // A file that failed keeps its stand-in.
      if (result.status !== "fulfilled") return;
      set.add(real[i]);
      set.delete(standIns[i]);
    }),
  );
  const waited = new Promise((resolve) => setTimeout(resolve, WAIT_MS));
  Promise.race([swapped, Promise.all([standInsLoaded, waited])]).then(settle, settle);
}

// Start as the bundle runs, before React's first render.
if (!ready) {
  try {
    start();
  } catch {
    settle();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True once the real fonts are in, or WAIT_MS has passed with stand-ins. */
export function useAppFonts(): boolean {
  return useSyncExternalStore(subscribe, () => ready, () => ready);
}
