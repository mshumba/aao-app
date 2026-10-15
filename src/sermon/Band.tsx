import { memo, useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { spokenTime } from "../kit";
import { Spark } from "../kit/Spark";
import { useReducedMotion } from "../motion";
import { bandTicks, type BandMarks } from "../player/NowPlaying";
import { clock } from "../player/PlayerProvider";
import { c, font, tabular, textCap, type } from "../theme";
import { T, web } from "../ui";
import { STRIP_HEIGHT, TimesRow, Track, useStripWidth } from "./Track";

/**
 * The band before the player loads: the same track, read-only. Its thumb
 * sits where Play will start (a shared time, a search moment, where you
 * left off); opened at a moment, it travels there once
 * ("Find the minute"). Decorative: the Watch pill says where it starts.
 */
export const StaticBand = memo(function StaticBand({
  marks,
  position,
  center,
  arrive = false,
}: {
  marks: BandMarks;
  /** 0 to 1, or null when it starts from the beginning. */
  position: number | null;
  center?: ReactNode;
  /** Travel from the start to `position` when it first shows. */
  arrive?: boolean;
}) {
  const [width, onLayout] = useStripWidth();
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(arrive && !reduced && position != null ? 0 : position);
  useEffect(() => {
    // After the first frame, so the thumb has somewhere to travel from.
    const id = requestAnimationFrame(() => setShown(position));
    return () => cancelAnimationFrame(id);
  }, [position]);
  const { ticks } = bandTicks(marks, 0);
  // Elapsed and remaining from where Play will start, as the playing band shows.
  const start = (position ?? 0) * marks.estimate;
  const times = marks.estimate > 0;
  return (
    <View>
      <View
        onLayout={onLayout}
        style={{ height: STRIP_HEIGHT }}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        {...web({ "aria-hidden": true })}
      >
        <Track width={width} position={shown} ticks={ticks} glide played={!arrive} />
      </View>
      <TimesRow
        left={times ? clock(start) : null}
        right={times ? `−${clock(Math.max(0, marks.estimate - start))}` : null}
        leftLabel={times ? spokenTime(start) : undefined}
        center={center}
      />
    </View>
  );
});

/**
 * "From your search: rejection" in the band's centre for the first six
 * seconds after opening from a search, then it fades away.
 */
export function SearchPill({ q }: { q: string }) {
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={styles.pill}
      accessible
      accessibilityLabel={`From your search: ${q}`}
    >
      <Spark size={12} color={c.goldOnDark} />
      <T style={styles.pillText} numberOfLines={2} maxFontSizeMultiplier={textCap.chip}>
        From your search: <T style={styles.pillQuery}>{q}</T>
      </T>
    </Animated.View>
  );
}

/** "4 moments marked" under a band with moments and nothing else to say. */
export function MarkedCaption({ count }: { count: number }) {
  return (
    <T style={styles.caption} maxFontSizeMultiplier={textCap.chip}>
      {`${count} moment${count === 1 ? "" : "s"} marked`}
    </T>
  );
}

const styles = StyleSheet.create({
  // Information only: a tap here falls through to the strip.
  pill: {
    pointerEvents: "none",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: "100%",
    minHeight: 24,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: c.glassOnStage,
    borderWidth: 1,
    borderColor: c.glassBorder,
  },
  pillText: { ...type.metaSmall, color: c.onMediaMuted, flexShrink: 1 },
  pillQuery: { fontFamily: font.bold, color: c.white },
  caption: { ...type.metaSmall, color: c.onMediaMuted, flexShrink: 1, pointerEvents: "none", ...tabular },
});
