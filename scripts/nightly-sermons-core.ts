/// <reference types="node" />
/** Public YouTube discovery. Inserts only; no manifest, transcripts, updates or deletes. */
// @ts-expect-error Node runs these sources directly and requires .ts; the app tsconfig disallows that spelling.
import { editorialHeadlines } from "../src/catalogue/editorial.ts";
// @ts-expect-error Node runs these sources directly and requires .ts; the app tsconfig disallows that spelling.
import { parseTitle } from "../src/catalogue/parseTitle.ts";

export const LIMITS = { pages: 100, pageSize: 50, attempts: 3, requestMs: 15_000, runMs: 480_000 } as const;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

export type Config = { youtubeKey: string; channelId: string; supabaseUrl: string; supabaseKey: string };
type ObjectValue = Record<string, unknown>;
type Dependencies = { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; signal?: AbortSignal };
export type SermonRow = {
  youtube_id: string; title: string; headline: string; event: string | null;
  series_key: string | null; part: number | null; session: string | null;
  speaker: string | null; venue: string | null; preached_on: string | null;
  published_at: string; duration_seconds: number; description: string | null;
  thumbnail_url: string; tags: string[];
};
type Candidate = { row: SermonRow; series: { key: string; name: string } | null };

function object(value: unknown): ObjectValue {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : {};
}

/** Validate before any request. Never print credentials or raw service error bodies. */
export function readConfig(env: Record<string, string | undefined>): Config {
  const names = ["YOUTUBE_API_KEY", "YOUTUBE_CHANNEL_ID", "SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const;
  const missing = names.filter((name) => !env[name]?.trim());
  if (missing.length) throw new Error(`Missing configuration: ${missing.join(", ")}`);
  const config = {
    youtubeKey: env.YOUTUBE_API_KEY!.trim(), channelId: env.YOUTUBE_CHANNEL_ID!.trim(),
    supabaseUrl: env.SUPABASE_URL!.trim().replace(/\/+$/, ""), supabaseKey: env.SUPABASE_SECRET_KEY!.trim(),
  };
  if (!CHANNEL_ID.test(config.channelId)) throw new Error("YOUTUBE_CHANNEL_ID must be a UC channel ID");
  // Deliberately require the project's canonical host, not an arbitrary credential destination.
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.supabaseUrl))
    throw new Error("SUPABASE_URL must be the canonical https://<project-ref>.supabase.co URL");
  if (!config.supabaseKey.startsWith("sb_secret_")) {
    try {
      const payload = JSON.parse(Buffer.from(config.supabaseKey.split(".")[1], "base64url").toString());
      if (payload.role !== "service_role" || config.supabaseKey.split(".").length !== 3) throw new Error();
    } catch {
      throw new Error("SUPABASE_SECRET_KEY must be a secret API key or legacy service_role key");
    }
  }
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

function candidate(value: unknown, channelId: string): Candidate | null {
  const video = object(value), snippet = object(video.snippet), status = object(video.status);
  const details = object(video.contentDetails);
  if (status.privacyStatus !== "public" || status.embeddable !== true || status.uploadStatus !== "processed" ||
      snippet.liveBroadcastContent !== "none" || snippet.channelId !== channelId) return null;
  const id = video.id, title = snippet.title, published = snippet.publishedAt;
  const seconds = durationSeconds(details.duration);
  if (typeof id !== "string" || !VIDEO_ID.test(id) || typeof title !== "string" || !title.trim() || title.length > 300 ||
      typeof published !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(published) || !Number.isFinite(Date.parse(published)) || seconds === null) return null;
  const parsed = parseTitle(title, published);
  const headline = editorialHeadlines[id] ?? parsed.headline;
  if (!headline || headline.length > 300 || (parsed.part !== null && (!Number.isInteger(parsed.part) || parsed.part < 1 || parsed.part > 32767))) return null;
  const series = parsed.seriesKey && parsed.series ? { key: parsed.seriesKey, name: parsed.series } : null;
  if (series && (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(series.key) || series.key.length > 160 || series.name.length > 200)) return null;
  const thumbs = object(snippet.thumbnails);
  const thumbnail = ["maxres", "standard", "high", "medium", "default"].map((size) => object(thumbs[size]).url)
    .find((url): url is string => typeof url === "string" && /^https:\/\/i\.ytimg\.com\//.test(url));
  return {
    row: {
      youtube_id: id, title, headline, event: parsed.event, series_key: series?.key ?? null,
      part: parsed.part, session: parsed.session, speaker: parsed.speaker, venue: parsed.venue,
      preached_on: parsed.preachedOn, published_at: new Date(published).toISOString(), duration_seconds: seconds,
      description: typeof snippet.description === "string" ? snippet.description : null,
      thumbnail_url: thumbnail ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      tags: Array.isArray(snippet.tags) ? snippet.tags.filter((tag): tag is string => typeof tag === "string") : [],
    }, series,
  };
}

function items(data: unknown, label: string): unknown[] {
  const list = object(data).items;
  if (!Array.isArray(list)) throw new Error(`${label}: invalid items response`);
  return list;
}

function chunks<T>(list: T[]): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < list.length; i += LIMITS.pageSize) result.push(list.slice(i, i + LIMITS.pageSize));
  return result;
}

