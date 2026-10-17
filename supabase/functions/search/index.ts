// POST /functions/v1/search {"q": "I keep going back to the same sin"}
//
// Need-based search over the sermon passages (see migrations need_search,
// search_polish and search_safety, and supabase/functions/README.md). In order:
//   1. checks: CORS/origin, the publishable key on apikey, q of 1-200 characters;
//   2. the distress check (_shared/distress.ts), before anything else: "care"
//      (they plainly say they want to die or to harm themselves), "maybe" (a
//      wording of despair) or neither;
//   3. search_open(), one database call: the 24-hour response cache (keyed on
//      the question and the distress list's version; hits are free), else a
//      need chip whose embeddings are stored (free: no OpenAI), else the rate
//      limits (_shared/limits.ts: the caller's own allowance, then everyone's).
//      Someone in distress is never refused: their search counts only against
//      an allowance for the model's reading, and past it they get the care
//      answer without the model. A cached answer without care is never served
//      to them. The published needs and guided paths load meanwhile;
//   3a. a need chip (q is a published need's label or short name): its fixed
//      teaching phrase and its label are searched with their stored embeddings
//      (embedded once, the first time, and kept until the need's wording
//      changes); theme, related needs and path come from the database. No chat
//      model;
//   3b. anything else: a small chat model reads the question (theme, a teaching
//      phrasing, 3 related needs, a guided path, care) while the question itself
//      is embedded and searched; the teaching phrasing is embedded and searched
//      as soon as it has streamed in;
//   4. the lists are fused (reciprocal rank; weak rows found only by the
//      question as typed go last), twins collapsed, at most 2 moments per
//      sermon. match_passages() already joins the sermon and any cached quote.
// Failing closed: someone whose words say "care" never gets the list for the
// question as typed: a fixed comfort phrasing (CARE_QUERY, its embedding
// stored) is searched instead. A "maybe" search is care too when the model
// can't read it (it failed, timed out, or the limits stopped it).
// When OpenAI fails: a chip answers with the need's curated moments (public
// .moments), someone in distress with the comfort list or else the curated
// moments of the comforting needs, anything else with sermon-title matches
// (fallback: "titles"). None of these is cached. If the chat model alone fails
// (and there is no distress), search answers from the question alone (theme =
// the question, no related needs, no path) and isn't cached.
// POST {"warm": true} with the project's secret key as the bearer token stores
// the embeddings of every published need and of the comfort phrasing ahead of
// time, so no chip tap ever needs OpenAI.

import { caller } from "../_shared/auth.ts";
import { DISTRESS_LIST_VERSION, type DistressReading } from "../_shared/distress.ts";
import { admin, dbTimeout, type Limit, secretKeys, withRetry } from "../_shared/db.ts";
import { gate, json, later, readJson, sameText } from "../_shared/http.ts";
import { careLimits, scopeOf, searchLimits } from "../_shared/limits.ts";
import { embed, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, embedHedged, vectorLiteral } from "../_shared/openai.ts";
import {
  CARE_QUERY,
  CARE_RELATED,
  CARE_THEME,
  fallbackTheme,
  type NeedInfo,
  normalise,
  type PathInfo,
  readDistress,
  understand,
  type Understood,
} from "../_shared/prompts.ts";

const MAX_MOMENTS = 14;
const PER_SERMON = 2;
const MAX_SERMONS = 10;
// Rows asked of each match_passages call. Each row costs a ts_headline and a
// caption-time lookup; 16 per list (up to 32 after fusing) is plenty for 14
// moments at 2 per sermon.
const MATCH_COUNT = 16;
const CACHE_SECONDS = 24 * 60 * 60;
// v2 (judge pass): related needs from public.needs, stricter paths, weak
// question-only matches ranked after the teaching matches.
// v3 (judge pass 2): 3 related needs even for a curated need's own search;
// someone in distress gets only the comforting teaching list and no path.
// v4 (search polish): need chips from needs.query, care and path.status in the
// response, hidden passages, typed searches keyed by a hash of the question.
// v5 (search safety): the distress list's version in the key, so an answer
// given under an older list isn't served once the list changes.
const CACHE_PREFIX = `search:v5:d${DISTRESS_LIST_VERSION}:`;
/** Stored embeddings are used only when made the way passages were embedded. */
const VECTOR_MODEL = `${EMBEDDING_MODEL}@${EMBEDDING_DIMENSIONS}`;
const RRF_K = 60;
// A row found only by the question as typed (not by the teaching phrasing)
// whose score is below this is usually a passage that shares the question's
// emotion words without teaching on it (a testimony aside, a prayer point, a
// caption error such as "lost" for "lust"). Such rows rank after every row the
// teaching phrasing found. In the judge's 20 graded searches, 9 rows fell below
// 0.47: 6 no, 3 partly, none yes. Not applied when there is no teaching list.
const WEAK_QUESTION_ONLY = 0.47;

const MATCH_COLUMNS =
  "id,youtube_id,start_s,end_s,words,similarity,score,sermon_hits,total_moments,total_sermons,excerpt,excerpt_at,title,headline,published_at,preached_on,duration_seconds,thumbnail_url,speaker,twins,quote,quote_at";

