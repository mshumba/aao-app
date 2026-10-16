import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, PixelRatio, Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";
import { useCatalogue } from "../catalogue/CatalogueProvider";
import { artworkWash } from "../data/artwork";
import { sampleSermons, type Sermon } from "../data/sermons";
import { ExpoImage, sizedArt } from "../kit/Artwork";
import { wallOf } from "../onboarding/ArtworkCollage";
import { motion } from "../onboarding/parts";
import { artFade, c, easeOut, radius } from "../theme";
import { web } from "../ui";
import { keepWall, keptWall } from "./data";

const GAP = 12;
const TILT = "-8deg";
/**
 * Soft focus: the flyers' lettering blurs away while their colours and
 * faces stay. Image blurs on iOS, Android and the web alike (a view's
 * filter would be ignored on iOS). In proportion to the tile, so a laptop's
 * larger flyers are as soft as a phone's.
 */
const BLUR_PER_WIDTH = 1 / 80;
/** Each flyer over its own pale wash: lower contrast without a milky haze. */
const ART_OPACITY = 0.64;
/**
 * The flyers' copy: YouTube's 320×180 (about 12 KB, where the full-size
 * artwork is 100 KB or more), which is all a blurred tile needs.
 */
const SOURCE_PX = 320;
/** The next launch's wall is fetched this long after this one shows, out of the way. */
const NEXT_WALL_AFTER_MS = 4000;

function tileUri(sermon: Sermon) {
  return sizedArt(sermon.thumbnail, SOURCE_PX / PixelRatio.get());
}

// The next launch's wall is chosen once a launch.
let nextChosen = false;

/**
 * Chooses the next launch's wall (none of this one's flyers) and fetches its
 * copies into the device's cache, a few seconds after this one shows, even
 * if Continue closes the screen meanwhile. iOS and Android only.
 */
function chooseNextWall(all: Sermon[], now: readonly Sermon[], total: number) {
  const image = ExpoImage;
  if (nextChosen || !image || Platform.OS === "web" || !all.length) return;
  nextChosen = true;
  setTimeout(() => {
    const showing = new Set(now.map((s) => s.id));
    const next = wallOf(all, total * 2)
      .filter((s) => !showing.has(s.id))
      .slice(0, total);
    if (next.length < total) return;
    // Kept however the fetch went: a flyer that can't load shows its wash.
    image
      .prefetch(next.map(tileUri), "disk")
      .catch(() => false)
      .then(() => keepWall(next.map((s) => s.id)));
  }, NEXT_WALL_AFTER_MS);
}

/**
 * The blessing screen's band: the welcome's wall of the sermons' artwork
 * (the same sermons, one per series, shuffled once a launch), in soft focus
 * and lighter, so it sets the scene without competing with the words.
 * Decorative only. Fills its parent, centred on it; `reach` is the tallest
 * the parent gets, so there are always enough rows to cover it.
 *
 * The flyers are different at every launch, so each launch chooses the
 * next one's and fetches them quietly, once this wall is showing (iOS and
 * Android): at the next launch they come from the device's cache in a
 * moment. `onReady` says when every tile has its artwork (or can't), so a
 * launch can show the screen whole; a flyer that arrives after `shown`
 * fades in on its own.
 */
