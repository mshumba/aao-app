import { useNavigation, type Href } from "expo-router";
import * as Haptics from "expo-haptics";
import { memo, useCallback, useMemo, type ReactElement } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useProgressOf } from "../auth/AccountProvider";
import { PartOfPathRow, type ArtSource } from "../kit";
import { nextDay, useEnrollment, usePath, type Path, type PathDayWithSermon } from "../learning";
import { useGo } from "../navigation";
import { pathWords, sermonLength } from "../paths/model";
import { usePlayback } from "../player/PlayerProvider";
import { fraction } from "../player/progress";
import { c, textCap, type } from "../theme";
import { useToast } from "../toast";
import { Icon, T, Tap } from "../ui";

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
 * else, when it's today's sermon on the path you're on, today's day. Any
 * other sermon (one opened "anyway", ahead of its day) is just the message
 * on its own. Null when it's neither, or while paths load.
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
    if (!day && active?.today?.youtubeId === sermonId) {
      path = active.path;
      days = active.days;
      day = active.today;
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
 * (today's segment filling as the sermon plays). A day opened from a path
 * you haven't started says so: "From a path · Day 3 of 7". A series says
 * "Part of your series · Teaching 3 of 12". When it's the day due on a path
 * you're on, a quiet "Mark Day 3 done" sits under it, for a sermon heard
 * elsewhere or not finished here.
 */
export const PathDayRow = memo(function PathDayRow({ ctx, current }: { ctx: PathDayContext; current: boolean }) {
  const openPath = useOpenPath();
  const progressFor = useProgressOf([ctx.day.youtubeId]);
  const { complete } = useEnrollment();
  const toast = useToast();
  const fan = useMemo(() => fanFor(ctx), [ctx]);
  const words = pathWords(ctx.path);
  const n = ctx.day.day;
  const kicker = ctx.enrolled
    ? `Part of your ${words.noun} · ${words.unit} ${n} of ${ctx.total}`
    : `From a ${words.noun} · ${words.unit} ${n} of ${ctx.total}`;
  const isDone = ctx.done.includes(n);
  const due = ctx.enrolled && ctx.today === n && !isDone;
  const saved = progressFor(ctx.day.youtubeId);
  const row = (partial: number) => (
    <PartOfPathRow
      testID="part-of-path"
      name={ctx.path.name}
      day={n}
      total={ctx.total}
      done={ctx.done}
      partial={isDone ? 0 : partial}
      fan={fan}
      kicker={kicker}
      onPress={() => openPath(ctx.path.id)}
    />
  );
  const markDone = () => {
    if (!complete(ctx.path.id, n)) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const last = nextDay(ctx.total, [...ctx.done, n]) == null;
    toast(last ? `${ctx.path.name} complete` : `${words.unit} ${n} done`, "checkmark-circle");
  };
  return (
    <View>
      {/* Only a loaded sermon's place moves the bar live. */}
      {current ? <LiveRow ctx={ctx} render={row} /> : row(saved ? fraction(saved) : 0)}
      {due ? (
        <Tap
          accessibilityRole="button"
          accessibilityLabel={`Mark ${words.unit} ${n} done`}
          accessibilityHint={`Counts ${words.unit.toLowerCase()} ${n} as done`}
          onPress={markDone}
          feedback="dim"
          style={styles.mark}
          testID="part-of-path-mark-done"
        >
          <Icon name="checkmark-circle-outline" size={17} color={c.muted} />
          <T style={[type.meta, styles.markText]} maxFontSizeMultiplier={textCap.chip}>
            {`Mark ${words.unit} ${n} done`}
          </T>
        </Tap>
      ) : null}
    </View>
  );
});

function LiveRow({ ctx, render }: { ctx: PathDayContext; render: (partial: number) => ReactElement }) {
  const { seconds, duration } = usePlayback();
  const length = duration || sermonLength(ctx.day) || 0;
  // In 2% steps, so the row redraws a few times a minute, not every second.
  const partial = length ? Math.round(Math.min(1, seconds / length) * 50) / 50 : 0;
  return render(partial);
}

const styles = StyleSheet.create({
  // Quiet: a muted line under the row, 44pt to touch.
  mark: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 8,
    marginTop: 2,
  },
  markText: { color: c.muted },
});