type MatchRow = {
  id: number;
  youtube_id: string;
  start_s: number;
  end_s: number;
  words: number;
  similarity: number;
  score: number;
  sermon_hits: number;
  total_moments: number;
  total_sermons: number;
  excerpt: string | null;
  excerpt_at: number | null;
  title: string;
  headline: string;
  published_at: string;
  preached_on: string | null;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  speaker: string | null;
  twins: number[] | null;
  quote: string | null;
  quote_at: number | null;
};

type Sermon = {
  youtubeId: string;
  title: string;
  headline: string;
  publishedAt: string;
  preachedOn: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  speaker: string | null;
};

type Moment = {
  id: string;
  youtubeId: string;
  at: number;
  end: number;
  quote: string | null;
  excerpt: string;
  score: number;
  sermon: Sermon;
};

type SearchResponse = {
  query: string;
  understood: { theme: string; related: string[] };
  path: { id: string; name: string; italic: string; days: number; status: PathInfo["status"] } | null;
  care: boolean;
  moments: Moment[];
  sermons: (Sermon & { moments: number })[];
  total: { moments: number; sermons: number };
  /**
   * Set when nothing could be searched by meaning (OpenAI failed or, for a
   * chip, the limits stopped it): "curated", the needs' hand-picked moments;
   * "titles", sermons whose titles match the words (moments: 0 on each).
   */
  fallback?: "curated" | "titles";
  cached: boolean;
  tookMs: number;
};

const round = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places;

/** Notes a retried database call in the request's log line. */
type OnRetry = (what: string) => void;

// ---- Guided paths and published needs ---------------------------------------------
// Loaded on every request, alongside search_open(): the runtime starts a fresh
// worker for nearly every request, so a cache in the worker would rarely help.

async function loadNeeds(onRetry: OnRetry): Promise<NeedInfo[]> {
  const { data, error } = await withRetry(
    () =>
      admin()
        .from("needs")
        .select("id,label,short,theme,query,related")
        .eq("published", true)
        .order("sort")
        .abortSignal(dbTimeout(3000)),
    () => onRetry("needs"),
  );
  if (error || !data) return [];
  type NeedRow = { id: string; label: string; short: string; theme: string; query: string | null; related: unknown };
  return (data as NeedRow[])
    .map((n) => ({
      id: String(n.id),
      label: String(n.label),
      short: String(n.short),
      theme: String(n.theme),
      query: n.query ? String(n.query) : null,
      related: Array.isArray(n.related) ? n.related.map(String) : [],
    }))
    .filter((n) => n.short.trim());
}

async function loadPaths(onRetry: OnRetry): Promise<PathInfo[]> {
  // Guided paths only: teaching series (kind 'series') aren't answers to a need.
  const { data, error } = await withRetry(
    () =>
      admin()
        .from("paths")
        .select("id,name,italic,needs,status,sort,path_days(count)")
        .eq("kind", "path")
        .order("sort")
        .abortSignal(dbTimeout(3000)),
    () => onRetry("paths"),
  );
  if (error || !data) return [];
  type PathRow = {
    id: string;
    name: string;
    italic: string;
    needs: string[] | null;
    status: string;
    path_days: { count: number }[] | null;
  };
  return (data as unknown as PathRow[])
    .map((p) => ({
      id: String(p.id),
      name: String(p.name),
      italic: String(p.italic),
      needs: Array.isArray(p.needs) ? p.needs.map(String) : [],
      days: Number(p.path_days?.[0]?.count ?? 0),
      status: (p.status === "published" ? "published" : "draft") as PathInfo["status"],
    }))
    .filter((p) => p.days > 0);
}

/** The published need whose label or short name is the search, when it has a fixed phrase. */
function needFor(norm: string, needs: NeedInfo[]): NeedInfo | null {
  return needs.find((n) => n.query && (normalise(n.label) === norm || normalise(n.short) === norm)) ?? null;
}

/** A need's related chips: the short names of its related needs that are published. */
function shortsOf(ids: string[], needs: NeedInfo[]): string[] {
  const byId = new Map(needs.map((n) => [n.id, n.short]));
  return ids.map((id) => byId.get(id)).filter((s): s is string => Boolean(s)).slice(0, 3);
}

// ---- Database steps ---------------------------------------------------------------

/**
 * Searches are cached under a hash of the question (case, spacing and
 * punctuation removed), so the cache doesn't hold what people typed in
 * readable form, and the cache can be read before the needs have loaded.
 */
async function cacheKey(norm: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return CACHE_PREFIX + hex;
}

type Stored = { id: string; query_embedding: string; label_embedding: string };

type Opened =
  | { cached: SearchResponse; quotes: Record<string, { quote: string; at: number }> }
  // `need`: a chip whose embeddings are stored (not counted). `care_vector`:
  // the comfort phrasing's stored embedding, when it was asked for.
  | { ok: true; need?: Stored; care_vector?: string | null }
  // `limit`: which limit said no, counting from 1.
  | { ok: false; retry_after: number; limit: number; care_vector?: string | null };

