import type { Sermon } from "./sermons";

/**
 * Editorial presentation, not source metadata. The short headline comes
 * from the catalogue (read from the YouTube title, or written by hand in
 * catalogue/editorial.ts); the exact title is kept, shown in the sermon's
 * details and still searched.
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
 * The line over or under a headline: who preached it when it wasn't Apostle
 * Arome Osayi alone, the event and which part of it, leaving out what the
 * headline already says ("Lioness Conference · Grand Finale"). With nothing
 * else to say, the venue. Empty when that leaves nothing: his name over
 * every such sermon would repeat down a list, so callers show no label (the
 * sermon page's byline names him instead).
 */
export function eventLine(sermon: Sermon) {
  const { lead, session } = eventParts(sermon);
  return session ? `${lead} · ${session}` : lead;
}

/**
 * The event line in two parts, for a kicker kept to one line: `lead` (who
 * preached and the event) gives way first, so `session` ("Day 2 Morning"),
 * which tells a gathering's sermons apart, always shows. `session` is null
 * when it's the whole line, or there's none.
 */
export function eventParts(sermon: Sermon): { lead: string; session: string | null } {
  const said = words(sermon.headline);
  const fresh = (text: string | null) => !!text && !said.includes(words(withoutYear(text)));
  const lead: string[] = [];
  if (sermon.speaker) lead.push(sermon.speaker);
  if (fresh(sermon.event)) lead.push(sermon.event!);
  const session = fresh(sermon.session) ? sermon.session! : null;
  if (!lead.length) return { lead: session ?? (fresh(sermon.venue) ? sermon.venue! : ""), session: null };
  return { lead: lead.join(" · "), session };
}
