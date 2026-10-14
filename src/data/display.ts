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
function words(text: string) {
  return ` ${text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/g, (w) => NUMBER_WORDS[w])
    .trim()} `;
}

const withoutYear = (name: string) => name.replace(/\s+(?:(?:19|20)\d\d|['’]\d\d)$/, "");

/**
 * The line under a headline: who preached it when it wasn't Apostle Arome
 * Osayi alone, the event and which part of it, leaving out what the headline
 * already says ("Lioness Conference · Grand Finale"). With nothing else to
 * say, the venue, then the channel.
 */
export function eventLine(sermon: Sermon) {
  const said = words(sermon.headline);
  const fresh = (text: string | null) => !!text && !said.includes(words(withoutYear(text)));
  const parts: string[] = [];
  if (sermon.speaker) parts.push(sermon.speaker);
  if (fresh(sermon.event)) parts.push(sermon.event!);
  if (fresh(sermon.session)) parts.push(sermon.session!);
  if (!parts.length && fresh(sermon.venue)) parts.push(sermon.venue!);
  return parts.join(" · ") || sermon.channel;
}
