import { expect, test } from "@playwright/test";
import { categories } from "../src/data/categories";
import { displayIds, headline } from "../src/data/display";
import { assignments } from "../src/data/edification";
import {
  searchSermons,
  sermons,
  sermonCategoryIds,
  sermonsInCategory,
} from "../src/data/sermons";

// Verified on 30 September 2026 against public ministry links and YouTube.
// Interface changes must never alter these strings.
const verifiedTitles = [
  "LIONESS CONFERENCE || PRAY WITHOUT CEASING || GRAND FINALE || 27TH SEPTEMBER 2026",
  "APOSTOLIC SHIFT | GRAND FINALE | Apostle Arome Osayi LIVE | The Votage | 23/09/26",
  "APOSTOLIC SHIFT | DAY TWO MORNING | Apostle Arome Osayi LIVE | The Votage | 23/09/26",
  "APOSTOLIC SHIFT | DAY ONE | Apostle Arome Osayi LIVE | The Votage | 22/09/26",
];

test("verified catalogue holds source metadata only, with exact titles", () => {
  expect(sermons.map((s) => s.title)).toEqual(verifiedTitles);
  expect(new Set(sermons.map((s) => s.id)).size).toBe(sermons.length);
  for (const sermon of sermons) {
    // Topic assignments live in edification.ts, never on the verified record.
    expect(Object.keys(sermon).sort()).toEqual(
      [
        "channel",
        "collection",
        "date",
        "duration",
        "id",
        "source",
        "sourcePage",
        "thumbnail",
        "title",
      ].sort(),
    );
    expect(sermon.source).toBe(`https://www.youtube.com/watch?v=${sermon.id}`);
    expect(sermon.thumbnail).toContain(sermon.id);
  }
});

test("demo topic assignments are separate, stable and point at real records", () => {
  const ids = categories.map((c) => c.id);
  expect(new Set(ids).size).toBe(ids.length);
  const sermonIds = sermons.map((s) => s.id);
  for (const [sermonId, assignment] of Object.entries(assignments)) {
    expect(sermonIds).toContain(sermonId);
    expect(assignment.reviewStatus).toBe("demo");
    expect(ids).toContain(assignment.primaryCategoryId);
    for (const id of assignment.additionalCategoryIds) expect(ids).toContain(id);
    expect(new Set(assignment.additionalCategoryIds).size).toBe(
      assignment.additionalCategoryIds.length,
    );
    expect(assignment.additionalCategoryIds).not.toContain(
      assignment.primaryCategoryId,
    );
  }
  for (const sermon of sermons)
    for (const id of sermonCategoryIds(sermon)) expect(ids).toContain(id);
});

test("topic membership includes secondary categories and empty collections", () => {
  expect(categories.map((c) => sermonsInCategory(c.id).length)).toEqual([
    3, 2, 2, 0,
  ]);
  expect(sermonsInCategory("prayer").map((s) => s.id)).toEqual([
    "nUW8NT2Pe88",
    "WYiA7rjenVI",
  ]);
});

test("search matches topic labels and tags, intersects selected scope", () => {
  expect(searchSermons("  SPIRITUAL   Growth ")).toHaveLength(3);
  expect(searchSermons("devotion")).toHaveLength(2);
  expect(searchSermons("faith", "prayer")).toHaveLength(0);
  expect(searchSermons("", "christian-living")).toHaveLength(0);
  expect(searchSermons("faith", "spiritual-growth").map((s) => s.id)).toEqual([
    "H9sRbSUt0YE",
  ]);
});

test("every sermon has a short headline kept apart from its verified title", () => {
  expect(displayIds.sort()).toEqual(sermons.map((s) => s.id).sort());
  for (const sermon of sermons) {
    expect(headline(sermon).length).toBeLessThan(sermon.title.length);
    expect(headline(sermon)).not.toMatch(/\|/);
  }
  // Search still finds a sermon by words that are only in its exact title.
  expect(searchSermons("votage").length).toBe(3);
  expect(searchSermons("27th september").map((s) => s.id)).toEqual(["nUW8NT2Pe88"]);
});