export async function importNewSermons(config: Config, deps: Dependencies = {}) {
  // Library callers get the same validation as the CLI, before any I/O.
  config = readConfig({ YOUTUBE_API_KEY: config.youtubeKey, YOUTUBE_CHANNEL_ID: config.channelId,
    SUPABASE_URL: config.supabaseUrl, SUPABASE_SECRET_KEY: config.supabaseKey });
  const fetcher = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms)));
  const runSignal = AbortSignal.any([AbortSignal.timeout(LIMITS.runMs), ...(deps.signal ? [deps.signal] : [])]);
  const counts = { playlistPages: 0, discovered: 0, existing: 0, unavailable: 0, skipped: 0, eligible: 0,
    insertedSermonsConfirmed: 0, insertedSeriesConfirmed: 0, youtubeRequests: 0, supabaseRequests: 0 };

  async function request(url: URL, label: string, init: RequestInit = {}): Promise<unknown> {
    for (let attempt = 0; attempt < LIMITS.attempts; attempt++) {
      if (runSignal.aborted) throw new Error("Import deadline reached or cancelled");
      const signal = AbortSignal.any([runSignal, AbortSignal.timeout(LIMITS.requestMs)]);
      if (label.startsWith("YouTube")) counts.youtubeRequests++; else counts.supabaseRequests++;
      let response: Response;
      try {
        response = await fetcher(url, { ...init, signal, redirect: "error" });
      } catch {
        if (runSignal.aborted) throw new Error("Import deadline reached or cancelled");
        if (attempt + 1 === LIMITS.attempts) throw new Error(`${label}: network request failed after ${LIMITS.attempts} attempts`);
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
        throw new Error(`${label}: HTTP ${response.status}`);
      }
      try {
        return await response.json(); // request signal stays active through the body
      } catch {
        if (runSignal.aborted) throw new Error("Import deadline reached or cancelled");
        if (signal.aborted && attempt + 1 < LIMITS.attempts) { await sleep(500 * 2 ** attempt); continue; }
        throw new Error(`${label}: invalid or incomplete JSON response`);
      }
    }
    throw new Error(`${label}: retry limit reached`);
  }

  const youtube = (resource: string, query: Record<string, string>) => {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
    url.search = new URLSearchParams({ ...query, key: config.youtubeKey }).toString();
    return request(url, `YouTube ${resource}`);
  };
  const dbHeaders: Record<string, string> = { apikey: config.supabaseKey, "Content-Type": "application/json" };
  // Secret API keys are not JWTs. The API gateway maps apikey to service_role.
  if (!config.supabaseKey.startsWith("sb_secret_")) dbHeaders.Authorization = `Bearer ${config.supabaseKey}`;
  const database = (table: "sermons" | "series", query: Record<string, string>, rows?: unknown[]) => {
    const url = new URL(`${config.supabaseUrl}/rest/v1/${table}`);
    url.search = new URLSearchParams(query).toString();
    return request(url, `Supabase ${table}`, rows ? {
      method: "POST", headers: { ...dbHeaders, Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(rows),
    } : { headers: dbHeaders });
  };

  const channels = items(await youtube("channels", { part: "contentDetails", id: config.channelId }), "YouTube channels");
  const channel = channels.find((c) => object(c).id === config.channelId);
  const playlist = object(object(object(channel).contentDetails).relatedPlaylists).uploads;
  if (typeof playlist !== "string" || !/^[A-Za-z0-9_-]+$/.test(playlist)) throw new Error("Configured channel has no uploads playlist");
  const ids = new Set<string>(), tokens = new Set<string>();
  let token = "";
  do {
    if (counts.playlistPages >= LIMITS.pages) throw new Error(`Uploads scan exceeded ${LIMITS.pages} pages; no writes performed. Increase the reviewed bound before retrying.`);
    const page = await youtube("playlistItems", { part: "contentDetails", playlistId: playlist, maxResults: String(LIMITS.pageSize), ...(token ? { pageToken: token } : {}) });
    counts.playlistPages++;
    const entries = items(page, "YouTube playlistItems");
    if (entries.length > LIMITS.pageSize) throw new Error("YouTube playlistItems: oversized page");
    for (const item of entries) {
      const id = object(object(item).contentDetails).videoId;
      if (typeof id === "string" && VIDEO_ID.test(id)) ids.add(id); else counts.skipped++;
    }
    const next = object(page).nextPageToken;
    if (next !== undefined && (typeof next !== "string" || !next)) throw new Error("YouTube playlistItems: invalid nextPageToken");
    token = typeof next === "string" ? next : "";
    if (token && tokens.has(token)) throw new Error("YouTube playlistItems: repeated page token; no writes performed");
    if (token) tokens.add(token);
  } while (token);
  counts.discovered = ids.size;

  const candidates: Candidate[] = [];
  // Finish discovery/validation before writing. Existing catalogue metadata is never fetched or rewritten.
  for (const batch of chunks([...ids])) {
    const existing = await database("sermons", { select: "youtube_id", youtube_id: `in.(${batch.join(",")})`, limit: String(LIMITS.pageSize) });
    if (!Array.isArray(existing) || existing.some((row) => !batch.includes(object(row).youtube_id as string)))
      throw new Error("Supabase sermons: invalid existing-ID response");
    const known = new Set(existing.map((row) => object(row).youtube_id));
    counts.existing += known.size;
    const missing = batch.filter((id) => !known.has(id));
    if (!missing.length) continue;
    const videos = items(await youtube("videos", { part: "snippet,contentDetails,status", id: missing.join(",") }), "YouTube videos");
    const seen = new Set<string>();
    for (const video of videos) {
      const id = object(video).id;
      if (typeof id !== "string" || !missing.includes(id) || seen.has(id)) throw new Error("YouTube videos: unexpected or duplicate video ID");
      seen.add(id);
      const eligible = candidate(video, config.channelId);
      if (eligible) candidates.push(eligible); else counts.skipped++;
    }
    counts.unavailable += missing.length - seen.size;
  }
  counts.eligible = candidates.length;
  // Stable newest wording for new series; existing names always win at the database.
  candidates.sort((a, b) => b.row.published_at.localeCompare(a.row.published_at) || a.row.youtube_id.localeCompare(b.row.youtube_id));
  const series = new Map<string, { key: string; name: string }>();
  for (const value of candidates) if (value.series && !series.has(value.series.key)) series.set(value.series.key, value.series);
  for (const batch of chunks([...series.values()])) {
    const inserted = await database("series", { on_conflict: "key", select: "key" }, batch);
    if (!Array.isArray(inserted)) throw new Error("Supabase series: invalid insert response; rerun safely");
    counts.insertedSeriesConfirmed += inserted.length;
  }
  for (const batch of chunks(candidates.map((c) => c.row))) {
    const inserted = await database("sermons", { on_conflict: "youtube_id", select: "youtube_id" }, batch);
    if (!Array.isArray(inserted)) throw new Error("Supabase sermons: invalid insert response; rerun safely");
    counts.insertedSermonsConfirmed += inserted.length;
  }
  return counts;
}
