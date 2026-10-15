import { memo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { c, shadows } from "../theme";
import { web } from "../ui";
import { Artwork, type ArtSource } from "./Artwork";

/**
 * A path's sermons as a little stack of printed posters: the day you're on
 * in front, two behind it, tilted. Geometry is the approved concept's, per
 * size. Decorative (hidden from screen readers); the card says the words.
 *
 * - "card": Home's "Your path" card, 118×84 (100×56 tiles).
 * - "compact": Search's "A path for this", 72×54 (62×35 tiles, two shown).
 * - "row": "Part of your path" on the sermon page, 58×46 (50×28, two shown).
 * - "cover": the path page's dark cover, 340×124 (two 164×92 behind a
 *   straight 192×108 front tile).
 */
export type FanSize = "card" | "compact" | "row" | "cover";

type Tile = { left: number; top: number; w: number; h: number; rotate: number; r: number };
/** A tile behind the front one: which sermon (1 = second, 2 = third) it shows. */
type BackTile = Tile & { item: 1 | 2 };
/** `back` is in painting order: the first is the furthest back. */
type Geometry = { box: [number, number]; front: Tile; back: BackTile[]; shadow: string };

const GEOMETRY: Record<FanSize, Geometry> = {
  card: {
    box: [118, 84],
    // Behind: the third sermon to the right (10°), under the second (-4°).
    back: [
      { item: 2, left: 22, top: 2, w: 100, h: 56, rotate: 10, r: 8 },
      { item: 1, left: 4, top: 10, w: 100, h: 56, rotate: -4, r: 8 },
    ],
    front: { left: 12, top: 24, w: 100, h: 56, rotate: -12, r: 8 },
    shadow: shadows.fanCard,
  },
  compact: {
    box: [72, 54],
    back: [{ item: 1, left: 10, top: 4, w: 62, h: 35, rotate: 8, r: 6 }],
    front: { left: 0, top: 14, w: 62, h: 35, rotate: -8, r: 6 },
    shadow: shadows.fanCompact,
  },
  row: {
    box: [58, 46],
    back: [{ item: 1, left: 6, top: 2, w: 50, h: 28, rotate: 8, r: 6 }],
    front: { left: 0, top: 14, w: 50, h: 28, rotate: -6, r: 6 },
    shadow: shadows.fanCompact,
  },
  cover: {
    box: [340, 124],
    back: [
      { item: 2, left: 174, top: 14, w: 164, h: 92, rotate: 12, r: 13 },
      { item: 1, left: 2, top: 14, w: 164, h: 92, rotate: -12, r: 13 },
    ],
    front: { left: 74, top: 0, w: 192, h: 108, rotate: 0, r: 13 },
    shadow: shadows.fanCover,
  },
};

export const fanSize = (size: FanSize, scale = 1) => ({
  width: GEOMETRY[size].box[0] * scale,
  height: GEOMETRY[size].box[1] * scale,
});

export const CardFan = memo(function CardFan({
  sermons,
  size = "card",
  scale = 1,
  border = "hairline",
  priority = "low",
  style,
}: {
  /** Front first, then the ones behind (left, right). One is enough. */
  sermons: readonly (ArtSource | null | undefined)[];
  size?: FanSize;
  /** Scales the whole fan (0.5 to 1.5 or so). */
  scale?: number;
  /** "hairline": the concept's faint white edge; "white": a 2pt white mat. */
  border?: "hairline" | "white";
  /** The front tile's loading priority ("high" on a cover above the fold). */
  priority?: "low" | "normal" | "high";
  style?: StyleProp<ViewStyle>;
}) {
  const g = GEOMETRY[size];
  const items = sermons.filter((s): s is ArtSource => !!s);
  const front = items[0];
  // Behind: as many as there are, up to the size's slots.
  const behind = g.back.filter((t) => t.item < items.length);
  const edge =
    border === "white"
      ? { borderWidth: 2 * scale, borderColor: c.white }
      : { borderWidth: 1, borderColor: c.artEdge };

  const tile = (t: Tile, art: ArtSource, key: string) => (
    <View
      key={key}
      style={[
        styles.tile,
        {
          left: t.left * scale,
          top: t.top * scale,
          width: t.w * scale,
          height: t.h * scale,
          borderRadius: t.r * scale,
          transform: t.rotate ? [{ rotate: `${t.rotate}deg` }] : undefined,
          boxShadow: g.shadow,
        },
      ]}
    >
      <Artwork
        art={art}
        width={t.w * scale}
        radius={t.r * scale}
        lift="none"
        priority={key === "front" ? priority : "low"}
      />
      <View style={[StyleSheet.absoluteFill, edge, { borderRadius: t.r * scale }]} />
    </View>
  );

  return (
    <View
      style={[{ width: g.box[0] * scale, height: g.box[1] * scale }, style]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      {...web({ "aria-hidden": true })}
    >
      {behind.map((t) => tile(t, items[t.item], `b${t.item}`))}
      {front ? tile(g.front, front, "front") : null}
    </View>
  );
});

const styles = StyleSheet.create({
  tile: { position: "absolute" },
});
