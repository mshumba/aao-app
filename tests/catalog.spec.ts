import { expect, test } from "@playwright/test";
import { editorialHeadlines } from "../src/catalogue/editorial";
import { parseTitle } from "../src/catalogue/parseTitle";
import { eventLine, eventParts, headline } from "../src/data/display";
import {
  fromTopics,
  relatedSermons,
  sampleRecords,
  sampleSermons as sermons,
  searchSermons,
  sermonCategoryIds,
  sermonsInTopic,
  seriesRails,
  toSermon,
  type SermonTopic,
} from "../src/data/sermons";
import { fixtureTopics } from "../src/learning/fixtures";

// Verified on 30 September 2026 against public ministry links and YouTube.
// Interface changes must never alter these strings.
const verifiedTitles = [
  "LIONESS CONFERENCE || PRAY WITHOUT CEASING || GRAND FINALE || 27TH SEPTEMBER 2026",
  "APOSTOLIC SHIFT | GRAND FINALE | Apostle Arome Osayi LIVE | The Votage | 23/09/26",
  "APOSTOLIC SHIFT | DAY TWO MORNING | Apostle Arome Osayi LIVE | The Votage | 23/09/26",
  "APOSTOLIC SHIFT | DAY ONE | Apostle Arome Osayi LIVE | The Votage | 22/09/26",
];

test("bundled sample keeps the verified source metadata, with exact titles", () => {
  expect(sermons.map((s) => s.title)).toEqual(verifiedTitles);
  expect(new Set(sermons.map((s) => s.id)).size).toBe(sermons.length);
  expect(sermons.map((s) => [s.date, s.duration])).toEqual([
    ["27 Sep 2026", "3 hr 35 min"],
    ["23 Sep 2026", "2 hr 28 min"],
    ["23 Sep 2026", "2 hr 49 min"],
    ["22 Sep 2026", "1 hr 47 min"],
  ]);
  for (const sermon of sermons) {
    expect(sermon.source).toBe(`https://www.youtube.com/watch?v=${sermon.id}`);
    expect(sermon.thumbnail).toContain(sermon.id);
  }
});

test("the bundled sample is what the import writes for the same videos", () => {
  // The fields read from the title come from the same parser the import
  // uses, with the hand-written headlines on top, so offline and online agree.
  for (const record of sampleRecords) {
    const parsed = parseTitle(record.title, record.published_at);
    expect(record).toMatchObject({
      headline: editorialHeadlines[record.youtube_id] ?? parsed.headline,
      event: parsed.event,
      series_key: parsed.seriesKey,
      part: parsed.part,
      session: parsed.session,
      speaker: parsed.speaker,
      venue: parsed.venue,
      preached_on: parsed.preachedOn,
    });
  }
});

test("the bundled sample carries its real topics, apart from the record", () => {
  const ids = fixtureTopics.map((t) => t.id);
  expect(new Set(ids).size).toBe(8);
  // As public.sermon_topics has them: one topic a sermon, and the Grand
  // Finale has none.
  expect(sermons.map((s) => [s.id, sermonCategoryIds(s)])).toEqual([
    ["nUW8NT2Pe88", ["prayer"]],
    ["H9sRbSUt0YE", []],
    ["yUDzMcZsVk8", ["purpose-calling"]],
    ["WYiA7rjenVI", ["purpose-calling"]],
  ]);
  for (const sermon of sermons) for (const id of sermonCategoryIds(sermon)) expect(ids).toContain(id);
  // Topics live in public.sermon_topics, never on the catalogue record.
  for (const record of sampleRecords)
    expect(Object.keys(record).join()).not.toMatch(/categor|topic|tag/);
});

const tagged = (id: string, topic: SermonTopic | null, seconds = 3600) =>
  toSermon({ ...sampleRecords[3], youtube_id: id, duration_seconds: seconds }, null, topic);

test("a topic lists its sermons, the best match first", () => {
  expect(sermonsInTopic(sermons, "purpose-calling").map((s) => s.id)).toEqual(["yUDzMcZsVk8", "WYiA7rjenVI"]);
  expect(sermonsInTopic(sermons, "prayer").map((s) => s.id)).toEqual(["nUW8NT2Pe88"]);
  expect(sermonsInTopic(sermons, "hearing-god")).toEqual([]);
  // By how well each matches, whatever the order they came in (newest first).
  const list = [tagged("weak", { id: "a", score: -0.4 }), tagged("best", { id: "a", score: 2.5 }), tagged("mid", { id: "a", score: 1 })];
  expect(sermonsInTopic(list, "a").map((s) => s.id)).toEqual(["best", "mid", "weak"]);
});

