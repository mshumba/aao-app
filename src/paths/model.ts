import type { Href } from "expo-router";
import type { WatchProgress } from "../auth/types";
import { clockText, leftText, splitItalic, spokenText, spokenTime, type ArtSource } from "../kit";
import type { PathDay, PathDayWithSermon } from "../learning";

/**
 * How the path screens describe days, times and artwork, kept apart from
 * the components so the Paths tab, the path page and its sheets all say the
 * same thing the same way.
 */

/** Seconds into a day's focus before "48 min left" replaces "16-min focus from 1:21:14". */
const STARTED_AFTER = 15;
/** Within this of the focus end, the day is as good as watched. */
const ENDED_WITHIN = 10;

export type DayTiming = {
  /** The focus segment's length in whole minutes (at least 1). */
  minutes: number;
  /** 0 to 1: how far through the focus segment. */
  partial: number;
  /** Where playing this day starts: inside the focus where they left off, else its start. */
  resumeAt: number;
  started: boolean;
  /** "48 min left" or "16-min focus from 1:21:14". */
  meta: string;
  /** The same in words: "16-minute focus from 1 hour 21 minutes 14 seconds". */
  spokenMeta: string;
  /** After a dot on the call to action: "48 min left" or "16 min". */
  detail: string;
};

/**
 * Where someone is in a day's focus segment, from the sermon's saved
 * position (members only; guests always start at the focus).
 */
export function dayTiming(day: PathDay, watch: WatchProgress | null | undefined): DayTiming {
  const length = Math.max(1, day.focusEnd - day.focusStart);
  const minutes = Math.max(1, Math.round(length / 60));
  const at = watch && !watch.finished ? watch.positionSeconds : null;
  if (at != null && at >= day.focusStart + STARTED_AFTER && at < day.focusEnd - ENDED_WITHIN) {
    const left = leftText(day.focusEnd - at);
    return {
      minutes,
      partial: (at - day.focusStart) / length,
      resumeAt: Math.floor(at),
      started: true,
      meta: left,
      spokenMeta: spokenText(left),
      detail: left,
    };
  }
  return {
    minutes,
    partial: 0,
    resumeAt: day.focusStart,
    started: false,
    meta: `${minutes}-min focus from ${clockText(day.focusStart)}`,
    spokenMeta: `${minutes}-minute focus from ${spokenTime(day.focusStart)}`,
    detail: `${minutes} min`,
  };
}

/** A day's artwork: its sermon, or YouTube's own copy while the library syncs. */
export function artOf(day: PathDayWithSermon): ArtSource {
  return day.sermon ?? { id: day.youtubeId };
}

/**
 * The sermon's headline, never edited. While the library is still syncing
 * (`settled` false) it's pending, and the row holds the line with a sand
 * bar; only a settled library may say the message isn't in it.
 */
export function dayTitle(day: PathDayWithSermon, settled: boolean) {
  if (day.sermon) return { text: day.sermon.headline, pending: false };
  return settled
    ? { text: "This message isn’t in the library yet", pending: false }
    : { text: "Loading this message", pending: true };
}

/**
 * A path's fan: `front` (today's day, or Day 1) in front, then the path's
 * other sermons in order behind it, each sermon once.
 */
export function fanFor(days: readonly PathDayWithSermon[], front: number): ArtSource[] {
  const first = days.find((d) => d.day === front);
  const order = first ? [first, ...days.filter((d) => d !== first)] : [...days];
  const seen = new Set<string>();
  const out: ArtSource[] = [];
  for (const d of order) {
    if (seen.has(d.youtubeId)) continue;
    seen.add(d.youtubeId);
    out.push(artOf(d));
    if (out.length === 3) break;
  }
  return out;
}

export type DayState = "done" | "today" | "upcoming";

/** Done days, today (the first not done) and the days still to come. */
export function stateOf(day: number, done: readonly number[], today: number | null): DayState {
  if (done.includes(day)) return "done";
  if (day === today) return "today";
  return "upcoming";
}

/**
 * Opens a day's sermon at `at`. With the path, the sermon page knows it's a
 * day of this path (it marks the day done at the focus end); without it,
 * it's an ordinary visit ("Open anyway", "Keep listening").
 */
export function sermonHref(youtubeId: string, at: number, path?: { id: string; day: number }): Href {
  const params: Record<string, string> = { id: youtubeId, t: String(Math.max(0, Math.floor(at))) };
  if (path) {
    params.path = path.id;
    params.day = String(path.day);
  }
  return { pathname: "/sermon/[id]", params } as unknown as Href;
}

export function pathHref(id: string): Href {
  return { pathname: "/path/[id]", params: { id } } as unknown as Href;
}

/**
 * Whether a cover title can start its italic phrase on a new line, as the
 * concept sets "Breaking free from / *habitual* sin": only when something
 * comes before the phrase.
 */
export function breaksBeforeItalic(name: string, italic: string | null | undefined) {
  const parts = splitItalic(name, italic);
  return !!parts.italic && parts.before.trim().length > 0;
}

/** "Day 1 · Lay aside every weight", the timeline's kicker for a day. */
export function dayKicker(day: number, state: DayState, theme: string, opts: { enrolled: boolean; locked: boolean }) {
  if (state === "today") return `Day ${day} · ${opts.enrolled ? "Today" : "Start here"}`;
  if (state === "upcoming" && opts.locked) return `Day ${day} · Opens after Day ${day - 1}`;
  return `Day ${day} · ${theme}`;
}
