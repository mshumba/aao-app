import { memo } from "react";
import { StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { CardFan, ItalicTitle, Kicker, PathProgress, Wash, fanSize, spokenText, type ArtSource } from "../kit";
import type { Path } from "../learning";
import { totalTimeLabel } from "../learning/format";
import { c, textCap, type } from "../theme";
import { web } from "../ui";
import { breaksBeforeItalic, pathWords } from "./model";

/** How far the ivory panel rides up over the cover's bottom edge. */
export const COVER_OVERLAP = 20;

/** The concept's fan is 340 wide on a 393pt phone; narrower phones shrink it. */
function fanScale(width: number) {
  return Math.min(1, (Math.min(width, 760) - 30) / 340);
}

/** How tall the cover's fan is at this window width. */
export function coverFanHeight(width: number) {
  return fanSize("cover", fanScale(width)).height;
}

/**
 * The path page's dark cover (concept screen 03): navy light over near
 * black, a fan of the path's sermons (today's in front), "GUIDED PATH · 7
 * MESSAGES" ("TEACHING SERIES · 12 TEACHINGS"), the name in serif with its
 * italic phrase, and the days as segments with "Day 3 of 7 · About 18 hours
 * in all" (the sermons, whole, once their lengths are known). It runs under
 * the status bar; the back and share buttons float above it (the screen
 * draws them).
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
  onTitleBottom,
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
  /** Where the title's last line ends, from the cover's top (for the pinned band). */
  onTitleBottom?: (y: number) => void;
}) {
  const { width } = useWindowDimensions();
  const scale = fanScale(width);
  const words = pathWords(path);
  const days = words.series ? "teachings" : "days";
  const all = length ? totalTimeLabel(length) : null;
  const allSpoken = all ? ` ${spokenText(all)}.` : "";
  // Before starting, the kicker already counts the messages: just the time.
  const caption = !enrolled
    ? all
      ? { left: all, centered: true }
      : undefined
    : {
        left: today == null ? "Finished" : `${words.unit} ${today} of ${total}`,
        right: all ?? undefined,
        centered: true,
      };
  const spoken = !enrolled
    ? `${total} ${days}, not started.${allSpoken}`
    : today == null
      ? `Finished, all ${total} ${days} done.`
      : `${words.unit} ${today} of ${total}. ${done.length} done.${allSpoken}`;

  return (
    <View style={[styles.cover, { paddingTop: topInset + 34 }]} onLayout={onLayout} testID="path-cover">
      <Wash kind="pathCover" />
      <CardFan sermons={fan} size="cover" scale={scale} style={styles.fan} priority="high" />
      <View
        style={styles.text}
        onLayout={
          onTitleBottom
            ? (e) => onTitleBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)
            : undefined
        }
      >
        <Kicker tone="onMedia">{`${words.kind} · ${words.count(path.dayCount || total)}`}</Kicker>
        <ItalicTitle
          text={path.name}
          italic={path.italic}
          breakBeforeItalic={breaksBeforeItalic(path.name, path.italic)}
          style={[type.coverTitle, styles.title]}
          maxFontSizeMultiplier={textCap.display}
          accessibilityRole="header"
          {...web({ "aria-level": 1 })}
        />
      </View>
      <PathProgress
        total={total}
        done={done}
        current={today}
        partial={partial}
        tone="onDark"
        caption={caption}
        accessibilityLabel={spoken}
        style={styles.progress}
      />
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
});
