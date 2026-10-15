import { useNavigation, type Href } from "expo-router";
import * as Haptics from "expo-haptics";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { AccessibilityInfo, Platform, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ItalicTitle, Kicker, PartOfPathRow, PlayPill, type ArtSource } from "../kit";
import { nextDay, useEnrollment, usePath, type Path, type PathDayWithSermon } from "../learning";
import { useReducedMotion } from "../motion";
import { useGo } from "../navigation";
import { usePlayback, usePlayerSession } from "../player/PlayerProvider";
import { c, radius, shadows, space, textCap, type } from "../theme";
import { T, Tap } from "../ui";

/** This sermon as a day of a path, and where the viewer is in that path. */
export type PathDayContext = {
  path: Path;
  day: PathDayWithSermon;
  days: PathDayWithSermon[];
  total: number;
  /** Day numbers done. */
  done: number[];
  enrolled: boolean;
  /** The day to do next (null once every day is done). */
  today: number | null;
  /** Opened as this day (?path=&day=), not just recognised as one. */
  explicit: boolean;
};

/**
 * Which day of a path this sermon is: the one the link names (?path=&day=),
 * else, when the sermon is a day of the path you're on, that day (today's
 * if it's today's). Null when it's neither, or while paths load.
 */
export function usePathDay(sermonId: string, link: { path: string | null; day: number | null }) {
  const named = usePath(link.path);
  const { active, progressFor } = useEnrollment();
  return useMemo<PathDayContext | null>(() => {
    let path: Path | undefined;
    let days: PathDayWithSermon[] = [];
    let day: PathDayWithSermon | undefined;
    let explicit = false;
    if (link.path && named.path && link.day != null) {
      const match = named.days.find((d) => d.day === link.day);
      // A link whose day isn't this sermon is ignored rather than trusted.
      if (match && match.youtubeId === sermonId) {
        path = named.path;
        days = named.days;
        day = match;
        explicit = true;
      }
    }
    if (!day && active) {
      const mine = active.days.filter((d) => d.youtubeId === sermonId);
      const pick = mine.find((d) => d.day === active.day) ?? mine[0];
      if (pick) {
        path = active.path;
        days = active.days;
        day = pick;
      }
    }
    if (!path || !day) return null;
    const progress = progressFor(path.id);
    const done = progress?.done ?? [];
    const total = days.length || path.dayCount;
    return {
      path,
      day,
      days,
      total,
      done,
      enrolled: !!progress,
      today: progress ? nextDay(total, done) : null,
      explicit,
    };
  }, [link.path, link.day, named.path, named.days, active, sermonId, progressFor]);
}

/** Front first: this day's sermon, then the day before it (or after, on day 1). */
function fanFor(ctx: PathDayContext): ArtSource[] {
  const art = (d: PathDayWithSermon | undefined): ArtSource | null =>
    d ? (d.sermon ?? { id: d.youtubeId }) : null;
  const i = ctx.days.findIndex((d) => d.day === ctx.day.day);
  const behind = ctx.days[i - 1] ?? ctx.days[i + 1];
  return [art(ctx.day), art(behind)].filter((a): a is ArtSource => !!a);
}

/** How far through the day's focus `seconds` is, 0 to 1. */
export function focusProgress(ctx: PathDayContext, seconds: number) {
  const { focusStart, focusEnd } = ctx.day;
  if (focusEnd <= focusStart) return 0;
  return Math.min(1, Math.max(0, (seconds - focusStart) / (focusEnd - focusStart)));
}

/**
 * Opens the path page: back to it when it's the screen underneath (where
 * this day was opened from), else on top of this one.
 */
export function useOpenPath() {
  const navigation = useNavigation();
  const go = useGo();
  return useCallback(
    (pathId: string) => {
      const state = navigation.getState();
      const below = state?.routes[state.index - 1] as { name?: string; params?: { id?: string } } | undefined;
      if (below?.name === "path/[id]" && below.params?.id === pathId) go.back();
      else go.push({ pathname: "/path/[id]", params: { id: pathId } } as unknown as Href);
    },
    [navigation, go],
  );
}

/**
 * "Part of your path · Day 3 of 7" on the panel, with the path's progress
 * (today's segment filling as the focus plays). A day opened from a path
 * you haven't started says so: "From a path · Day 3 of 7".
 */
