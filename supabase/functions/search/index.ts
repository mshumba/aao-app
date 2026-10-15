// POST /functions/v1/search {"q": "I keep going back to the same sin"}
//
// Need-based search over the sermon passages (see migrations need_search and
// search_polish, and supabase/functions/README.md). In order:
//   1. checks: CORS/origin, the publishable key on apikey, q of 1-200 characters;
//   2. search_start(), one database call: the 24-hour response cache (hits are
//      free and don't count towards the limit), else the rate limits (20
//      searches per 5 minutes per signed-in user, else per IP; 300 an hour for
//      everyone together). The published needs and guided paths load meanwhile;
//   3a. a need chip (q is a published need's label or short name): its fixed
//      teaching phrase and its label are embedded together and searched; theme,
//      related needs and path come from the database. No chat model.
//   3b. anything else: a small chat model reads the question (theme, a teaching
//      phrasing, 3 related needs, a guided path, care) while the question itself
//      is embedded and searched; the teaching phrasing is embedded and searched
//      as soon as it has streamed in;
//   4. the lists are fused (reciprocal rank; weak rows found only by the
//      question as typed go last), twins collapsed, at most 2 moments per
//      sermon. match_passages() already joins the sermon and any cached quote.
// Someone who says they want to die (care) never gets the list for the question
// as typed, even when the model is unavailable: a fixed comfort phrasing is
// searched instead. If the chat model fails otherwise, search answers from the
// question alone (theme = the question, no related needs, no path) and isn't
// cached.

import { callerKey } from "../_shared/auth.ts";
import { admin, dbTimeout, envInt, withRetry } from "../_shared/db.ts";
import { gate, json, later, readJson } from "../_shared/http.ts";
import { embedHedged, vectorLiteral } from "../_shared/openai.ts";
import {
  CARE_QUERY,
  CARE_RELATED,
  CARE_THEME,
  fallbackTheme,
  inDistress,
  type NeedInfo,
  normalise,
  type PathInfo,
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
const RATE_MAX = 20;
const RATE_WINDOW_S = 300;
const CACHE_SECONDS = 24 * 60 * 60;
// v2 (judge pass): related needs from public.needs, stricter paths, weak
// question-only matches ranked after the teaching matches.
// v3 (judge pass 2): 3 related needs even for a curated need's own search;
// someone in distress gets only the comforting teaching list and no path.
// v4 (search polish): need chips from needs.query, care and path.status in the
// response, hidden passages, typed searches keyed by a hash of the question.
const CACHE_PREFIX = "search:v4:";
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
  cached: boolean;
  tookMs: number;
};

const round = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places;

/** Notes a retried database call in the request's log line. */
type OnRetry = (what: string) => void;

// ---- Guided paths and published needs ---------------------------------------------
// Loaded on every request, alongside search_start(): the runtime starts a fresh
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

type Start =
  | { cached: SearchResponse; quotes: Record<string, { quote: string; at: number }> }
  | { ok: true }
  | { ok: false; retry_after: number };

