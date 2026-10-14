import { useCallback, useState } from "react";
import { Image, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";
import { useCatalogue } from "../catalogue/CatalogueProvider";
import { artworkWash } from "../data/artwork";
import { Sermon, sampleSermons } from "../data/sermons";
import { c, easeOut, radius } from "../theme";
import { gradient, web } from "../ui";
import { motion } from "./parts";

const GAP = 12;
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
  // The newest artwork, which is the sharpest; the sample until it loads.
  const sermons = catalogue.sermons.length ? catalogue.sermons.slice(0, 12) : sampleSermons;
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
                // Two steps per row, so no tile touches a copy of itself.
                const sermon = sermons[(col + row * 2) % sermons.length];
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
