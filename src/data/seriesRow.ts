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