/**
 * search_open(): the cache, then a chip with stored embeddings, then the
 * limits in order (see migration search_safety). `norm` is null for someone
 * in distress (never a chip); `careInput` asks for the comfort phrasing's
 * stored embedding too.
 */
async function open(
  key: string,
  norm: string | null,
  limits: Limit[],
  careInput: string | null,
  onRetry: OnRetry,
): Promise<Opened> {
  const { data, error } = await withRetry(
    () =>
      admin()
        .rpc("search_open", {
          cache_key: key,
          query_norm: norm,
          vector_model: VECTOR_MODEL,
          care_input: careInput,
          max_age_seconds: CACHE_SECONDS,
          rate_keys: limits.map((l) => l.key),
          rate_max: limits.map((l) => l.max),
          rate_windows: limits.map((l) => l.windowSeconds),
        })
        .abortSignal(dbTimeout(4000)),
    () => onRetry("open"),
  );
  if (error || !data) throw new Error(`search_open: ${error?.code ?? ""} ${error?.message ?? "no answer"}`);
  return data as Opened;
}

async function writeCache(key: string, response: SearchResponse): Promise<void> {
  // The question isn't stored; it is put back from the request on a cache hit.
  // Rows are deleted after 24 hours (search_cleanup(), every 15 minutes).
  const row = { key, response: { ...response, query: "" }, created_at: new Date().toISOString() };
  const { error } = await withRetry(() =>
    admin().from("search_cache").upsert(row, { onConflict: "key" }).abortSignal(dbTimeout(4000))
  );
  if (error) throw new Error(`cache write: ${error.code ?? error.message}`);
}

/** `vector` in pgvector's text form (vectorLiteral(), or a stored embedding as text). */
async function match(vector: string, text: string, onRetry: OnRetry): Promise<MatchRow[]> {
  const { data, error } = await withRetry(
    () =>
      admin()
        .rpc("match_passages", { query_embedding: vector, query_text: text, match_count: MATCH_COUNT })
        .select(MATCH_COLUMNS)
        .abortSignal(dbTimeout(6000)),
    () => onRetry("match"),
  );
  if (error) throw new Error(`match_passages: ${error.code ?? ""} ${error.message}`);
  return (data ?? []) as unknown as MatchRow[];
}

// ---- Stored embeddings ----------------------------------------------------------------
// A chip's two phrases and the comfort phrasing are embedded once and kept
// (need_vectors, search_vectors), so a chip tap, and the comfort list for
// someone in distress, need no OpenAI call. A need's row counts only while its
// label, short name and query are what was embedded (search_open checks).

async function storeNeedVectors(need: NeedInfo, vectors: [string, string]): Promise<void> {
  const row = {
    need_id: need.id,
    label: need.label,
    short: need.short,
    query: need.query,
    label_norm: normalise(need.label),
    short_norm: normalise(need.short),
    model: VECTOR_MODEL,
    query_embedding: vectors[0],
    label_embedding: vectors[1],
    updated_at: new Date().toISOString(),
  };
  const { error } = await withRetry(() =>
    admin().from("need_vectors").upsert(row, { onConflict: "need_id" }).abortSignal(dbTimeout(4000))
  );
  if (error) throw new Error(`need_vectors: ${error.code ?? error.message}`);
}

async function storeVector(key: string, input: string, vector: string): Promise<void> {
  const row = { key, input, model: VECTOR_MODEL, embedding: vector, updated_at: new Date().toISOString() };
  const { error } = await withRetry(() =>
    admin().from("search_vectors").upsert(row, { onConflict: "key" }).abortSignal(dbTimeout(4000))
  );
  if (error) throw new Error(`search_vectors: ${error.code ?? error.message}`);
}

async function storedVector(key: string, input: string, onRetry: OnRetry): Promise<string | null> {
  const { data } = await withRetry(
    () =>
      admin()
        .from("search_vectors")
        .select("embedding")
        .eq("key", key)
        .eq("input", input)
        .eq("model", VECTOR_MODEL)
        .abortSignal(dbTimeout(3000)),
    () => onRetry("vector"),
  );
  const found = (data as { embedding: unknown }[] | null)?.[0]?.embedding;
  return typeof found === "string" ? found : null;
}

// ---- When nothing can be searched by meaning ------------------------------------------

type SermonRow = Pick<
  MatchRow,
  | "youtube_id"
  | "title"
  | "headline"
  | "published_at"
  | "preached_on"
  | "duration_seconds"
  | "thumbnail_url"
  | "speaker"
>;

type CuratedRow = {
  passage_id: number;
  youtube_id: string;
  need_id: string;
  at_s: number;
  end_s: number;
  quote: string;
  score: number | null;
  sermons: Omit<SermonRow, "youtube_id"> | Omit<SermonRow, "youtube_id">[] | null;
};

/**
 * The curated moments (public.moments) of these needs, best first, the
 * first need's first; at most 2 per sermon, never a hidden passage. Their
 * quotes are hand-checked verbatim, so the app shows them as they are.
 */
