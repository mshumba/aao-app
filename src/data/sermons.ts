import {
  defaultThumbnail,
  type SeriesRecord,
  type SermonRecord,
  type Snapshot,
} from "../catalogue/records";
import { parseDuration } from "../kit/time";
import { MONTHS, SHORT_MONTHS } from "../lib/dates";
import { takeTurns } from "../lib/turns";

/**
 * A sermon as the app shows it, made from a catalogue record (Supabase, the
 * device's copy, or the bundled sample below) and its topic, which is
 * kept apart from the record (public.sermon_topics).
 */
export type Sermon = {
  /** The YouTube video ID: the stable key everywhere. */
  id: string;
  /** The exact YouTube title, never edited. */
  title: string;
  /** A short headline read from the title (or written by hand). */
  headline: string;
  event: string | null;
  /** Which part of the event, e.g. "Day 2 Evening" or "Grand Finale". */
  session: string | null;
  seriesKey: string | null;
  part: number | null;
  /** Named preachers when it isn't Apostle Arome Osayi alone. */
  speaker: string | null;
  venue: string | null;
  channel: string;
  /** The occasion in a few words, shown where artwork can't load. */
  collection: string;
  /** "27 Sep 2026": when it was preached, else when it was uploaded. */
  date: string;
  /** The same day as YYYY-MM-DD, for ordering. */
  day: string;
  /** Whether `day` is when it was preached; else it's the upload's, which can be days late. */
  preached: boolean;
  publishedAt: string;
  /** "3 hr 35 min" */
  duration: string;
  thumbnail: string;
  source: string;
  /** Its video is on R2, so the app's own player plays it (the phones list only these). */
  videoReady: boolean;
  /**
   * Its main topic, as matched from its transcript. A sermon with no
   * transcript or no clear fit has none, and none shows until the topics
   * have loaded.
   */
  topic: SermonTopic | null;
};

/** The topic a sermon was matched to, and how well (higher is closer; compared within a topic). */
export type SermonTopic = { id: string; score: number };

/** Each tagged sermon's topic, by YouTube ID. */
export type TopicTags = Record<string, SermonTopic>;

export const CHANNEL = "Apostle Arome Osayi";

/** "2026-09-27" → "27 Sep 2026" (or "27 September 2026" when long). */
export function formatDay(day: string, long = false) {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return `${d} ${(long ? MONTHS : SHORT_MONTHS)[m - 1]} ${y}`;
}