export const PathDayRow = memo(function PathDayRow({ ctx, current }: { ctx: PathDayContext; current: boolean }) {
  const openPath = useOpenPath();
  const fan = useMemo(() => fanFor(ctx), [ctx]);
  const kicker = ctx.enrolled
    ? `Part of your path · Day ${ctx.day.day} of ${ctx.total}`
    : `From a path · Day ${ctx.day.day} of ${ctx.total}`;
  const row = (partial: number) => (
    <PartOfPathRow
      testID="part-of-path"
      name={ctx.path.name}
      day={ctx.day.day}
      total={ctx.total}
      done={ctx.done}
      partial={partial}
      fan={fan}
      kicker={kicker}
      onPress={() => openPath(ctx.path.id)}
    />
  );
  // Only a loaded sermon's place moves the bar, so only then follow playback.
  return current ? <LiveRow ctx={ctx} render={row} /> : row(0);
});

function LiveRow({ ctx, render }: { ctx: PathDayContext; render: (partial: number) => ReactElement }) {
  const { seconds } = usePlayback();
  // In 2% steps, so the row redraws a few times a minute, not every second.
  const partial = Math.round(focusProgress(ctx, seconds) * 50) / 50;
  return render(ctx.done.includes(ctx.day.day) ? 0 : partial);
}

/**
 * Watches for the end of today's focus while this day plays. The first time
 * playback runs past it, the day is marked done (once) and a card says
 * "That's today's teaching", with Keep listening (carries on) and Finish
 * Day 3 (stops, keeping the place, and goes to the path).
 */
export function DayDoneWatcher({ ctx, sermonId }: { ctx: PathDayContext; sermonId: string }) {
  const session = usePlayerSession();
  const p = usePlayback();
  const { markDone } = useEnrollment();
  const openPath = useOpenPath();
  const [shown, setShown] = useState(false);
  const marked = useRef(false);
  const last = useRef<number | null>(null);
  const current = session.sermon?.id === sermonId;
  const { day, enrolled, done, today } = ctx;
  // Only today's day of a path you're on: later days open after it.
  const eligible = enrolled && !done.includes(day.day) && today === day.day;

  useEffect(() => {
    if (!current) {
      last.current = null;
      return;
    }
    const before = last.current;
    last.current = p.seconds;
    if (!eligible || marked.current) return;
    // Reached by playing (a step of a few seconds), or the video ended
    // inside or after the focus.
    const crossed =
      before != null && before < day.focusEnd && p.seconds >= day.focusEnd && p.seconds - before <= 6;
    const ended = p.state === 0 && p.seconds >= day.focusStart;
    if (!crossed && !ended) return;
    marked.current = true;
    markDone(ctx.path.id, day.day);
    setShown(true);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    AccessibilityInfo.announceForAccessibility(`Day ${day.day} done. That’s today’s teaching.`);
  }, [current, p.seconds, p.state, eligible, day, markDone, ctx.path.id]);

  if (!shown) return null;
  return (
    <DayDoneCard
      day={day.day}
      onKeepListening={() => setShown(false)}
      onFinish={() => {
        setShown(false);
        // Done for today: stop (the place is kept) rather than dock a
        // paused video over the path.
        session.close();
        openPath(ctx.path.id);
      }}
    />
  );
}

const DayDoneCard = memo(function DayDoneCard({
  day,
  onKeepListening,
  onFinish,
}: {
  day: number;
  onKeepListening: () => void;
  onFinish: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  return (
    <Animated.View
      entering={reduced ? FadeIn.duration(150) : FadeInDown.duration(240)}
      exiting={FadeOut.duration(180)}
      style={[styles.doneWrap, { bottom: Math.max(16, insets.bottom) }]}
      testID="day-done"
      accessibilityViewIsModal={false}
    >
      <View style={styles.done}>
        <Kicker>{`Day ${day} done`}</Kicker>
        <ItalicTitle
          text="That’s today’s teaching"
          italicLast
          accessibilityRole="header"
          style={styles.doneTitle}
          maxFontSizeMultiplier={textCap.section}
        />
        <T style={styles.doneBody}>
          You’ve reached the end of today’s focus. Keep listening, or finish here for today.
        </T>
        <View style={styles.doneActions}>
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Keep listening"
            onPress={onKeepListening}
            style={styles.keep}
          >
            <T style={styles.keepText} maxFontSizeMultiplier={textCap.chip}>
              Keep listening
            </T>
          </Tap>
          <PlayPill
            size="md"
            icon="checkmark"
            label={`Finish Day ${day}`}
            onPress={onFinish}
            hint="Stops the sermon here and opens the path"
          />
        </View>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  doneWrap: { position: "absolute", left: 16, right: 16, alignItems: "center", zIndex: 40 },
  done: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: c.raised,
    borderRadius: radius.r22,
    padding: space.s20,
    boxShadow: shadows.floating,
  },
  doneTitle: { ...type.section, marginTop: 6 },
  doneBody: { ...type.body, color: c.muted, marginTop: 6 },
  doneActions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14, justifyContent: "flex-end" },
  keep: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  keepText: { ...type.button, color: c.text },
});