test("Home's topic rail takes each topic's best, the topics taking turns", () => {
  const list = [
    tagged("a2", { id: "a", score: 1 }),
    tagged("a1", { id: "a", score: 2 }),
    tagged("b1", { id: "b", score: 3 }),
    tagged("b2", { id: "b", score: 0.5 }),
    tagged("b3", { id: "b", score: 0.2 }),
    tagged("b4", { id: "b", score: 0.1 }),
    // Over three hours, and finished: left out, however close.
    tagged("long", { id: "a", score: 9 }, 3 * 3600 + 60),
    tagged("done", { id: "b", score: 4 }),
    tagged("other", { id: "c", score: 8 }),
    tagged("untagged", null),
  ];
  const finished = (id: string) => id === "done";
  // A small topic runs out ("a" has two); the other carries on.
  expect(fromTopics(list, ["a", "b"], finished, 10).map((s) => s.id)).toEqual(["a1", "b1", "a2", "b2", "b3", "b4"]);
  expect(fromTopics(list, ["a", "b"], finished, 3).map((s) => s.id)).toEqual(["a1", "b1", "a2"]);
  // Three hours exactly is fine.
  expect(fromTopics([tagged("three", { id: "a", score: 1 }, 3 * 3600)], ["a"], () => false, 10)).toHaveLength(1);
  expect(fromTopics(list, [], finished, 10)).toEqual([]);
});

test("every sermon has a short headline kept apart from its verified title", () => {
  for (const sermon of sermons) {
    expect(headline(sermon).length).toBeLessThan(sermon.title.length);
    expect(headline(sermon)).not.toMatch(/\|/);
  }
  // The hand-written event lines of 30 September 2026 still read the same.
  expect(sermons.map(eventLine)).toEqual([
    "Lioness Conference · Grand Finale",
    "The Votage",
    "The Votage",
    "The Votage",
  ]);
  // Search still finds a sermon by words that are only in its exact title.
  expect(searchSermons(sermons, "votage").length).toBe(3);
  expect(searchSermons(sermons, "27th september").map((s) => s.id)).toEqual([
    "nUW8NT2Pe88",
  ]);
  // And by the day it was preached, however it's written.
  expect(searchSermons(sermons, "22 september 2026").map((s) => s.id)).toEqual([
    "WYiA7rjenVI",
  ]);
  expect(searchSermons(sermons, "2026-09-23")).toHaveLength(2);
});

test("event lines name guest ministers and skip what the headline says", () => {
  const sermon = toSermon({
    youtube_id: "abcdefghijk",
    title: "REV. ANTHONY AUDU || CHARACTERS AROUND THE ALTAR 2 || 6TH FEB. 2024",
    headline: "Characters Around the Altar 2",
    event: null,
    series_key: "characters-around-the-altar",
    part: 2,
    session: null,
    speaker: "Rev. Anthony Audu",
    venue: null,
    preached_on: "2024-02-06",
    published_at: "2024-02-06T21:00:00+00:00",
    duration_seconds: 3600,
    thumbnail_url: null,
  });
  expect(eventLine(sermon)).toBe("Rev. Anthony Audu");
  expect(sermon.duration).toBe("1 hr");
  expect(sermon.thumbnail).toBe("https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg");
  const fast = toSermon({
    ...sampleRecords[0],
    youtube_id: "bcdefghijkl",
    headline: "40 Days Fasting & Prayer: Day 22",
    event: "40 Days Fasting & Prayer 2026",
    session: "Day 22",
    venue: "RCN Houston TX",
  });
  expect(eventLine(fast)).toBe("RCN Houston TX");
});

test("a row's one-line kicker keeps the session apart, so the event is what shortens", () => {
  // "Lioness Conference · Grand Finale".
  expect(eventParts(sermons[0])).toEqual({ lead: "Lioness Conference", session: "Grand Finale" });
  const day = toSermon({
    ...sampleRecords[0],
    youtube_id: "cdefghijklm",
    headline: "The Power of Agreement",
    event: "Gathering of Nations 2026",
    session: "Day 2 Morning",
    speaker: null,
  });
  expect(eventParts(day)).toEqual({ lead: "Gathering of Nations 2026", session: "Day 2 Morning" });
  expect(eventLine(day)).toBe("Gathering of Nations 2026 · Day 2 Morning");
  // A guest minister leads, and shortens with the event.
  expect(eventParts({ ...day, speaker: "Rev. Anthony Audu" })).toEqual({
    lead: "Rev. Anthony Audu · Gathering of Nations 2026",
    session: "Day 2 Morning",
  });
  // A session on its own is the whole line, as is a venue with nothing else.
  expect(eventParts({ ...day, event: null })).toEqual({ lead: "Day 2 Morning", session: null });
  expect(eventParts({ ...day, event: null, session: null, venue: "RCN Houston TX" })).toEqual({
    lead: "RCN Houston TX",
    session: null,
  });
});

test("series rails and related sermons follow the series order", () => {
  const rails = seriesRails(sermons, () => "Apostolic Shift 2026");
  expect(rails.map((r) => r.key)).toEqual(["apostolic-shift-2026"]);
  // Day One, Day Two Morning, then the Grand Finale.
  expect(rails[0].sermons.map((s) => s.id)).toEqual([
    "WYiA7rjenVI",
    "yUDzMcZsVk8",
    "H9sRbSUt0YE",
  ]);
  expect(seriesRails(sermons, () => undefined, { min: 4 })).toEqual([]);
  // After Day One comes the rest of the series, then the rest of the library.
  const dayOne = sermons.find((s) => s.id === "WYiA7rjenVI")!;
  expect(relatedSermons(dayOne, sermons).map((s) => s.id)).toEqual([
    "yUDzMcZsVk8",
    "H9sRbSUt0YE",
    "nUW8NT2Pe88",
  ]);
});
