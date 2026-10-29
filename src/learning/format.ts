import { formatDay, formatDuration } from "../data/sermons";
import type { PathStatus, SearchSermon, SermonCardData } from "./types";

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

/** "2 of 7 done". */
export function doneLabel(done: number, total: number) {
  return `${done} of ${total} done`;
}

/**
 * "29 Mar 2026 · 2 hr 16 min" for a search result's sermon, each part kept
 * whole on narrow phones (no-break spaces, as ui.tsx's nowrap(): importing
 * it here would bring React Native into the unit tests).
 */
export function searchSermonMeta(sermon: Pick<SearchSermon, "preachedOn" | "publishedAt" | "durationSeconds">) {
  const date = formatDay(sermon.preachedOn ?? sermon.publishedAt.slice(0, 10));
  const length = formatDuration(sermon.durationSeconds);
  return [date, length]
    .filter(Boolean)
    .map((part) => part.replace(/ /g, " "))
    .join(" · ");
}

/** What a sermon's page shows of its card. */
export type ShownCard = { summary: string; points: string[]; scriptures: string[]; forWhom: string | null };

/** The most scriptures a page lists (the most central come first). */
const SCRIPTURES_SHOWN = 8;

/**
 * What a sermon's page shows of its card, or null to show nothing. A card
 * with no main points is one whose transcript couldn't be read, and its
 * summary only says so: no help to someone choosing a sermon.
 */
export function cardShown(card: SermonCardData | null | undefined): ShownCard | null {
  if (!card) return null;
  const summary = card.summary.trim();
  const points = card.mainPoints.map((point) => point.trim()).filter(Boolean);
  if (!summary || !points.length) return null;
  return {
    summary,
    points,
    scriptures: card.scriptures
      .map((ref) => ref.trim())
      .filter(Boolean)
      .slice(0, SCRIPTURES_SHOWN),
    forWhom: forLine(card.forWhom),
  };
}

/** First words that keep their capital after "For": "For Christian wives and mothers…". */
const KEEPS_CAPITAL = /^(Christian|Bible|Spirit|God|Jesus|Christ|Holy)\b/;

/**
 * Who it's for, as a sentence: "Believers who keep falling into the same
 * sin" → "For believers who keep falling into the same sin.". Null when the
 * card names no one ("Not determinable from this transcript…").
 */
export function forLine(text: string): string | null {
  const line = text.trim().replace(/\s+/g, " ");
  if (!line || /^(no|not|none|nobody|unclear|unknown)\b/i.test(line)) return null;
  const keep = KEEPS_CAPITAL.test(line) || /^[A-Z]{2,}\b/.test(line);
  const who = keep ? line : line[0].toLowerCase() + line.slice(1);
  return `For ${who}${/[.!?]$/.test(who) ? "" : "."}`;
}