async function curated(needIds: string[], onRetry: OnRetry): Promise<Moment[]> {
  const { data, error } = await withRetry(
    () =>
      admin()
        .from("moments")
        .select(
          "passage_id,youtube_id,need_id,at_s,end_s,quote,score," +
            "sermons(title,headline,published_at,preached_on,duration_seconds,thumbnail_url,speaker)," +
            "passages!inner(hidden_from_search)",
        )
        .in("need_id", needIds)
        .eq("passages.hidden_from_search", false)
        .order("score", { ascending: false, nullsFirst: false })
        .limit(60)
        .abortSignal(dbTimeout(4000)),
    () => onRetry("moments"),
  );
  if (error) throw new Error(`moments: ${error.code ?? ""} ${error.message}`);
  const rows = (data ?? []) as unknown as CuratedRow[];
  rows.sort((a, b) => needIds.indexOf(a.need_id) - needIds.indexOf(b.need_id));
  const shown: Moment[] = [];
  const perSermon = new Map<string, number>();
  const seen = new Set<number>();
  for (const r of rows) {
    if (shown.length === MAX_MOMENTS) break;
    const s = Array.isArray(r.sermons) ? r.sermons[0] : r.sermons;
    const n = perSermon.get(r.youtube_id) ?? 0;
    if (!s || seen.has(r.passage_id) || n >= PER_SERMON) continue;
    seen.add(r.passage_id);
    perSermon.set(r.youtube_id, n + 1);
    shown.push({
      id: String(r.passage_id),
      youtubeId: r.youtube_id,
      at: round(Number(r.at_s), 2),
      end: round(Number(r.end_s), 2),
      quote: r.quote,
      excerpt: r.quote.toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ").trim(),
      score: round(Number(r.score ?? 0), 3),
      sermon: sermonOf({ ...s, youtube_id: r.youtube_id }),
    });
  }
  return shown;
}

/** Sermons whose title or headline holds the question's content words (match_sermon_titles()). */
async function titleMatches(q: string, onRetry: OnRetry): Promise<Sermon[]> {
  const { data, error } = await withRetry(
    () =>
      admin()
        .rpc("match_sermon_titles", { query_text: q, match_count: MAX_SERMONS })
        .abortSignal(dbTimeout(4000)),
    () => onRetry("titles"),
  );
  if (error) throw new Error(`match_sermon_titles: ${error.code ?? ""} ${error.message}`);
  return ((data ?? []) as SermonRow[]).map(sermonOf);
}

// ---- Fusing the searches ---------------------------------------------------------------

type Candidate = {
  row: MatchRow;
  rrf: number;
  score: number;
  hits: number;
  /** Found only by the question as typed, with a weak score (see WEAK_QUESTION_ONLY). */
  weak: boolean;
};

/** "question": the text as typed (or a need's label); "teaching": a teaching phrasing. */
type MatchList = { kind: "question" | "teaching"; rows: MatchRow[] };

function fuse(lists: MatchList[]): Candidate[] {
  const byId = new Map<number, Candidate>();
  const hasTeaching = lists.some((l) => l.kind === "teaching" && l.rows.length > 0);
  for (const { kind, rows } of lists) {
    rows.forEach((row, rank) => {
      const c = byId.get(row.id);
      if (!c) {
        // The first list a row appears in keeps its excerpt.
        byId.set(row.id, {
          row,
          rrf: 1 / (RRF_K + rank + 1),
          score: row.score,
          hits: row.sermon_hits,
          weak: kind === "question" && hasTeaching && row.score < WEAK_QUESTION_ONLY,
        });
      } else {
        c.rrf += 1 / (RRF_K + rank + 1);
        c.score = Math.max(c.score, row.score);
        c.hits = Math.max(c.hits, row.sermon_hits);
        c.weak = false; // a teaching phrasing found it too
      }
    });
  }
  return [...byId.values()].sort((a, b) =>
    Number(a.weak) - Number(b.weak) || b.rrf - a.rrf || b.score - a.score || a.row.id - b.row.id
  );
}

const overlaps = (a: MatchRow, b: MatchRow) => a.start_s < b.end_s - 1 && b.start_s < a.end_s - 1;

function sermonOf(r: SermonRow): Sermon {
  return {
    youtubeId: r.youtube_id,
    title: r.title,
    headline: r.headline,
    publishedAt: r.published_at,
    preachedOn: r.preached_on,
    durationSeconds: r.duration_seconds,
    thumbnailUrl: r.thumbnail_url,
    speaker: r.speaker,
  };
}

type Reading = {
  theme: string;
  related: string[];
  path: PathInfo | null;
  care: boolean;
};

