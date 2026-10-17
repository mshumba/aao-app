import type { Page } from "@playwright/test";
import {
  HABIT,
  LENGTH,
  SERMON,
  WAIT,
  expect,
  fakeYouTube,
  playhead,
  seedPathProgress,
  seedWatchProgress,
  shown,
  storedPathProgress,
  tab,
  test,
  ytLog,
} from "./fixtures";
import { totalTime } from "../src/learning/format";

// Guided paths, one message a day, from the local fixtures
// (src/learning/fixtures.ts): "Breaking free from habitual sin" (published,
// 7 days; Day 1 is Apostolic Shift: Day One, 1 hr 47 min; Day 3 is Day Two
// Morning, 2 hr 49 min) and "Learning to wait on God" (a 5-day draft, shown
// with no draft label anywhere, as the owner asked). A day
// plays its whole sermon: it resumes where the viewer left off, else starts
// at the beginning, and it's done once 95% of it has been watched. The path
// page shows the days as a row of cards that opens on today's, the next day
// at its edge.

const ORDER_SET = "Order set by the ministry";
/** Any draft marker: the owner asked for none, anywhere. */
const DRAFT = /Draft|awaiting ministry review/;

function cta(page: Page) {
  return page.getByTestId("path-cta");
}

function day(page: Page, n: number) {
  return shown(page.getByTestId(`path-day-${n}`)).first();
}

/** Where a day's card sits across the window: wholly in it, at its edge, or out of sight. */
async function inView(page: Page, n: number) {
  const box = (await day(page, n).boundingBox())!;
  const width = page.viewportSize()!.width;
  if (box.x + box.width <= 0 || box.x >= width) return "out";
  return box.x >= 0 && box.x + box.width <= width ? "whole" : "edge";
}

test("a path's length reads as a clock would say it: 12h, 5h 30m, 50m", () => {
  expect(totalTime(12 * 3600 + 20 * 60)).toEqual({ text: "12h", spoken: "About 12 hours" });
  expect(totalTime(5 * 3600 + 27 * 60)).toEqual({ text: "5h 30m", spoken: "About 5 hours 30 minutes" });
  expect(totalTime(9 * 3600 + 58 * 60)).toEqual({ text: "10h", spoken: "About 10 hours" });
  expect(totalTime(3600 + 2 * 60)).toEqual({ text: "1h", spoken: "About 1 hour" });
  expect(totalTime(49 * 60)).toEqual({ text: "50m", spoken: "About 50 minutes" });
  expect(totalTime(59 * 60)).toEqual({ text: "1h", spoken: "About 1 hour" });
});

/**
 * A place in Day Two Morning (Days 3 and 7) 15 seconds short of 95% watched
 * (9685s), about 3 seconds of playing at the fake clock's 5x.
 */
const NEARLY_WATCHED = 9670;

function placeInDayTwo(positionSeconds: number) {
  return {
    sermonId: SERMON.dayTwo,
    positionSeconds,
    durationSeconds: LENGTH[SERMON.dayTwo],
    finished: false,
    updatedAt: "2026-10-14T09:00:00.000Z",
  };
}

test("the Paths tab lists every path, and a draft carries no label", async ({ page }) => {
  await page.goto("/");
  await tab(page, "Paths").click();
  await expect(page.getByRole("heading", { level: 1, name: "Paths" })).toBeVisible();
  await expect(page).toHaveURL(/\/paths$/);
  // The first path to start (in the editors' order, which opens with hope
  // rather than sin) leads, as the tab's masthead; the rest follow. Its
  // length is the sermons' own, whole: never the focus minutes a day. A
  // draft makes no claim about who set its order.
  const wait = page.getByTestId("paths-featured");
  await expect(wait).toHaveAccessibleName("Start here. 5 days. Learning to wait on God. About 14 hours.");
  // The length by a clock: "14h".
  await expect(wait).toContainText("14h");
  await expect(wait).not.toContainText(DRAFT);
  await expect(wait).not.toContainText(ORDER_SET);
  await expect(page.getByTestId("paths-play")).toHaveAccessibleName(
    "Start Day 1, 3 hours 35 minutes. Learning to wait on God",
  );
  await expect(shown(page.getByText("1 path", { exact: true }))).toBeVisible();
  const habit = page.getByTestId(`path-card-${HABIT}`);
  await expect(habit).toHaveAccessibleName(
    "Breaking free from habitual sin. 7 days. Seven days from the grip of a repeated sin to the freedom grace gives.",
  );
  await expect(habit).toContainText("7 days");
  await expect(habit).not.toContainText(DRAFT);
  await expect(page.getByText(/min a day|in all/)).toHaveCount(0);
  await habit.click();
  await expect(page).toHaveURL(new RegExp(`/path/${HABIT}$`));
});

