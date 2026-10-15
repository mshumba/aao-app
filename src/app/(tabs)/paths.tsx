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
  nextDay,
  trustLine,
  useEnrollment,
  usePaths,
  type Path,
  type PathDayWithSermon,
} from "../../learning";
import { totalTimeLabel } from "../../learning/format";
import { useGo, usePageTitle } from "../../navigation";
import { dayTiming, fanFor, isSingleTeaching, pathHref, pathLength, pathWords } from "../../paths/model";
import { useOpenTeaching, usePlayDay } from "../../paths/navigation";
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
  /** "Continue Day 3", "Start Day 1". */
  action: string;
  /** "48 min left", "2 hr 16 min": today's sermon, whole. */
  detail: string;
  /** "About 18 hours in all", once every sermon's length is known. */
  length: string | null;
};

/** A row of the list: a path's card, or the heading of the teaching series. */
type Row =
  | { kind: "card"; path: Path; total: number; progress: ListProgress; fan: ArtSource[]; days: PathDayWithSermon[] }
  | { kind: "heading"; title: string; count: string };

/**
 * The Paths tab. A dark masthead under the status bar, built like a path's
 * own cover: "Paths", "Guided journeys, *one message a day*", then the path
 * you're on (or the first to start) with its fan, name, progress and a
 * white "Continue Day 3" that plays today's sermon, whole. On an ivory panel
 * rising over it, every other path as a small dark cover, then the teaching
 * series in a section of their own ("12 teachings"; one of a single
 * teaching opens that teaching). Drafts say so; the ministry's name is only
 * claimed for a published path.
 */
