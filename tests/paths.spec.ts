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

// Guided paths, one message a day, from the local fixtures
// (src/learning/fixtures.ts): "Breaking free from habitual sin" (published,
// 7 days; Day 1 is Apostolic Shift: Day One, 1 hr 47 min; Day 3 is Day Two
// Morning, 2 hr 49 min) and "Learning to wait on God" (a 5-day draft). A day
// plays its whole sermon: it resumes where the viewer left off, else starts
// at the beginning, and it's done once 95% of it has been watched.

const ORDER_SET = "Order set by the ministry";
const DRAFT = "Draft · awaiting ministry review";

function cta(page: Page) {
  return page.getByTestId("path-cta");
}

function day(page: Page, n: number) {
  return shown(page.getByTestId(`path-day-${n}`)).first();
}

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

test("the Paths tab lists every path, and a draft says it's a draft", async ({ page }) => {
  await page.goto("/");
  await tab(page, "Paths").click();
  await expect(page.getByRole("heading", { level: 1, name: "Paths" })).toBeVisible();
  await expect(page).toHaveURL(/\/paths$/);
  // The first path to start leads, as the tab's masthead; the rest follow.
  // Its length is the sermons' own, whole: never the focus minutes a day.
  const habit = page.getByTestId("paths-featured");
  await expect(habit).toHaveAccessibleName(
    "Start here. 7 messages. Breaking free from habitual sin. Order set by the ministry. About 18 hours in all.",
  );
  await expect(habit).not.toContainText("Draft");
  await expect(page.getByTestId("paths-play")).toHaveAccessibleName(
    "Start Day 1, 1 hour 47 minutes. Breaking free from habitual sin",
  );
  await expect(shown(page.getByText("1 path", { exact: true }))).toBeVisible();
  const wait = page.getByTestId(`path-card-${WAIT}`);
  await expect(wait).toHaveAccessibleName(/^Learning to wait on God\. 5 messages\. Draft, awaiting ministry review\./);
  await expect(wait).toContainText("5 messages");
  await expect(wait).toContainText("Draft");
  await expect(page.getByText(/min a day/)).toHaveCount(0);
  await wait.click();
  await expect(page).toHaveURL(new RegExp(`/path/${WAIT}$`));
});

test("only a published path claims the ministry set its order", async ({ page }) => {
  await page.goto(`/path/${HABIT}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Breaking free from habitual sin" }),
  ).toBeVisible();
  await expect(shown(page.getByText(ORDER_SET, { exact: true }))).toBeVisible();
  await expect(shown(page.getByText(DRAFT, { exact: true }))).toHaveCount(0);

  await page.goto(`/path/${WAIT}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Learning to wait on God" }),
  ).toBeVisible();
  await expect(shown(page.getByText(DRAFT, { exact: true }))).toBeVisible();
  await expect(shown(page.getByText(ORDER_SET))).toHaveCount(0);

  // Home is just as honest: the first path as a card, the others as tiles.
  await page.goto("/");
  await expect(page.getByTestId("start-here")).toContainText(ORDER_SET);
  const tiles = shown(page.getByTestId("path-tile"));
  await expect(tiles).toHaveCount(1);
  await expect(tiles.nth(0)).toContainText(DRAFT);
  await expect(tiles.nth(0)).not.toContainText(ORDER_SET);
  await expect(tiles.nth(0)).toHaveAccessibleName(/ Draft, awaiting ministry review\.$/);
});

test("a path not yet started opens on Day 1, and shows the days ahead", async ({ page }) => {
  await page.goto(`/path/${HABIT}`);
  await expect(page).toHaveTitle("Breaking free from habitual sin · AAO");
  await expect(day(page, 1)).toContainText("Day 1 · Start here");
  await expect(day(page, 1)).toContainText("1 hr 47 min");
  await expect(day(page, 1)).not.toContainText("focus");
  await expect(
    page.getByRole("button", {
      name: "Day 1, start here. Lay aside every weight. Apostolic Shift: Day One. 1 hour 47 minutes.",
      exact: true,
    }),
  ).toBeVisible();
  // Nothing to mark done before the path has started.
  await expect(page.getByTestId("path-day-1-mark-done")).toHaveCount(0);
  await expect(page.getByTestId("path-cover")).toContainText("About 18 hours in all");
  // Nothing is locked before the path starts: each day shows its theme.
  for (const n of [2, 3, 4, 5, 6, 7]) {
    await expect(day(page, n)).not.toContainText("Opens after");
    await expect(day(page, n)).toHaveAccessibleName(new RegExp(`^Day ${n}\\. .+\\. Coming up\\.$`));
  }
  await expect(cta(page)).toHaveAccessibleName("Start Day 1, 1 hour 47 minutes");
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
    await expect(day(page, 1)).toHaveAccessibleName(/^Day 1\. .*\. Done\.$/);
    await expect(day(page, 2)).toHaveAccessibleName(/^Day 2\. .*\. Done\.$/);
    await expect(day(page, 3)).toContainText("Day 3 · Today");
    await expect(day(page, 3)).toContainText("2 hr 49 min");
    await expect(day(page, 4)).toContainText("Day 4 · Opens after Day 3");
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
    await expect(day(page, 3)).toHaveAccessibleName(/^Day 3\. .*\. Done\.$/);
    await expect(day(page, 4)).toContainText("Day 4 · Today");
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
    await expect(day(page, n)).toHaveAccessibleName(new RegExp(`^Day ${n}\\. .*\\. Done\\.$`));
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
    await expect(shown(page.getByText(DRAFT, { exact: true }))).toBeVisible();
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
