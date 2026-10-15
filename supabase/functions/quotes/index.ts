// POST /functions/v1/quotes {"ids": ["1882", "18057"], "q": "same sin"}
//   -> {"quotes": {"1882": {"quote": "...", "at": 3738.4}, "18057": null}}
//
// A verbatim quote for each passage search returned without one (up to 14).
// Cached quotes (public.passage_quotes) come first; the rest go to the chat
// model in ONE batched call that picks a 1-2 sentence span of at most 45 words
// per passage, adding only capitals and punctuation. Every quote is checked in
// code to be a contiguous verbatim run of the passage's caption words
// (_shared/verbatim.ts), and the passage_quotes trigger checks it again. A
// passage with no quote that passes is stored as null, so it is never sent to
// the model twice, and the app shows nothing for it.
// `at` is where to start playing: about 3 s before the quote's first word.

import { callerKey } from "../_shared/auth.ts";
import { admin, dbTimeout, envInt, rateLimit } from "../_shared/db.ts";
import { gate, json, readJson } from "../_shared/http.ts";
import { pickQuotes } from "../_shared/prompts.ts";
import { bestVerbatim, playFrom } from "../_shared/verbatim.ts";

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
  let q: string | undefined;
  if (body?.q !== undefined && body?.q !== null) {
    if (typeof body.q !== "string" || body.q.trim().length > 200) return json(req, 400, { error: "bad_query" });
    q = body.q.replace(/\s+/g, " ").trim() || undefined;
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
          { key: "quotes:all", max: envInt("QUOTES_GLOBAL_PER_HOUR", 120), windowSeconds: 3600 },
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
          picked = await pickQuotes(passages.map((p) => ({ id: String(p.id), text: p.text })), q, 20000);
        } catch (error) {
          // Nothing cached: the next request tries these passages again.
          log.model_error = String((error as Error)?.message ?? error);
        }
        if (picked) {
          const rows: CacheRow[] = [];
          let passed = 0;
          for (const p of passages) {
            const raw = picked.quotes.get(String(p.id));
            const m = raw ? bestVerbatim(raw, p.text) : null;
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
