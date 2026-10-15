import type { Href } from "expo-router";
import type { WatchProgress } from "../auth/types";
import { durationText, leftText, parseDuration, splitItalic, spokenText, type ArtSource } from "../kit";
import type { Path, PathDayWithSermon } from "../learning";
import { messagesLabel, teachingsLabel } from "../learning/format";
import { resumePoint } from "../player/progress";

/**
 * How the path screens describe days, times and artwork, kept apart from
 * the components so the Paths tab, the path page and its sheets all say the
 * same thing the same way. A day plays its whole sermon, so every time here
 * is the sermon's: "2 hr 16 min", "48 min left".
 */

export type DayTiming = {
  /** The sermon's length in seconds, or null while it isn't known. */
  length: number | null;
  /** 0 to 1: how far through the sermon. */
  partial: number;
  /** Where the viewer left off (0: the beginning). The player resumes there itself. */
  resumeAt: number;
  started: boolean;
  /** "48 min left", or the whole length ("2 hr 16 min"); empty while it isn't known. */
  meta: string;
  /** The same in words: "48 minutes left". */
  spokenMeta: string;
  /** After a dot on the call to action: the same as `meta`. */
  detail: string;
};

/** A sermon's length: the saved one (exact) or the catalogue's ("2 hr 16 min"). */
export function sermonLength(day: PathDayWithSermon, watch?: WatchProgress | null) {
  return watch?.durationSeconds || parseDuration(day.sermon?.duration) || null;
}

/**
 * Where someone is in a day's sermon, from their saved place (members
 * only; guests start from the beginning). A sermon watched to the end (or
 * never started) reads as its whole length and starts over.
 */
export function dayTiming(day: PathDayWithSermon, watch: WatchProgress | null | undefined): DayTiming {
  const length = sermonLength(day, watch);
  const at = resumePoint(watch ?? null);
  if (at > 0 && length && at < length) {
    const left = leftText(length - at);
    return {
      length,
      partial: at / length,
      resumeAt: at,
      started: true,
      meta: left,
      spokenMeta: spokenText(left),
      detail: left,
    };
  }
  const whole = length ? durationText(length) : "";
  return { length, partial: 0, resumeAt: 0, started: false, meta: whole, spokenMeta: spokenText(whole), detail: whole };
}

/** The path's sermons, whole, together (seconds); null until every one is known. */
export function pathLength(days: readonly PathDayWithSermon[]) {
  let total = 0;
  for (const d of days) {
    const length = sermonLength(d);
    if (!length) return null;
    total += length;
  }
  return days.length ? total : null;
}

/**
 * How a guided path or a teaching series names itself and its days: "Day 3
 * of 7" on a path, "Teaching 3 of 12" in a series.
 */
export function pathWords(path: Pick<Path, "kind">) {
  const series = path.kind === "series";
  return {
    series,
    /** "Day" or "Teaching". */
    unit: series ? "Teaching" : "Day",
    /** "Guided path" or "Teaching series". */
    kind: series ? "Teaching series" : "Guided path",
    /** "path" or "series", in sentences ("Your path", "Why this series"). */
    noun: series ? "series" : "path",
    /** "7 messages" or "12 teachings". */
    count: (n: number) => (series ? teachingsLabel(n) : messagesLabel(n)),
  };
}

/** A series of one teaching has no page of its own: it opens the teaching. */
export function isSingleTeaching(path: Pick<Path, "kind">, total: number) {
  return path.kind === "series" && total === 1;
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
 * A day's sermon page. With the path, the page knows it's a day of this
 * path (finishing it marks the day done); without it, it's an ordinary
 * visit ("Open anyway"). No `at`: the sermon resumes where the viewer left
 * off, else plays from the beginning; `at` is for a single moment ("Key
 * moment 53:44").
 */
export function sermonHref(youtubeId: string, opts: { path?: { id: string; day: number }; at?: number } = {}): Href {
  const params: Record<string, string> = { id: youtubeId };
  if (opts.at != null) params.t = String(Math.max(0, Math.floor(opts.at)));
  if (opts.path) {
    params.path = opts.path.id;
    params.day = String(opts.path.day);
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

/** "Day 1 · Lay aside every weight", the timeline's kicker for a day ("Teaching 1 · …" in a series). */
export function dayKicker(
  day: number,
  state: DayState,
  theme: string,
  opts: { enrolled: boolean; locked: boolean; unit?: string },
) {
  const unit = opts.unit ?? "Day";
  if (state === "today") return `${unit} ${day} · ${opts.enrolled ? (unit === "Day" ? "Today" : "Next") : "Start here"}`;
  if (state === "upcoming" && opts.locked) return `${unit} ${day} · Opens after ${unit} ${day - 1}`;
  return `${unit} ${day} · ${theme}`;
}
