// POST /functions/v1/quotes {"ids": ["1882", "18057"]}
//   -> {"quotes": {"1882": {"quote": "...", "at": 3738.4}, "18057": null}}
//
// A clean verbatim quote for each passage search returned without one (up to
// 14). Cached quotes (public.passage_quotes) come first; the rest go to the
// chat model in ONE batched call (pick.ts), which gives a quote and a backup
// per passage. Each pick is rebuilt from the transcript's own words and
// checked in code (_shared/verbatim.ts: caption words in order, only fillers
// and stutters left out, no word the model corrected, 8-45 words, ending a
// sentence); the first that passes is used, and the passage_quotes trigger
// checks the words again. A passage with no quote that passes is stored as
// null, so it is never sent to the model twice, and the app shows its excerpt
// instead.
// `at` is where to start playing: 3 s before the quote's first word.
//
// An optional "q" (the search text) is still accepted from older app builds
// but ignored: a passage's quote is cached once and shown for every search,
// so it is chosen without the search text and no caller can steer it.

import { callerKey } from "../_shared/auth.ts";
import { admin, dbTimeout, envInt, rateLimit } from "../_shared/db.ts";
import { gate, json, readJson } from "../_shared/http.ts";
import { buildQuote, playFrom } from "../_shared/verbatim.ts";
import { pickQuotes } from "./pick.ts";

const MAX_IDS = 14;
const RATE_MAX = 20;
const RATE_WINDOW_S = 300;

type Quote = { quote: string; at: number } | null;

type PassageRow = {
  id: number;
  text: string;
  words: number;
  start_s: number;
  end_s: number;
  seg_words: number[];
  seg_times: number[];
};

type CacheRow = { passage_id: number; quote: string | null; quote_at: number | null; model: string };

/** Stores the batch; a row the database refuses is shown as null. */
async function store(rows: CacheRow[], out: Record<string, Quote>): Promise<void> {
  if (!rows.length) return;
  const db = admin();
  const { error } = await db.from("passage_quotes").upsert(rows, { onConflict: "passage_id" });
  if (!error) return;
  for (const row of rows) {
    const one = await db.from("passage_quotes").upsert(row, { onConflict: "passage_id" });
    if (one.error) {
      console.error(JSON.stringify({ fn: "quotes", refused: row.passage_id, code: one.error.code }));
      out[String(row.passage_id)] = null;
    }
  }
}

Deno.serve(async (req) => {
  const t0 = performance.now();
  const blocked = gate(req);
  if (blocked) return blocked;

  const body = await readJson(req, 8192);
  const rawIds = body?.ids;
  if (!Array.isArray(rawIds) || rawIds.length > MAX_IDS) return json(req, 400, { error: "bad_query" });
  const ids = [...new Set(rawIds.map((v) => (typeof v === "number" ? String(v) : v)))];
  if (!ids.every((v) => typeof v === "string" && /^[0-9]{1,15}$/.test(v))) {
    return json(req, 400, { error: "bad_query" });
  }
  // "q" is ignored (see the top of this file); a malformed one is still refused.
  if (body?.q !== undefined && body?.q !== null && (typeof body.q !== "string" || body.q.trim().length > 200)) {
    return json(req, 400, { error: "bad_query" });
  }
  if (!ids.length) return json(req, 200, { quotes: {} });

  const log: Record<string, unknown> = { fn: "quotes", ids: ids.length };
  try {
    const db = admin();
    const out: Record<string, Quote> = {};

    const cached = await db
      .from("passage_quotes")
      .select("passage_id,quote,quote_at")
      .in("passage_id", ids)
      .abortSignal(dbTimeout(4000));
    if (cached.error) throw new Error(`passage_quotes: ${cached.error.code ?? cached.error.message}`);
    for (const r of cached.data ?? []) {
      out[String(r.passage_id)] = r.quote && r.quote_at !== null ? { quote: r.quote, at: Number(r.quote_at) } : null;
    }
    const missing = ids.filter((id) => !(id in out));
    log.cached = ids.length - missing.length;

    if (missing.length) {
      const found = await db
        .from("passages")
        .select("id,text,words,start_s,end_s,seg_words,seg_times")
        .in("id", missing)
        .abortSignal(dbTimeout(5000));
      if (found.error) throw new Error(`passages: ${found.error.code ?? found.error.message}`);
      const passages = (found.data ?? []) as PassageRow[];
      for (const id of missing) out[id] = null; // unknown ids stay null

      // Only calls that will reach the model count towards the limits.
      if (passages.length) {
        const rate = await rateLimit([
          { key: await callerKey(req, "quotes"), max: RATE_MAX, windowSeconds: RATE_WINDOW_S },
          // A ceiling for everyone together, so OpenAI spend stays bounded.
          { key: "quotes:all", max: envInt("QUOTES_GLOBAL_PER_HOUR", 30), windowSeconds: 3600 },
        ]);
        if (!rate.ok) {
          console.log(JSON.stringify({ ...log, limited: true }));
          return json(req, 429, { error: "rate_limited", retryAfter: rate.retryAfter }, {
            "Retry-After": String(rate.retryAfter),
          });
        }
      }

      if (passages.length) {
        let picked: Awaited<ReturnType<typeof pickQuotes>> | null = null;
        try {
          picked = await pickQuotes(passages.map((p) => ({ id: String(p.id), text: p.text })), 20000);
        } catch (error) {
          // Nothing cached: the next request tries these passages again.
          log.model_error = String((error as Error)?.message ?? error);
        }
        if (picked) {
          const rows: CacheRow[] = [];
          let passed = 0;
          for (const p of passages) {
            // The model's quote, or its backup when the quote can't be matched to the captions.
            let m: ReturnType<typeof buildQuote> = null;
            for (const raw of picked.quotes.get(String(p.id)) ?? []) {
              m = buildQuote(raw, p);
              if (m) break;
            }
            if (m) {
              const at = playFrom(p, m.firstToken);
              out[String(p.id)] = { quote: m.quote, at };
              rows.push({ passage_id: p.id, quote: m.quote, quote_at: at, model: picked.model });
              passed++;
            } else {
              rows.push({ passage_id: p.id, quote: null, quote_at: null, model: picked.model });
            }
          }
          await store(rows, out);
          log.model = picked.model;
          log.usage = picked.usage;
          log.asked = passages.length;
          log.passed = passed;
        }
      }
    }

    log.ms = Math.round(performance.now() - t0);
    console.log(JSON.stringify(log));
    return json(req, 200, { quotes: out });
  } catch (error) {
    console.error(JSON.stringify({ ...log, error: String((error as Error)?.message ?? error) }));
    return json(req, 503, { error: "unavailable" });
  }
});
