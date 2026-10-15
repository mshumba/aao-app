import { memo, useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useAccount } from "../auth/AccountProvider";
import { useCatalogue } from "../catalogue/CatalogueProvider";
import { headline } from "../data/display";
import type { Sermon } from "../data/sermons";
import {
  CardFan,
  ItalicTitle,
  Kicker,
  PathCardNavy,
  SectionHeader,
  TrustLine,
  Wash,
  spokenText,
  type ArtSource,
} from "../kit";
import {
  doneLabel,
  messagesLabel,
  trustLine,
  useEnrollment,
  type ActivePath,
  type Path,
  type PathDay,
  type PathDayWithSermon,
} from "../learning";
import { dayTiming, pathWords } from "../paths/model";
import { usePlayDay } from "../paths/navigation";
import { c, radius, textCap, type } from "../theme";
import { T, Tap } from "../ui";

/** A sermon for a fan: the catalogue's, or YouTube's artwork while it syncs. */
function art(find: (id: string) => Sermon | undefined, youtubeId: string): ArtSource {
  return find(youtubeId) ?? { id: youtubeId };
}

/**
 * Where today's day stands for this viewer, the same way the path page
 * says it (dayTiming): how far into its sermon they've watched, what's left
 * of it ("48 min left", or its whole length before they start), and where
 * it picks up (the player resumes there itself).
 */
export function todayProgress(day: PathDayWithSermon, watch: Parameters<typeof dayTiming>[1]) {
  const timing = dayTiming(day, watch);
  return { partial: timing.partial, meta: timing.meta, from: timing.resumeAt };
}

// ---- Your path ---------------------------------------------------------------------------

/**
 * The navy "Your path · Day 3 of 7" card: the fan of today's sermon and the
 * two before it, the path's name, progress by day, and "Today · …" with a
 * play circle that plays today's sermon, whole, from where the viewer left
 * off. The sermon's page knows it's today's day, so watching it marks the
 * day done. A teaching series says "Your series · Teaching 3 of 12".
 */
export const YourPath = memo(function YourPath({
  active,
  onOpenPath,
  onPlay,
}: {
  active: ActivePath;
  onOpenPath: (id: string) => void;
  /** Opens the sermon playing (no place asked: it resumes, else starts at the beginning). */
  onPlay: (youtubeId: string) => void;
}) {
  const { find } = useCatalogue();
  const account = useAccount();
  const { path, day, done, total, days, today } = active;
  const words = pathWords(path);
  const saved = today && account.user ? account.progressFor(today.youtubeId) : null;
  const now = today ? todayProgress(today, saved) : { partial: 0, meta: "", from: 0 };

  const fan = useMemo(() => {
    // Today in front; behind it the two days before (or after, on Day 1).
    const order = [day, day - 1, day - 2, day + 1, day + 2].filter((n) => n >= 1 && n <= total);
    const ids = order
      .map((n) => days.find((d) => d.day === n)?.youtubeId)
      .filter((id): id is string => !!id);
    // A sermon can be two days of a path; show it once.
    return [...new Set(ids)].slice(0, 3).map((id) => art(find, id));
  }, [day, total, days, find]);

  const title = today ? (today.sermon ? headline(today.sermon) : today.theme) : "";
  return (
    <PathCardNavy
      testID="your-path"
      variant="home"
      name={path.name}
      italic={path.italic}
      day={day}
      total={total}
      done={done}
      partial={now.partial}
      fan={fan}
      kicker={words.series ? `Your series · ${words.unit} ${day} of ${total}` : undefined}
      todayLead={words.series ? "Next" : undefined}
      playLabel={words.series ? `Play teaching ${day}` : undefined}
      todayTitle={title}
      todayMeta={now.meta ? `${now.meta} · ${doneLabel(done.length, total)}` : doneLabel(done.length, total)}
      onOpen={() => onOpenPath(path.id)}
      onPlay={() => today && onPlay(today.youtubeId)}
      style={styles.card}
    />
  );
});

/** Holds the card's place while progress loads, so nothing jumps. */
export function YourPathPlaceholder() {
  return <View style={[styles.card, styles.placeholder]} accessible={false} />;
}

// ---- Start a path ---------------------------------------------------------------------

const TILE_W = 264;
const COVER_H = 148;
const FAN_SCALE = 0.66;

/**
 * For someone not on a path: the first path as the concept's navy card
 * ("Start here", its Day 1 to play, who set its order, honestly), then the
 * others as a rail of dark covers with their length, name and promise.
 * Guided paths only: the teaching series have their own section on the
 * Paths tab.
 */
