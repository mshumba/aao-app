import { formatDay, formatDuration } from "../data/sermons";
import type { PathStatus, SearchSermon, SermonCard } from "./types";

/**
 * Words the path, search and sermon screens share, so every screen says the
 * same thing the same way, drafts are never presented as the ministry's and
 * a sermon's card never as the Apostle's words.
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

/** Straight quotation marks and apostrophes curled, as the app writes them. */
export function curlQuotes(text: string) {
  return text
    .replace(/(^|[\s([{—–-])"/g, "$1“")
    .replace(/"/g, "”")
    .replace(/(^|[\s([{—–-])'/g, "$1‘")
    .replace(/'/g, "’");
}

/** First words that keep their capital after "For": names, and the Spirit's. */
const NAMED = /^(?:Bible|Christ|Christians?|God|Jesus|Holy|Spirit|Remnant|Apostle|[A-Z]{2,})\b/;

/**
 * "For ministers and believers who …", when the card's line says who the
 * sermon is for plainly: only the part before a semicolon (after it come
 * the reader's asides, "not a teaching message"), and nothing when it says
 * no one can be pointed to it or talks about the transcript instead.
 */
export function forLine(forWhom: string) {
  const who = curlQuotes(forWhom.split(";")[0].trim().replace(/[.,:]+$/, ""));
  if (!who || /^(?:not|no|nobody|none|unclear|unknown)\b/i.test(who)) return null;
  if (/\b(?:transcripts?|captions?|excerpt|audio|video)\b/i.test(who)) return null;
  const start = NAMED.test(who) ? who : who[0].toLowerCase() + who.slice(1);
  return `For ${start}.`;
}

/**
 * A sermon's card as its page shows it, or null when it says nothing about
 * the sermon (the reader couldn't make out the transcript, so it found no
 * main points). The summary describes the sermon; show it as plain text,
 * never in quotation marks.
 */
export function cardText(card: SermonCard) {
  const summary = curlQuotes(card.summary.trim());
  const points = card.mainPoints.map((point) => curlQuotes(point.trim())).filter(Boolean);
  if (!summary || !points.length) return null;
  return {
    summary,
    points,
    scriptures: [...new Set(card.scriptures.map((ref) => ref.trim()).filter(Boolean))],
    forLine: forLine(card.forWhom),
  };
}

export type CardText = NonNullable<ReturnType<typeof cardText>>;