/** 12914 → "3 hr 35 min" (whole minutes, as YouTube rounds down). */
export function formatDuration(seconds: number | null) {
  if (seconds == null || seconds < 0) return "";
  const minutes = Math.floor(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

const withoutYear = (name: string) => name.replace(/\s+(?:(?:19|20)\d\d|['’]\d\d)$/, "");

export function toSermon(
  record: SermonRecord,
  seriesName?: string | null,
  topic: SermonTopic | null = null,
): Sermon {
  const day = record.preached_on ?? record.published_at.slice(0, 10);
  return {
    id: record.youtube_id,
    title: record.title,
    headline: record.headline || record.title,
    event: record.event,
    session: record.session,
    seriesKey: record.series_key,
    part: record.part,
    speaker: record.speaker,
    venue: record.venue,
    channel: CHANNEL,
    collection:
      record.event ?? (seriesName ? withoutYear(seriesName) : null) ?? record.venue ?? CHANNEL,
    date: formatDay(day),
    day,
    preached: record.preached_on != null,
    publishedAt: record.published_at,
    duration: formatDuration(record.duration_seconds),
    thumbnail: record.thumbnail_url ?? defaultThumbnail(record.youtube_id),
    source: `https://www.youtube.com/watch?v=${record.youtube_id}`,
    videoReady: !!record.video_ready_at,
    topic,
  };
}

/** Newest first: by the day preached (else uploaded), then by upload time. */
export function compareNewest(a: Sermon, b: Sermon) {
  return b.day.localeCompare(a.day) || b.publishedAt.localeCompare(a.publishedAt);
}

/** A snapshot's sermons with their topics, ready to show and newest first. */
export function sermonsFrom(snapshot: Pick<Snapshot, "sermons" | "series">, tags: TopicTags = {}) {
  const names = new Map(snapshot.series.map((s) => [s.key, s.name]));
  return snapshot.sermons
    .map((record) =>
      toSermon(record, record.series_key ? names.get(record.series_key) : null, tags[record.youtube_id] ?? null),
    )
    .sort(compareNewest);
}

// Bundled sample ------------------------------------------------------------------
// Four sermons shipped with the app: shown before the catalogue first loads
// with no network, and the whole library in development's on-device mode
// (EXPO_PUBLIC_AUTH_MODE=local), so the automated tests are deterministic.
// Titles, dates, durations and thumbnails were checked against public
// ministry links and YouTube on 30 September 2026; the other fields are what
// the import wrote to Supabase for the same videos.

const sampleSeries: SeriesRecord[] = [
  { key: "lioness-conference-2026", name: "Lioness Conference 2026" },
  { key: "apostolic-shift-2026", name: "Apostolic Shift 2026" },
];

export const sampleRecords: SermonRecord[] = [
  {
    youtube_id: "nUW8NT2Pe88",
    title:
      "LIONESS CONFERENCE || PRAY WITHOUT CEASING || GRAND FINALE || 27TH SEPTEMBER 2026",
    headline: "Pray Without Ceasing",
    event: "Lioness Conference",
    series_key: "lioness-conference-2026",
    part: null,
    session: "Grand Finale",
    speaker: null,
    venue: null,
    preached_on: "2026-09-27",
    published_at: "2026-09-27T20:39:22+00:00",
    duration_seconds: 12914,
    thumbnail_url: "https://i.ytimg.com/vi/nUW8NT2Pe88/maxresdefault.jpg",
    video_ready_at: "2026-10-21T00:36:01Z",
  },
  {
    youtube_id: "H9sRbSUt0YE",
    title:
      "APOSTOLIC SHIFT | GRAND FINALE | Apostle Arome Osayi LIVE | The Votage | 23/09/26",
    headline: "Apostolic Shift: Grand Finale",
    event: null,
    series_key: "apostolic-shift-2026",
    part: null,
    session: "Grand Finale",
    speaker: null,
    venue: "The Votage",
    preached_on: "2026-09-23",
    published_at: "2026-09-23T18:57:07+00:00",
    duration_seconds: 8915,
    thumbnail_url: "https://i.ytimg.com/vi/H9sRbSUt0YE/maxresdefault.jpg",
    video_ready_at: "2026-10-21T00:36:01Z",
  },
  {
    youtube_id: "yUDzMcZsVk8",
    title:
      "APOSTOLIC SHIFT | DAY TWO MORNING | Apostle Arome Osayi LIVE | The Votage | 23/09/26",
    headline: "Apostolic Shift: Day Two Morning",
    event: null,
    series_key: "apostolic-shift-2026",
    part: 2,
    session: "Day 2 Morning",
    speaker: null,
    venue: "The Votage",
    preached_on: "2026-09-23",
    published_at: "2026-09-23T11:45:00+00:00",
    duration_seconds: 10195,
    thumbnail_url: "https://i.ytimg.com/vi/yUDzMcZsVk8/maxresdefault.jpg",
    video_ready_at: "2026-10-21T00:36:01Z",
  },
  {
    youtube_id: "WYiA7rjenVI",
    title:
      "APOSTOLIC SHIFT | DAY ONE | Apostle Arome Osayi LIVE | The Votage | 22/09/26",
    headline: "Apostolic Shift: Day One",
    event: null,
    series_key: "apostolic-shift-2026",
    part: 1,
    session: "Day 1",
    speaker: null,
    venue: "The Votage",
    preached_on: "2026-09-22",
    published_at: "2026-09-22T18:08:56+00:00",
    duration_seconds: 6441,
    thumbnail_url: "https://i.ytimg.com/vi/WYiA7rjenVI/maxresdefault.jpg",
    video_ready_at: "2026-10-21T00:36:01Z",
  },
];

/** The bundled sample as a snapshot that never counts as synced. */
export const sampleSnapshot: Snapshot = {
  sermons: sampleRecords,
  series: sampleSeries,
  syncedAt: null,
  fullAt: 0,
};

/** The sample's topics, as public.sermon_topics has them (20 October 2026); the Grand Finale has none. */
export const sampleTags: TopicTags = {
  nUW8NT2Pe88: { id: "prayer", score: 5.066 },
  yUDzMcZsVk8: { id: "purpose-calling", score: 4.207 },
  WYiA7rjenVI: { id: "hearing-god", score: 5.101 },
};

export const sampleSermons: Sermon[] = sermonsFrom(sampleSnapshot, sampleTags);

// Topics and search -----------------------------------------------------------------

/** A sermon's topic's ID, in a list (none, or one). */
export function sermonTopicIds(sermon: Pick<Sermon, "topic">): string[] {
  return sermon.topic ? [sermon.topic.id] : [];
}

/** A topic's sermons, the best match first (newest first among equals). */
export function sermonsInTopic(list: readonly Sermon[], topicId: string): Sermon[] {
  const score = (sermon: Sermon) => sermon.topic?.score ?? 0;
  return list.filter((sermon) => sermon.topic?.id === topicId).sort((a, b) => score(b) - score(a));
}

/** Home leaves out sermons longer than this (seconds). */
const HOME_LONGEST = 3 * 60 * 60;

/**
 * Sermons for Home's "From your topics": those in `topicIds`, each topic's
 * best match first, the topics taking turns (once a small topic's run out,
 * the others carry on). As everywhere on Home, nothing over three hours, and
 * nothing the viewer has `finished`.
 */
export function fromTopics(
  list: readonly Sermon[],
  topicIds: readonly string[],
  finished: (id: string) => boolean,
  count: number,
): Sermon[] {
  const shown = list.filter(
    (sermon) => (parseDuration(sermon.duration) ?? 0) <= HOME_LONGEST && !finished(sermon.id),
  );
  return takeTurns(
    topicIds.map((id) => sermonsInTopic(shown, id)),
    count,
  );
}

// Built once per sermon object: typing filters thousands of these.
const searchText = new WeakMap<Sermon, string>();

function textOf(sermon: Sermon) {
  let text = searchText.get(sermon);
  if (text == null) {
    text = [
      sermon.title,
      sermon.headline,
      sermon.event,
      sermon.session,
      sermon.speaker,
      sermon.venue,
      sermon.collection,
      sermon.channel,
      sermon.date,
      formatDay(sermon.day, true),
      sermon.day,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    searchText.set(sermon, text);
  }
  return text;
}

/**
 * Sermons matching every word of the query, in the list's order: by headline,
 * exact title, event, speaker, venue and date ("27 September 2026", "Sep 2026").
 */
export function searchSermons(list: Sermon[], query: string): Sermon[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return list;
  return list.filter((sermon) => {
    const text = textOf(sermon);
    return terms.every((term) => text.includes(term));
  });
}

// Series ------------------------------------------------------------------------------

// Within a day: morning, afternoon, evening, night, then a finale.
function timeOfDay(session: string | null) {
  if (!session) return 1.5;
  if (/finale/i.test(session)) return 4;
  if (/night|vigil/i.test(session)) return 3;
  if (/evening/i.test(session)) return 2;
  if (/afternoon/i.test(session)) return 1;
  if (/morning/i.test(session)) return 0;
  return 1.5;
}

/** Within a day: by part, time of day, then upload. */
function compareWithinDay(a: Sermon, b: Sermon) {
  return (
    (a.part ?? Number.MAX_SAFE_INTEGER) - (b.part ?? Number.MAX_SAFE_INTEGER) ||
    timeOfDay(a.session) - timeOfDay(b.session) ||
    a.publishedAt.localeCompare(b.publishedAt)
  );
}

/** Days further apart than this are another run of the gathering. */
const RUN_GAP_DAYS = 14;

const daysApart = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 86_400_000;

/** Preached that day, or with no part to place it by. */
const onItsDay = (sermon: Sermon) => sermon.preached || sermon.part == null;

/**
 * A series in order. Its sermons fall into runs, a gathering's days each
 * within a fortnight of the one before, and the runs follow each other by
 * date: Minnesota Apostolic Conference 2025 met in September and again in
 * December. Within a run: by the day preached, part, time of day, then
 * upload. A sermon with no preached date has only its upload's, which can
 * come days late, so it takes the day its run preached the nearest part:
 * School of the Prophets 2021's Day 1 Evening, uploaded after Day 3, still
 * comes first.
 */
export function inSeriesOrder(sermons: readonly Sermon[]) {
  const byDay = [...sermons].sort((a, b) => a.day.localeCompare(b.day) || compareWithinDay(a, b));
  if (byDay.every(onItsDay)) return byDay;
  const runs: Sermon[][] = [];
  for (const sermon of byDay) {
    const run = runs[runs.length - 1];
    if (run && daysApart(run[run.length - 1].day, sermon.day) <= RUN_GAP_DAYS) run.push(sermon);
    else runs.push([sermon]);
  }
  return runs.flatMap(inRunOrder);
}

/** A run in order: a sermon with no preached date on its nearest part's day (else the run's first). */
function inRunOrder(run: Sermon[]) {
  if (run.every(onItsDay)) return run;
  // The day each part was first preached.
  const partDays = new Map<number, string>();
  for (const { preached, part, day } of run) {
    if (preached && part != null && !partDays.has(part)) partDays.set(part, day);
  }
  const dayOf = (sermon: Sermon) => {
    if (sermon.preached || sermon.part == null) return sermon.day;
    let nearest: number | null = null;
    for (const part of partDays.keys()) {
      if (nearest == null || Math.abs(part - sermon.part) < Math.abs(nearest - sermon.part)) nearest = part;
    }
    return nearest == null ? run[0].day : partDays.get(nearest)!;
  };
  const days = new Map(run.map((sermon) => [sermon, dayOf(sermon)]));
  return run.sort((a, b) => days.get(a)!.localeCompare(days.get(b)!) || compareWithinDay(a, b));
}

/** Every sermon in a series, in order. */
export function seriesSermons(list: Sermon[], key: string) {
  return inSeriesOrder(list.filter((sermon) => sermon.seriesKey === key));
}

export type SeriesRail = { key: string; name: string; sermons: Sermon[] };

/**
 * Series for Home: the ones with the most recent sermons, each with at least
 * `min` sermons, in order. `list` is newest first.
 */
export function seriesRails(
  list: Sermon[],
  name: (key: string) => string | undefined,
  { count = 3, min = 3 }: { count?: number; min?: number } = {},
): SeriesRail[] {
  const groups = new Map<string, Sermon[]>();
  for (const sermon of list) {
    if (!sermon.seriesKey) continue;
    const group = groups.get(sermon.seriesKey) ?? [];
    group.push(sermon);
    groups.set(sermon.seriesKey, group);
  }
  const rails: SeriesRail[] = [];
  // Map order is first-seen order: the series with the newest sermon first.
  for (const [key, sermons] of groups) {
    if (sermons.length < min) continue;
    rails.push({ key, name: name(key) ?? sermons[0].collection, sermons: inSeriesOrder(sermons) });
    if (rails.length === count) break;
  }
  return rails;
}

/**
 * Sermons to suggest after this one: the rest of its series (the parts after
 * it first), then ones sharing a topic, then the newest.
 */
export function relatedSermons(sermon: Sermon, list: Sermon[], count = 3) {
  const topic = sermon.topic?.id;
  const series = sermon.seriesKey ? seriesSermons(list, sermon.seriesKey) : [];
  const at = series.findIndex((s) => s.id === sermon.id);
  const nextInSeries = [...series.slice(at + 1), ...series.slice(0, Math.max(at, 0))];
  const rank = new Map(nextInSeries.map((s, i) => [s.id, i]));
  return list
    .filter((other) => other.id !== sermon.id)
    .map((other, index) => ({
      other,
      index,
      series: rank.get(other.id) ?? Number.MAX_SAFE_INTEGER,
      shared: topic && other.topic?.id === topic ? 1 : 0,
    }))
    .sort((a, b) => a.series - b.series || b.shared - a.shared || a.index - b.index)
    .slice(0, count)
    .map(({ other }) => other);
}
