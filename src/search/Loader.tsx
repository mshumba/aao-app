import { requireOptionalNativeModule } from "expo";
import { memo, useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ReduceMotion,
  cancelAnimation,
  css,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Artwork, Strong, artCandidates, type ArtSource } from "../kit";
import { c, font, shadows, textCap } from "../theme";
import { sermonCount } from "../topics";
import { T, web } from "../ui";

/**
 * While search works: a fan of real sermon artwork shuffling (the front
 * card flicks to the back every 700ms) over one honest line that says what
 * search is doing. Shown only once a search has taken 400ms, so a quick
 * answer never flashes it.
 *
 * The fan runs on the UI thread: one repeating clock, each card working out
 * its own place from it, so nothing re-renders while it plays. It is
 * decorative and hidden from screen readers; the screen's polite live region
 * reads the line instead (loaderStatus). Under Reduce Motion the fan stays
 * still and only the line crossfades.
 */

/** Tiles in the fan: three show (front straight, two behind), up to two more wait behind them. */
export const FAN_MAX = 5;
const FAN_MIN = 3;
/** One shuffle: the move, then a short rest. */
const STEP = 700;
const MOVE = 550;
const REST = STEP - MOVE;
const ease = Easing.bezierFn(0.23, 1, 0.32, 1);

const TILE_W = 156;
const TILE_H = Math.round((TILE_W * 9) / 16);
const BOX_W = 260;
const BOX_H = 124;

type Slot = { x: number; y: number; rotate: number; scale: number; opacity: number };
/** Front, left behind (-8°), right behind (+6°), then out of sight behind them. */
const SLOTS: Slot[] = [
  { x: 0, y: 14, rotate: 0, scale: 1, opacity: 1 },
  { x: -38, y: 2, rotate: -8, scale: 0.9, opacity: 1 },
  { x: 38, y: 0, rotate: 6, scale: 0.88, opacity: 1 },
  { x: 0, y: -2, rotate: 0, scale: 0.84, opacity: 0 },
];

// ---- What search is doing --------------------------------------------------------------

/**
 * The steps, in the order search takes them: reading the question (skipped
 * for a need, which is understood already), searching the library, choosing
 * the moments; then, past 8 seconds, that it's slow.
 */
export type LoaderStep = 0 | 1 | 2 | 3;

/** The line for a step: `strong` is set bold (the theme, once known). */
export function loaderStatus(step: LoaderStep, sermons: number, theme?: string) {
  const library = sermons > 0 ? sermonCount(sermons) : "every sermon";
  switch (step) {
    case 0:
      return { lead: "Understanding what you’re going through…" };
    case 1:
      return theme
        ? { lead: `Searching ${library} for `, strong: theme, tail: "…" }
        : { lead: `Searching ${library}…` };
    case 2:
      return { lead: "Choosing the clearest moments…" };
    case 3:
      return { lead: "Taking longer than usual. Still searching…" };
  }
}

/** The line as one string, for the live region. */
export function loaderText(step: LoaderStep, sermons: number, theme?: string) {
  const { lead, strong = "", tail = "" } = loaderStatus(step, sermons, theme);
  return `${lead}${strong}${tail}`;
}

// ---- The loader ------------------------------------------------------------------------

export const SearchLoader = memo(function SearchLoader({
  art,
  step,
  sermons,
  theme,
  reduced,
}: {
  /** Artwork already on the device (see warmArt), newest first. */
  art: readonly ArtSource[];
  step: LoaderStep;
  /** How many sermons the library holds. */
  sermons: number;
  /** What search is looking for, once it's known. */
  theme?: string;
  reduced: boolean;
}) {
  const { lead, strong, tail } = loaderStatus(step, sermons, theme);
  return (
    <Animated.View testID="search-loader" style={[styles.loader, appear]}>
      <Fan art={art} reduced={reduced} />
      {/* Seen only: the live region under the field says it. */}
      <View
        style={styles.status}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        {...web({ "aria-hidden": true })}
      >
        {/* Sizes the line to the words now showing; the crossfading copies sit over it. */}
        <StatusText style={styles.sizer} lead={lead} strong={strong} tail={tail} />
        <Animated.View
          key={`${step}:${theme ?? ""}`}
          entering={FadeIn.duration(240).reduceMotion(ReduceMotion.Never)}
          exiting={FadeOut.duration(240).reduceMotion(ReduceMotion.Never)}
          style={StyleSheet.absoluteFill}
        >
          <StatusText testID="search-loader-status" lead={lead} strong={strong} tail={tail} />
        </Animated.View>
      </View>
    </Animated.View>
  );
});

function StatusText({
  lead,
  strong,
  tail,
  style,
  testID,
}: {
  lead: string;
  strong?: string;
  tail?: string;
  style?: object;
  testID?: string;
}) {
  return (
    <T testID={testID} style={[styles.statusText, style]} maxFontSizeMultiplier={textCap.section}>
      {lead}
      {strong ? <Strong>{strong}</Strong> : null}
      {tail}
    </T>
  );
}

