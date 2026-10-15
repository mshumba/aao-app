import { useIsFocused } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { memo, useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, View, useWindowDimensions, type ListRenderItem } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount } from "../../auth/AccountProvider";
import { useCatalogue } from "../../catalogue/CatalogueProvider";
import {
  CardFan,
  ItalicTitle,
  Kicker,
  PathProgress,
  PlayPill,
  SectionHeader,
  TrustLine,
  Wash,
  spokenKicker,
  spokenText,
  type ArtSource,
} from "../../kit";
import {
  doneLabel,
  messagesLabel,
  minutesPerDayLabel,
  nextDay,
  trustLine,
  useEnrollment,
  usePaths,
  type Path,
  type PathDayWithSermon,
} from "../../learning";
import { useGo, usePageTitle } from "../../navigation";
import { dayTiming, fanFor, pathHref } from "../../paths/model";
import { usePlayDay } from "../../paths/navigation";
import { PathListCard, type ListProgress } from "../../paths/PathListCard";
import { useDockInset } from "../../player/useDockInset";
import { c, radius, space, textCap, type } from "../../theme";
import { Heading, StatePanel, Tap, nowrap, web } from "../../ui";

const MAX_WIDTH = 760;
/** How far the ivory panel rides up over the masthead. */
const OVERLAP = 20;

type Featured = {
  path: Path;
  days: PathDayWithSermon[];
  fan: ArtSource[];
  total: number;
  /** The viewer is on it (the path they're on), or it's the first to start. */
  mine: boolean;
  day: number;
  done: readonly number[];
  partial: number;
  /** Where Play starts. */
  at: number;
  /** "Continue Day 3", "Start Day 1". */
  action: string;
  /** "8 min left", "16 min". */
  detail: string;
};

/**
 * The Paths tab. A dark masthead under the status bar, built like a path's
 * own cover: "Paths", "Guided journeys, *one message a day*", then the path
 * you're on (or the first to start) with its fan, name, progress and a
 * white "Continue Day 3" that plays today. On an ivory panel rising over it,
 * every other path as a small dark cover. Drafts say so; the ministry's
 * name is only claimed for a published path.
 */
