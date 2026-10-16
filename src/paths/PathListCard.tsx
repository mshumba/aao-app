import { memo } from "react";
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { CardFan, ItalicTitle, PathProgress, Wash, fanSize, spokenText, type ArtSource } from "../kit";
import { keepLastWord } from "../kit/paths";
import type { Path } from "../learning";
import { artRadius, c, font, fontSize, space, tabular, textCap, type } from "../theme";
import { Icon, T, Tap, web } from "../ui";
import { isSingleTeaching, pathWords } from "./model";
import { TotalTime } from "./TotalTime";

export type ListProgress =
  | { kind: "none" }
  | { kind: "on"; day: number; done: readonly number[]; partial: number }
  | { kind: "finished" };

/** The leading tile: a small dark cover, its fan scaled to its height. Smaller on a narrow phone. */
const TILE = { w: 104, h: 58 };
const TILE_NARROW = { w: 88, h: 50 };
const fanScale = (tileH: number) => (tileH - 6) / fanSize("card").height;

/**
 * A path on the Paths tab, as a row under the "Start here" masthead: a
 * small copy of the path page's dark cover (its fan under navy light),
 * then the name in serif, the one-line promise and "7 days · ◷ 18h" ("12
 * teachings" for a series), or, once started, where you are on it. A
 * hairline parts it from the row above (`first`: none). One element to
 * assistive tech.
 */
export const PathListCard = memo(function PathListCard({
  path,
  fan,
  total,
  length,
  progress,
  first = false,
  onPress,
  style,
}: {
  path: Path;
  /** Front first. */
  fan: readonly ArtSource[];
  total: number;
  /** The sermons, whole, together (seconds); null until every one's length is known. */
  length: number | null;
  progress: ListProgress;
  /** The first row under its heading: no hairline above it. */
  first?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const narrow = useWindowDimensions().width < 360;
  const tile = narrow ? TILE_NARROW : TILE;
  const words = pathWords(path);
  const count = words.count(total);
  const name = keepLastWord(path.name, path.italic);
  const single = isSingleTeaching(path, total);
  const status =
    progress.kind === "on"
      ? `${words.unit} ${progress.day} of ${total}, ${progress.done.length} done`
      : progress.kind === "finished"
        ? "Finished"
        : null;
  // One label, in words: "Breaking free from habitual sin. 7 days.
  // <promise>."
  const label = [path.name, spokenText(count), path.promise, status]
    .filter((part): part is string => !!part)
    .map((part) => part.trim().replace(/[.!?]$/, ""))
    .join(". ")
    .concat(".");

  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={single ? "Opens the teaching" : `Opens the ${words.noun}`}
      onPress={onPress}
      feedback="dim"
      style={[styles.row, !first && styles.rule, style]}
      testID={`path-card-${path.id}`}
    >
      <View
        style={[styles.tile, { width: tile.w, height: tile.h, borderRadius: artRadius(tile.w) }]}
        {...web({ dataSet: { dark: "true" } })}
      >
        <Wash kind="pathCover" />
        <CardFan sermons={fan} size="card" scale={fanScale(tile.h)} />
      </View>
      <View style={styles.text}>
        <ItalicTitle
          text={name.text}
          italic={name.italic}
          accessibilityLabel={path.name}
          numberOfLines={2}
          style={styles.name}
          maxFontSizeMultiplier={textCap.section}
        />
        {/* A third line on a narrow phone, where the column is short. */}
        {path.promise ? (
          <T style={styles.promise} numberOfLines={narrow ? 3 : 2}>
            {path.promise}
          </T>
        ) : null}
        {progress.kind === "on" ? (
          <PathProgress
            total={total}
            done={progress.done}
            current={progress.day}
            partial={progress.partial}
            tone="onLight"
            thickness={3}
            gap={3}
            // The segments show what's done: the words just say where you are.
            caption={{ left: `${words.unit} ${progress.day} of ${total}` }}
            style={styles.progress}
          />
        ) : progress.kind === "finished" ? (
          <View style={styles.meta}>
            <Icon name="checkmark-circle" size={14} color={c.accent} />
            <T style={styles.finished}>Finished</T>
          </View>
        ) : (
          <View style={styles.meta}>
            <T style={styles.metaText}>{length ? `${count} ·` : count}</T>
            {length ? <TotalTime seconds={length} tone="onLight" /> : null}
          </View>
        )}
      </View>
    </Tap>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    paddingVertical: space.lg,
  },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
  tile: {
    backgroundColor: c.media,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, minWidth: 0 },
  name: {
    fontFamily: font.serif,
    fontSize: fontSize.heading,
    lineHeight: 24,
    letterSpacing: -0.2,
    color: c.text,
    // Its first line sits level with the tile's top edge.
    marginTop: -3,
  },
  promise: { ...type.meta, color: c.muted, marginTop: 2 },
  meta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  metaText: { ...type.metaSmall, color: c.muted, ...tabular },
  finished: { ...type.metaSmall, color: c.accent },
  progress: { marginTop: 8 },
});