function build(query: string, reading: Reading, lists: MatchList[]): Omit<SearchResponse, "cached" | "tookMs"> {
  const twins = new Map<number, number[]>();
  for (const r of lists.flatMap((l) => l.rows)) twins.set(r.id, (r.twins ?? []).map(Number));

  // Twins: keep the best-ranked copy only.
  const kept: Candidate[] = [];
  const keptIds = new Set<number>();
  for (const c of fuse(lists)) {
    const mine = twins.get(c.row.id) ?? [];
    const clash = mine.some((t) => keptIds.has(t)) ||
      kept.some((k) => (twins.get(k.row.id) ?? []).includes(c.row.id));
    if (clash) continue;
    kept.push(c);
    keptIds.add(c.row.id);
  }

  // At most 2 per sermon, not overlapping.
  const shown: Candidate[] = [];
  const perSermon = new Map<string, Candidate[]>();
  for (const c of kept) {
    if (shown.length === MAX_MOMENTS) break;
    const same = perSermon.get(c.row.youtube_id) ?? [];
    if (same.length >= PER_SERMON || same.some((s) => overlaps(s.row, c.row))) continue;
    same.push(c);
    perSermon.set(c.row.youtube_id, same);
    shown.push(c);
  }

  const moments: Moment[] = shown.map((c) => {
    const r = c.row;
    const hasQuote = Boolean(r.quote) && r.quote_at !== null;
    const excerptAt = r.excerpt_at ?? r.start_s;
    const at = hasQuote ? Number(r.quote_at) : Math.max(excerptAt - 3, r.start_s, 0);
    return {
      id: String(r.id),
      youtubeId: r.youtube_id,
      at: round(at, 2),
      end: round(r.end_s, 2),
      quote: hasQuote ? r.quote : null,
      excerpt: (r.excerpt ?? "").trim(),
      score: round(c.score, 3),
      sermon: sermonOf(r),
    };
  });

  // Sermons in order of their best moment, with how many moments match there.
  const inSermon = new Map<string, number>();
  for (const c of kept) inSermon.set(c.row.youtube_id, (inSermon.get(c.row.youtube_id) ?? 0) + 1);
  const sermons: (Sermon & { moments: number })[] = [];
  const seen = new Set<string>();
  for (const c of kept) {
    if (sermons.length === MAX_SERMONS) break;
    if (seen.has(c.row.youtube_id)) continue;
    seen.add(c.row.youtube_id);
    sermons.push({ ...sermonOf(c.row), moments: Math.max(c.hits, inSermon.get(c.row.youtube_id) ?? 1, 1) });
  }

  const all = lists.flatMap((l) => l.rows);
  const total = {
    moments: Math.max(0, ...all.map((r) => r.total_moments), moments.length),
    sermons: Math.max(0, ...all.map((r) => r.total_sermons), sermons.length),
  };

  const p = reading.path;
  return {
    query,
    understood: { theme: reading.theme, related: reading.related },
    path: p ? { id: p.id, name: p.name, italic: p.italic, days: p.days, status: p.status } : null,
    care: reading.care,
    moments,
    sermons,
    total,
  };
}

// ---- The two kinds of search ----------------------------------------------------------

type Run = {
  log: Record<string, unknown>;
  usage: { chat_in: number; chat_out: number; embed: number; model: string };
  ms: Record<string, number>;
  since: () => number;
  onRetry: OnRetry;
};

type Found = {
  reading: Reading;
  lists: MatchList[];
  complete: boolean;
  /** Needs whose curated moments stand in when nothing could be searched. */
  curated: string[];
};

const errorText = (e: unknown) => String((e as Error)?.message ?? e);

/** Embeds `text` and searches it; `step` names the timing in the log. */
async function embedAndMatch(text: string, step: string, run: Run): Promise<MatchRow[]> {
  const r = await embedHedged([text]);
  run.usage.embed += r.tokens;
  const rows = await match(vectorLiteral(r.vectors[0]), text, run.onRetry);
  run.ms[step] = run.since();
  return rows;
}

/**
 * The comfort phrasing (CARE_QUERY) searched: with its stored embedding when
 * there is one (`stored`; undefined: look it up), else embedded now and
 * stored for next time.
 */
async function careRows(run: Run, stored: string | null | undefined): Promise<MatchRow[]> {
  let vector = stored === undefined ? await storedVector("care", CARE_QUERY, run.onRetry) : stored;
  if (!vector) {
    const r = await embedHedged([CARE_QUERY]);
    run.usage.embed += r.tokens;
    vector = vectorLiteral(r.vectors[0]);
    later(storeVector("care", CARE_QUERY, vector));
  } else run.log.care_vector = "stored";
  const rows = await match(vector, CARE_QUERY, run.onRetry);
  run.ms.match_care = run.since();
  return rows;
}

/** What a need chip is understood as: its theme, its related needs and the path for it. */
function needReading(need: NeedInfo, needs: NeedInfo[], paths: PathInfo[]): Reading {
  return {
    theme: need.theme,
    related: shortsOf(need.related, needs),
    path: paths.find((p) => p.needs.includes(need.id)) ?? null,
    care: false,
  };
}

/**
 * A need chip: its fixed teaching phrase and its label, searched with their
 * stored embeddings, or embedded in one call (and stored) the first time. No
 * chat model. When they can't be embedded, the need's curated moments stand in.
 */
