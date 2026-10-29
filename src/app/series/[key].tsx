import { useLocalSearchParams } from "expo-router";
import { memo, useMemo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useProgressOf } from "../../auth/AccountProvider";
import type { WatchProgress } from "../../auth/types";
import { useCatalogue } from "../../catalogue/CatalogueProvider";
import {
  isGathering,
  seriesRows,
  sessionDate,
  sessionDays,
  sessionLabel,
  splitSession,
  type SessionDay,
  type SessionRow,
} from "../../data/seriesRow";
import { seriesSermons } from "../../data/sermons";
import { seriesDays } from "../../home/copy";
import { useSermonActions } from "../../home/actions";
import { CoverPage, StickyCTA, spokenKicker } from "../../kit";
import { messagesLabel } from "../../learning/format";
import { firstParam, useExitTo } from "../../navigation";
import { fraction, resumePoint, timeLeft } from "../../player/progress";
import { font, fontSize, radius, space, tabular, textCap, type } from "../../theme";
import { Header, Heading, Icon, Page, SermonRow, StatePanel, T, Tap, c, pressedTint, spokenDuration } from "../../ui";
import { watched } from "../../watched";

/**
 * Every part of a series, in order, under a cover built like a path's: a
 * fan of its own sermons, "Series · 3 messages", the name, the days it
 * spans. The cover names the series, so the rows don't (see seriesRows).
 *
 * A multi-part teaching such as "Gift of Prophecy" lists its parts as
 * sermon rows. A gathering, where every sermon is a session ("Lioness
 * Conference 2022", IEC 2024), goes by day instead: "Day 2 · Tue 21 May"
 * over its Morning and Evening, rows of words without the poster every
 * session shares, each with a ring for how much of it has been watched;
 * and a call to play the first session, or continue the first one begun
 * ("Continue Day 2 · Evening"). A gathering with one session a day lists
 * "Day 1", "Day 2"… each with its date. A day with no preached date shows
 * the day it went up (see sessionDays).
 */
export default function SeriesScreen() {
  const params = useLocalSearchParams<{ key: string | string[] }>();
  const key = firstParam(params.key) ?? "";
  const catalogue = useCatalogue();
  const exitTo = useExitTo();
  const name = catalogue.seriesName(key);
  const list = useMemo(() => seriesSermons(catalogue.sermons, key), [catalogue.sermons, key]);
  const title = name ?? list[0]?.collection ?? "";
  const sessions = useMemo(() => (isGathering(list) ? sessionDays(list, title) : null), [list, title]);

  if (!list.length && !catalogue.settled)
    return (
      <Page header={<Header back />}>
        <View style={styles.loading}>
          <ActivityIndicator color={c.accent} accessibilityLabel="Loading series" />
        </View>
      </Page>
    );
  if (!list.length)
    return (
      <Page header={<Header back />}>
        <StatePanel
          level={1}
          icon="albums-outline"
          title="This series isn’t available"
          body="The link may be out of date. Choose another sermon from the library."
          label="Browse sermons"
          action={() => exitTo("/")}
        />
      </Page>
    );

  const span = seriesDays(list);
  return (
    <CoverPage
      testID="series-page"
      title={title}
      kicker={`Series · ${messagesLabel(list.length)}`}
      lead={span || null}
      fan={list}
      footer={sessions ? <SessionsCTA sessions={sessions} /> : undefined}
    >
      {sessions ? (
        <Sessions sessions={sessions} />
      ) : (
        <View style={styles.rows}>
          {seriesRows(list, title).map((row) => (
            <SermonRow key={row.sermon.id} sermon={row.sermon} title={row.title} kicker={row.label} />
          ))}
        </View>
      )}
    </CoverPage>
  );
}

type Gathering = { grouped: boolean; days: SessionDay[] };

const idsOf = (sessions: Gathering) => sessions.days.flatMap((d) => d.rows.map((row) => row.sermon.id));

/** Begun and not finished: 0 to 1 of the way through, else 0. */
function begun(watch: WatchProgress | null) {
  return watch && !watched(watch) && resumePoint(watch) > 0 ? fraction(watch) : 0;
}

