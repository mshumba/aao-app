import { MONTHS, WEEKDAYS } from "../lib/dates";
import { headline, words } from "./display";
import type { Sermon } from "./sermons";

/** "Day 4 Morning" → "Day 4 · Morning"; "Day 1" and "Grand Finale" as they are. */
export function sessionLabel(session: string) {
  return session.replace(/^(Day \d+)\s+(?=\S)/i, "$1 · ");
}

const said = (text: string | null) => (text ? words(text).trim().split(" ") : []);

/**
 * A sermon's row on its series' page, where the page's title already names
 * the series and event, so the rows don't repeat them. A headline that only
 * says the series, event or session again ("Cameroon for Jesus", "IEC: Day
 * 2 Evening") gives way to the session, "Day 4 · Morning"; a real message
 * title stays, with the session as its small label. A guest preacher is
 * still named in the label. `shared` is what the series' rows all say (see
 * seriesRows).
 */
export function seriesRowText(sermon: Sermon, seriesName: string | null, shared: readonly string[] = []) {
  const session = sermon.session ? sessionLabel(sermon.session) : null;
  const known = new Set([seriesName, sermon.event, sermon.session, ...shared].flatMap(said));
  // A word of its own makes a title; a bare date ("06 08 2021") doesn't.
  const titled = said(headline(sermon)).some((word) => /[a-z]/.test(word) && !known.has(word));
  if (session && !titled) return { title: session, label: sermon.speaker };
  return {
    title: headline(sermon),
    label: [sermon.speaker, session].filter(Boolean).join(" · ") || null,
  };
}

/**
 * A series' rows, in its order. A headline on half or more of them (two at
 * least) is the gathering's theme, not a message's title, so its words count
 * as the series' own: IEC 2024 put "The Life of Prayer" on 12 of its 14
 * sessions, which read "Day 2 · Evening", and "Hospital Dedication" keeps its
 * title. Unless its rows would then read as another message does: Operation
 * Nigeria 2022's "Night Watch" after each day's session isn't a theme.
 */
export function seriesRows(list: readonly Sermon[], seriesName: string | null) {
  const texts = list.map((sermon) => words(headline(sermon)));
  const counts = new Map<string, number>();
  for (const text of texts) counts.set(text, (counts.get(text) ?? 0) + 1);
  const themes = [...counts].filter(([, n]) => n > 1 && n * 2 >= list.length).map(([text]) => text);
  const rows = list.map((sermon) => ({ sermon, ...seriesRowText(sermon, seriesName, themes) }));
  const others = new Set(rows.filter((_, i) => !themes.includes(texts[i])).map((row) => row.title));
  const clash = rows.some((row, i) => themes.includes(texts[i]) && others.has(row.title));
  return clash ? list.map((sermon) => ({ sermon, ...seriesRowText(sermon, seriesName) })) : rows;
}

// ---- A gathering, by day -------------------------------------------------------------

/** "Day 2 Evening" → its day, "Day 2", and the rest, "Evening"; "Grand Finale" has no day. */
export function splitSession(session: string) {
  const match = session.match(/^(Day \d+)\b\s*(.*)$/i);
  return match ? { day: match[1], rest: match[2].trim() } : { day: null, rest: session.trim() };
}

/**
 * "2024-05-21" → "Tue 21 May", or "Tuesday 21 May" to be read aloud. No
 * year: the cover's dates give it.
 */
export function sessionDate(day: string, long = false) {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const month = MONTHS[m - 1];
  return long ? `${weekday} ${d} ${month}` : `${weekday.slice(0, 3)} ${d} ${month.slice(0, 3)}`;
}

export type SessionRow = {
  sermon: Sermon;
  /**
   * Under a day: "Morning", "Grand Finale", a message's own title
   * ("Hospital Dedication"), or for the day's one plain session the session
   * as the event names it ("Day 1"). Without days: the session whole, "Day
   * 2 · Evening" (as seriesRows).
   */
  title: string;
  /** A guest preacher, and the time of day under a message's own title. */
  label: string | null;
};

