import { formatDay, formatDuration } from "../data/sermons";
import type { PathStatus, SearchSermon } from "./types";

/**
 * Words the path and search screens share, so every screen says the same
 * thing the same way, and drafts are never presented as the ministry's.
 */

/**
 * The line beside "Why this path". Only a published path may say the
 * ministry set its order; a draft says nothing (null), as the owner asked:
 * no "Draft" label anywhere.
 */
export function trustLine(status: PathStatus) {
  return status === "published"
    ? { text: "Order set by the ministry", icon: "shield-checkmark-outline" as const }
    : null;
}

/** "7 messages". */
export function messagesLabel(count: number) {
  return `${count} message${count === 1 ? "" : "s"}`;
}

/** "12 teachings": a teaching series' length. */
export function teachingsLabel(count: number) {
  return `${count} teaching${count === 1 ? "" : "s"}`;
}

/**
 * A path's sermons, whole, together, shown beside a clock: "12h"; under ten
 * hours "5h 30m"; under an hour "50m". It's only ever "about", so it's
 * rounded: to the hour from ten hours, to ten minutes under that, to five
 * under an hour. `spoken` says it in words: "About 12 hours".
 */
export function totalTime(seconds: number) {
  const minutes = Math.max(0, seconds) / 60;
  let h: number;
  let m: number;
  if (minutes < 57.5) {
    h = 0;
    m = Math.max(5, Math.round(minutes / 5) * 5);
  } else {
    const tens = Math.round(minutes / 10) * 10;
    h = tens < 600 ? Math.floor(tens / 60) : Math.round(minutes / 60);
    m = tens < 600 ? tens % 60 : 0;
  }
  const text = !h ? `${m}m` : m ? `${h}h ${m}m` : `${h}h`;
  const words = [h ? `${h} hour${h === 1 ? "" : "s"}` : "", m ? `${m} minutes` : ""].filter(Boolean);
  return { text, spoken: `About ${words.join(" ")}` };
}

/** "Day 3 of 7". */
export function dayOfLabel(day: number, total: number) {
  return `Day ${day} of ${total}`;
}

/** "2 of 7 done". */
export function doneLabel(done: number, total: number) {
  return `${done} of ${total} done`;
}

/** "29 Mar 2026 · 2 hr 16 min" for a search result's sermon. */
export function searchSermonMeta(sermon: Pick<SearchSermon, "preachedOn" | "publishedAt" | "durationSeconds">) {
  const date = formatDay(sermon.preachedOn ?? sermon.publishedAt.slice(0, 10));
  const length = formatDuration(sermon.durationSeconds);
  return length ? `${date} · ${length}` : date;
}

/** Thumbnail for a search sermon, falling back to YouTube's standard one. */
export function searchSermonArt(sermon: Pick<SearchSermon, "thumbnailUrl" | "youtubeId">) {
  return sermon.thumbnailUrl || `https://i.ytimg.com/vi/${sermon.youtubeId}/hqdefault.jpg`;
}
