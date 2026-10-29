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
 * with no main points, or one that can't say who it's for, is one whose
 * transcript couldn't be read: no help to someone choosing a sermon. Its
 * summary keeps to the sermon, never the transcript (`aboutTheSermon`), and
 * shows nothing when it can't.
 */
export function cardShown(card: SermonCardData | null | undefined): ShownCard | null {
  if (!card) return null;
  if (card.forWhom.trim() && namesNoOne(card.forWhom)) return null;
  const summary = aboutTheSermon(card.summary);
  const points = card.mainPoints.map((point) => point.trim()).filter(Boolean);
  if (!summary || !points.length) return null;
  return {
    summary: curlyQuotes(summary),
    points: points.map(curlyQuotes),
    scriptures: card.scriptures
      .map((ref) => ref.trim())
      .filter(Boolean)
      .slice(0, SCRIPTURES_SHOWN),
    forWhom: forLine(card.forWhom),
  };
}

/**
 * Words about what was read rather than what he preached: the transcript,
 * its captions and the parts of the service they caught ("The captured
 * portion contains…", "Within the excerpts…", "no sermon is captured").
 * Not every "captured", though: "the captured ark" is the sermon's own.
 */
const ABOUT_TRANSCRIPT =
  /\b(transcript|captions?|(available|captured) (portions?|excerpts|passages)|portions? (provided|available)|(sampled|within the) excerpts|(no|any) (sermon|teaching|preaching) is captured|fragments of the (message|service) are captured)\b/i;

/**
 * The summary as a description of the sermon, or "" when it isn't one.
 * Some summaries say what the captions held ("The transcript ends as the
 * next minister is invited…"), which the whole video may well contradict.
 * An aside in brackets about them ("Elton (Pilton in the captions)") and
 * closing sentences about them are left out. A card that mentions them
 * anywhere else shows nothing, since what follows leans on that sentence
 * ("He…", "They…").
 */
function aboutTheSermon(text: string) {
  const summary = text
    .trim()
    .replace(/\s*\([^()]*\)/g, (aside) => (ABOUT_TRANSCRIPT.test(aside) ? "" : aside));
  if (!ABOUT_TRANSCRIPT.test(summary)) return summary;
  const kept = sentences(summary);
  while (kept.length && ABOUT_TRANSCRIPT.test(kept[kept.length - 1])) kept.pop();
  return kept.some((sentence) => ABOUT_TRANSCRIPT.test(sentence)) ? "" : kept.join(" ");
}

/** Titles whose full stop doesn't end a sentence: "Rev. Tony George preaches…". */
const TITLE_STOP = /\b(Rev|Pst|Dr|Mr|Mrs|Ms|Prof|St|Bro|Sis|Evang|Engr)\.$/;

/**
 * A summary's sentences: split after . ! or ? (and any closing quote or
 * bracket) and a space, but not after a title, nor before a word that
 * carries on the sentence (the question “Had God said?” to undermine…).
 */
function sentences(text: string) {
  const out: string[] = [];
  text
    .replace(/([.!?]["”’')]*)\s+/g, "$1\u0000")
    .split("\u0000")
    .forEach((piece) => {
      const last = out.length - 1;
      if (last >= 0 && (TITLE_STOP.test(out[last]) || /^[a-z]/.test(piece))) out[last] += ` ${piece}`;
      else out.push(piece);
    });
  return out;
}

/**
 * Straight quotes made curly, as in the app's own copy: a teaching titled
 * “The Seven Spirits of God”, God’s set time, Paul’s word ‘wrestle’. A
 * quote opens at the start, after a space or after an opening bracket, dash
 * or quote; any other is a closing quote or an apostrophe, as is one before
 * a digit (the October ’20 Contact). The cards' quotes always come in pairs.
 */
function curlyQuotes(text: string) {
  const opens = (before: string) => !before || /[\s([{–—“]/.test(before);
  return text
    .replace(/"/g, (_quote, at: number) => (opens(text[at - 1]) ? "“" : "”"))
    .replace(/'(?=\d)/g, "’")
    .replace(/'/g, (_quote, at: number, curled: string) => (opens(curled[at - 1]) ? "‘" : "’"));
}

/** A "who it's for" that names no one: "Not enough transcript to say…". */
function namesNoOne(text: string) {
  return /^(no|not|none|nobody|unclear|unknown)\b/i.test(text.trim());
}

/** First words that keep their capital after "For": "For Christian wives and mothers…". */
const KEEPS_CAPITAL = /^(Christian|Bible|Spirit|God|Jesus|Christ|Holy)\b/;

/**
 * Who it's for, as a sentence: "Believers who keep falling into the same
 * sin" → "For believers who keep falling into the same sin.". Null when the
 * card names no one ("Not determinable from this transcript…"), or talks
 * about the transcript ("…; the sermon itself is not in this transcript.").
 */
export function forLine(text: string): string | null {
  const line = text.trim().replace(/\s+/g, " ");
  if (!line || namesNoOne(line) || ABOUT_TRANSCRIPT.test(line)) return null;
  const keep = KEEPS_CAPITAL.test(line) || /^[A-Z]{2,}\b/.test(line);
  const who = keep ? line : line[0].toLowerCase() + line.slice(1);
  return curlyQuotes(`For ${who}${/[.!?]$/.test(who) ? "" : "."}`);
}
