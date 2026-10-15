// POST /functions/v1/search {"q": "I keep going back to the same sin"}
//
// Need-based search over the sermon passages (see migration need_search and
// supabase/functions/README.md). In order:
//   1. checks: CORS/origin, the publishable key on apikey, q of 1-200 characters;
//   2. the 24-hour response cache (hits are free and don't count towards the limit);
//   3. the rate limit: 20 searches per 5 minutes per signed-in user, else per IP;
//   4. in parallel: a small chat model reads the question (theme, a teaching
//      phrasing, 3 related needs, a guided path that fits) while the question
//      itself is embedded and searched; then the teaching phrasing is embedded
//      and searched too;
//   5. the two result lists are fused (reciprocal rank; weak rows found only by
//      the question as typed go last), twins collapsed, at most
//      2 moments per sermon, joined to the sermon catalogue and any cached quotes.
// If the chat model fails or is slow, search still answers from the question
// alone (theme = the question, no related needs, no path) and isn't cached.

import { callerKey } from "../_shared/auth.ts";
import { admin, dbTimeout, envInt, rateLimit } from "../_shared/db.ts";
import { gate, json, later, readJson } from "../_shared/http.ts";
import { embed, vectorLiteral } from "../_shared/openai.ts";
import { fallbackTheme, type NeedInfo, type PathInfo, understand, type Understood } from "../_shared/prompts.ts";

const MAX_MOMENTS = 14;
const PER_SERMON = 2;
const MAX_SERMONS = 10;
// Rows asked of each match_passages call. Each row costs a ts_headline and a
// caption-time lookup; 16 per list (up to 32 after fusing) is plenty for 14
// moments at 2 per sermon, and keeps the database work small on Micro compute.
const MATCH_COUNT = 16;
const RATE_MAX = 20;
const RATE_WINDOW_S = 300;
const CACHE_MS = 24 * 60 * 60 * 1000;
// v2 (judge pass): related needs from public.needs, stricter paths, weak
// question-only matches ranked after the teaching matches.
// v3 (judge pass 2): 3 related needs even for a curated need's own search;
// someone in distress gets only the comforting teaching list and no path.
const CACHE_PREFIX = "search:v3:";
const RRF_K = 60;
// A row found only by the question as typed (not by the teaching phrasing)
// whose score is below this is usually a passage that shares the question's
// emotion words without teaching on it (a testimony aside, a prayer point, a
// caption error such as "lost" for "lust"). Such rows rank after every row the
// teaching phrasing found. In the judge's 20 graded searches, 9 rows fell below
// 0.47: 6 no, 3 partly, none yes. Not applied when there is no teaching list.
const WEAK_QUESTION_ONLY = 0.47;

const MATCH_COLUMNS =
  "id,youtube_id,start_s,end_s,words,similarity,score,sermon_hits,total_moments,total_sermons,excerpt,excerpt_at,title,headline,published_at,preached_on,duration_seconds,thumbnail_url,speaker";

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
  path: { id: string; name: string; italic: string; days: number } | null;
  moments: Moment[];
  sermons: (Sermon & { moments: number })[];
  total: { moments: number; sermons: number };
  cached: boolean;
  tookMs: number;
};