async function needSearch(
  need: NeedInfo,
  needs: NeedInfo[],
  paths: PathInfo[],
  run: Run,
  stored: Stored | undefined,
): Promise<Found> {
  const query = need.query as string;
  const reading = needReading(need, needs, paths);
  let vectors: [string, string];
  if (stored) {
    vectors = [stored.query_embedding, stored.label_embedding];
    run.log.vectors = "stored";
  } else {
    try {
      const r = await embedHedged([query, need.label]);
      run.usage.embed += r.tokens;
      vectors = [vectorLiteral(r.vectors[0]), vectorLiteral(r.vectors[1])];
      later(storeNeedVectors(need, vectors));
    } catch (error) {
      run.log.embed_error = errorText(error);
      return { reading, lists: [], complete: false, curated: [need.id] };
    }
  }
  run.ms.embed = run.since();
  const [teach, label] = await Promise.allSettled([
    match(vectors[0], query, run.onRetry),
    match(vectors[1], need.label, run.onRetry),
  ]);
  run.ms.match = run.since();
  const lists: MatchList[] = [];
  if (label.status === "fulfilled") lists.push({ kind: "question", rows: label.value });
  else run.log.raw_error = errorText(label.reason);
  if (teach.status === "fulfilled") lists.push({ kind: "teaching", rows: teach.value });
  else run.log.teach_error = errorText(teach.reason);
  return { reading, lists, complete: lists.length === 2, curated: [need.id] };
}

/** The care answer without the chat model: the comfort list, theme and related needs. */
async function careWithoutModel(needs: NeedInfo[], run: Run, careVector: string | null | undefined): Promise<Found> {
  const lists: MatchList[] = [];
  try {
    lists.push({ kind: "teaching", rows: await careRows(run, careVector) });
  } catch (error) {
    run.log.care_error = errorText(error);
  }
  return {
    reading: { theme: CARE_THEME, related: shortsOf(CARE_RELATED, needs), path: null, care: true },
    lists,
    complete: false,
    curated: CARE_RELATED,
  };
}

/**
 * Anything typed: the chat model reads it while the question (or, in
 * distress, the comfort phrasing) is searched. A "maybe" search the model
 * couldn't read is care.
 */
async function freeSearch(
  q: string,
  distress: DistressReading,
  needs: NeedInfo[],
  paths: PathInfo[],
  run: Run,
  careVector: string | null | undefined,
): Promise<Found> {
  const careAsTyped = distress === "care";
  // Set from the streaming callback, so typed without narrowing to null.
  let teachP = null as Promise<MatchRow[]> | null;
  const searchTeaching = (teachingQuery: string) => {
    if (teachP) return;
    run.ms.teaching = run.since();
    teachP = embedAndMatch(teachingQuery, "match_t", run);
    teachP.catch(() => {}); // settled below
  };

  const understoodP: Promise<Understood | null> = understand(q, paths, needs, 4500, searchTeaching)
    .then((r) => {
      run.usage.chat_in += r.usage.input;
      run.usage.chat_out += r.usage.output;
      run.usage.model = r.model;
      run.ms.chat = run.since();
      return r.understood;
    })
    .catch((error) => {
      run.log.chat_error = errorText(error);
      return null;
    });
  // Someone in distress never gets the question as typed searched: it finds
  // passages that name depression or death, which in this archive often speak
  // of it harshly ("a believer cannot be depressed").
  const firstP = careAsTyped ? careRows(run, careVector) : embedAndMatch(q, "match_q", run);
  firstP.catch(() => {});

  const understood = await understoodP;
  if (understood?.teachingQuery) searchTeaching(understood.teachingQuery);
  const [first, teach] = await Promise.allSettled([firstP, teachP ?? Promise.resolve(null)]);
  if (first.status === "rejected") run.log.raw_error = errorText(first.reason);
  if (teach.status === "rejected") run.log.teach_error = errorText(teach.reason);
  const teachRows = teach.status === "fulfilled" ? teach.value : null;
  // Failing closed: words that may mean distress, and no reading from the model.
  const closed = distress === "maybe" && understood === null;
  if (closed) run.log.care_closed = true;
  const care = careAsTyped || understood?.care === true || closed;

  const lists: MatchList[] = [];
  let complete = understood !== null && teachRows !== null;
  if (care) {
    // The model's own phrasing for someone it saw in distress (not one it
    // streamed before failing, which may not be about comfort).
    if (teachRows && understood) lists.push({ kind: "teaching", rows: teachRows });
    if (careAsTyped) {
      if (first.status === "fulfilled") lists.push({ kind: "teaching", rows: first.value });
      else complete = false;
    } else if (!lists.length) {
      // Distress the pattern didn't settle and no comforting phrasing from the
      // model: search the comfort phrasing rather than the question as typed.
      try {
        lists.push({ kind: "teaching", rows: await careRows(run, careVector) });
      } catch (error) {
        run.log.care_error = errorText(error);
      }
    }
  } else {
    if (first.status === "fulfilled") lists.push({ kind: "question", rows: first.value });
    else complete = false;
    if (teachRows) lists.push({ kind: "teaching", rows: teachRows });
  }

  const reading: Reading = understood
    ? {
      theme: understood.theme,
      related: understood.related,
      path: care ? null : paths.find((p) => p.id === understood.pathId) ?? null,
      care,
    }
    : care
    ? { theme: CARE_THEME, related: shortsOf(CARE_RELATED, needs), path: null, care }
    : { theme: fallbackTheme(q), related: [], path: null, care };
  return { reading, lists, complete, curated: care ? CARE_RELATED : [] };
}