async function start(key: string, who: string, onRetry: OnRetry): Promise<Start> {
  const { data, error } = await withRetry(
    () =>
      admin()
        .rpc("search_start", {
          cache_key: key,
          max_age_seconds: CACHE_SECONDS,
          // A ceiling for everyone together, after the caller's own limit, so
          // OpenAI spend stays bounded.
          rate_keys: [who, "search:all"],
          rate_max: [RATE_MAX, envInt("SEARCH_GLOBAL_PER_HOUR", 300)],
          rate_windows: [RATE_WINDOW_S, 3600],
        })
        .abortSignal(dbTimeout(4000)),
    () => onRetry("start"),
  );
  if (error || !data) throw new Error(`search_start: ${error?.code ?? ""} ${error?.message ?? "no answer"}`);
  return data as Start;
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

async function match(vector: number[], text: string, onRetry: OnRetry): Promise<MatchRow[]> {
  const { data, error } = await withRetry(
    () =>
      admin()
        .rpc("match_passages", { query_embedding: vectorLiteral(vector), query_text: text, match_count: MATCH_COUNT })
        .select(MATCH_COLUMNS)
        .abortSignal(dbTimeout(6000)),
    () => onRetry("match"),
  );
  if (error) throw new Error(`match_passages: ${error.code ?? ""} ${error.message}`);
  return (data ?? []) as unknown as MatchRow[];
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

function sermonOf(r: MatchRow): Sermon {
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

type Found = { reading: Reading; lists: MatchList[]; complete: boolean };

const errorText = (e: unknown) => String((e as Error)?.message ?? e);

/** Embeds `text` and searches it; `step` names the timing in the log. */
async function embedAndMatch(text: string, step: string, run: Run): Promise<MatchRow[]> {
  const r = await embedHedged([text]);
  run.usage.embed += r.tokens;
  const rows = await match(r.vectors[0], text, run.onRetry);
  run.ms[step] = run.since();
  return rows;
}

/** A need chip: its fixed teaching phrase and its label, embedded in one call and searched. No chat model. */
async function needSearch(need: NeedInfo, needs: NeedInfo[], paths: PathInfo[], run: Run): Promise<Found> {
  const query = need.query as string;
  const vectors = await embedHedged([query, need.label]);
  run.usage.embed += vectors.tokens;
  run.ms.embed = run.since();
  const [teach, label] = await Promise.allSettled([
    match(vectors.vectors[0], query, run.onRetry),
    match(vectors.vectors[1], need.label, run.onRetry),
  ]);
  run.ms.match = run.since();
  const lists: MatchList[] = [];
  if (label.status === "fulfilled") lists.push({ kind: "question", rows: label.value });
  else run.log.raw_error = errorText(label.reason);
  if (teach.status === "fulfilled") lists.push({ kind: "teaching", rows: teach.value });
  else run.log.teach_error = errorText(teach.reason);
  return {
    reading: {
      theme: need.theme,
      related: shortsOf(need.related, needs),
      path: paths.find((p) => p.needs.includes(need.id)) ?? null,
      care: false,
    },
    lists,
    complete: lists.length === 2,
  };
}

/** Anything typed: the chat model reads it while the question (or, in distress, CARE_QUERY) is searched. */
async function freeSearch(q: string, needs: NeedInfo[], paths: PathInfo[], run: Run): Promise<Found> {
  const careAsTyped = inDistress(q);
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
  const firstP = embedAndMatch(careAsTyped ? CARE_QUERY : q, careAsTyped ? "match_care" : "match_q", run);
  firstP.catch(() => {});

  const understood = await understoodP;
  if (understood?.teachingQuery) searchTeaching(understood.teachingQuery);
  const [first, teach] = await Promise.allSettled([firstP, teachP ?? Promise.resolve(null)]);
  if (first.status === "rejected") run.log.raw_error = errorText(first.reason);
  if (teach.status === "rejected") run.log.teach_error = errorText(teach.reason);
  const teachRows = teach.status === "fulfilled" ? teach.value : null;
  const care = careAsTyped || understood?.care === true;

  const lists: MatchList[] = [];
  let complete = understood !== null && teachRows !== null;
  if (care) {
    if (teachRows) lists.push({ kind: "teaching", rows: teachRows });
    if (careAsTyped) {
      if (first.status === "fulfilled") lists.push({ kind: "teaching", rows: first.value });
      else complete = false;
    } else if (!teachRows) {
      // The model saw distress the pattern didn't, but its phrasing failed:
      // search the comfort phrasing rather than the question as typed.
      try {
        lists.push({ kind: "teaching", rows: await embedAndMatch(CARE_QUERY, "match_care", run) });
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
  return { reading, lists, complete };
}

// ---- Handler ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const t0 = performance.now();
  const blocked = gate(req);
  if (blocked) return blocked;

  const body = await readJson(req, 4096);
  const q = typeof body?.q === "string" ? body.q.replace(/\s+/g, " ").trim() : "";
  // deno-lint-ignore no-control-regex
  if (!q || q.length > 200 || /[\u0000-\u001f\u007f]/.test(q)) return json(req, 400, { error: "bad_query" });
  const norm = normalise(q);
  if (!norm) return json(req, 400, { error: "bad_query" });

  const log: Record<string, unknown> = { fn: "search" };
  const retries: string[] = [];
  const onRetry: OnRetry = (what) => retries.push(what);
  const since = () => Math.round(performance.now() - t0);
  try {
    const whoP = callerKey(req, "search");
    const needsP = loadNeeds(onRetry).catch(() => [] as NeedInfo[]);
    const pathsP = loadPaths(onRetry).catch(() => [] as PathInfo[]);
    const key = await cacheKey(norm);
    const begun = await start(key, await whoP, onRetry);
    if ("cached" in begun) {
      // Quotes found since the answer was cached are added on the way out.
      const moments = (begun.cached.moments ?? []).map((m) => {
        const found = begun.quotes?.[m.id];
        return found && !m.quote ? { ...m, quote: found.quote, at: round(Number(found.at), 2) } : m;
      });
      const tookMs = since();
      console.log(JSON.stringify({ ...log, cached: true, ms: tookMs, ...(retries.length ? { retries } : {}) }));
      return json(req, 200, { ...begun.cached, query: q, moments, cached: true, tookMs });
    }
    if (!begun.ok) {
      console.log(JSON.stringify({ ...log, limited: true }));
      return json(req, 429, { error: "rate_limited", retryAfter: begun.retry_after }, {
        "Retry-After": String(begun.retry_after),
      });
    }
    log.ms_start = since();

    const [needs, paths] = await Promise.all([needsP, pathsP]);
    const need = inDistress(q) ? null : needFor(norm, needs);
    if (need) log.need = need.id;
    const run: Run = { log, usage: { chat_in: 0, chat_out: 0, embed: 0, model: "" }, ms: {}, since, onRetry };
    const found = need ? await needSearch(need, needs, paths, run) : await freeSearch(q, needs, paths, run);
    if (found.reading.care) log.care = true;

    if (!found.lists.length && !found.reading.care) {
      console.error(JSON.stringify({ ...log, failed: true, ms: since(), retries }));
      return json(req, 503, { error: "unavailable" });
    }
    // Someone in distress gets an answer even with nothing to show, so the app
    // can still offer help.
    const result = build(q, found.reading, found.lists);
    const tookMs = since();
    if (found.complete) later(writeCache(key, { ...result, cached: false, tookMs: 0 }));
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
  } catch (error) {
    console.error(JSON.stringify({ ...log, error: errorText(error), ms: since(), retries }));
    return json(req, 503, { error: "unavailable" });
  }
});
