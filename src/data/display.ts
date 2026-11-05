import type { Sermon } from "./sermons";

/**
 * Editorial presentation, not source metadata. The short headline comes
 * from the catalogue (read from the YouTube title, or written by hand in
 * catalogue/editorial.ts); the exact title is kept and still searched.
 */

/** The short headline. */
export function headline(sermon: Sermon) {
  return sermon.headline || sermon.title;
}

const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7",
  eight: "8", nine: "9", ten: "10",
};

/** Lowercase words with number words as digits, for "is it already said?". */
export function words(text: string) {
  return ` ${text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/g, (w) => NUMBER_WORDS[w])
    .trim()} `;
}

const withoutYear = (name: string) => name.replace(/\s+(?:(?:19|20)\d\d|['’]\d\d)$/, "");

/**
 * What a sermon page's About tab says of where it's from: who preached it
 * when it wasn't Apostle Arome Osayi alone, the event and which part of it,
 * leaving out what the headline already says ("Lioness Conference · Grand
 * Finale"). With nothing else to say, the venue. Empty when that leaves
 * nothing (see SermonDescription).
 */
export function eventLine(sermon: Sermon) {
  const fresh = unsaid(sermon);
  const parts = [sermon.speaker, fresh(sermon.event), fresh(sermon.session)].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return fresh(sermon.venue) ?? "";
}

/**
 * The gold line over a sermon in a list (and the grey one under it in
 * search and onboarding): who preached it when it wasn't Apostle Arome
 * Osayi alone, and which part of an event it was ("Day 2 Morning"), which
 * tells a gathering's look-alike sermons apart. The event, service, church
 * and venue are left out: they don't help anyone choose. Empty when that
 * leaves nothing: his name over every such sermon would repeat down a
 * list, so callers show no label (the sermon page's byline names him).
 */
export function sermonKicker(sermon: Sermon) {
  const { lead, session } = kickerParts(sermon);
  return session ? `${lead} · ${session}` : lead;
}

/**
 * The kicker in two parts, for a line kept to one line beside artwork:
 * `lead` (who preached) gives way first, so `session` ("Day 2 Morning")
 * always shows. `session` is null when it's the whole line, or there's none.
 */
export function kickerParts(sermon: Sermon): { lead: string; session: string | null } {
  const session = unsaid(sermon)(sermon.session);
  if (!sermon.speaker) return { lead: session ?? "", session: null };
  return { lead: sermon.speaker, session };
}

/** The text, unless the headline already says it (a year aside); else null. */
function unsaid(sermon: Sermon) {
  const said = words(sermon.headline);
  return (text: string | null) => (text && !said.includes(words(withoutYear(text))) ? text : null);
}
