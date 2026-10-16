/**
 * Loads the Apostle Arome Osayi channel catalogue into Supabase (the
 * public.sermons and public.series tables), reading each title with the
 * app's own parser. Safe to re-run: rows are upserted on youtube_id, a row
 * is only touched when something about it changed (so the app's "changed
 * since" sync stays small), and nothing is ever deleted except series no
 * sermon belongs to any more.
 *
 *   node --env-file=.env scripts/import-catalogue.mts <manifest.json> [--dry-run]
 *
 * The manifest is the channel export from the transcript pipeline: `videos`
 * keyed by YouTube ID, each with title, published_at, duration_seconds and,
 * for some, description, thumbnail_url and tags. Transcripts are not read.
 *
 * Needs SUPABASE_ACCESS_TOKEN (a personal access token for the Management
 * API) and EXPO_PUBLIC_SUPABASE_URL (to find the project) in the
 * environment. Neither is printed. --dry-run only reports how the titles
 * parse.
 */
import { readFileSync } from "node:fs";
import { buildCatalogueRow, catalogueSeries, type CatalogueImportRow, type CatalogueVideo } from "./catalogue-rows.ts";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const manifestPath = args.find((arg) => !arg.startsWith("--"));
if (!manifestPath) {
  console.error("Usage: node --env-file=.env scripts/import-catalogue.mts <manifest.json> [--dry-run]");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  videos?: Record<string, CatalogueVideo>;
};
const videos = Object.entries(manifest.videos ?? {});

const rows: CatalogueImportRow[] = [];
let skipped = 0;
for (const [id, video] of videos) {
  const row = buildCatalogueRow(id, video);
  if (row) rows.push(row);
  else skipped++;
}
const series = catalogueSeries(rows);

// Coverage of the title parser, for the record.
const pct = (n: number) => `${n} (${((100 * n) / rows.length).toFixed(1)}%)`;
const count = (test: (row: CatalogueImportRow) => boolean) => pct(rows.filter(test).length);
console.log(`Videos in manifest: ${videos.length} (${skipped} skipped without an ID, title or upload date)`);
console.log(`Preaching date read from title: ${count((r) => !!r.preached_on)}`);
console.log(`Event: ${count((r) => !!r.event)}`);
console.log(`In a series: ${count((r) => !!r.series_key)} across ${series.length} series`);
console.log(`Part or day number: ${count((r) => r.part != null)}`);
console.log(`Guest or additional speaker named: ${count((r) => !!r.speaker)}`);
console.log(`Venue: ${count((r) => !!r.venue)}`);
console.log(
  `Headline is the whole title (nothing to shorten): ${count(
    (r) => r.headline.toLowerCase() === r.title.replace(/\s+/g, " ").toLowerCase(),
  )}`,
);
if (dryRun) process.exit(0);

// Management API ----------------------------------------------------------------

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const ref =
  process.env.SUPABASE_PROJECT_REF?.trim() ||
  /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(process.env.EXPO_PUBLIC_SUPABASE_URL ?? "")?.[1];
if (!token || !ref) {
  console.error("Set SUPABASE_ACCESS_TOKEN and EXPO_PUBLIC_SUPABASE_URL (or SUPABASE_PROJECT_REF).");
  process.exit(1);
}

async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
    if (response.ok) return (await response.json()) as T[];
    // Rate limits and brief outages: wait and try again a few times.
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
      continue;
    }
    throw new Error(`Management API ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }
}

/** JSON as a dollar-quoted SQL literal. */
function jsonLiteral(value: unknown) {
  const json = JSON.stringify(value);
  const tag = "$aao_json$";
  if (json.includes(tag)) throw new Error("Data contains the SQL quote tag");
  return `${tag}${json}${tag}::jsonb`;
}

const seriesResult = await query<{ inserted: number; updated: number }>(`
  with input as (
    select * from jsonb_to_recordset(${jsonLiteral(series)}) as x(key text, name text)
  ), upserted as (
    insert into public.series as s (key, name)
    select key, name from input
    on conflict (key) do update set name = excluded.name
      where s.name is distinct from excluded.name
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted)::int as inserted,
         count(*) filter (where not inserted)::int as updated
  from upserted;
`);

const columns = [
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
] as const;
// Description, thumbnail and tags only exist for some videos in the
// manifest; a missing value never clears one already stored.
const kept = ["description", "thumbnail_url"] as const;

let inserted = 0;
let updated = 0;
const BATCH = 400;
for (let start = 0; start < rows.length; start += BATCH) {
  const batch = rows.slice(start, start + BATCH).map(({ series: _series, ...row }) => row);
  const [result] = await query<{ inserted: number; updated: number }>(`
    with input as (
      select * from jsonb_to_recordset(${jsonLiteral(batch)}) as x(
        youtube_id text, title text, headline text, event text, series_key text,
        part smallint, session text, speaker text, venue text, preached_on date,
        published_at timestamptz, duration_seconds integer, description text,
        thumbnail_url text, tags text[]
      )
    ), upserted as (
      insert into public.sermons as s (
        youtube_id, ${columns.join(", ")}, ${kept.join(", ")}, tags
      )
      select youtube_id, ${columns.join(", ")}, ${kept.join(", ")}, coalesce(tags, '{}')
      from input
      on conflict (youtube_id) do update set
        ${columns.map((c) => `${c} = excluded.${c}`).join(",\n        ")},
        ${kept.map((c) => `${c} = coalesce(excluded.${c}, s.${c})`).join(",\n        ")},
        tags = case when cardinality(excluded.tags) > 0 then excluded.tags else s.tags end
      where
        ${columns.map((c) => `s.${c} is distinct from excluded.${c}`).join("\n        or ")}
        ${kept.map((c) => `or (excluded.${c} is not null and s.${c} is distinct from excluded.${c})`).join("\n        ")}
        or (cardinality(excluded.tags) > 0 and s.tags is distinct from excluded.tags)
      returning (xmax = 0) as inserted
    )
    select count(*) filter (where inserted)::int as inserted,
           count(*) filter (where not inserted)::int as updated
    from upserted;
  `);
  inserted += result.inserted;
  updated += result.updated;
  console.log(`Sermons ${start + 1}–${start + batch.length}: ${result.inserted} new, ${result.updated} changed`);
}

// YouTube serves hqdefault for every video; the manifest names a better
// image for some.
await query(`
  update public.sermons
  set thumbnail_url = 'https://i.ytimg.com/vi/' || youtube_id || '/hqdefault.jpg'
  where thumbnail_url is null;
`);
const [orphans] = await query<{ removed: number }>(`
  with removed as (
    delete from public.series s
    where not exists (select 1 from public.sermons m where m.series_key = s.key)
    returning 1
  )
  select count(*)::int as removed from removed;
`);
const [totals] = await query<{ sermons: number; series: number; dated: number }>(`
  select (select count(*) from public.sermons)::int as sermons,
         (select count(*) from public.series)::int as series,
         (select count(*) from public.sermons where preached_on is not null)::int as dated;
`);

console.log(
  `Series: ${seriesResult[0].inserted} new, ${seriesResult[0].updated} renamed, ${orphans.removed} empty removed`,
);
console.log(`Sermons: ${inserted} new, ${updated} changed`);
console.log(
  `In Supabase now: ${totals.sermons} sermons (${totals.dated} with a preaching date), ${totals.series} series`,
);
