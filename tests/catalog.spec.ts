import { expect, test } from "@playwright/test";
import { categories } from "../src/data/categories";
import {
  searchSermons,
  sermons,
  sermonCategoryIds,
  sermonsInCategory,
} from "../src/data/sermons";

test("catalog separates stable demo topics from verified source identity", () => {
  const ids = categories.map((c) => c.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(new Set(sermons.map((s) => s.id)).size).toBe(sermons.length);
  for (const sermon of sermons) {
    expect(sermon.edification.reviewStatus).toBe("demo");
    expect(ids).toContain(sermon.edification.primaryCategoryId);
    for (const id of sermonCategoryIds(sermon)) expect(ids).toContain(id);
    expect(new Set(sermon.edification.additionalCategoryIds).size).toBe(
      sermon.edification.additionalCategoryIds.length,
    );
    expect(sermon.edification.additionalCategoryIds).not.toContain(
      sermon.edification.primaryCategoryId,
    );
    expect(sermon.title.trim()).not.toBe("");
    expect(sermon.source).toBe(`https://www.youtube.com/watch?v=${sermon.id}`);
    expect(sermon.thumbnail).toContain(sermon.id);
  }
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
