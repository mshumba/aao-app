import { formatDay, formatDuration } from "../data/sermons";
import type { Path, PathStatus, SearchSermon } from "./types";

/**
 * Words the path and search screens share, so every screen says the same
 * thing the same way, and drafts are never presented as the ministry's.
 */

/**
 * The line beside "Why this path". Only a published path may say the
 * ministry set its order; a draft says it is awaiting review.
 */
export function trustLine(status: PathStatus) {
  return status === "published"
    ? { text: "Order set by the ministry", icon: "shield-checkmark-outline" as const, tone: "accent" as const }
    : { text: "Draft · awaiting ministry review", icon: "shield-outline" as const, tone: "muted" as const };
}

/** "7 messages". */
export function messagesLabel(count: number) {
  return `${count} message${count === 1 ? "" : "s"}`;
}

/** "About 16 min a day". */
export function minutesPerDayLabel(path: Pick<Path, "minutesPerDay">) {
  return `About ${path.minutesPerDay} min a day`;
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
