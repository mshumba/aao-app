import { memo, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Artwork, ItalicTitle, Kicker, PlayPill, Quote, clockText, spokenTime } from "../kit";
import type { Path, PathDayWithSermon } from "../learning";
import { useReducedMotion } from "../motion";
import { c, radius, space, tabular, textCap, type } from "../theme";
import { T, TextButton, web } from "../ui";
import { PathSheet } from "./Sheet";

/**
 * "Day 3 done." (the doc's Day complete sheet), shown when someone comes
 * back to the path page after the sermon page marked the day done: the
 * day's verbatim quote, what tomorrow holds, "Done for today", and "Keep
 * listening from 1:37:02". No streaks, flames or confetti; the new segment
 * of the path fills over 400ms (at once under Reduce Motion).
 */
export const DayCompleteSheet = memo(function DayCompleteSheet({
  visible,
  path,
  day,
  total,
  done,
  next,
  nextMinutes,
  hydrated,
  onClose,
  onKeepListening,
  onNextPath,
}: {
  visible: boolean;
  path: Path;
  day: PathDayWithSermon | undefined;
  total: number;
  done: readonly number[];
  /** The next day still to do, or undefined when the path is finished. */
  next: PathDayWithSermon | undefined;
  nextMinutes: number;
  hydrated: boolean;
  onClose: () => void;
  onKeepListening: (day: PathDayWithSermon) => void;
  onNextPath: () => void;
}) {
  if (!day) return null;
  const finished = !next;
  const heading = finished ? "Path complete." : `Day ${day.day} done.`;
  const nextTitle = next?.sermon?.headline ?? (hydrated ? null : "Loading");
  return (
    <PathSheet visible={visible} onClose={onClose} label={finished ? "Path complete" : `Day ${day.day} done`} testID="day-complete">
      <View style={styles.head}>
        <Kicker numberOfLines={2} style={styles.center}>
          {finished ? `${path.name}` : `Day ${day.day} of ${total} · ${day.theme}`}
        </Kicker>
        <ItalicTitle
          text={heading}
          italic={finished ? "complete" : "done"}
          style={[type.question, styles.title]}
          maxFontSizeMultiplier={textCap.display}
          accessibilityRole="header"
          {...web({ "aria-level": 2 })}
        />
        <FillingProgress total={total} done={done} fresh={day.day} />
        <T style={[type.metaSmall, tabular, styles.count]}>
          {finished ? `All ${total} days done` : `${done.length} of ${total} done`}
        </T>
      </View>

      {day.keyQuote ? (
        <View style={styles.quoteCard}>
          <Quote text={day.keyQuote} size="card" />
          <T style={[type.meta, styles.source]} accessibilityLabel={`From ${day.sermon?.headline ?? "today's message"}, at ${spokenTime(day.keyAt)}`}>
            {day.sermon?.headline ?? "Today’s message"}
            {" · "}
            <T style={[type.meta, tabular, styles.sourceTime]}>{clockText(day.keyAt)}</T>
          </T>
        </View>
      ) : null}

      {next ? (
        <View
          style={styles.next}
          accessible
          accessibilityLabel={`Tomorrow: day ${next.day}. ${next.theme}. ${nextTitle ?? ""}. ${nextMinutes} minutes.`}
        >
          <Artwork art={next.sermon ?? { id: next.youtubeId }} width={64} radius={6} />
          <View style={styles.nextText}>
            <Kicker tone="muted">{`Tomorrow · Day ${next.day}`}</Kicker>
            <T style={[type.cardTitle, { marginTop: 2 }]} numberOfLines={2}>
              {nextTitle ?? next.theme}
            </T>
            <T style={[type.meta, tabular, styles.muted]}>{`${next.theme} · ${nextMinutes} min`}</T>
          </View>
        </View>
      ) : (
        <T style={[type.body, styles.finishedLine]}>
          {`You’ve walked every day of ${path.name}. Take what stayed with you into this week.`}
        </T>
      )}

      <View style={styles.actions}>
        {finished ? (
          <>
            <PlayPill
              tone="navy"
              size="md"
              icon="none"
              label="Choose your next path"
              onPress={onNextPath}
              style={styles.primary}
              testID="day-complete-next-path"
            />
            <TextButton label="Close" onPress={onClose} />
          </>
        ) : (
          <>
            <PlayPill
              tone="navy"
              size="md"
              icon="none"
              label="Done for today"
              onPress={onClose}
              style={styles.primary}
              testID="day-complete-close"
            />
            <TextButton
              label={`Keep listening from ${clockText(day.focusEnd)}`}
              hint={`Plays on from ${spokenTime(day.focusEnd)}`}
              onPress={() => onKeepListening(day)}
            />
          </>
        )}
      </View>
    </PathSheet>
  );
});

const fillEase = Easing.bezier(0.23, 1, 0.32, 1);

/** The path's segments, the day just finished filling in over 400ms. */
function FillingProgress({ total, done, fresh }: { total: number; done: readonly number[]; fresh: number }) {
  const reduced = useReducedMotion();
  const fill = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    fill.value = reduced ? 1 : withTiming(1, { duration: 400, easing: fillEase });
  }, [fill, reduced]);
  const freshStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  return (
    <View style={styles.segments} accessible={false} importantForAccessibility="no-hide-descendants" {...web({ "aria-hidden": true })}>
      {Array.from({ length: Math.max(1, total) }, (_, i) => {
        const n = i + 1;
        const isFresh = n === fresh;
        const isDone = done.includes(n) && !isFresh;
        return (
          <View key={n} style={styles.segment}>
            {isDone ? <View style={styles.segmentFull} /> : null}
            {isFresh ? <Animated.View style={[styles.segmentFill, freshStyle]} /> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: "center" },
  center: { textAlign: "center" },
  title: { color: c.text, textAlign: "center", marginTop: 6 },
  segments: { flexDirection: "row", gap: 4, alignSelf: "stretch", marginTop: 16, marginHorizontal: 24 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: c.track, overflow: "hidden" },
  segmentFull: { height: 4, backgroundColor: c.accent },
  segmentFill: { height: 4, backgroundColor: c.accent },
  count: { color: c.muted, marginTop: 8 },
  quoteCard: {
    marginTop: 20,
    backgroundColor: c.feature,
    borderRadius: radius.r20,
    paddingVertical: 18,
    paddingLeft: 26,
    paddingRight: 20,
  },
  source: { color: c.mutedOnFeature, marginTop: 10 },
  sourceTime: { color: c.accent, fontFamily: type.labelSmall.fontFamily },
  next: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 20 },
  nextText: { flex: 1, minWidth: 0 },
  muted: { color: c.muted, marginTop: 2 },
  finishedLine: { color: c.muted, marginTop: 20, textAlign: "center" },
  actions: { marginTop: space.xl, gap: space.xs, alignItems: "stretch" },
  primary: { alignSelf: "stretch", minHeight: 52 },
});
