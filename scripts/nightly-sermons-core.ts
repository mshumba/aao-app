/// <reference types="node" />
/** Public YouTube discovery. Inserts only; no manifest, transcripts, updates or deletes. */
// @ts-expect-error Node runs these sources directly and requires .ts; the app tsconfig disallows that spelling.
import { importExclusions } from "../src/catalogue/importExclusions.ts";
// @ts-expect-error Node runs these sources directly and requires .ts; the app tsconfig disallows that spelling.
import { buildCatalogueRow, catalogueSeries, type CatalogueImportRow } from "./catalogue-rows.ts";

export const LIMITS = { pages: 100, pageSize: 50, attempts: 3, requestMs: 15_000, runMs: 480_000, inserts: 25 } as const;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

export type Config = { youtubeKey: string; channelId: string; supabaseUrl: string; supabaseKey: string };
type ObjectValue = Record<string, unknown>;
export type ImportOptions = { dryRun: boolean; allowBacklog: boolean };
type Dependencies = {
  fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; signal?: AbortSignal;
  exclusions?: Readonly<Record<string, string>>;
};
export type SermonRow = Omit<CatalogueImportRow, "series">;
export type ImportSummary = {
  dryRun: boolean; playlistPages: number; discovered: number; existing: number;
  unavailable: number; skipped: number; short: number; ageRestricted: number; excluded: number; eligible: number;
  insertedSermonsConfirmed: number; insertedSeriesConfirmed: number; youtubeRequests: number; supabaseRequests: number;
  candidates: { id: string; durationSeconds: number }[];
  attemptedIds: string[]; insertedIds: string[]; rejectedIds: string[];
  attemptedSeriesKeys: string[]; insertedSeriesKeys: string[]; rejectedSeriesKeys: string[];
};
/** Only deliberately sanitized messages and public recovery metadata cross the CLI boundary. */
export class ImportError extends Error {
  readonly summary?: ImportSummary;
  constructor(message: string, summary?: ImportSummary) {
    super(message); this.name = "ImportError"; this.summary = summary;
  }
}
class RequestError extends Error {
  readonly status: number;
  constructor(label: string, status: number) {
    super(`${label}: HTTP ${status}`); this.status = status;
  }
}

/** Manual invocations are read-only unless --apply is explicitly supplied. */
export function readOptions(args: string[]): ImportOptions {
  const seen = new Set<string>();
  for (const arg of args) {
    if (!["--dry-run", "--apply", "--allow-backlog"].includes(arg))
      throw new ImportError("Unknown argument; use --dry-run, --apply or --allow-backlog");
    if (seen.has(arg)) throw new ImportError("Repeated import option");
    seen.add(arg);
  }
  if (seen.has("--dry-run") && seen.has("--apply"))
    throw new ImportError("--dry-run and --apply cannot be combined");
  return { dryRun: !seen.has("--apply"), allowBacklog: seen.has("--allow-backlog") };
}

function object(value: unknown): ObjectValue {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : {};
}

/** Validate before any request. Never print credentials or raw service error bodies. */
export function readConfig(env: Record<string, string | undefined>): Config {
  const names = ["YOUTUBE_API_KEY", "YOUTUBE_CHANNEL_ID", "SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const;
  const missing = names.filter((name) => !env[name]?.trim());
  if (missing.length) throw new ImportError(`Missing configuration: ${missing.join(", ")}`);
  const config = {
    youtubeKey: env.YOUTUBE_API_KEY!.trim(), channelId: env.YOUTUBE_CHANNEL_ID!.trim(),
    supabaseUrl: env.SUPABASE_URL!.trim().replace(/\/+$/, ""), supabaseKey: env.SUPABASE_SECRET_KEY!.trim(),
  };
  if (!CHANNEL_ID.test(config.channelId)) throw new ImportError("YOUTUBE_CHANNEL_ID must be a UC channel ID");
  // Deliberately require the project's canonical host, not an arbitrary credential destination.
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.supabaseUrl))
    throw new ImportError("SUPABASE_URL must be the canonical https://<project-ref>.supabase.co URL");
  if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(config.supabaseKey))
    throw new ImportError("SUPABASE_SECRET_KEY must be a dedicated sb_secret_ API key");
  return config;
}

/** YouTube ISO-8601 day/time durations; zero/invalid durations are not ready to import. */
export function durationSeconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value);
  if (!m || !m.slice(1).some(Boolean) || value.endsWith("T")) return null;
  const seconds = Math.round(Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0));
  return Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 2147483647 ? seconds : null;
}

