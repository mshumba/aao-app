import type { Href } from "expo-router";
import { firstParam } from "../navigation";

/**
 * What a link to a sermon can ask of its page, besides the sermon itself:
 *
 * - `t`: start here (seconds). The play button reads "Play from 34:12".
 * - `from=search` with `q`: opened from "What are you going through?"; the
 *   band shows "From your search: …" for six seconds, and the search
 *   moment gets its own tick. A "Play from" tap there plays at once.
 * - `path` and `day`: opened as a day of a path. The band shows the day's
 *   focus in gold, Play starts at the focus, and reaching its end marks the
 *   day done.
 * - `play=1`: start playing as soon as the page has settled.
 */
export type SermonLink = {
  t?: number | null;
  from?: "search" | "path" | "share" | null;
  q?: string | null;
  path?: string | null;
  day?: number | null;
  play?: boolean;
};

export type SermonParams = {
  t: number | null;
  from: "search" | "path" | "share" | null;
  q: string | null;
  path: string | null;
  day: number | null;
  play: boolean;
};

type Raw = Record<string, string | string[] | undefined>;

/** "2052", "34:12" or "1:05:12" → seconds; null when it isn't a time. */
export function parseTime(value?: string | null) {
  if (!value) return null;
  const text = value.trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Math.floor(Number(text));
  const clock = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(text);
  if (clock) return Number(clock[1] ?? 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
  // YouTube's own "1h5m12s" / "312s".
  const yt = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(text);
  if (yt && (yt[1] || yt[2] || yt[3]))
    return Number(yt[1] ?? 0) * 3600 + Number(yt[2] ?? 0) * 60 + Number(yt[3] ?? 0);
  return null;
}

/** The page's parameters, read defensively (links can repeat or mangle them). */
export function readSermonParams(raw: Raw): SermonParams {
  const t = parseTime(firstParam(raw.t));
  const from = firstParam(raw.from);
  const q = firstParam(raw.q)?.trim().replace(/\s+/g, " ").slice(0, 200) || null;
  const path = firstParam(raw.path)?.trim() || null;
  const dayText = firstParam(raw.day);
  const day = dayText && /^\d{1,3}$/.test(dayText) ? Number(dayText) : null;
  const play = ["1", "true", "yes"].includes(firstParam(raw.play) ?? "");
  return {
    t: t != null && t >= 0 ? t : null,
    from: from === "search" || from === "path" || from === "share" ? from : null,
    q,
    path,
    day: day && day > 0 ? day : null,
    play,
  };
}

/**
 * A link to a sermon's page. For example, a search result's "Play from":
 * `sermonHref(id, { t: 6747, from: "search", q, play: true })`, or a path
 * day: `sermonHref(day.youtubeId, { path: path.id, day: day.day, play: true })`.
 */
export function sermonHref(id: string, link: SermonLink = {}): Href {
  const params: Record<string, string> = { id };
  if (link.t != null && link.t >= 0) params.t = String(Math.floor(link.t));
  if (link.from) params.from = link.from;
  if (link.q) params.q = link.q;
  if (link.path) params.path = link.path;
  if (link.day != null) params.day = String(link.day);
  if (link.play) params.play = "1";
  return { pathname: "/sermon/[id]", params } as Href;
}