export const BlessingWall = memo(function BlessingWall({
  reach,
  reduced,
  enter,
  shown,
  onReady,
}: {
  reach: number;
  reduced: boolean;
  /** false: no entrance (a launch, where the splash lifts onto the screen whole). */
  enter: boolean;
  /** The screen is showing: tiles arriving from now on fade in. */
  shown: boolean;
  onReady?: () => void;
}) {
  const { width } = useWindowDimensions();
  const { sermons: all, find } = useCatalogue();
  const [failed, setFailed] = useState<Record<string, true>>({});
  const markFailed = useCallback(
    (id: string) => setFailed((current) => (current[id] ? current : { ...current, [id]: true })),
    [],
  );

  const tileW = Math.min(260, Math.max(150, Math.round(width * 0.4)));
  const tileH = Math.round((tileW * 9) / 16);
  const blur = Math.round(tileW * BLUR_PER_WIDTH * 10) / 10;
  // Enough to cover the band's corners once tilted.
  const cols = Math.ceil((width * 1.3) / (tileW + GAP)) + 1;
  const rows = Math.ceil((reach + width * 0.15) / (tileH + GAP)) + 1;
  const planeW = cols * (tileW + GAP);
  const planeH = rows * (tileH + GAP);
  const total = rows * cols;
  const sermons = useMemo(() => {
    if (!all.length) return sampleSermons;
    // The wall the last launch chose and fetched, while the library still has it.
    const kept = keptWall()
      .map((id) => find(id))
      .filter((s): s is Sermon => !!s?.thumbnail);
    return kept.length >= total ? kept.slice(0, total) : wallOf(all, total);
  }, [all, find, total]);

  // ---- The next launch's wall: once this one shows -----------------------------------
  useEffect(() => {
    if (shown) chooseNextWall(all, sermons, total);
  }, [shown, all, sermons, total]);

  // Every tile in (or failed): once, for the screen's first showing.
  const done = useRef(new Set<string>());
  const ready = useRef(false);
  const onSettled = useCallback(
    (tile: string) => {
      done.current.add(tile);
      if (ready.current || done.current.size < total) return;
      ready.current = true;
      onReady?.();
    },
    [total, onReady],
  );
  // Nothing to wait for if a tile can't even start (no artwork to show).
  useEffect(() => {
    if (!sermons.length && !ready.current) {
      ready.current = true;
      onReady?.();
    }
  }, [sermons.length, onReady]);

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.layer]}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      {...web({ "aria-hidden": true })}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          enter && {
            animationName: reduced ? motion.fade : motion.settle,
            animationDuration: reduced ? 300 : 700,
            animationDelay: 60,
            animationTimingFunction: easeOut,
            animationFillMode: "backwards",
          },
        ]}
      >
        <View
          style={[
            styles.plane,
            { width: planeW, height: planeH, marginLeft: -planeW / 2, marginTop: -planeH / 2 },
          ]}
        >
          {Array.from({ length: rows }, (_, row) => (
            <View
              key={row}
              style={[
                styles.row,
                // Alternate rows sit half a tile over, like brickwork.
                row % 2 === 1 && { transform: [{ translateX: -(tileW + GAP) / 2 }] },
              ]}
            >
              {Array.from({ length: cols }, (_, col) => {
                const sermon = sermons[(row * cols + col) % sermons.length];
                return (
                  <Tile
                    key={col}
                    tile={`${row}.${col}`}
                    sermon={sermon}
                    width={tileW}
                    height={tileH}
                    blur={blur}
                    fade={shown && !reduced}
                    failed={!!failed[sermon.id]}
                    onError={markFailed}
                    onSettled={onSettled}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </Animated.View>
    </View>
  );
});

/**
 * One flyer over its wash. Drawn at once when it arrives before the screen
 * shows (expo-image's own transition stays off: changing it later would
 * load the image again), fading in when it arrives after.
 */
function Tile({
  tile,
  sermon,
  width,
  height,
  blur,
  fade,
  failed,
  onError,
  onSettled,
}: {
  tile: string;
  sermon: Sermon;
  width: number;
  height: number;
  blur: number;
  fade: boolean;
  failed: boolean;
  onError: (id: string) => void;
  onSettled: (tile: string) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const uri = tileUri(sermon);
  const onLoad = () => {
    setLoaded(true);
    onSettled(tile);
  };
  const onFail = () => {
    onError(sermon.id);
    onSettled(tile);
  };
  // Another tile of the same sermon failed first: nothing to wait for here.
  useEffect(() => {
    if (failed) onSettled(tile);
  }, [failed, onSettled, tile]);
  return (
    <View style={[styles.tile, { width, height, backgroundColor: artworkWash[sermon.id] ?? c.feature }]}>
      {failed ? null : (
        <Animated.View
          style={[
            styles.art,
            {
              opacity: loaded ? ART_OPACITY : 0,
              transitionProperty: "opacity",
              transitionDuration: fade ? artFade : 0,
              transitionTimingFunction: easeOut,
            },
          ]}
        >
          {ExpoImage ? (
            <ExpoImage
              source={{ uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              // iOS and Android blur in the image's own pixels, React Native
              // (and the web) in points: the same softness either way.
              blurRadius={Platform.OS === "web" ? blur : (blur * SOURCE_PX) / width}
              cachePolicy="memory-disk"
              transition={0}
              accessible={false}
              onLoad={onLoad}
              onError={onFail}
            />
          ) : (
            <Image
              source={{ uri }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              blurRadius={blur}
              accessible={false}
              onLoad={onLoad}
              onError={onFail}
            />
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { overflow: "hidden", backgroundColor: c.bg, pointerEvents: "none" },
  plane: {
    position: "absolute",
    left: "50%",
    top: "50%",
    gap: GAP,
    transform: [{ rotate: TILT }],
  },
  row: { flexDirection: "row", gap: GAP },
  tile: {
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  art: StyleSheet.absoluteFill,
});