function candidate(value: unknown, channelId: string): CatalogueImportRow | "short" | "ageRestricted" | null {
  const video = object(value), snippet = object(video.snippet), status = object(video.status);
  const details = object(video.contentDetails);
  if (status.privacyStatus !== "public" || status.embeddable !== true || status.uploadStatus !== "processed" ||
      snippet.liveBroadcastContent !== "none" || snippet.channelId !== channelId) return null;
  if (object(details.contentRating).ytRating === "ytAgeRestricted") return "ageRestricted";
  const id = video.id, title = snippet.title, published = snippet.publishedAt;
  const seconds = durationSeconds(details.duration);
  if (seconds !== null && seconds <= 180) return "short";
  if (typeof id !== "string" || !VIDEO_ID.test(id) || typeof title !== "string" ||
      typeof published !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(published) || !Number.isFinite(Date.parse(published)) || seconds === null) return null;
  const thumbs = object(snippet.thumbnails);
  const thumbnail = ["maxres", "standard", "high", "medium", "default"].map((size) => object(thumbs[size]).url)
    .find((url): url is string => typeof url === "string" && /^https:\/\/i\.ytimg\.com\//.test(url));
  const row = buildCatalogueRow(id, {
    title, published_at: new Date(published).toISOString(), duration_seconds: seconds,
    description: typeof snippet.description === "string" ? snippet.description : null,
    thumbnail_url: thumbnail ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    tags: Array.isArray(snippet.tags) ? snippet.tags.filter((tag): tag is string => typeof tag === "string") : [],
  });
  if (!row || row.title.length > 300 || !row.headline || row.headline.length > 300 ||
      (row.part !== null && (!Number.isInteger(row.part) || row.part < 1 || row.part > 32767))) return null;
  if (row.series_key && (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(row.series_key) || row.series_key.length > 160 || !row.series || row.series.length > 200)) return null;
  return row;
}

function items(data: unknown, label: string): unknown[] {
  const list = object(data).items;
  if (!Array.isArray(list)) throw new ImportError(`${label}: invalid items response`);
  return list;
}

function chunks<T>(list: T[]): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < list.length; i += LIMITS.pageSize) result.push(list.slice(i, i + LIMITS.pageSize));
  return result;
}

