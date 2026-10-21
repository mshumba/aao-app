import type { Sermon } from "../data/sermons";
import { messagesLabel } from "../learning/format";

/**
 * Home's words, in one place so the hero, the cards and their accessibility
 * labels say the same thing.
 */

const WEEK = 7 * 24 * 60 * 60 * 1000;
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** "morning" before noon, "afternoon" until five, then "evening". */
export function partOfDay(now = new Date()) {
  const hour = now.getHours();
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

/** "Good afternoon, Mufaro" (the first word of the name), or "Good afternoon". */
export function greeting(name: string | null | undefined, now = new Date()) {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Good ${partOfDay(now)}, ${first}` : `Good ${partOfDay(now)}`;
}

/** "27 Sep", with the year when it isn't this year ("27 Sep 2025"). */
export function shortDay(day: string, now = new Date()) {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  const base = `${d} ${MONTHS[m - 1]}`;
  return y === now.getFullYear() ? base : `${base} ${y}`;
}

/** Uploaded in the last seven days (the only time "New" may be said). */
export function isNewThisWeek(sermon: Pick<Sermon, "publishedAt">, now = Date.now()) {
  const at = Date.parse(sermon.publishedAt);
  return Number.isFinite(at) && now - at < WEEK && now - at > -WEEK;
}

/**
 * The hero's kicker: "New this week · 2 hr 8 min" for a sermon uploaded in
 * the last week; otherwise "Latest · 27 Sep · 3 hr 35 min" (nothing older
 * than a week is called new).
 */
export function heroKicker(sermon: Sermon, now = new Date()) {
  const lead = isNewThisWeek(sermon, now.getTime()) ? "New this week" : `Latest · ${shortDay(sermon.day, now)}`;
  return sermon.duration ? `${lead} · ${sermon.duration}` : lead;
}

/**
 * A conference or teaching series has at least this many sermons, wherever
 * one is listed (Home's rail, a sermon's "Part of a series", All sermons).
 */
export const SERIES_MIN = 2;

/** "22–23 Sep", "30 Sep – 2 Oct" or "27 Sep": the days a series' sermons span. */
export function seriesDays(sermons: Pick<Sermon, "day">[], now = new Date()) {
  const days = sermons.map((s) => s.day).filter(Boolean).sort();
  if (!days.length) return "";
  const first = days[0];
  const last = days[days.length - 1];
  if (first === last) return shortDay(first, now);
  const [fy, fm, fd] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  // "22–23 Sep" within one month; "30 Sep – 2 Oct" across two.
  return fy === ly && fm === lm
    ? `${fd}–${shortDay(last, now)}`
    : `${shortDay(first, now)} – ${shortDay(last, now)}`;
}

/**
 * "3 messages · 22–23 Sep": a series counted the way paths count theirs
 * (messagesLabel), the same on Home's cards, the series page and All sermons.
 */
export function seriesCaption(sermons: Pick<Sermon, "day">[], now = new Date()) {
  const count = messagesLabel(sermons.length);
  const days = seriesDays(sermons, now);
  return days ? `${count} · ${days}` : count;
}
