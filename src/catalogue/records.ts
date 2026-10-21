/**
 * The catalogue as stored in Supabase (public.sermons, public.series) and as
 * cached on the device. Pure, so the automated tests can run it directly.
 */

/** The columns of public.sermons the app reads. */
export type SermonRecord = {
  youtube_id: string;
  /** The exact YouTube title. */
  title: string;
  headline: string;
  event: string | null;
  series_key: string | null;
  part: number | null;
  session: string | null;
  speaker: string | null;
  venue: string | null;
  /** YYYY-MM-DD, when the title says when it was preached. */
  preached_on: string | null;
  /** ISO timestamp of the YouTube upload. */
  published_at: string;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  /** When its video was found on R2; null until then. */
  video_ready_at: string | null;
};

export type SeriesRecord = { key: string; name: string };

export const SERMON_COLUMNS = [
  "youtube_id",
  "title",
  "headline",
  "event",
  "series_key",
  "part",
  "session",
  "speaker",
  "venue",
  "preached_on",
  "published_at",
  "duration_seconds",
  "thumbnail_url",
  "video_ready_at",
] as const satisfies readonly (keyof SermonRecord)[];

/** A copy of the catalogue, and how fresh it is. */
export type Snapshot = {
  sermons: SermonRecord[];
  series: SeriesRecord[];
  /** The newest updated_at seen; the next sync asks for changes after it. */
  syncedAt: string | null;
  /** When the whole catalogue was last fetched (ms since epoch). */
  fullAt: number;
};

/** What a sync brought back. */
export type Changes = {
  sermons: SermonRecord[];
  series: SeriesRecord[];
  syncedAt: string | null;
};

/** The image YouTube has for every video; stored rows usually point at it. */
export function defaultThumbnail(id: string) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** Applies changes to a snapshot: changed rows replace old ones, new ones are added. */
export function mergeChanges(base: Snapshot, changes: Changes): Snapshot {
  const sermons = new Map(base.sermons.map((s) => [s.youtube_id, s]));
  for (const s of changes.sermons) sermons.set(s.youtube_id, s);
  const series = new Map(base.series.map((s) => [s.key, s]));
  for (const s of changes.series) series.set(s.key, s);
  const syncedAt =
    [base.syncedAt, changes.syncedAt].filter((t): t is string => !!t).sort().pop() ?? null;
  return { ...base, sermons: [...sermons.values()], series: [...series.values()], syncedAt };
}

// Device cache ------------------------------------------------------------------
// Rows are stored as arrays in column order, and the usual thumbnail is left
// out, which roughly halves the size: the whole library is about 650 KB.

const CACHE_VERSION = 1;

type Encoded = {
  v: number;
  columns: readonly string[];
  rows: unknown[][];
  series: [string, string][];
  syncedAt: string | null;
  fullAt: number;
};

export function encodeSnapshot(snapshot: Snapshot): string {
  const encoded: Encoded = {
    v: CACHE_VERSION,
    columns: SERMON_COLUMNS,
    rows: snapshot.sermons.map((s) =>
      SERMON_COLUMNS.map((column) =>
        column === "thumbnail_url" && s.thumbnail_url === defaultThumbnail(s.youtube_id)
          ? null
          : s[column],
      ),
    ),
    series: snapshot.series.map((s) => [s.key, s.name]),
    syncedAt: snapshot.syncedAt,
    fullAt: snapshot.fullAt,
  };
  return JSON.stringify(encoded);
}

/** The cached snapshot, or null when there is none or it can't be read. */
export function decodeSnapshot(raw: string | null): Snapshot | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Encoded;
    if (
      data?.v !== CACHE_VERSION ||
      !Array.isArray(data.rows) ||
      !Array.isArray(data.series) ||
      data.columns?.join() !== SERMON_COLUMNS.join()
    )
      return null;
    const sermons = data.rows.map((row) => {
      const record = Object.fromEntries(
        SERMON_COLUMNS.map((column, i) => [column, row[i] ?? null]),
      ) as SermonRecord;
      record.thumbnail_url ??= defaultThumbnail(record.youtube_id);
      return record;
    });
    if (sermons.some((s) => typeof s.youtube_id !== "string" || typeof s.title !== "string"))
      return null;
    return {
      sermons,
      series: data.series.map(([key, name]) => ({ key, name })),
      syncedAt: data.syncedAt ?? null,
      fullAt: Number(data.fullAt) || 0,
    };
  } catch {
    return null;
  }
}