export async function importNewSermons(config: Config, options: ImportOptions = readOptions([]), deps: Dependencies = {}): Promise<ImportSummary> {
  // Library callers get the same validation as the CLI, before any I/O.
  config = readConfig({ YOUTUBE_API_KEY: config.youtubeKey, YOUTUBE_CHANNEL_ID: config.channelId,
    SUPABASE_URL: config.supabaseUrl, SUPABASE_SECRET_KEY: config.supabaseKey });
  if (typeof options.dryRun !== "boolean" || typeof options.allowBacklog !== "boolean")
    throw new ImportError("Invalid import options");
  const exclusions = deps.exclusions ?? importExclusions;
  if (Object.entries(exclusions).some(([id, reason]) => !VIDEO_ID.test(id) || typeof reason !== "string" || !reason.trim()))
    throw new ImportError("Import exclusions must map valid YouTube IDs to nonempty reasons");
  const fetcher = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms)));
  const runSignal = AbortSignal.any([AbortSignal.timeout(LIMITS.runMs), ...(deps.signal ? [deps.signal] : [])]);
  const counts: ImportSummary = { dryRun: options.dryRun, playlistPages: 0, discovered: 0, existing: 0,
    unavailable: 0, skipped: 0, short: 0, ageRestricted: 0, excluded: 0, eligible: 0,
    insertedSermonsConfirmed: 0, insertedSeriesConfirmed: 0, youtubeRequests: 0, supabaseRequests: 0,
    candidates: [], attemptedIds: [], insertedIds: [], rejectedIds: [],
    attemptedSeriesKeys: [], insertedSeriesKeys: [], rejectedSeriesKeys: [] };

  async function request(url: URL, label: string, init: RequestInit = {}): Promise<unknown> {
    for (let attempt = 0; attempt < LIMITS.attempts; attempt++) {
      if (runSignal.aborted) throw new ImportError("Import deadline reached or cancelled");
      const signal = AbortSignal.any([runSignal, AbortSignal.timeout(LIMITS.requestMs)]);
      if (label.startsWith("YouTube")) counts.youtubeRequests++; else counts.supabaseRequests++;
      let response: Response;
      try {
        response = await fetcher(url, { ...init, signal, redirect: "error" });
      } catch {
        if (runSignal.aborted) throw new ImportError("Import deadline reached or cancelled");
        if (attempt + 1 === LIMITS.attempts) throw new ImportError(`${label}: network request failed after ${LIMITS.attempts} attempts`);
        await sleep(500 * 2 ** attempt);
        continue;
      }
      if (!response.ok) {
        // Do not log response bodies, URLs or raw fetch errors: they may echo keys.
        await response.body?.cancel().catch(() => {});
        if ([429, 500, 502, 503, 504].includes(response.status) && attempt + 1 < LIMITS.attempts) {
          const retry = Number(response.headers.get("retry-after"));
          await sleep(Number.isFinite(retry) && retry > 0 ? Math.min(retry * 1000, 5000) : 500 * 2 ** attempt);
          continue;
        }
        throw new RequestError(label, response.status);
      }
      try {
        return await response.json(); // request signal stays active through the body
      } catch {
        if (runSignal.aborted) throw new ImportError("Import deadline reached or cancelled");
        if (signal.aborted && attempt + 1 < LIMITS.attempts) { await sleep(500 * 2 ** attempt); continue; }
        throw new ImportError(`${label}: invalid or incomplete JSON response`);
      }
    }
    throw new ImportError(`${label}: retry limit reached`);
  }

  const youtube = (resource: string, query: Record<string, string>) => {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
    url.search = new URLSearchParams(query).toString();
    return request(url, `YouTube ${resource}`, { headers: { "X-Goog-Api-Key": config.youtubeKey } });
  };
  const dbHeaders: Record<string, string> = { apikey: config.supabaseKey, "Content-Type": "application/json" };
  // Dedicated secret API keys are not JWTs; send only the gateway apikey header.
  const database = (table: "sermons" | "series", query: Record<string, string>, rows?: unknown[]) => {
    const url = new URL(`${config.supabaseUrl}/rest/v1/${table}`);
    url.search = new URLSearchParams(query).toString();
    return request(url, `Supabase ${table}`, rows ? {
      method: "POST", headers: { ...dbHeaders, Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(rows),
    } : { headers: dbHeaders });
  };

  async function execute() {
    const channels = items(await youtube("channels", { part: "contentDetails", id: config.channelId }), "YouTube channels");
    const channel = channels.find((c) => object(c).id === config.channelId);
    const playlist = object(object(object(channel).contentDetails).relatedPlaylists).uploads;
    if (typeof playlist !== "string" || !/^[A-Za-z0-9_-]+$/.test(playlist)) throw new ImportError("Configured channel has no uploads playlist");
    const ids = new Set<string>(), tokens = new Set<string>();
    let token = "";
    do {
      if (counts.playlistPages >= LIMITS.pages) throw new ImportError(`Uploads scan exceeded ${LIMITS.pages} pages; no writes performed. Increase the reviewed bound before retrying.`);
      const page = await youtube("playlistItems", { part: "contentDetails", playlistId: playlist, maxResults: String(LIMITS.pageSize), ...(token ? { pageToken: token } : {}) });
      counts.playlistPages++;
      const entries = items(page, "YouTube playlistItems");
      if (entries.length > LIMITS.pageSize) throw new ImportError("YouTube playlistItems: oversized page");
      for (const item of entries) {
        const id = object(object(item).contentDetails).videoId;
        if (typeof id === "string" && VIDEO_ID.test(id)) ids.add(id); else counts.skipped++;
      }
      const next = object(page).nextPageToken;
      if (next !== undefined && (typeof next !== "string" || !next)) throw new ImportError("YouTube playlistItems: invalid nextPageToken");
      token = typeof next === "string" ? next : "";
      if (token && tokens.has(token)) throw new ImportError("YouTube playlistItems: repeated page token; no writes performed");
      if (token) tokens.add(token);
    } while (token);
    counts.discovered = ids.size;

    const candidates: CatalogueImportRow[] = [];
    const includedIds = [...ids].filter((id) => !Object.hasOwn(exclusions, id));
    counts.excluded = ids.size - includedIds.length;
    // Finish discovery/validation before writing. Existing catalogue metadata is never fetched or rewritten.
    for (const batch of chunks(includedIds)) {
      const existing = await database("sermons", { select: "youtube_id", youtube_id: `in.(${batch.join(",")})`, limit: String(LIMITS.pageSize) });
      if (!Array.isArray(existing) || existing.some((row) => !batch.includes(object(row).youtube_id as string)))
        throw new ImportError("Supabase sermons: invalid existing-ID response");
      const known = new Set(existing.map((row) => object(row).youtube_id));
      counts.existing += known.size;
      const missing = batch.filter((id) => !known.has(id));
      if (!missing.length) continue;
      const videos = items(await youtube("videos", { part: "snippet,contentDetails,status", id: missing.join(",") }), "YouTube videos");
      const seen = new Set<string>();
      for (const video of videos) {
        const id = object(video).id;
        if (typeof id !== "string" || !missing.includes(id) || seen.has(id)) throw new ImportError("YouTube videos: unexpected or duplicate video ID");
        seen.add(id);
        const eligible = candidate(video, config.channelId);
        if (eligible === "short") counts.short++;
        else if (eligible === "ageRestricted") counts.ageRestricted++;
        else if (eligible) candidates.push(eligible);
        else counts.skipped++;
      }
      counts.unavailable += missing.length - seen.size;
    }
    counts.eligible = candidates.length;
    candidates.sort((a, b) => b.published_at.localeCompare(a.published_at) || a.youtube_id.localeCompare(b.youtube_id));
    counts.candidates = candidates.map((row) => ({ id: row.youtube_id, durationSeconds: row.duration_seconds! }));
    if (options.dryRun) return counts;
    if (candidates.length > LIMITS.inserts && !options.allowBacklog)
      throw new ImportError(`Insert cap exceeded: ${candidates.length} candidates, limit ${LIMITS.inserts}; no writes performed. Review a dry run before using --allow-backlog.`);

    async function insert(table: "sermons" | "series", rows: (SermonRow | { key: string; name: string })[]) {
      const key = table === "sermons" ? "youtube_id" : "key";
      const ids = rows.map((row) => String(object(row)[key]));
      const attempted = table === "sermons" ? counts.attemptedIds : counts.attemptedSeriesKeys;
      for (const id of ids) if (!attempted.includes(id)) attempted.push(id);
      const inserted = await database(table, { on_conflict: key, select: key }, rows);
      if (!Array.isArray(inserted) || inserted.some((row) => !ids.includes(object(row)[key] as string)) ||
          new Set(inserted.map((row) => object(row)[key])).size !== inserted.length)
        throw new ImportError(`Supabase ${table}: invalid insert response; inspect attempted IDs before rerunning`);
      const confirmed = inserted.map((row) => object(row)[key] as string);
      if (table === "sermons") {
        counts.insertedIds.push(...confirmed); counts.insertedSermonsConfirmed += confirmed.length;
      } else {
        counts.insertedSeriesKeys.push(...confirmed); counts.insertedSeriesConfirmed += confirmed.length;
      }
    }

    async function insertBatch(table: "sermons" | "series", rows: (SermonRow | { key: string; name: string })[]) {
      try { await insert(table, rows); return; }
      catch (error) { if (!(error instanceof RequestError) || error.status !== 400) throw error; }
      // A rejected batch is atomic. Isolate only HTTP400 validation failures;
      // authorization, transport and other failures must stop immediately.
      for (const row of rows) {
        try { await insert(table, [row]); }
        catch (error) {
          if (!(error instanceof RequestError) || error.status !== 400) throw error;
          if (table === "sermons") counts.rejectedIds.push((row as SermonRow).youtube_id);
          else counts.rejectedSeriesKeys.push((row as { key: string }).key);
        }
      }
    }

    for (const batch of chunks(catalogueSeries(candidates))) await insertBatch("series", batch);
    const rows: SermonRow[] = [];
    for (const candidate of candidates) {
      if (candidate.series_key && counts.rejectedSeriesKeys.includes(candidate.series_key)) {
        counts.rejectedIds.push(candidate.youtube_id);
        continue;
      }
      const row: Partial<CatalogueImportRow> = { ...candidate };
      delete row.series; // parser-only wording is not a sermons column
      rows.push(row as SermonRow);
    }
    for (const batch of chunks(rows)) await insertBatch("sermons", batch);
    if (counts.rejectedIds.length || counts.rejectedSeriesKeys.length)
      throw new ImportError("Some catalogue rows were rejected with HTTP 400; valid rows were processed. Review the rejected IDs before rerunning.");
    return counts;
  }

  try { return await execute(); }
  catch (error) {
    // Request/configuration messages are controlled; never expose arbitrary
    // helper/fetch errors, response bodies, request URLs or credentials.
    const message = error instanceof ImportError || error instanceof RequestError ? error.message : "Nightly sermon import failed";
    throw new ImportError(message, counts);
  }
}
