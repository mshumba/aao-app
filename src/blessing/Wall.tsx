import { memo, useCallback, useMemo, useState } from "react";
import { Image, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";
import { useCatalogue } from "../catalogue/CatalogueProvider";
import { artworkWash } from "../data/artwork";
import { sampleSermons, type Sermon } from "../data/sermons";
import { wallOf } from "../onboarding/ArtworkCollage";
import { motion } from "../onboarding/parts";
import { c, easeOut, radius } from "../theme";
import { web } from "../ui";

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
 * The blessing screen's band: the welcome's wall of the sermons' artwork
 * (the same sermons, one per series, shuffled once a launch), in soft focus
 * and lighter, so it sets the scene without competing with the words.
 * Decorative only. Fills its parent, centred on it; `reach` is the tallest
 * the parent gets, so there are always enough rows to cover it.
 */
export const BlessingWall = memo(function BlessingWall({
  reach,
  reduced,
}: {
  reach: number;
  reduced: boolean;
}) {
  const { width } = useWindowDimensions();
  const catalogue = useCatalogue();
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
  const sermons = useMemo(
    () => (catalogue.sermons.length ? wallOf(catalogue.sermons, rows * cols) : sampleSermons),
    [catalogue.sermons, rows, cols],
  );

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
                    sermon={sermon}
                    width={tileW}
                    height={tileH}
                    blur={blur}
                    failed={!!failed[sermon.id]}
                    onError={markFailed}
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

function Tile({
  sermon,
  width,
  height,
  blur,
  failed,
  onError,
}: {
  sermon: Sermon;
  width: number;
  height: number;
  blur: number;
  failed: boolean;
  onError: (id: string) => void;
}) {
  return (
    <View style={[styles.tile, { width, height, backgroundColor: artworkWash[sermon.id] ?? c.feature }]}>
      {failed ? null : (
        <Image
          source={{ uri: sermon.thumbnail }}
          style={styles.art}
          resizeMode="cover"
          blurRadius={blur}
          accessible={false}
          onError={() => onError(sermon.id)}
        />
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
  art: { ...StyleSheet.absoluteFill, opacity: ART_OPACITY },
});