/** Cache key form of a question: case, spacing and punctuation don't matter. */
export function normalise(q: string): string {
  return q
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const round = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places;

// ---- Guided paths and published needs (cached in the isolate for 10 minutes) -----

let pathsCache: { at: number; paths: PathInfo[] } | null = null;
let needsCache: { at: number; needs: NeedInfo[] } | null = null;

async function loadNeeds(): Promise<NeedInfo[]> {
  if (needsCache && Date.now() - needsCache.at < 10 * 60 * 1000) return needsCache.needs;
  const { data, error } = await admin()
    .from("needs")
    .select("id,label,short")
    .eq("published", true)
    .order("sort")
    .abortSignal(dbTimeout(3000));
  if (error || !data) return needsCache?.needs ?? [];
  const needs = (data as { id: string; label: string; short: string }[])
    .map((n) => ({ id: String(n.id), label: String(n.label), short: String(n.short) }))
    .filter((n) => n.short.trim());
  needsCache = { at: Date.now(), needs };
  return needs;
}

async function loadPaths(): Promise<PathInfo[]> {
  if (pathsCache && Date.now() - pathsCache.at < 10 * 60 * 1000) return pathsCache.paths;
  const { data, error } = await admin()
    .from("paths")
    .select("id,name,italic,needs,sort,path_days(count)")
    .order("sort")
    .abortSignal(dbTimeout(3000));
  if (error || !data) return pathsCache?.paths ?? [];
  type PathRow = {
    id: string;
    name: string;
    italic: string;
    needs: string[] | null;
    path_days: { count: number }[] | null;
  };
  const paths = (data as unknown as PathRow[])
    .map((p) => ({
      id: String(p.id),
      name: String(p.name),
      italic: String(p.italic),
      needs: Array.isArray(p.needs) ? p.needs.map(String) : [],
      days: Number(p.path_days?.[0]?.count ?? 0),
    }))
    .filter((p) => p.days > 0);
  pathsCache = { at: Date.now(), paths };
  return paths;
}

// ---- Database steps ---------------------------------------------------------------

async function readCache(key: string): Promise<SearchResponse | null> {
  const { data, error } = await admin()
    .from("search_cache")
    .select("response,created_at")
    .eq("key", key)
    .gte("created_at", new Date(Date.now() - CACHE_MS).toISOString())
    .abortSignal(dbTimeout(3000))
    .maybeSingle();
  if (error || !data) return null;
  return data.response as SearchResponse;
}

async function writeCache(key: string, response: SearchResponse): Promise<void> {
  const db = admin();
  const { error } = await db
    .from("search_cache")
    .upsert({ key, response, created_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`cache write: ${error.code ?? error.message}`);
  // Now and then, clear out entries past their 24 hours.
  if (Math.random() < 0.05) {
    await db.from("search_cache").delete().lt("created_at", new Date(Date.now() - CACHE_MS).toISOString());
  }
}

async function match(vector: number[], text: string): Promise<MatchRow[]> {
  const { data, error } = await admin()
    .rpc("match_passages", { query_embedding: vectorLiteral(vector), query_text: text, match_count: MATCH_COUNT })
    .select(MATCH_COLUMNS)
    .abortSignal(dbTimeout(9000));
  if (error) throw new Error(`match_passages: ${error.code ?? ""} ${error.message}`);
  return (data ?? []) as unknown as MatchRow[];
}

async function cachedQuotes(ids: number[]): Promise<Map<number, { quote: string; at: number }>> {
  const out = new Map<number, { quote: string; at: number }>();
  if (!ids.length) return out;
  const { data, error } = await admin()
    .from("passage_quotes")
    .select("passage_id,quote,quote_at")
    .in("passage_id", ids)
    .not("quote", "is", null)
    .abortSignal(dbTimeout(3000));
  if (error) return out;
  for (const r of data ?? []) {
    if (r.quote && r.quote_at !== null) out.set(Number(r.passage_id), { quote: r.quote, at: Number(r.quote_at) });
  }
  return out;
}

async function twinsOf(ids: number[]): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>();
  if (!ids.length) return out;
  const { data, error } = await admin()
    .from("passages")
    .select("id,twins")
    .in("id", ids)
    .abortSignal(dbTimeout(3000));
  if (error) return out;
  for (const r of data ?? []) out.set(Number(r.id), (r.twins ?? []).map(Number));
  return out;
}

// ---- Fusing the two searches ---------------------------------------------------------

type Candidate = {
  row: MatchRow;
  rrf: number;
  score: number;
  hits: number;
  /** Found only by the question as typed, with a weak score (see WEAK_QUESTION_ONLY). */
  weak: boolean;
};

type MatchList = { kind: "question" | "teaching"; rows: MatchRow[] };

function fuse(lists: MatchList[]): Candidate[] {
  const byId = new Map<number, Candidate>();
  const hasTeaching = lists.some((l) => l.kind === "teaching" && l.rows.length > 0);
  for (const { kind, rows } of lists) {
    rows.forEach((row, rank) => {
      const c = byId.get(row.id);
      if (!c) {
        // The question's list comes first: its excerpt is kept.
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
        c.weak = false; // the teaching phrasing found it too
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

function build(
  query: string,
  understood: Understood | null,
  paths: PathInfo[],
  lists: MatchList[],
  twins: Map<number, number[]>,
  quotes: Map<number, { quote: string; at: number }>,
): Omit<SearchResponse, "cached" | "tookMs"> {
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
    const q = quotes.get(r.id);
    const excerptAt = r.excerpt_at ?? r.start_s;
    const at = q ? q.at : Math.max(excerptAt - 3, r.start_s, 0);
    return {
      id: String(r.id),
      youtubeId: r.youtube_id,
      at: round(at, 2),
      end: round(r.end_s, 2),
      quote: q?.quote ?? null,
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

  const path = understood?.pathId ? paths.find((p) => p.id === understood.pathId) : undefined;
  return {
    query,
    understood: understood
      ? { theme: understood.theme, related: understood.related }
      : { theme: fallbackTheme(query), related: [] },
    path: path ? { id: path.id, name: path.name, italic: path.italic, days: path.days } : null,
    moments,
    sermons,
    total,
  };
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
  const key = CACHE_PREFIX + norm.slice(0, 240); // search_cache.key holds at most 256 characters

  const log: Record<string, unknown> = { fn: "search" };
  try {
    const whoP = callerKey(req, "search");
    const pathsP = loadPaths().catch(() => [] as PathInfo[]);
    const needsP = loadNeeds().catch(() => [] as NeedInfo[]);
    whoP.catch(() => {}); // awaited below unless the cache answers first
    const cached = await readCache(key).catch(() => null);
    if (cached) {
      // Quotes found since the answer was cached are added on the way out.
      const ids = (cached.moments ?? []).map((m) => Number(m.id));
      const quotes = await cachedQuotes(ids).catch(() => new Map());
      const moments = (cached.moments ?? []).map((m) => {
        const found = quotes.get(Number(m.id));
        return found && !m.quote ? { ...m, quote: found.quote, at: round(found.at, 2) } : m;
      });
      const tookMs = Math.round(performance.now() - t0);
      console.log(JSON.stringify({ ...log, cached: true, ms: tookMs }));
      return json(req, 200, { ...cached, query: q, moments, cached: true, tookMs });
    }

    const rate = await rateLimit([
      { key: await whoP, max: RATE_MAX, windowSeconds: RATE_WINDOW_S },
      // A ceiling for everyone together, so OpenAI spend stays bounded.
      { key: "search:all", max: envInt("SEARCH_GLOBAL_PER_HOUR", 300), windowSeconds: 3600 },
    ]);
    if (!rate.ok) {
      console.log(JSON.stringify({ ...log, limited: true }));
      return json(req, 429, { error: "rate_limited", retryAfter: rate.retryAfter }, {
        "Retry-After": String(rate.retryAfter),
      });
    }
    const [paths, needs] = await Promise.all([pathsP, needsP]);
    const usage = { chat_in: 0, chat_out: 0, embed: 0, model: "" };
    const ms: Record<string, number> = {};
    const since = () => Math.round(performance.now() - t0);

    const understoodP: Promise<Understood | null> = understand(q, paths, needs, 4500)
      .then((r) => {
        usage.chat_in += r.usage.input;
        usage.chat_out += r.usage.output;
        usage.model = r.model;
        ms.chat = since();
        return r.understood;
      })
      .catch((error) => {
        log.chat_error = String(error?.message ?? error);
        return null;
      });

    const rawP = embed([q], 4000).then(async (r) => {
      usage.embed += r.tokens;
      ms.embed = since();
      const rows = await match(r.vectors[0], q);
      ms.match_q = since();
      return rows;
    });

    const teachP = understoodP.then(async (u) => {
      if (!u?.teachingQuery) return null;
      const r = await embed([u.teachingQuery], 4000);
      usage.embed += r.tokens;
      const rows = await match(r.vectors[0], u.teachingQuery);
      ms.match_t = since();
      return rows;
    });

    const [raw, teach, understoodRes] = await Promise.allSettled([rawP, teachP, understoodP]);
    const understood = understoodRes.status === "fulfilled" ? understoodRes.value : null;
    const lists: MatchList[] = [];
    const teachRows = teach.status === "fulfilled" && teach.value?.length ? teach.value : null;
    // Someone who says they want to die gets only the teaching phrasing's list
    // (God's comfort and hope). The question as typed finds passages that name
    // depression or death, and in this archive those often speak of it harshly
    // ("a believer cannot be depressed").
    const careOnly = understood?.care === true && teachRows !== null;
    if (careOnly) log.care = true;
    if (raw.status === "fulfilled") {
      if (!careOnly) lists.push({ kind: "question", rows: raw.value });
    } else log.raw_error = String((raw.reason as Error)?.message ?? raw.reason);
    if (teachRows) lists.push({ kind: "teaching", rows: teachRows });
    else if (teach.status === "rejected") log.teach_error = String((teach.reason as Error)?.message ?? teach.reason);
    if (!lists.length) {
      console.error(JSON.stringify({ ...log, failed: true, ms: since() }));
      return json(req, 503, { error: "unavailable" });
    }

    const ids = [...new Set(lists.flatMap((l) => l.rows).map((r) => r.id))];
    const [twins, quotes] = await Promise.all([twinsOf(ids), cachedQuotes(ids)]);
    const result = build(q, understood, paths, lists, twins, quotes);
    const tookMs = since();
    const complete = understood !== null && raw.status === "fulfilled" && teach.status === "fulfilled" &&
      teach.value !== null;
    if (complete) later(writeCache(key, { ...result, cached: false, tookMs: 0 }));
    console.log(JSON.stringify({
      ...log,
      cached: false,
      complete,
      ms: tookMs,
      steps: ms,
      usage,
      rows: lists.map((l) => l.rows.length),
      moments: result.moments.length,
    }));
    return json(req, 200, { ...result, cached: false, tookMs });
  } catch (error) {
    console.error(JSON.stringify({ ...log, error: String((error as Error)?.message ?? error) }));
    return json(req, 503, { error: "unavailable" });
  }
});
