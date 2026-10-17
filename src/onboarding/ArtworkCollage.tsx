import { useCallback, useMemo, useState } from "react";
import { Image, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";
import { useCatalogue } from "../catalogue/CatalogueProvider";
import { artworkWash } from "../data/artwork";
import { Sermon, sampleSermons } from "../data/sermons";
import { c, easeOut, radius } from "../theme";
import { gradient, web } from "../ui";
import { motion } from "./parts";

const GAP = 12;

// One shuffle per launch, so the wall looks different each time the app
// opens but stays put while it's on screen.
const LAUNCH_SEED = Math.floor(Math.random() * 2 ** 31);

/** A small, fast, seeded random number generator (mulberry32). */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RECENT_YEARS = 4;

/**
 * `count` different sermons for the wall: one per series or conference (so
 * Day 3 and Day 4 of one crusade don't fill it with the same flyer), mostly
 * Apostle Arome Osayi's own from the last few years (their artwork is sharp),
 * in a fresh order each launch. Falls back to older ones and guest ministers
 * only when there aren't enough.
 */
export function wallOf(all: Sermon[], count: number): Sermon[] {
  const random = seeded(LAUNCH_SEED);
  const since = `${new Date().getFullYear() - RECENT_YEARS}`;
  const group = (s: Sermon) => s.seriesKey ?? s.event ?? s.headline;
  const tiers = [
    all.filter((s) => !s.speaker && s.day >= since),
    all.filter((s) => s.day >= since),
    all,
  ];
  const picked: Sermon[] = [];
  const seen = new Set<string>();
  const groups = new Set<string>();
  for (const tier of tiers) {
    const shuffled = [...tier];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    for (const sermon of shuffled) {
      if (picked.length >= count) return picked;
      if (seen.has(sermon.id) || !sermon.thumbnail || groups.has(group(sermon))) continue;
      seen.add(sermon.id);
      groups.add(group(sermon));
      picked.push(sermon);
    }
  }
  return picked.length ? picked : all.slice(0, count);
}
const TILT = "-8deg";

// Washes the top in ivory so the dark status bar text stays readable, lets
// the artwork show clearly through the middle, then fades it into the page
// over a long, eased run so the headline sits on plain ivory with no seam.
const fade = gradient(
  `linear-gradient(180deg, ${c.bg}e6 0%, ${c.bg}80 10%, ${c.bg}00 26%, ${c.bg}00 50%, ${c.bg}40 62%, ${c.bg}b3 78%, ${c.bg}f2 92%, ${c.bg} 100%)`,
);
// A faint highlight across each tile, so plain colour still has a surface.
const sheen = gradient(
  `linear-gradient(160deg, ${c.white}14 0%, ${c.white}00 55%)`,
);

/**
 * The welcome's backdrop: the sermons' own artwork as a tilted wall, lifted
 * a touch toward each one's pale wash and fading into the ivory page.
 * Decorative only. Artwork that can't load (offline, blocked) leaves its
 * tile in that wash, so the wall still reads as a deliberate field of soft
 * colour.
 *
 * Fills its parent; `bleed` extends the fade below it, under the content.
 */
export function ArtworkCollage({
  bleed = 0,
  reduced,
}: {
  bleed?: number;
  reduced: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const catalogue = useCatalogue();
  const [failed, setFailed] = useState<Record<string, true>>({});
  const markFailed = useCallback(
    (id: string) =>
      setFailed((current) => (current[id] ? current : { ...current, [id]: true })),
    [],
  );

  // Tiles grow with the screen but stay thumbnail-sized; enough rows and
  // columns that the tilted wall still covers every corner.
  const tileW = Math.min(280, Math.max(150, Math.round(width * 0.42)));
  const tileH = Math.round((tileW * 9) / 16);
  const cols = Math.ceil((width * 1.4) / (tileW + GAP)) + 1;
  const rows = Math.ceil((height * 0.75) / (tileH + GAP)) + 1;
  const planeW = cols * (tileW + GAP);
  const planeH = rows * (tileH + GAP);
  // A different sermon on every tile: one per series or conference, shuffled
  // afresh each launch; the sample until the catalogue loads.
  const sermons = useMemo(
    () =>
      catalogue.sermons.length ? wallOf(catalogue.sermons, rows * cols) : sampleSermons,
    [catalogue.sermons, rows, cols],
  );

  return (
    <View
      style={[styles.layer, { bottom: -bleed, pointerEvents: "none" }]}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      {...web({ "aria-hidden": true })}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
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
            {
              width: planeW,
              height: planeH,
              marginLeft: -planeW / 2,
              marginTop: -planeH / 2,
            },
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
                // Each tile its own sermon; only the small sample repeats.
                const sermon = sermons[(row * cols + col) % sermons.length];
                return (
                  <Tile
                    key={col}
                    sermon={sermon}
                    width={tileW}
                    height={tileH}
                    failed={!!failed[sermon.id]}
                    onError={markFailed}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </Animated.View>
      <View style={[StyleSheet.absoluteFill, fade]} />
    </View>
  );
}

function Tile({
  sermon,
  width,
  height,
  failed,
  onError,
}: {
  sermon: Sermon;
  width: number;
  height: number;
  failed: boolean;
  onError: (id: string) => void;
}) {
  return (
    <View
      style={[
        styles.tile,
        { width, height, backgroundColor: artworkWash[sermon.id] ?? c.feature },
      ]}
    >
      {!failed && (
        <Image
          source={{ uri: sermon.thumbnail }}
          style={styles.art}
          resizeMode="cover"
          accessible={false}
          onError={() => onError(sermon.id)}
        />
      )}
      <View style={[StyleSheet.absoluteFill, sheen]} />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
    backgroundColor: c.bg,
  },
  // Centred a little above the middle, so more of the wall shows above the
  // fade than disappears into it.
  plane: {
    position: "absolute",
    left: "50%",
    top: "44%",
    gap: GAP,
    transform: [{ rotate: TILT }],
  },
  row: { flexDirection: "row", gap: GAP },
  // The hairline keeps pale tiles (artwork still loading, or failed) from
  // dissolving into the page.
  tile: {
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  // Nearly full strength over its pale wash: the artwork reads clearly but
  // a little lighter, so the dark wall sits calmly on the ivory page.
  art: { ...StyleSheet.absoluteFill, opacity: 0.88 },
});