test("on the Paths tab, the path you're on says its day once", async ({ page }) => {
  await seedPathProgress(page, { [HABIT]: [1, 2], [WAIT]: [1] });
  await page.goto("/paths");
  const mine = page.getByTestId("paths-active");
  await expect(mine).toHaveAccessibleName(
    "Your path. Day 3 of 7. Breaking free from habitual sin. 2 of 7 done.",
  );
  await expect(shown(page.getByText(/Day\s3\sof\s7/i))).toHaveCount(1);
  // Another path started: where you are on it, and nothing more.
  const wait = page.getByTestId(`path-card-${WAIT}`);
  await expect(wait).toContainText("Day 2 of 5");
  await expect(wait).not.toContainText(/to go/);
});

test("a day's theme and title wrap between words, never mid-word", async ({ page }) => {
  // The narrowest phone the app supports, where the longest themes wrap.
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/path/${WAIT}`);
  // Its last two words kept together ("…in its / time" never happens).
  const theme = day(page, 2).getByText(/He makes everything beautiful in its\s+time/i);
  const title = day(page, 4).getByText("Apostolic Shift: Day Two Morning", { exact: true });
  for (const text of [theme, title]) {
    await expect(text).toBeVisible();
    // Nothing clipped: the whole text fits the box it's drawn in.
    const fits = await text.evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1);
    expect(fits).toBe(true);
    // On more than one line, broken between words.
    expect(((await text.boundingBox())?.height ?? 0)).toBeGreaterThan(24);
  }
  expect(await theme.textContent()).toMatch(/its\u00a0time$/);
  // A card's name never breaks inside "Day 1".
  const name = day(page, 1).getByText(/^Day.1 · Start here$/);
  expect(await name.textContent()).toBe("Day\u00a01 · Start here");
});

test("only a published path claims the ministry set its order", async ({ page }) => {
  await page.goto(`/path/${HABIT}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Breaking free from habitual sin" }),
  ).toBeVisible();
  await expect(shown(page.getByText(ORDER_SET, { exact: true }))).toBeVisible();
  await expect(shown(page.getByText(DRAFT))).toHaveCount(0);

  // A draft says nothing about who set its order: no claim, and no label.
  await page.goto(`/path/${WAIT}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Learning to wait on God" }),
  ).toBeVisible();
  await expect(shown(page.getByText("Why this path", { exact: true }))).toBeVisible();
  await expect(shown(page.getByText(DRAFT))).toHaveCount(0);
  await expect(shown(page.getByText(ORDER_SET))).toHaveCount(0);

  // Home is just as honest: the first path (the draft) as a card, the
  // others as tiles.
  await page.goto("/");
  await expect(page.getByTestId("start-here")).toContainText("Learning to wait on God");
  await expect(page.getByTestId("start-here")).not.toContainText(DRAFT);
  await expect(page.getByTestId("start-here")).not.toContainText(ORDER_SET);
  const tiles = shown(page.getByTestId("path-tile"));
  await expect(tiles).toHaveCount(1);
  await expect(tiles.nth(0)).not.toContainText(DRAFT);
  await expect(tiles.nth(0)).toContainText(ORDER_SET);
  await expect(tiles.nth(0)).toHaveAccessibleName(
    "Breaking free from habitual sin. 7 days. Seven days from the grip of a repeated sin to the freedom grace gives. Order set by the ministry.",
  );
});

test("a path not yet started opens on Day 1, and shows the days ahead", async ({ page }) => {
  await page.goto(`/path/${HABIT}`);
  await expect(page).toHaveTitle("Breaking free from habitual sin · AAO");
  await expect(day(page, 1)).toContainText("Day 1 · Start here");
  await expect(day(page, 1)).toContainText("1 hr 47 min");
  await expect(day(page, 1)).not.toContainText("focus");
  // The day's theme leads; the sermon's headline follows with its length.
  await expect(day(page, 1)).toHaveAccessibleName(
    "Day 1 of 7, start here. Lay aside every weight. Apostolic Shift: Day One, 1 hour 47 minutes.",
  );
  // Nothing to mark done before the path has started.
  await expect(page.getByTestId("path-day-1-mark-done")).toHaveCount(0);
  // The path's length by a clock: "18h", said "About 18 hours".
  const cover = page.getByTestId("path-cover");
  await expect(cover).toContainText("18h");
  await expect(cover).not.toContainText("in all");
  await expect(cover.getByRole("img", { name: "7 days, not started. About 18 hours." })).toBeVisible();
  // Day 1 in view and Day 2 at its edge; the rest are a scroll away.
  expect(await inView(page, 1)).toBe("whole");
  expect(await inView(page, 2)).toBe("edge");
  expect(await inView(page, 3)).toBe("out");
  // Nothing is locked before the path starts: each day shows its theme.
  for (const n of [2, 3, 4, 5, 6, 7]) {
    await expect(day(page, n)).not.toContainText("Opens after");
    await expect(day(page, n)).toHaveAccessibleName(new RegExp(`^Day ${n} of 7, coming up\\. .+\\.$`));
  }
  await expect(day(page, 2)).toHaveAccessibleName(
    "Day 2 of 7, coming up. Shut down the factory. Apostolic Shift: Grand Finale, 2 hours 28 minutes.",
  );
  await expect(cta(page)).toHaveAccessibleName("Start Day 1, 1 hour 47 minutes");
  // On the keyboard, the arrow keys move from day to day.
  await day(page, 1).focus();
  await page.keyboard.press("ArrowRight");
  await expect(day(page, 2)).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(day(page, 1)).toBeFocused();
  // A locked day explains itself kindly, and the way in is Day 1.
  await day(page, 4).click();
  const sheet = page.getByRole("dialog", { name: "This path starts with Day 1" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Each day builds on the one before, so the path begins with Day 1.");
  await expect(sheet.getByRole("button", { name: "Start Day 1", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Open Day 4 anyway", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
});

test("starting a path plays Day 1, whole, from the beginning, and Home follows the path", async ({
  page,
}) => {
  await fakeYouTube(page, { duration: LENGTH[SERMON.dayOne] });
  await page.goto(`/path/${HABIT}`);
  await cta(page).click();
  // No jump to a focus: the sermon starts at the beginning.
  await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.dayOne}\\?path=${HABIT}&day=1$`));
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  expect((await ytLog(page)).starts).toEqual([0]);
  const stored = await storedPathProgress(page);
  expect(Object.keys(stored!.enrollments)).toEqual([HABIT]);
  expect(stored!.done[HABIT]).toEqual([]);
  // The sermon page knows it's Day 1 of the path; nothing marks a focus.
  await expect(page.getByLabel(/focus/i)).toHaveCount(0);
  await expect(page.getByText(/focus/i)).toHaveCount(0);
  await expect(page.getByRole("slider", { name: "Playback position" })).toHaveAttribute(
    "aria-valuemax",
    String(LENGTH[SERMON.dayOne]),
  );
  await expect(page.getByTestId("part-of-path")).toHaveAccessibleName(
    "Part of your path. Day 1 of 7. Breaking free from habitual sin. 0 of 7 done.",
  );

  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(day(page, 1)).toContainText("Day 1 · Today");
  // A second Back within 350ms counts as a double tap; pace it like a person.
  await page.waitForTimeout(400);
  await page.getByTestId("path-back").click();
  await tab(page, "Home").click();
  const card = page.getByTestId("your-path");
  await expect(
    card.getByRole("button", {
      name: "Your path. Day 1 of 7. Breaking free from habitual sin. 0 of 7 done.",
      exact: true,
    }),
  ).toBeVisible();
  // Started, it leaves the list of paths to start, and leads the Paths tab.
  await expect(shown(page.getByTestId("start-a-path"))).toHaveCount(0);
  await tab(page, "Paths").click();
  await expect(page.getByTestId("paths-active")).toBeVisible();
  await expect(page.getByTestId(`path-card-${HABIT}`)).toHaveCount(0);
  await expect(shown(page.getByRole("heading", { name: "More paths" }))).toBeVisible();
});