export const StartPathRail = memo(function StartPathRail({
  paths,
  daysOf,
  onOpenPath,
  onSeeAll,
}: {
  paths: readonly Path[];
  daysOf: (id: string) => PathDay[];
  onOpenPath: (id: string) => void;
  onSeeAll: () => void;
}) {
  const { find } = useCatalogue();
  const { fontScale } = useWindowDimensions();
  // Wider with large text, so names and promises keep their lines.
  const width = Math.round(TILE_W * Math.min(1.3, Math.max(1, fontScale)));
  const tiles = useMemo(
    () =>
      paths
        .filter((path) => path.kind !== "series")
        .map((path) => ({
        path,
          fan: daysOf(path.id)
            .slice(0, 3)
            .map((d) => art(find, d.youtubeId)),
        })),
    [paths, daysOf, find],
  );
  if (!tiles.length) return null;
  const [first, ...rest] = tiles;
  return (
    <View testID="start-a-path">
      <StartHere path={first.path} fan={first.fan} days={daysOf(first.path.id)} onOpenPath={onOpenPath} />
      {rest.length ? (
        <>
          <SectionHeader
            title="More paths"
            action={{ label: "See all", onPress: onSeeAll, hint: "Opens Paths" }}
            inset={24}
            style={styles.header}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={width + 12}
            snapToAlignment="start"
            contentContainerStyle={styles.rail}
          >
            {rest.map(({ path, fan }) => (
              <PathTile key={path.id} path={path} fan={fan} width={width} onOpen={onOpenPath} />
            ))}
          </ScrollView>
        </>
      ) : null}
    </View>
  );
});

/**
 * The first path to start, as Home's navy card: "Start here · 7 messages",
 * its name and who set its order, and Day 1 to play (a guest is asked for a
 * free account first; signing up starts the path and plays Day 1).
 */
const StartHere = memo(function StartHere({
  path,
  fan,
  days,
  onOpenPath,
}: {
  path: Path;
  fan: ArtSource[];
  days: PathDay[];
  onOpenPath: (id: string) => void;
}) {
  const { find } = useCatalogue();
  const { start } = useEnrollment();
  const play = usePlayDay();
  const [busy, setBusy] = useState(false);
  const first = days[0];
  const sermon = first ? find(first.youtubeId) : undefined;
  // Day 1's sermon, whole: "1 hr 47 min".
  const timing = first ? dayTiming({ ...first, sermon }, null) : null;
  const total = days.length || path.dayCount;
  const onPlay = useCallback(async () => {
    if (!first || busy) return;
    setBusy(true);
    try {
      if ((await start(path.id)) === "started") play(first.youtubeId, { path: { id: path.id, day: first.day } });
    } finally {
      setBusy(false);
    }
  }, [first, busy, start, path.id, play]);
  if (!first || !timing) return null;
  return (
    <PathCardNavy
      testID="start-here"
      variant="home"
      name={path.name}
      italic={path.italic}
      day={1}
      total={total}
      done={EMPTY}
      fan={fan}
      kicker={`Start here · ${messagesLabel(total)}`}
      trust={path.status}
      todayLead="Day 1"
      playLabel="Start the path with day 1"
      todayTitle={sermon ? headline(sermon) : first.theme}
      todayMeta={timing.meta || messagesLabel(total)}
      onOpen={() => onOpenPath(path.id)}
      onPlay={onPlay}
      style={styles.card}
    />
  );
});

const EMPTY: number[] = [];

const PathTile = memo(function PathTile({
  path,
  fan,
  width,
  onOpen,
}: {
  path: Path;
  fan: ArtSource[];
  width: number;
  onOpen: (id: string) => void;
}) {
  const length = messagesLabel(path.dayCount);
  const trust = trustLine(path.status).text;
  const scale = (FAN_SCALE * width) / TILE_W;
  return (
    <Tap
      testID="path-tile"
      accessibilityRole="button"
      accessibilityLabel={`${path.name}. ${spokenText(length)}. ${path.promise} ${trust.replace(" · ", ", ")}.`}
      accessibilityHint="Opens the path"
      onPress={() => onOpen(path.id)}
      feedback="scaleLarge"
      unstable_pressDelay={60}
      style={{ width }}
    >
      <View style={[styles.cover, { height: Math.round((COVER_H * width) / TILE_W) }]}>
        <Wash kind="pathCover" />
        <CardFan sermons={fan} size="cover" scale={scale} />
      </View>
      <Kicker style={styles.tileKicker} numberOfLines={1}>
        {length}
      </Kicker>
      <ItalicTitle
        text={path.name}
        italic={path.italic}
        numberOfLines={2}
        style={[type.pathName, styles.tileName]}
        maxFontSizeMultiplier={textCap.section}
      />
      {path.promise ? (
        <T style={styles.promise} numberOfLines={2}>
          {path.promise}
        </T>
      ) : null}
      <TrustLine status={path.status} style={styles.trust} />
    </Tap>
  );
});

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 16 },
  placeholder: { height: 194, borderRadius: radius.r26, backgroundColor: c.feature },
  header: { marginTop: 28, marginBottom: 12 },
  rail: { paddingHorizontal: 24, gap: 12 },
  cover: {
    borderRadius: radius.r20,
    backgroundColor: c.media,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  tileKicker: { marginTop: 12 },
  tileName: { marginTop: 4 },
  promise: { ...type.meta, fontSize: 13, lineHeight: 18, color: c.muted, marginTop: 4 },
  trust: { marginTop: 8 },
});
