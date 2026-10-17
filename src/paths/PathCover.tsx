import { memo } from "react";
import { StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { CardFan, ItalicTitle, Kicker, PathProgress, Wash, fanSize, type ArtSource } from "../kit";
import { keepLastWord } from "../kit/paths";
import type { Path } from "../learning";
import { totalTime } from "../learning/format";
import { c, tabular, textCap, type } from "../theme";
import { T, web } from "../ui";
import { breaksBeforeItalic, pathWords } from "./model";
import { TotalTime } from "./TotalTime";

/** How far the ivory panel rides up over the cover's bottom edge. */
export const COVER_OVERLAP = 20;

/**
 * The fan at most 0.8 of the concept's 340pt (a 154pt front poster on a
 * 390pt phone), so today's card clears the call to action; narrower phones
 * shrink it.
 */
function fanScale(width: number) {
  return Math.min(0.8, (Math.min(width, 760) - 30) / 340);
}

/** How tall the cover's fan is at this window width. */
export function coverFanHeight(width: number) {
  return fanSize("cover", fanScale(width)).height;
}

/**
 * Space above the fan, under the status bar. Under 360pt the tiles behind
 * reach out under the back and share buttons, so they start a little lower.
 */
export function coverTop(width: number) {
  return width < 360 ? 26 : 20;
}

/**
 * The path page's dark cover (concept screen 03): navy light over near
 * black, a fan of the path's sermons (today's in front), "GUIDED PATH · 7
 * DAYS" ("TEACHING SERIES · 12 TEACHINGS"), the name in serif with its
 * italic phrase, and once it's started the days as segments with "Day 3 of
 * 7 · [clock] 18h" under them (the sermons, whole, once their lengths are
 * known); before that, just "[clock] 18h", as the kicker has already
 * counted the days (the Paths tab's masthead says it the same way). It
 * runs under the status bar; the back and share buttons float above it
 * (the screen draws them).
 */
export const PathCover = memo(function PathCover({
  path,
  fan,
  total,
  done,
  today,
  partial,
  enrolled,
  length,
  topInset,
  onLayout,
  onWordsLayout,
}: {
  path: Path;
  fan: readonly ArtSource[];
  total: number;
  done: readonly number[];
  /** Today's day number, or null once every day is done. */
  today: number | null;
  /** 0 to 1 through today's sermon. */
  partial: number;
  enrolled: boolean;
  /** The sermons' length together (seconds), or null while it isn't known. */
  length?: number | null;
  topInset: number;
  onLayout?: (e: LayoutChangeEvent) => void;
  /** The kicker and title's layout on the cover, where the title's last line ends (for the pinned header). */
  onWordsLayout?: (e: LayoutChangeEvent) => void;
}) {
  const { width } = useWindowDimensions();
  const scale = fanScale(width);
  const words = pathWords(path);
  // Never one word alone on the title's last line.
  const name = keepLastWord(path.name, path.italic);
  const days = words.series ? "teachings" : "days";
  const all = length ? totalTime(length) : null;
  const allSpoken = all ? ` ${all.spoken}.` : "";
  // Started: the segments, with "Day 3 of 7" under them. Before that, empty
  // segments would read as something loading, and the kicker has said "7
  // days": just "[clock] 18h".
  const where = !enrolled
    ? null
    : today == null
      ? "Finished"
      : `${words.unit} ${today} of ${total}`;
  const spoken = !enrolled
    ? `${total} ${days}, not started.${allSpoken}`
    : today == null
      ? `Finished, all ${total} ${days} done.${allSpoken}`
      : `${words.unit} ${today} of ${total}. ${done.length} done.${allSpoken}`;

  return (
    <View style={[styles.cover, { paddingTop: topInset + coverTop(width) }]} onLayout={onLayout} testID="path-cover">
      <Wash kind="pathCover" />
      <CardFan sermons={fan} size="cover" scale={scale} style={styles.fan} priority="high" dimBack />
      <View style={styles.text} onLayout={onWordsLayout}>
        <Kicker tone="onMedia">{`${words.kind} · ${words.count(path.dayCount || total)}`}</Kicker>
        <ItalicTitle
          text={name.text}
          italic={name.italic}
          accessibilityLabel={path.name}
          breakBeforeItalic={breaksBeforeItalic(path.name, path.italic)}
          style={[type.coverTitle, styles.title]}
          maxFontSizeMultiplier={textCap.display}
          accessibilityRole="header"
          {...web({ "aria-level": 1 })}
        />
      </View>
      <View
        style={styles.progress}
        accessible
        accessibilityLabel={spoken}
        // Web drops a label on an element with no role.
        {...web({ role: "img" })}
      >
        {enrolled ? (
          <PathProgress total={total} done={done} current={today} partial={partial} tone="onDark" />
        ) : null}
        {where || length ? (
          <View style={[styles.caption, !enrolled && styles.captionAlone]}>
            {where ? <T style={[type.metaSmall, tabular, styles.where]} maxFontSizeMultiplier={textCap.section}>
                {where}
              </T> : null}
            {where && length ? <T style={[type.metaSmall, styles.dot]} maxFontSizeMultiplier={textCap.section}>
                ·
              </T> : null}
            {length ? <TotalTime seconds={length} /> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  cover: {
    backgroundColor: c.media,
    overflow: "hidden",
    paddingBottom: 12 + COVER_OVERLAP,
  },
  fan: { alignSelf: "center" },
  text: { alignItems: "center", paddingHorizontal: 24 },
  title: { color: c.white, textAlign: "center", marginTop: 8 },
  progress: { width: "100%", maxWidth: 420, alignSelf: "center", paddingHorizontal: 58, marginTop: 8 },
  // One line under the segments, centred; it wraps whole at large text.
  caption: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    columnGap: 10,
    marginTop: 8,
  },
  captionAlone: { marginTop: 0 },
  where: { color: c.white },
  dot: { color: c.onMediaMuted },
});