export type SessionDay = {
  /** "Day 2"; null for a session not named by its day ("Grand Finale" on a day of its own). */
  day: string | null;
  /**
   * The day it was preached (YYYY-MM-DD), else the day it went up when that
   * keeps the days in order (see datedByUpload); null when neither does.
   */
  date: string | null;
  /** `date` is the upload's, not a preached date. */
  uploaded?: boolean;
  rows: SessionRow[];
};

/** A gathering: every one of its sermons is a session ("Day 2 Evening", "Grand Finale"). */
export function isGathering(list: readonly Sermon[]) {
  return list.length > 0 && list.every((sermon) => !!sermon.session);
}

/**
 * A gathering's sessions by day, in the series' order (IEC 2024: "Day 2"
 * with its Morning and Evening). A session named by its day joins the day
 * before it when that's the same day ("Day 7 Morning" twice, a run's Day 1
 * apart from the next run's); one that isn't ("Grand Finale") joins the day
 * it was preached on, else has its own. Under a day a session reads as its
 * time of day; a real message title stays, its time of day under it; a
 * day's one plain session reads as the event named it ("Day 1", not a
 * placeholder "Message"); and sessions that would read alike are told
 * apart in order ("Evening · Part 2"). A day with no preached date shows
 * the day it went up, when that sits between its neighbours' dates.
 *
 * `grouped` is false when no day has more than one session: the rows then
 * read as their whole session ("Day 3", as seriesRows has them), each with
 * its date, and the page draws no day headings.
 */
export function sessionDays(list: readonly Sermon[], seriesName: string | null) {
  const days: SessionDay[] = [];
  const whole: SessionRow[][] = [];
  for (const row of seriesRows(list, seriesName)) {
    const { sermon } = row;
    const session = sermon.session ?? "";
    const { day, rest } = splitSession(session);
    const titled = row.title !== sessionLabel(session);
    const under: SessionRow = titled
      ? { sermon, title: row.title, label: [sermon.speaker, rest].filter(Boolean).join(" · ") || null }
      : { sermon, title: rest, label: row.label };
    const last = days[days.length - 1];
    const joins = !!last && (day ? last.day === day : last.rows[0].sermon.day === sermon.day);
    if (joins) {
      last.rows.push(under);
      whole[whole.length - 1].push(row);
      if (!last.date && sermon.preached) last.date = sermon.day;
    } else {
      days.push({ day, date: sermon.preached ? sermon.day : null, rows: [under] });
      whole.push([row]);
    }
  }
  datedByUpload(days);
  const grouped = days.some((d) => d.rows.length > 1);
  if (!grouped) return { grouped, days: days.map((d, i) => ({ ...d, rows: whole[i] })) };
  for (const d of days) {
    const counts = new Map<string, number>();
    for (const row of d.rows) counts.set(row.title, (counts.get(row.title) ?? 0) + 1);
    const seen = new Map<string, number>();
    d.rows = d.rows.map((row) => {
      if (counts.get(row.title)! < 2)
        return row.title ? row : { ...row, title: sessionLabel(row.sermon.session ?? "") || "Message" };
      const n = (seen.get(row.title) ?? 0) + 1;
      seen.set(row.title, n);
      return { ...row, title: row.title ? `${row.title} · Part ${n}` : `Part ${n}` };
    });
  }
  return { grouped, days };
}

/**
 * A day with no preached date (Cameroon 2026's Day 2) shows the day its
 * first session went up, in the same "Thu 1 Oct": honest, as it's that
 * day's own upload, and usually the day itself for a livestream. Only when
 * it sits after the day before's date and before the next's; an upload
 * that came late would put the days out of order, so that day shows none.
 */
function datedByUpload(days: SessionDay[]) {
  days.forEach((d, i) => {
    if (d.date) return;
    // With no preached date, a sermon's day is its upload's.
    const up = d.rows[0]?.sermon.day;
    if (!up) return;
    const before = days.slice(0, i).reverse().find((x) => x.date)?.date;
    const after = days.slice(i + 1).find((x) => x.date)?.date;
    if ((before && up <= before) || (after && up >= after)) return;
    d.date = up;
    d.uploaded = true;
  });
}
