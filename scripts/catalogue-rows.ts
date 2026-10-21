/** Shared metadata normalization for the manifest and nightly importers. */
// @ts-expect-error Node runs this source directly and requires .ts; the app tsconfig disallows that spelling.
import { editorialHeadlines } from "../src/catalogue/editorial.ts";
// @ts-expect-error Node runs this source directly and requires .ts; the app tsconfig disallows that spelling.
import { parseTitle } from "../src/catalogue/parseTitle.ts";

export type CatalogueVideo = {
  title?: string;
  published_at?: string;
  duration_seconds?: number | null;
  description?: string | null;
  thumbnail_url?: string | null;
  tags?: string[] | null;
};

export type CatalogueImportRow = {
  youtube_id: string;
  title: string;
  headline: string;
  event: string | null;
  series_key: string | null;
  series: string | null;
  part: number | null;
  session: string | null;
  speaker: string | null;
  venue: string | null;
  preached_on: string | null;
  published_at: string;
  duration_seconds: number | null;
  description: string | null;
  thumbnail_url: string | null;
  tags: string[];
};

/** Keep the manifest importer's minimal validation; API callers validate their input first. */
export function buildCatalogueRow(id: string, video: CatalogueVideo): CatalogueImportRow | null {
  const title = video.title?.trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(id) || !title || !video.published_at) {
    return null;
  }
  const parsed = parseTitle(title, video.published_at);
  return {
    youtube_id: id,
    title,
    headline: editorialHeadlines[id] ?? parsed.headline,
    event: parsed.event,
    series_key: parsed.seriesKey,
    series: parsed.series,
    part: parsed.part,
    session: parsed.session,
    speaker: parsed.speaker,
    venue: parsed.venue,
    preached_on: parsed.preachedOn,
    published_at: video.published_at,
    duration_seconds:
      typeof video.duration_seconds === "number" ? Math.round(video.duration_seconds) : null,
    description: video.description?.trim() || null,
    thumbnail_url: video.thumbnail_url || null,
    tags: Array.isArray(video.tags) ? video.tags.filter((tag) => typeof tag === "string") : [],
  };
}

/** Most common series wording wins; ties use its newest upload date. */
export function catalogueSeries(rows: readonly CatalogueImportRow[]): { key: string; name: string }[] {
  const seriesNames = new Map<string, Map<string, { count: number; latest: string }>>();
  for (const row of rows) {
    if (!row.series_key || !row.series) continue;
    const names = seriesNames.get(row.series_key) ?? new Map();
    const seen = names.get(row.series) ?? { count: 0, latest: "" };
    seen.count++;
    if (row.published_at > seen.latest) seen.latest = row.published_at;
    names.set(row.series, seen);
    seriesNames.set(row.series_key, names);
  }
  return [...seriesNames].map(([key, names]) => {
    const [name] = [...names].sort(
      ([, a], [, b]) => b.count - a.count || b.latest.localeCompare(a.latest),
    )[0];
    return { key, name };
  });
}