test.describe("part way through a path", () => {
  test.beforeEach(async ({ page }) => {
    await seedPathProgress(page, { [HABIT]: [1, 2] });
  });

  test("Continue plays today's sermon, whole, from the beginning", async ({ page }) => {
    await fakeYouTube(page, { duration: LENGTH[SERMON.dayTwo] });
    await page.goto(`/path/${HABIT}`);
    await expect(day(page, 1)).toHaveAccessibleName(/^Day 1 of 7, done\. /);
    await expect(day(page, 2)).toHaveAccessibleName(/^Day 2 of 7, done\. /);
    await expect(day(page, 3)).toContainText("Day 3 · Today");
    await expect(day(page, 3)).toContainText("Stop sin while it is a thought");
    await expect(day(page, 3)).toContainText("2 hr 49 min");
    await expect(day(page, 4)).toContainText("Day 4 · Opens after Day 3");
    await expect(day(page, 4)).toHaveAccessibleName(/^Day 4 of 7, opens after Day 3\. Find the flesh's booster stations\. /);
    // The row opens on today, the next day at its edge, the days done to the left.
    await expect.poll(() => inView(page, 3)).toBe("whole");
    expect(await inView(page, 4)).toBe("edge");
    expect(await inView(page, 1)).toBe("out");
    await expect(cta(page)).toHaveAccessibleName("Continue Day 3, 2 hours 49 minutes");
    await cta(page).click();
    await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.dayTwo}\\?path=${HABIT}&day=3$`));
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    expect((await ytLog(page)).starts).toEqual([0]);
    await expect(page.getByText(/focus|today’s teaching/i)).toHaveCount(0);
  });

  test("today's key moment plays from that moment", async ({ page }) => {
    await fakeYouTube(page, { duration: LENGTH[SERMON.dayTwo] });
    await page.goto(`/path/${HABIT}`);
    await page.getByTestId("path-day-3-key").click();
    await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.dayTwo}\\?t=3224&path=${HABIT}&day=3$`));
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    expect((await ytLog(page)).starts).toEqual([3224]);
  });

  test("a locked day says when it opens and leads back to today", async ({ page }) => {
    await fakeYouTube(page, { duration: LENGTH[SERMON.dayTwo] });
    await page.goto(`/path/${HABIT}`);
    await day(page, 4).click();
    const next = page.getByRole("dialog", { name: "Day 4 opens after Day 3" });
    await expect(next).toContainText("Finish Day 3 first, and Day 4 will be ready for you.");
    await page.keyboard.press("Escape");
    await day(page, 5).click();
    const later = page.getByRole("dialog", { name: "Day 5 opens after Day 4" });
    await expect(later).toContainText("You’re on Day 3 now; Day 5 opens once Day 4 is done.");
    await later.getByRole("button", { name: "Go to Day 3", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.dayTwo}\\?path=${HABIT}&day=3$`));
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  });

  test("a locked day can still be opened on its own, outside the path", async ({ page }) => {
    await fakeYouTube(page, { duration: LENGTH[SERMON.dayOne] });
    await page.goto(`/path/${HABIT}`);
    await day(page, 5).click();
    await page.getByRole("button", { name: "Open Day 5 anyway", exact: true }).click();
    // Day 5's sermon plays on its own, not as a day of the path: nothing to
    // mark done. (The sermon is also Day 1, done already: not that either.)
    await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.dayOne}$`));
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    expect((await ytLog(page)).starts).toEqual([0]);
    await expect(page.getByTestId("part-of-path")).toHaveCount(0);
    expect((await storedPathProgress(page))?.done[HABIT]).toEqual([1, 2]);
  });

  test("Continue resumes today's sermon where the viewer left off", async ({ page }) => {
    // 7300s into the 10195s sermon: 48 minutes of the whole sermon left.
    await seedWatchProgress(page, [placeInDayTwo(7300)]);
    await fakeYouTube(page, { duration: LENGTH[SERMON.dayTwo] });
    await page.goto(`/path/${HABIT}`);
    await expect(cta(page)).toHaveAccessibleName("Continue Day 3, 48 minutes left");
    await expect(day(page, 3)).toContainText("48 min left");
    await cta(page).click();
    await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.dayTwo}\\?path=${HABIT}&day=3$`));
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    expect((await ytLog(page)).starts).toEqual([7300]);
  });

  test("watching today's sermon to 95% marks the day done", async ({ page }) => {
    await seedWatchProgress(page, [placeInDayTwo(NEARLY_WATCHED)]);
    await fakeYouTube(page, { duration: LENGTH[SERMON.dayTwo] });
    await page.goto(`/path/${HABIT}`);
    await expect(cta(page)).toHaveAccessibleName("Continue Day 3, 9 minutes left");
    await cta(page).click();
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    expect((await ytLog(page)).starts).toEqual([NEARLY_WATCHED]);
    // Quietly: a toast, no card over the sermon, and the sermon plays on.
    await expect(page.getByTestId("toast")).toContainText("Day 3 done", { timeout: 15_000 });
    await expect.poll(async () => (await storedPathProgress(page))?.done[HABIT]).toEqual([1, 2, 3]);
    await expect(page.getByTestId("day-done")).toHaveCount(0);
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    await expect(page.getByTestId("part-of-path")).toHaveAccessibleName(
      "Part of your path. Day 3 of 7. Breaking free from habitual sin. 3 of 7 done.",
    );
    await expect(page.getByTestId("part-of-path-mark-done")).toHaveCount(0);
    // Back on the path, the day complete sheet: the day's key quote and
    // what's next, its length the whole sermon's.
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/path/${HABIT}$`));
    const sheet = page.getByRole("dialog", { name: "Day 3 done" });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("3 of 7 done");
    await expect(sheet).toContainText(
      "“Bad actions are incubated through the outlet of the mind until they find expression in the womb of the heart.”",
    );
    await expect(sheet).toContainText("Tomorrow · Day 4");
    await expect(sheet).toContainText("Find the flesh's booster stations · 3 hr 35 min");
    // Watched to the end, there's nothing left to keep listening to.
    await expect(sheet.getByRole("button", { name: /^Keep listening/ })).toHaveCount(0);
    await sheet.getByRole("button", { name: "Done for today", exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await expect(day(page, 3)).toHaveAccessibleName(/^Day 3 of 7, done\. /);
    await expect(day(page, 4)).toContainText("Day 4 · Today");
    // The row moves on to the new today.
    await expect.poll(() => inView(page, 4)).toBe("whole");
    await expect(cta(page)).toHaveAccessibleName("Continue Day 4, 3 hours 35 minutes");
    // The sheet isn't shown again for the same day.
    await page.reload();
    await expect(day(page, 4)).toContainText("Day 4 · Today");
    await page.waitForTimeout(500);
    await expect(page.getByRole("dialog", { name: "Day 3 done" })).toHaveCount(0);
  });

  test("a day finishes while its sermon plays on docked, with its page closed", async ({ page }) => {
    // A little more room: the sermon page closes before 95% is reached.
    await seedWatchProgress(page, [placeInDayTwo(NEARLY_WATCHED - 25)]);
    await fakeYouTube(page, { duration: LENGTH[SERMON.dayTwo] });
    await page.goto(`/path/${HABIT}`);
    // Tapped at once, before the account's saved places have loaded: the
    // sermon still picks up there once they arrive.
    await cta(page).click();
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    await expect.poll(() => playhead(page)).toBeGreaterThanOrEqual(NEARLY_WATCHED - 25);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.waitForTimeout(400);
    await page.getByTestId("path-back").click();
    await expect(page.getByTestId("your-path")).toBeVisible();
    await expect(page.getByTestId("player-dock")).toBeVisible();
    expect((await storedPathProgress(page))?.done[HABIT]).toEqual([1, 2]);
    // Still playing in the dock, the sermon reaches 95%: the day is done.
    await expect(page.getByTestId("toast")).toContainText("Day 3 done", { timeout: 20_000 });
    await expect.poll(async () => (await storedPathProgress(page))?.done[HABIT]).toEqual([1, 2, 3]);
    await expect(page.getByTestId("player-dock")).toBeVisible();
    await expect(
      page.getByTestId("your-path").getByRole("button", {
        name: "Your path. Day 4 of 7. Breaking free from habitual sin. 3 of 7 done.",
        exact: true,
      }),
    ).toBeVisible();
  });

  test("Mark Day 3 done on the path page shows the day complete sheet", async ({ page }) => {
    await seedWatchProgress(page, [placeInDayTwo(7300)]);
    await fakeYouTube(page, { duration: LENGTH[SERMON.dayTwo] });
    await page.goto(`/path/${HABIT}`);
    const mark = page.getByRole("button", { name: "Mark Day 3 done", exact: true });
    await expect(mark).toBeVisible();
    // Only today's day can be marked.
    await expect(page.getByTestId("path-day-4-mark-done")).toHaveCount(0);
    await mark.click();
    await expect.poll(async () => (await storedPathProgress(page))?.done[HABIT]).toEqual([1, 2, 3]);
    const sheet = page.getByRole("dialog", { name: "Day 3 done" });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("3 of 7 done");
    // Marked done part way through: the rest of the sermon is a tap away.
    await sheet.getByRole("button", { name: "Keep listening · 48 min left", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.dayTwo}\\?path=${HABIT}&day=3$`));
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    expect((await ytLog(page)).starts).toEqual([7300]);
    // A day already done has nothing to mark.
    await expect(page.getByTestId("part-of-path-mark-done")).toHaveCount(0);
  });

  test("on a wide window, arrows under the row move it a day at a time, clear of the artwork", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/path/${HABIT}`);
    const earlier = page.getByRole("button", { name: "Earlier days", exact: true });
    const later = page.getByRole("button", { name: "Later days", exact: true });
    await expect(later).toBeVisible();
    await expect.poll(() => inView(page, 3)).toBe("whole");
    // Under the cards, at the column's end; "Mark Day 3 done" is today's
    // card's own ring, at its top right.
    const card = (await day(page, 3).boundingBox())!;
    const mark = (await page.getByTestId("path-day-3-mark-done").boundingBox())!;
    expect(mark.x + mark.width).toBeLessThanOrEqual(card.x + card.width);
    expect(mark.x).toBeGreaterThan(card.x + card.width / 2);
    expect(mark.y - card.y).toBeLessThan(20);
    for (const arrow of [earlier, later]) {
      const box = (await arrow.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(card.y + card.height);
    }
    const x = async () => (await day(page, 3).boundingBox())!.x;
    await later.click();
    await expect.poll(async () => card.x - (await x())).toBeGreaterThan(card.width);
    await earlier.click();
    await expect.poll(x).toBeCloseTo(card.x, 0);
    // At the row's end "Later days" goes, and "Earlier days" keeps its place.
    const place = (await earlier.boundingBox())!.x;
    for (let i = 0; i < 7 && (await later.count()); i++) {
      const from = await x();
      await later.click();
      await expect.poll(x).toBeLessThan(from);
      // A day at a time: the row comes to rest before the next press.
      await expect
        .poll(async () => {
          const at = await x();
          await page.waitForTimeout(100);
          return (await x()) - at;
        })
        .toBe(0);
    }
    await expect(later).toHaveCount(0);
    expect((await earlier.boundingBox())!.x).toBe(place);
  });

  test("Mark Day 3 done on the sermon page", async ({ page }) => {
    await page.goto(`/sermon/${SERMON.dayTwo}?path=${HABIT}&day=3`);
    const row = page.getByTestId("part-of-path");
    await expect(row).toHaveAccessibleName(
      "Part of your path. Day 3 of 7. Breaking free from habitual sin. 2 of 7 done.",
    );
    await page.getByRole("button", { name: "Mark Day 3 done", exact: true }).click();
    await expect(page.getByTestId("toast")).toContainText("Day 3 done");
    await expect.poll(async () => (await storedPathProgress(page))?.done[HABIT]).toEqual([1, 2, 3]);
    await expect(row).toHaveAccessibleName(
      "Part of your path. Day 3 of 7. Breaking free from habitual sin. 3 of 7 done.",
    );
    await expect(page.getByTestId("part-of-path-mark-done")).toHaveCount(0);
    // The path shows it with the day complete sheet.
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/path/${HABIT}$`));
    await expect(page.getByRole("dialog", { name: "Day 3 done" })).toBeVisible();
  });
});

test("the path page never offers Day 1 to someone on Day 3, even while loading", async ({
  page,
}) => {
  // The page waits for the viewer's progress before it says which day is
  // today, so a member on Day 3 never sees "Start Day 1" first.
  await seedPathProgress(page, { [HABIT]: [1, 2] });
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __ctaLabels: string[] }).__ctaLabels = seen;
    document.addEventListener("DOMContentLoaded", () =>
      new MutationObserver(() => {
        const label = document.querySelector('[data-testid="path-cta"]')?.getAttribute("aria-label");
        if (label && seen[seen.length - 1] !== label) seen.push(label);
      }).observe(document.body, { subtree: true, childList: true, attributes: true }),
    );
  });
  await page.goto(`/path/${HABIT}`);
  await expect(cta(page)).toHaveAccessibleName("Continue Day 3, 2 hours 49 minutes");
  const labels = await page.evaluate(
    () => (window as unknown as { __ctaLabels: string[] }).__ctaLabels,
  );
  expect(labels).toEqual(["Continue Day 3, 2 hours 49 minutes"]);
});

test("finishing the last day completes the path", async ({ page }) => {
  await seedPathProgress(page, { [HABIT]: [1, 2, 3, 4, 5, 6] });
  // Day 7 is Day Two Morning again, 15 seconds short of 95% watched.
  await seedWatchProgress(page, [placeInDayTwo(NEARLY_WATCHED)]);
  await fakeYouTube(page, { duration: LENGTH[SERMON.dayTwo] });
  await page.goto(`/path/${HABIT}`);
  await expect(cta(page)).toHaveAccessibleName("Continue Day 7, 9 minutes left");
  await cta(page).click();
  await expect(page.getByTestId("toast")).toContainText("Breaking free from habitual sin complete", {
    timeout: 15_000,
  });
  await expect
    .poll(async () => (await storedPathProgress(page))?.enrollments[HABIT].finishedAt)
    .toEqual(expect.any(String));
  expect((await storedPathProgress(page))?.done[HABIT]).toEqual([1, 2, 3, 4, 5, 6, 7]);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Path complete" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "Path complete." })).toBeVisible();
  await expect(sheet).toContainText("All 7 days done");
  await expect(sheet).toContainText("You’ve walked every day of Breaking free from habitual sin.");
  await sheet.getByRole("button", { name: "Close", exact: true }).click();
  await expect(cta(page)).toHaveAccessibleName("Choose your next path");
  for (const n of [1, 2, 3, 4, 5, 6, 7])
    await expect(day(page, n)).toHaveAccessibleName(new RegExp(`^Day ${n} of 7, done\\. `));
  // Finished, the row goes back to Day 1.
  await expect.poll(() => inView(page, 1)).toBe("whole");
  // Finished, Home offers paths to start again, and the Paths tab says so.
  await page.waitForTimeout(400);
  await page.getByTestId("path-back").click();
  await tab(page, "Home").click();
  await expect(page.getByTestId("your-path")).toHaveCount(0);
  await expect(shown(page.getByTestId("start-a-path"))).toBeVisible();
  await tab(page, "Paths").click();
  await expect(page.getByTestId("paths-active")).toHaveCount(0);
  await expect(page.getByTestId(`path-card-${HABIT}`)).toHaveAccessibleName(/\. Finished\.$/);
});

test.describe("as a guest", () => {
  test.use({ viewer: "guest" });

  test("Start asks for a free account, then starts the path and plays Day 1", async ({
    page,
  }) => {
    await fakeYouTube(page, { duration: LENGTH[SERMON.dayOne] });
    await page.goto(`/path/${HABIT}`);
    await cta(page).click();
    const heading = page.getByRole("heading", { name: "Create a free account to start this path" });
    await expect(heading).toBeVisible();
    // The sheet names the path and its length.
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Breaking free from habitual sin")).toBeVisible();
    await expect(sheet).toContainText("7 days");
    expect((await ytLog(page)).created).toBe(0);
    expect((await storedPathProgress(page, "guest"))?.enrollments ?? {}).toEqual({});

    await page.getByTestId("continue-google").click();
    await expect(heading).toHaveCount(0);
    await expect(page.getByTestId("toast")).toContainText("signed in");
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.dayOne}`));
    // The new account is on the path.
    const owner = "local:google.viewer@example.com";
    await expect
      .poll(async () => Object.keys((await storedPathProgress(page, owner))?.enrollments ?? {}))
      .toEqual([HABIT]);
    // Nothing was started for the guest on this device.
    expect((await storedPathProgress(page, "guest"))?.enrollments ?? {}).toEqual({});
  });

  test("after signing up, Day 1 plays, whole, from the beginning", async ({ page }) => {
    // The sign-up carries the path and the day through, and no focus time.
    await fakeYouTube(page, { duration: LENGTH[SERMON.dayOne] });
    await page.goto(`/path/${HABIT}`);
    await cta(page).click();
    await page.getByTestId("continue-google").click();
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.dayOne}\\?path=${HABIT}&day=1$`));
    expect((await ytLog(page)).starts).toEqual([0]);
  });

  test("closing the sign-up sheet abandons starting the path", async ({ page }) => {
    // Only the sign-up the sheet was opened for starts the path.
    await fakeYouTube(page);
    await page.goto(`/path/${HABIT}`);
    await cta(page).click();
    const heading = page.getByRole("heading", { name: "Create a free account to start this path" });
    await expect(heading).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(heading).toHaveCount(0);
    await page.goto("/account");
    await page.getByRole("button", { name: "Create free account" }).click();
    await page.getByTestId("continue-google").click();
    await expect(page.getByTestId("toast")).toContainText("signed in");
    await page.waitForTimeout(800);
    expect((await ytLog(page)).created).toBe(0);
    expect(
      (await storedPathProgress(page, "local:google.viewer@example.com"))?.enrollments ?? {},
    ).toEqual({});
  });

  test("a locked day still explains itself to a guest", async ({ page }) => {
    await page.goto(`/path/${WAIT}`);
    await expect(page.getByRole("heading", { level: 1, name: "Learning to wait on God" })).toBeVisible();
    await day(page, 3).click();
    await expect(page.getByRole("dialog", { name: "This path starts with Day 1" })).toBeVisible();
  });
});

test("a link to a path that doesn't exist says so and offers every path", async ({ page }) => {
  await page.goto("/path/no-such-path");
  await expect(
    page.getByRole("heading", { level: 1, name: "This path isn’t available" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "See all paths", exact: true }).click();
  await expect(page).toHaveURL(/\/paths$/);
  await expect(page.getByRole("heading", { level: 1, name: "Paths" })).toBeVisible();
});

test("a path's name never leaves its last word alone on a line", async ({ page }) => {
  await seedPathProgress(page, { [HABIT]: [1, 2] });
  await page.setViewportSize({ width: 320, height: 568 });
  const glued = /habitual sin$/;
  // Home's card, the Paths tab's masthead and the path's own cover.
  await page.goto("/");
  const home = page.getByTestId("your-path").getByText(/^Breaking free from/);
  expect(await home.textContent()).toMatch(glued);
  await page.goto("/paths");
  const mast = shown(page.getByTestId("paths-active")).getByText(/^Breaking free from/);
  expect(await mast.textContent()).toMatch(glued);
  await page.goto(`/path/${HABIT}`);
  const cover = page.getByRole("heading", { level: 1, name: "Breaking free from habitual sin" });
  expect(await cover.textContent()).toMatch(glued);
  // Today's theme too: "Stop sin while it is a thought".
  expect(await day(page, 3).getByText(/^Stop sin while it is/).textContent()).toMatch(/a thought$/);
});