const Fan = memo(function Fan({ art, reduced }: { art: readonly ArtSource[]; reduced: boolean }) {
  const tiles: (ArtSource | null)[] = art.slice(0, FAN_MAX);
  while (tiles.length < FAN_MIN) tiles.push(null);
  const count = tiles.length;
  // Counts shuffles: n.f is f of the way through shuffle n.
  const clock = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      cancelAnimation(clock);
      clock.set(0);
      return;
    }
    clock.set(0);
    clock.set(withRepeat(withTiming(count, { duration: count * STEP, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(clock);
  }, [clock, count, reduced]);

  return (
    <View
      style={styles.fan}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      {...web({ "aria-hidden": true })}
    >
      {tiles.map((tile, i) => (
        <FanTile key={tile?.id ?? `blank-${i}`} art={tile} index={i} count={count} clock={clock} />
      ))}
    </View>
  );
});

const FanTile = memo(function FanTile({
  art,
  index,
  count,
  clock,
}: {
  art: ArtSource | null;
  index: number;
  count: number;
  clock: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const now = clock.get();
    const n = Math.floor(now);
    const into = (now - n) * STEP;
    const t = into < REST ? 0 : ease(Math.min(1, (into - REST) / MOVE));
    // Where this tile is in shuffle n, and where it's going: the front one
    // to the very back, the rest one place forward.
    const from = (((index - n) % count) + count) % count;
    const to = (from - 1 + count) % count;
    const a = SLOTS[Math.min(from, SLOTS.length - 1)];
    const b = SLOTS[Math.min(to, SLOTS.length - 1)];
    let x = a.x + (b.x - a.x) * t;
    let y = a.y + (b.y - a.y) * t;
    let rotate = a.rotate + (b.rotate - a.rotate) * t;
    const scale = a.scale + (b.scale - a.scale) * t;
    let opacity = a.opacity + (b.opacity - a.opacity) * t;
    let z = count - to;
    if (from === 0) {
      // The front card flicks out to the right, then slips in behind.
      const arc = Math.sin(Math.PI * t);
      x += arc * 92;
      y -= arc * 6;
      rotate += arc * 10;
      z = t < 0.5 ? count + 1 : count - to;
      // Going out of sight (a fan of four or five): only once it's behind the others.
      if (b.opacity === 0) opacity = t < 0.5 ? 1 : 2 - 2 * t;
    }
    return {
      zIndex: z,
      opacity,
      transform: [{ translateX: x }, { translateY: y }, { rotate: `${rotate}deg` }, { scale }],
    };
  });
  return (
    <Animated.View testID="fan-tile" style={[styles.tile, style]}>
      <Artwork art={art} width={TILE_W} radius={10} lift="none" />
    </Animated.View>
  );
});

// ---- Artwork already on the device ------------------------------------------------------

type ExpoImageType = typeof import("expo-image").Image;
const ExpoImage: ExpoImageType | null =
  Platform.OS === "web" || requireOptionalNativeModule("ExpoImage")
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("expo-image") as typeof import("expo-image")).Image
    : null;

/**
 * Fetches the fan's artwork into the image cache ahead of time (the newest
 * sermons, which Home has usually shown already), so the loader never waits
 * on the network for a picture.
 */
export function warmArt(art: readonly ArtSource[]) {
  if (!ExpoImage || !art.length) return;
  ExpoImage.prefetch(
    art.map((a) => artCandidates(a, TILE_W)[0]),
    "memory-disk",
  ).catch(() => {});
}

const appear = {
  animationName: css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } }),
  animationDuration: 240,
  animationFillMode: "backwards" as const,
};

/** Static sand placeholders breathe while search works (opacity 1 ↔ 0.55, 1.6s). No shimmer. */
export const breathe = {
  animationName: css.keyframes({ "0%": { opacity: 1 }, "50%": { opacity: 0.55 }, "100%": { opacity: 1 } }),
  animationDuration: 1600,
  animationIterationCount: "infinite" as const,
  animationTimingFunction: "ease-in-out" as const,
};

const styles = StyleSheet.create({
  loader: { alignItems: "center", marginTop: 18, paddingHorizontal: 24 },
  fan: { width: BOX_W, height: BOX_H },
  tile: {
    position: "absolute",
    left: (BOX_W - TILE_W) / 2,
    top: 8,
    width: TILE_W,
    height: TILE_H,
    borderRadius: 10,
    backgroundColor: c.feature,
    boxShadow: shadows.art,
  },
  status: { alignSelf: "stretch", marginTop: 10 },
  sizer: { opacity: 0 },
  statusText: { fontFamily: font.medium, fontSize: 14.5, lineHeight: 21, color: c.muted, textAlign: "center" },
});