/** A response from moments that weren't searched (curated) or from title matches. */
function fromFallback(
  query: string,
  reading: Reading,
  moments: Moment[],
  titles: Sermon[],
): Omit<SearchResponse, "cached" | "tookMs"> {
  const count = new Map<string, number>();
  for (const m of moments) count.set(m.youtubeId, (count.get(m.youtubeId) ?? 0) + 1);
  const sermons: (Sermon & { moments: number })[] = [];
  for (const m of moments) {
    if (sermons.some((x) => x.youtubeId === m.youtubeId)) continue;
    sermons.push({ ...m.sermon, moments: count.get(m.youtubeId) ?? 1 });
  }
  for (const t of titles) if (!sermons.some((x) => x.youtubeId === t.youtubeId)) sermons.push({ ...t, moments: 0 });
  const p = reading.path;
  return {
    query,
    understood: { theme: reading.theme, related: reading.related },
    path: p ? { id: p.id, name: p.name, italic: p.italic, days: p.days, status: p.status } : null,
    care: reading.care,
    moments,
    sermons: sermons.slice(0, MAX_SERMONS),
    total: { moments: moments.length, sermons: Math.min(sermons.length, MAX_SERMONS) },
    ...(moments.length ? { fallback: "curated" as const } : titles.length ? { fallback: "titles" as const } : {}),
  };
}

// ---- Storing embeddings ahead of time -------------------------------------------------

/** The bearer token is one of the project's secret keys (an operator, never the app). */
function fromOperator(req: Request): boolean {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  return !!token && secretKeys().some((key) => sameText(token, key));
}

/**
 * {"warm": true}: embeds every published need whose stored embeddings are
 * missing or out of date, and the comfort phrasing, in one OpenAI call, and
 * stores them. Run after deploying, and after changing a need's wording
 * (search also stores a chip's embeddings itself the first time it is used).
 */
async function warm(req: Request): Promise<Response> {
  if (!fromOperator(req)) return json(req, 401, { error: "unauthorized" });
  const noted = () => {};
  const needs = (await loadNeeds(noted)).filter((n) => n.query);
  const { data, error } = await admin().from("need_vectors").select("need_id,label,short,query,model");
  if (error) return json(req, 503, { error: "unavailable" });
  type Row = { need_id: string; label: string; short: string; query: string; model: string };
  const current = new Set(
    ((data ?? []) as Row[])
      .filter((v) => {
        const n = needs.find((x) => x.id === v.need_id);
        return n && v.model === VECTOR_MODEL && v.label === n.label && v.short === n.short && v.query === n.query;
      })
      .map((v) => v.need_id),
  );
  const todo = needs.filter((n) => !current.has(n.id));
  const careStored = (await storedVector("care", CARE_QUERY, noted)) !== null;
  const inputs = [...todo.flatMap((n) => [n.query as string, n.label]), ...(careStored ? [] : [CARE_QUERY])];
  if (inputs.length) {
    const { vectors } = await embed(inputs, 20000);
    const text = vectors.map(vectorLiteral);
    await Promise.all(todo.map((n, i) => storeNeedVectors(n, [text[2 * i], text[2 * i + 1]])));
    if (!careStored) await storeVector("care", CARE_QUERY, text[text.length - 1]);
  }
  const answer = { needs: needs.length, embedded: todo.length, care: careStored ? "stored" : "embedded" };
  console.log(JSON.stringify({ fn: "search", warm: true, ...answer }));
  return json(req, 200, answer);
}

