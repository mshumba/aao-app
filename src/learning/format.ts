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

/** "About 18 hours in all": a path's sermons, whole, together. */
export function totalTimeLabel(seconds: number) {
  if (seconds < 3600) return `About ${Math.max(1, Math.round(seconds / 60))} min in all`;
  const hours = Math.round(seconds / 3600);
  return `About ${hours} hour${hours === 1 ? "" : "s"} in all`;
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