export default function PathsTab() {
  usePageTitle("Paths");
  const go = useGo();
  const play = usePlayDay();
  const account = useAccount();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { find } = useCatalogue();
  const { paths, loading, error, refresh, daysOf } = usePaths();
  const enrollment = useEnrollment();
  const { width } = useWindowDimensions();
  const dock = useDockInset();
  const cardWidth = Math.min(width, MAX_WIDTH) - space.gutter * 2;
  const active = enrollment.active;
  const { progressFor, start } = enrollment;

  // Each path's days with their sermons (for fans and today's progress).
  const joined = useMemo(() => {
    const map = new Map<string, PathDayWithSermon[]>();
    paths.forEach((p) => map.set(p.id, daysOf(p.id).map((d) => ({ ...d, sermon: find(d.youtubeId) }))));
    return map;
    // daysOf reads the provider's map, which changes with `paths`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths, find]);

  const watchOf = useCallback(
    (youtubeId: string) => (account.user ? account.progressFor(youtubeId) : null),
    [account],
  );

  // The masthead's path: the one you're on, else the first not finished.
  const featured = useMemo<Featured | null>(() => {
    if (active) {
      const { path, day, done, total, days, today } = active;
      const timing = today ? dayTiming(today, watchOf(today.youtubeId)) : null;
      const started = !!timing?.started || done.length > 0;
      return {
        path,
        days,
        fan: fanFor(days, day),
        total,
        mine: true,
        day,
        done,
        partial: timing?.partial ?? 0,
        at: timing?.resumeAt ?? today?.focusStart ?? 0,
        action: `${started ? "Continue" : "Start"} Day ${day}`,
        detail: timing?.detail ?? "",
      };
    }
    const path = paths.find((p) => {
      const mine = progressFor(p.id);
      return !mine || (!mine.finishedAt && nextDay(daysOf(p.id).length || p.dayCount, mine.done) != null);
    });
    if (!path) return null;
    const days = joined.get(path.id) ?? [];
    const first = days[0];
    if (!first) return null;
    const timing = dayTiming(first, null);
    return {
      path,
      days,
      fan: fanFor(days, 1),
      total: days.length || path.dayCount,
      mine: false,
      day: 1,
      done: [],
      partial: 0,
      at: first.focusStart,
      action: "Start Day 1",
      detail: timing.detail,
    };
  }, [active, paths, joined, progressFor, daysOf, watchOf]);

  const list = useMemo(
    () =>
      paths
        .filter((p) => p.id !== featured?.path.id)
        .map((path) => {
          const days = joined.get(path.id) ?? [];
          const total = days.length || path.dayCount;
          const mine = progressFor(path.id);
          let progress: ListProgress = { kind: "none" };
          let front = 1;
          if (mine) {
            const day = nextDay(total, mine.done);
            if (day == null || mine.finishedAt) progress = { kind: "finished" };
            else {
              const today = days.find((d) => d.day === day);
              progress = {
                kind: "on",
                day,
                done: mine.done,
                partial: today ? dayTiming(today, watchOf(today.youtubeId)).partial : 0,
              };
              front = day;
            }
          }
          return { path, total, progress, fan: fanFor(days, front) };
        }),
    [paths, featured?.path.id, joined, progressFor, watchOf],
  );

  const open = useCallback((id: string) => go.push(pathHref(id)), [go]);

  // Starting the featured path: a guest is asked for a free account first
  // (signing up starts it and plays Day 1).
  const [starting, setStarting] = useState(false);
  const playFeatured = useCallback(async () => {
    if (!featured || starting) return;
    const today = featured.days.find((d) => d.day === featured.day);
    if (!today) return open(featured.path.id);
    if (featured.mine) return play(today.youtubeId, featured.at, { id: featured.path.id, day: featured.day });
    setStarting(true);
    try {
      if ((await start(featured.path.id)) === "started")
        play(today.youtubeId, today.focusStart, { id: featured.path.id, day: today.day });
    } finally {
      setStarting(false);
    }
  }, [featured, starting, open, play, start]);

  const header = (
    <View>
      <Masthead
        featured={featured}
        top={insets.top}
        onOpen={open}
        onPlay={playFeatured}
      />
      <View style={[styles.panel, { width: "100%" }]}>
        <View style={styles.column}>
          {list.length ? (
            <SectionHeader
              title={featured?.mine ? "More paths" : featured ? "More paths" : "Choose a path"}
              count={`${list.length} ${list.length === 1 ? "path" : "paths"}`}
              style={styles.section}
            />
          ) : null}
          {loading && !paths.length ? <Placeholders /> : null}
          {!loading && !paths.length ? (
            error ? (
              <StatePanel
                icon="cloud-offline-outline"
                title="Couldn’t load paths"
                body="Check your connection and try again."
                action={refresh}
                label="Try again"
              />
            ) : (
              <StatePanel
                icon="trail-sign-outline"
                title="Paths are coming"
                body="Guided journeys through the Apostle’s teaching will appear here, a message a day."
              />
            )
          ) : null}
        </View>
      </View>
    </View>
  );

  const renderItem: ListRenderItem<(typeof list)[number]> = useCallback(
    ({ item }) => (
      <View style={styles.column}>
        <PathListCard
          path={item.path}
          fan={item.fan}
          total={item.total}
          width={cardWidth}
          progress={item.progress}
          onPress={() => open(item.path.id)}
        />
      </View>
    ),
    [cardWidth, open],
  );

  return (
    <View style={styles.screen}>
      {focused ? <StatusBar style="light" animated /> : null}
      <FlatList
        testID="paths-list"
        data={list}
        keyExtractor={(item) => item.path.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={{ paddingBottom: space.section + dock }}
        initialNumToRender={4}
        windowSize={7}
        removeClippedSubviews={false}
      />
    </View>
  );
}

const Separator = () => <View style={{ height: 28 }} />;

/**
 * The tab's dark top, as a path's cover: the page's name, then the path
 * you're on (or the first to start) with today one tap away.
 */
const Masthead = memo(function Masthead({
  featured,
  top,
  onOpen,
  onPlay,
}: {
  featured: Featured | null;
  top: number;
  onOpen: (id: string) => void;
  onPlay: () => void;
}) {
  const { width } = useWindowDimensions();
  const scale = Math.min(0.8, (Math.min(width, MAX_WIDTH) - 48) / 340);
  const f = featured;
  const kicker = f
    ? f.mine
      ? `Your path · ${nowrap(`Day ${f.day} of ${f.total}`)}`
      : `Start here · ${messagesLabel(f.total)}`
    : "";
  const spoken = f
    ? f.mine
      ? `Your path. Day ${f.day} of ${f.total}. ${f.path.name}. ${doneLabel(f.done.length, f.total)}.`
      : `Start here. ${messagesLabel(f.total)}. ${f.path.name}. ${trustLine(f.path.status).text.replace(" · ", ", ")}. ${spokenText(minutesPerDayLabel(f.path))}.`
    : "";
  return (
    <View style={[styles.mast, { paddingTop: top + 18 }]} {...web({ dataSet: { dark: "true" } })}>
      <Wash kind="pathCover" />
      <View style={styles.mastHead}>
        <Heading level={1} style={[styles.mastKicker]} maxFontSizeMultiplier={textCap.section}>
          Paths
        </Heading>
        <ItalicTitle
          text="Guided journeys, one message a day"
          italic="one message a day"
          style={[type.title, styles.mastTitle]}
          maxFontSizeMultiplier={textCap.display}
        />
      </View>
      {f ? (
        <View style={styles.featured}>
          <Tap
            testID={f.mine ? "paths-active" : "paths-featured"}
            accessibilityRole="button"
            accessibilityLabel={spoken}
            accessibilityHint="Opens the path"
            onPress={() => onOpen(f.path.id)}
            feedback="scaleLarge"
            style={styles.featuredTap}
          >
            <CardFan sermons={f.fan} size="cover" scale={scale} priority="high" />
            <Kicker tone="onMedia" style={styles.center}>
              {kicker}
            </Kicker>
            <ItalicTitle
              text={f.path.name}
              italic={f.path.italic}
              style={[type.coverTitle, styles.featuredName]}
              maxFontSizeMultiplier={textCap.display}
            />
            {f.mine ? null : <TrustLine status={f.path.status} tone="dark" style={styles.trust} />}
          </Tap>
          <PathProgress
            total={f.total}
            done={f.done}
            current={f.mine ? f.day : null}
            partial={f.partial}
            tone="onDark"
            caption={
              f.mine
                ? { left: `Day ${f.day} of ${f.total}`, right: doneLabel(f.done.length, f.total), centered: true }
                : { left: minutesPerDayLabel(f.path), centered: true }
            }
            style={styles.progress}
          />
          <PlayPill
            testID="paths-play"
            tone="white"
            size="md"
            label={f.action}
            detail={f.detail || undefined}
            accessibilityLabel={`${f.action}${f.detail ? `, ${spokenText(spokenKicker(f.detail))}` : ""}. ${f.path.name}`}
            hint={f.mine ? "Plays today’s day" : "Starts the path and plays Day 1"}
            onPress={onPlay}
            style={styles.play}
          />
        </View>
      ) : null}
    </View>
  );
});

/** Shapes held where cards will be (static: no shimmer). */
function Placeholders() {
  return (
    <View style={styles.placeholders} accessible accessibilityLabel="Loading paths">
      {[0, 1].map((i) => (
        <View key={i}>
          <View style={styles.ghostArt} />
          <View style={[styles.ghostLine, { width: "72%", marginTop: 14 }]} />
          <View style={[styles.ghostLine, { width: "46%", marginTop: 10 }]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  column: {
    width: "100%",
    maxWidth: MAX_WIDTH,
    alignSelf: "center",
    paddingHorizontal: space.gutter,
  },
  mast: { backgroundColor: c.media, overflow: "hidden", paddingBottom: 26 + OVERLAP },
  mastHead: { width: "100%", maxWidth: MAX_WIDTH, alignSelf: "center", paddingHorizontal: space.gutter },
  mastKicker: { ...type.overline, color: c.onMediaKicker },
  mastTitle: { color: c.white, marginTop: 6 },
  featured: { alignItems: "center", marginTop: 26, paddingHorizontal: space.gutter },
  featuredTap: { alignItems: "center", alignSelf: "stretch" },
  center: { textAlign: "center", marginTop: 14 },
  featuredName: { color: c.white, textAlign: "center", marginTop: 6 },
  trust: { marginTop: 8, justifyContent: "center" },
  progress: { width: "100%", maxWidth: 300, marginTop: 14 },
  play: { marginTop: 18 },
  panel: {
    marginTop: -OVERLAP,
    backgroundColor: c.bg,
    borderTopLeftRadius: radius.r28,
    borderTopRightRadius: radius.r28,
    paddingTop: 4,
  },
  section: { marginTop: space.xl, marginBottom: space.lg },
  placeholders: { gap: 28, marginTop: space.xl },
  ghostArt: { height: 196, borderRadius: radius.r22, backgroundColor: c.feature },
  ghostLine: { height: 12, borderRadius: 6, backgroundColor: c.feature },
});