// ---- Handler ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const t0 = performance.now();
  const blocked = gate(req);
  if (blocked) return blocked;

  const body = await readJson(req, 4096);
  if (body?.warm === true) {
    try {
      return await warm(req);
    } catch (error) {
      console.error(JSON.stringify({ fn: "search", warm: true, error: errorText(error) }));
      return json(req, 503, { error: "unavailable" });
    }
  }
  const q = typeof body?.q === "string" ? body.q.replace(/\s+/g, " ").trim() : "";
  // deno-lint-ignore no-control-regex
  if (!q || q.length > 200 || /[\u0000-\u001f\u007f]/.test(q)) return json(req, 400, { error: "bad_query" });
  const norm = normalise(q);
  if (!norm) return json(req, 400, { error: "bad_query" });
  // Before anything else, so the limits never stand between someone in
  // distress and help.
  const distress = readDistress(q);

  const log: Record<string, unknown> = { fn: "search" };
  if (distress) log.distress = distress;
  const retries: string[] = [];
  const onRetry: OnRetry = (what) => retries.push(what);
  const since = () => Math.round(performance.now() - t0);
  const run: Run = { log, usage: { chat_in: 0, chat_out: 0, embed: 0, model: "" }, ms: {}, since, onRetry };

  /** The answer for what was found, or a fallback when nothing could be searched. */
  const respond = async (found: Found, key: string | null): Promise<Response> => {
    if (found.reading.care) log.care = true;
    let result: Omit<SearchResponse, "cached" | "tookMs">;
    if (found.lists.length) {
      result = build(q, found.reading, found.lists);
      if (found.complete && key) later(writeCache(key, { ...result, cached: false, tookMs: 0 }));
    } else {
      const moments = found.curated.length
        ? await curated(found.curated, onRetry).catch((error) => {
          log.curated_error = errorText(error);
          return [] as Moment[];
        })
        : [];
      // Someone in distress gets an answer even with nothing to show, so the
      // app can still offer help. Anyone else gets title matches, or a 503.
      const titles = moments.length || found.reading.care ? [] : await titleMatches(q, onRetry).catch((error) => {
        log.titles_error = errorText(error);
        return [] as Sermon[];
      });
      if (!moments.length && !titles.length && !found.reading.care) {
        console.error(JSON.stringify({ ...log, failed: true, ms: since(), steps: run.ms, retries }));
        return json(req, 503, { error: "unavailable" });
      }
      result = fromFallback(q, found.reading, moments, titles);
      if (result.fallback) log.fallback = result.fallback;
    }
    const tookMs = since();
    console.log(JSON.stringify({
      ...log,
      cached: false,
      complete: found.complete,
      ms: tookMs,
      steps: run.ms,
      usage: run.usage,
      rows: found.lists.map((l) => l.rows.length),
      moments: result.moments.length,
      ...(retries.length ? { retries } : {}),
    }));
    return json(req, 200, { ...result, cached: false, tookMs });
  };

  try {
    const needsP = loadNeeds(onRetry).catch(() => [] as NeedInfo[]);
    const pathsP = loadPaths(onRetry).catch(() => [] as PathInfo[]);
    const key = await cacheKey(norm);
    // Someone in distress: only the allowance for the model's reading, never
    // a refusal (the caller isn't needed).
    const who = distress === "care" ? null : await caller(req, "search");
    if (who?.ip) log.ip = who.ip;
    const limits = who ? searchLimits(who) : careLimits();
    const begun = await open(key, distress === "care" ? null : norm, limits, distress ? CARE_QUERY : null, onRetry);

    if ("cached" in begun) {
      // Re-checked: a cached answer without care is never served to someone
      // whose words say it (one cached before the list knew their wording).
      if (distress === "care" && !begun.cached.care) {
        log.recheck = true;
        return await respond(await careWithoutModel(await needsP, run, undefined), null);
      }
      // Quotes found since the answer was cached are added on the way out.
      const moments = (begun.cached.moments ?? []).map((m) => {
        const found = begun.quotes?.[m.id];
        return found && !m.quote ? { ...m, quote: found.quote, at: round(Number(found.at), 2) } : m;
      });
      const tookMs = since();
      console.log(JSON.stringify({ ...log, cached: true, ms: tookMs, ...(retries.length ? { retries } : {}) }));
      return json(req, 200, { ...begun.cached, query: q, moments, cached: true, tookMs });
    }
    log.ms_start = since();

    if (!begun.ok) {
      // Past the limits the model can't read the search. Someone in distress,
      // or whose words may mean it, gets the care answer without it (failing
      // closed); a chip gets its curated moments; anything else is told
      // search is busy.
      if (distress) {
        log.limited = "care";
        return await respond(await careWithoutModel(await needsP, run, begun.care_vector), null);
      }
      const needs = await needsP;
      const need = needFor(norm, needs);
      if (need) {
        log.need = need.id;
        log.limited = "chip";
        return await respond(
          { reading: needReading(need, needs, await pathsP), lists: [], complete: false, curated: [need.id] },
          null,
        );
      }
      const scope = scopeOf(limits, begun.limit);
      console.log(JSON.stringify({ ...log, limited: scope }));
      return json(req, 429, { error: "rate_limited", retryAfter: begun.retry_after, scope }, {
        "Retry-After": String(begun.retry_after),
      });
    }

    const [needs, paths] = await Promise.all([needsP, pathsP]);
    const stored = begun.need;
    const need = distress === "care"
      ? null
      : (stored && needs.find((n) => n.id === stored.id && n.query)) || needFor(norm, needs);
    if (need) log.need = need.id;
    const found = need
      ? await needSearch(need, needs, paths, run, stored?.id === need.id ? stored : undefined)
      : await freeSearch(q, distress, needs, paths, run, begun.care_vector);
    return await respond(found, key);
  } catch (error) {
    console.error(JSON.stringify({ ...log, error: errorText(error), ms: since(), retries }));
    // Even with the database down, someone in distress gets an answer: the
    // app shows the care card above it.
    if (distress) {
      return json(req, 200, {
        ...fromFallback(q, { theme: CARE_THEME, related: [], path: null, care: true }, [], []),
        cached: false,
        tookMs: since(),
      });
    }
    return json(req, 503, { error: "unavailable" });
  }
});
