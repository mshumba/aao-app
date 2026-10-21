// video-ready: marks sermons whose own video is ready to stream from R2.
//
//   POST {}  (publishable key)  -> {"ok": true}
//
// For every sermon still marked not ready, asks R2's public address for its
// HLS playlist (https://audio.aaolearning.com/video/<youtube_id>/master.m3u8)
// and sets public.sermons.video_ready_at for each one that answers. Apps from
// version 0.2.0 list only sermons with it set, so uploads appear as the video
// pipeline finishes them. A pg_cron job calls it every 10 minutes (see
// supabase/migrations/20261021000100_sermon_video_ready.sql and
// supabase/functions/README.md); the answer says nothing, the log has the
// counts. Asking R2 needs no keys: the playlists are public.

import { callerKey } from "../_shared/auth.ts";
import { admin, dbTimeout, rateLimit, withRetry } from "../_shared/db.ts";
import { gate, json } from "../_shared/http.ts";

const BASE = (Deno.env.get("VIDEO_BASE_URL") ?? "https://audio.aaolearning.com/video").replace(/\/+$/, "");
/** Playlists asked for at once, and how long one may take. */
const CONCURRENCY = 16;
const ASK_TIMEOUT_MS = 8000;
/** The API returns at most this many rows a request, so longer lists are read in pages. */
const PAGE = 1000;
/** Runs an hour, per caller and in all. The cron job needs six. */
const RATE_MAX = 8;
const GLOBAL_MAX = 24;

/** How R2 answered this run, for the log: status code (or "failed") to count. */
const answers: Record<string, number> = {};

/** True when R2 serves the sermon's playlist. A refused or slow answer is asked once more. */
async function onR2(youtubeId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let status = "failed";
    try {
      const res = await fetch(`${BASE}/${youtubeId}/master.m3u8`, {
        method: "HEAD",
        signal: AbortSignal.timeout(ASK_TIMEOUT_MS),
      });
      status = String(res.status);
      if (res.ok || res.status === 404) {
        answers[status] = (answers[status] ?? 0) + 1;
        return res.ok;
      }
    } catch {
      // Timed out or the connection failed: ask again below.
    }
    answers[status] = (answers[status] ?? 0) + 1;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

/** Path-day sermons first, so the guided paths are ready soonest. */
function pathDaysFirst(ids: string[], first: Set<string>): string[] {
  return [...ids.filter((id) => first.has(id)), ...ids.filter((id) => !first.has(id))];
}

/** Runs `check` over `ids`, `CONCURRENCY` at a time; returns the ids it's true for. */
async function found(ids: string[], check: (id: string) => Promise<boolean>): Promise<string[]> {
  const out: string[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, ids.length) }, async () => {
      while (next < ids.length) {
        const id = ids[next++];
        if (await check(id)) out.push(id);
      }
    }),
  );
  return out;
}

Deno.serve(async (req) => {
  const t0 = performance.now();
  for (const key of Object.keys(answers)) delete answers[key];
  const blocked = gate(req);
  if (blocked) return blocked;
  const log: Record<string, unknown> = { fn: "video-ready" };
  const answer = (status: number, out: unknown) => {
    log.status = status;
    log.ms = Math.round(performance.now() - t0);
    (status >= 500 ? console.error : console.log)(JSON.stringify(log));
    return json(req, status, out);
  };

  try {
    const rate = await rateLimit([
      { key: await callerKey(req, "video-ready"), max: RATE_MAX, windowSeconds: 3600 },
      { key: "video-ready:all", max: GLOBAL_MAX, windowSeconds: 3600 },
    ]);
    if (!rate.ok) return answer(429, { error: "rate_limited", retryAfter: rate.retryAfter });

    const db = admin();
    const unready: string[] = [];
    for (let from = 0;; from += PAGE) {
      const { data, error } = await withRetry(() =>
        db.from("sermons").select("youtube_id").is("video_ready_at", null)
          .order("youtube_id").range(from, from + PAGE - 1).abortSignal(dbTimeout(10_000))
      );
      if (error) throw new Error(`sermons: ${error.code ?? error.message}`);
      unready.push(...(data ?? []).map((r: { youtube_id: string }) => r.youtube_id));
      if (!data || data.length < PAGE) break;
    }
    const days = await withRetry(() => db.from("path_days").select("youtube_id").abortSignal(dbTimeout(10_000)));
    if (days.error) throw new Error(`path_days: ${days.error.code ?? days.error.message}`);
    const ids = pathDaysFirst(unready, new Set((days.data ?? []).map((r: { youtube_id: string }) => r.youtube_id)));
    const ready = await found(ids, onR2);
    for (let k = 0; k < ready.length; k += 200) {
      const { error: updateError } = await withRetry(() =>
        db.from("sermons").update({ video_ready_at: new Date().toISOString() })
          .in("youtube_id", ready.slice(k, k + 200)).is("video_ready_at", null).abortSignal(dbTimeout(10_000))
      );
      if (updateError) throw new Error(`update: ${updateError.code ?? updateError.message}`);
    }
    Object.assign(log, { unready: unready.length, checked: ids.length, marked: ready.length, answers });
    return answer(200, { ok: true });
  } catch (error) {
    log.error = error instanceof Error ? error.message : String(error);
    return answer(500, { error: "failed" });
  }
});