export default function PathsTab() {
  usePageTitle("Paths");
  const go = useGo();
  const play = usePlayDay();
  const openTeaching = useOpenTeaching();
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

  // The masthead's path: the one you're on, else the first guided path
  // not finished (a teaching series is chosen from its own section).
  const featured = useMemo<Featured | null>(() => {
    if (active) {
      const { path, day, done, total, days, today } = active;
      const timing = today ? dayTiming(today, watchOf(today.youtubeId)) : null;
      const started = !!timing?.started || done.length > 0;
      const length = pathLength(days);
      return {
        path,
        days,
        fan: fanFor(days, day),
        total,
        mine: true,
        day,
        done,
        partial: timing?.partial ?? 0,
        action: `${started ? "Continue" : "Start"} ${pathWords(path).unit} ${day}`,
        detail: timing?.detail ?? "",
        length: length ? totalTimeLabel(length) : null,
      };
    }
    const path = paths.find((p) => {
      if (p.kind === "series") return false;
      const mine = progressFor(p.id);
      return !mine || (!mine.finishedAt && nextDay(daysOf(p.id).length || p.dayCount, mine.done) != null);
    });
    if (!path) return null;
    const days = joined.get(path.id) ?? [];
    const first = days[0];
    if (!first) return null;
    const length = pathLength(days);
    return {
      path,
      days,
      fan: fanFor(days, 1),
      total: days.length || path.dayCount,
      mine: false,
      day: 1,
      done: [],
      partial: 0,
      action: "Start Day 1",
      detail: dayTiming(first, watchOf(first.youtubeId)).detail,
      length: length ? totalTimeLabel(length) : null,
    };
  }, [active, paths, joined, progressFor, daysOf, watchOf]);

  // Guided paths, then the teaching series under their own heading.
  const list = useMemo<Row[]>(() => {
    const card = (path: Path): Row => {
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
      return { kind: "card", path, total, progress, fan: fanFor(days, front), days };
    };
    const rest = paths.filter((p) => p.id !== featured?.path.id);
    const guided = rest.filter((p) => p.kind !== "series").map(card);
    const series = rest.filter((p) => p.kind === "series").map(card);
    return series.length
      ? [
          ...guided,
          { kind: "heading", title: "Teaching series", count: `${series.length} series` },
          ...series,
        ]
      : guided;
  }, [paths, featured?.path.id, joined, progressFor, watchOf]);
  const guidedCount = list.findIndex((row) => row.kind === "heading");
  const morePaths = guidedCount === -1 ? list.length : guidedCount;

  const open = useCallback((id: string) => go.push(pathHref(id)), [go]);
  // A series of one teaching opens that teaching; any other path its page.
  const openRow = useCallback(
    (row: Extract<Row, { kind: "card" }>) => {
      const only = row.days[0];
      if (isSingleTeaching(row.path, row.total) && only) openTeaching(only.youtubeId);
      else open(row.path.id);
    },
    [open, openTeaching],
  );

  // Starting the featured path: a guest is asked for a free account first
  // (signing up starts it and plays Day 1).
  const [starting, setStarting] = useState(false);
  const playFeatured = useCallback(async () => {
    if (!featured || starting) return;
    const today = featured.days.find((d) => d.day === featured.day);
    if (!today) return open(featured.path.id);
    const day = { id: featured.path.id, day: today.day };
    if (featured.mine) return play(today.youtubeId, { path: day });
    setStarting(true);
    try {
      if ((await start(featured.path.id)) === "started") play(today.youtubeId, { path: day });
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
          {morePaths ? (
            <SectionHeader
              title={featured ? "More paths" : "Choose a path"}
              count={`${morePaths} ${morePaths === 1 ? "path" : "paths"}`}
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

  const renderItem: ListRenderItem<Row> = useCallback(
    ({ item }) =>
      item.kind === "heading" ? (
        <View style={styles.column}>
          <SectionHeader title={item.title} count={item.count} style={styles.seriesSection} />
        </View>
      ) : (
        <View style={styles.column}>
          <PathListCard
            path={item.path}
            fan={item.fan}
            total={item.total}
            width={cardWidth}
            progress={item.progress}
            onPress={() => openRow(item)}
          />
        </View>
      ),
    [cardWidth, openRow],
  );

  return (
    <View style={styles.screen}>
      {focused ? <StatusBar style="light" animated /> : null}
      <FlatList
        testID="paths-list"
        data={list}
        keyExtractor={(item) => (item.kind === "card" ? item.path.id : `heading-${item.title}`)}
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

// No gap under the series' heading: its own margin sets it.
const Separator = ({ leadingItem }: { leadingItem?: Row }) =>
  leadingItem?.kind === "heading" ? null : <View style={{ height: 28 }} />;

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
  const words = pathWords(f?.path ?? { kind: "path" });
  const kicker = f
    ? f.mine
      ? `Your ${words.noun} · ${nowrap(`${words.unit} ${f.day} of ${f.total}`)}`
      : `Start here · ${words.count(f.total)}`
    : "";
  const spoken = f
    ? f.mine
      ? `Your ${words.noun}. ${words.unit} ${f.day} of ${f.total}. ${f.path.name}. ${doneLabel(f.done.length, f.total)}.`
      : `Start here. ${words.count(f.total)}. ${f.path.name}. ${trustLine(f.path.status).text.replace(" · ", ", ")}.${f.length ? ` ${spokenText(f.length)}.` : ""}`
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
            accessibilityHint={`Opens the ${words.noun}`}
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
                ? { left: `${words.unit} ${f.day} of ${f.total}`, right: doneLabel(f.done.length, f.total), centered: true }
                : f.length
                  ? { left: f.length, centered: true }
                  : undefined
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
            hint={f.mine ? `Plays ${words.series ? "the next teaching" : "today’s day"}` : "Starts the path and plays Day 1"}
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
  // After a card's 28pt separator: a section's 40pt gap in all.
  seriesSection: { marginTop: space.section - 28, marginBottom: space.lg },
  placeholders: { gap: 28, marginTop: space.xl },
  ghostArt: { height: 196, borderRadius: radius.r22, backgroundColor: c.feature },
  ghostLine: { height: 12, borderRadius: 6, backgroundColor: c.feature },
});
