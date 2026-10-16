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
 * still named in the label.
 */
export function seriesRowText(sermon: Sermon, seriesName: string | null) {
  const session = sermon.session ? sessionLabel(sermon.session) : null;
  const known = new Set([seriesName, sermon.event, sermon.session].flatMap(said));
  // A word of its own makes a title; a bare date ("06 08 2021") doesn't.
  const titled = said(headline(sermon)).some((word) => /[a-z]/.test(word) && !known.has(word));
  if (session && !titled) return { title: session, label: sermon.speaker };
  return {
    title: headline(sermon),
    label: [sermon.speaker, session].filter(Boolean).join(" · ") || null,
  };
}