/** A session's length, or what's left of it once begun ("48 min left"). */
function timeOf(row: SessionRow, watch: WatchProgress | null) {
  return watch && begun(watch) ? timeLeft(watch) : row.sermon.duration;
}

/** The gathering's days, each a heading over its sessions (none with one session a day). */
const Sessions = memo(function Sessions({ sessions }: { sessions: Gathering }) {
  const ids = useMemo(() => idsOf(sessions), [sessions]);
  const progressFor = useProgressOf(ids);
  const { open } = useSermonActions();
  const { grouped, days } = sessions;
  return (
    <View>
      {days.map((d, i) => {
        const heading = grouped ? (d.day ?? (d.date ? sessionDate(d.date) : null)) : null;
        return (
          <View key={d.rows[0].sermon.id} style={grouped && i > 0 && styles.day}>
            {heading ? (
              <Heading
                level={2}
                style={styles.heading}
                accessibilityLabel={d.day && d.date ? `${d.day}, ${sessionDate(d.date, true)}` : undefined}
                maxFontSizeMultiplier={textCap.section}
              >
                {heading}
                {d.day && d.date ? <T style={styles.headingDate}>{`  ${sessionDate(d.date)}`}</T> : null}
              </Heading>
            ) : null}
            {d.rows.map((row, j) => (
              <View key={row.sermon.id}>
                {/* A hairline between sessions, along the words' edge. */}
                {j > 0 || (!grouped && i > 0) ? <View style={styles.divider} /> : null}
                <SessionLine
                  row={row}
                  day={grouped ? d.day : null}
                  date={grouped ? null : d.date}
                  watch={progressFor(row.sermon.id)}
                  onOpen={open}
                />
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
});

/**
 * A session as a row of words: "Morning" (or a message's own title, its
 * time of day under it) and its length, then a ring filled as far as it's
 * been watched, a check once it has. Opens the sermon's page.
 */
const SessionLine = memo(function SessionLine({
  row,
  day,
  date,
  watch,
  onOpen,
}: {
  row: SessionRow;
  /** The day it's under, read before its name ("Day 2, Morning"). */
  day: string | null;
  /** Without day headings, the row's own date. */
  date: string | null;
  watch: WatchProgress | null;
  onOpen: (id: string) => void;
}) {
  const done = watched(watch);
  const part = begun(watch);
  const time = timeOf(row, watch);
  const meta = [row.label, date && sessionDate(date), time].filter(Boolean).join(" · ");
  // A day's one plain session is named by its day: "Day 1", said once.
  const spoken = [
    day ? (row.title === day ? day : `${day}, ${row.title}`) : spokenKicker(row.title),
    row.label && spokenKicker(row.label),
    date && sessionDate(date, true),
    time && spokenDuration(time),
    done && "Watched",
  ]
    .filter(Boolean)
    .join(". ");
  return (
    <Tap
      testID="sermon-row"
      accessibilityRole="button"
      accessibilityLabel={`${spoken}.`}
      onPress={() => onOpen(row.sermon.id)}
      // In a scrolling list: a scroll's first touch doesn't press it.
      unstable_pressDelay={60}
      feedback="highlight"
      highlightColor={pressedTint}
      style={styles.session}
    >
      <View style={styles.sessionText}>
        <T style={styles.sessionTitle} numberOfLines={2}>
          {row.title}
        </T>
        {meta ? (
          <T style={styles.sessionMeta} numberOfLines={2}>
            {meta}
          </T>
        ) : null}
      </View>
      <WatchRing part={part} done={done} />
    </Tap>
  );
});

const RING = 28;
const RING_LINE = 1.5;

/**
 * How much of a session has been watched: an empty ring, a navy arc round
 * it as far as it's been watched, filled with a check once it's done.
 * Drawn with views (two clipped halves), so it needs nothing native.
 */
const WatchRing = memo(function WatchRing({ part, done }: { part: number; done: boolean }) {
  if (done)
    return (
      <View style={[styles.ring, styles.ringDone]}>
        <Icon name="checkmark" size={16} color={c.white} />
      </View>
    );
  return (
    <View style={styles.ring}>
      <View style={styles.ringTrack} />
      {part > 0 ? <RingHalf side="right" turn={Math.min(part, 0.5)} /> : null}
      {part > 0.5 ? <RingHalf side="left" turn={part} /> : null}
    </View>
  );
});

/**
 * One half of the arc: a ring drawn on its top and right sides (half a
 * circle, ending at three o'clock's diagonal), turned so it ends at `turn`
 * of the way round, inside a clip of that half.
 */
function RingHalf({ side, turn }: { side: "left" | "right"; turn: number }) {
  return (
    <View style={[styles.half, side === "right" && styles.halfRight]}>
      <View
        style={[styles.arc, side === "right" && styles.arcRight, { transform: [{ rotate: `${turn * 360 - 135}deg` }] }]}
      />
    </View>
  );
}

/**
 * "Play Day 1 · Morning", or "Continue Day 2 · Evening" for the first
 * session begun and not finished; once every session has been watched,
 * the first again. Plays it (asking a guest for a free account first).
 */
const SessionsCTA = memo(function SessionsCTA({ sessions }: { sessions: Gathering }) {
  const ids = useMemo(() => idsOf(sessions), [sessions]);
  const progressFor = useProgressOf(ids);
  const { watch } = useSermonActions();
  const all = sessions.days.flatMap((d) => d.rows.map((row) => ({ row, day: d.day })));
  const started = all.find(({ row }) => begun(progressFor(row.sermon.id)) > 0);
  const next = started ?? all.find(({ row }) => !watched(progressFor(row.sermon.id))) ?? all[0];
  if (!next) return null;
  const { label, detail } = ctaWords(next.row, next.day, sessions.grouped, timeOf(next.row, progressFor(next.row.sermon.id)));
  return (
    <StickyCTA
      testID="series-cta"
      label={`${started ? "Continue" : "Play"} ${label}`}
      detail={detail || undefined}
      hint="Plays this session"
      onPress={() => watch(next.row.sermon.id)}
    />
  );
});

/** The call to action's words: the day, then the session's name, else its time. */
function ctaWords(row: SessionRow, day: string | null, grouped: boolean, time: string) {
  const session = row.sermon.session ?? "";
  const { day: named, rest } = splitSession(session);
  const what = grouped
    ? row.title === "Message" || row.title === day
      ? ""
      : row.title
    : row.title !== sessionLabel(session)
      ? row.title
      : rest;
  const which = day ?? named;
  return which ? { label: which, detail: what || time } : { label: what || row.title, detail: time };
}

const styles = StyleSheet.create({
  loading: { paddingVertical: space.xxl, alignItems: "center" },
  rows: { gap: space.lg },
  day: { marginTop: space.xl },
  heading: { fontFamily: font.serif, fontSize: fontSize.heading, lineHeight: 24, color: c.text, marginBottom: 4 },
  headingDate: { ...type.meta, color: c.muted },
  session: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: space.md,
    marginHorizontal: -space.md,
    borderRadius: radius.md,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.divider },
  sessionText: { flex: 1, minWidth: 0, gap: 2 },
  sessionTitle: { ...type.label, color: c.text },
  sessionMeta: { ...type.meta, color: c.muted, ...tabular },
  ring: { width: RING, height: RING },
  ringTrack: {
    position: "absolute",
    top: 0,
    left: 0,
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: RING_LINE,
    borderColor: c.nodeRing,
  },
  ringDone: { borderRadius: RING / 2, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" },
  half: { position: "absolute", top: 0, left: 0, width: RING / 2, height: RING, overflow: "hidden" },
  halfRight: { left: RING / 2 },
  arc: {
    position: "absolute",
    top: 0,
    left: 0,
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: RING_LINE,
    borderTopColor: c.accent,
    borderRightColor: c.accent,
    borderBottomColor: "transparent",
    borderLeftColor: "transparent",
  },
  arcRight: { left: -RING / 2 },
});
