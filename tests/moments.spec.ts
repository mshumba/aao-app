import type { Page } from "@playwright/test";
import { LENGTH, SERMON, expect, fakeYouTube, playhead, test, ytLog } from "./fixtures";

// "Moments in this sermon" on the sermon page: his words at their
// timestamps (the local fixtures give Apostolic Shift: Day One four, at
// 24:58, 50:04, 1:08:40 and 1:27:10). Pressing one plays from there; the
// one playing is marked and the next lifts as "Coming up".

const DAY_ONE = `/sermon/${SERMON.dayOne}`;
const DAY_TWO = `/sermon/${SERMON.dayTwo}`;

function moment(page: Page, spokenAt: string) {
  return page
    .getByTestId("sermon-moments")
    .getByRole("button", { name: new RegExp(`^${spokenAt}\\. `) });
}

test("the moments are listed in order with his words", async ({ page }) => {
  await page.goto(DAY_ONE);
  const section = page.getByTestId("sermon-moments");
  await expect(section.getByRole("heading", { name: "Moments in this sermon" })).toBeVisible();
  await expect(section.getByText("4 moments", { exact: true })).toBeVisible();
  await expect(section.getByTestId("moment-row")).toHaveCount(4);
  await expect(section.getByTestId("moment-row").first()).toHaveAccessibleName(
    "24 minutes 58 seconds. Temptation is personal. “Temptation is idiosyncratic; temptation is particular to you.”",
  );
  await expect(section.getByTestId("moment-row").first()).toContainText("24:58");
  // The band under the poster says so too.
  await expect(page.getByText("4 moments marked", { exact: true })).toBeVisible();
});

test("tapping a moment starts the sermon there, and the next one is coming up", async ({
  page,
}) => {
  // Day Two Morning's moments: 53:44, 58:07, 1:09:18, 1:13:04, 2:10:20.
  await fakeYouTube(page, { duration: LENGTH[SERMON.dayTwo] });
  await page.goto(DAY_TWO);
  await moment(page, "53 minutes 44 seconds").click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  expect((await ytLog(page)).starts).toEqual([3224]);
  await expect(moment(page, "53 minutes 44 seconds")).toHaveAccessibleName(
    /^53 minutes 44 seconds\. Playing\. Victory over sin\./,
  );
  await expect(moment(page, "53 minutes 44 seconds")).toHaveAttribute("aria-selected", "true");
  // The next, about 4 minutes on, lifts as coming up.
  await expect(moment(page, "58 minutes 7 seconds")).toHaveAccessibleName(
    /^58 minutes 7 seconds\. Coming up in 4 minutes\. Milk or wine\./,
  );
  await expect(moment(page, "58 minutes 7 seconds")).toContainText("Coming up in 4 min");
  await expect(moment(page, "58 minutes 7 seconds")).toHaveAttribute("aria-selected", "false");
  // Further than 15 minutes ahead isn't coming up yet.
  await expect(moment(page, "1 hour 9 minutes 18 seconds")).toHaveAccessibleName(
    /^1 hour 9 minutes 18 seconds\. Win in your soul\./,
  );
});

test("while playing, a moment seeks the same player instead of reloading it", async ({
  page,
}) => {
  await fakeYouTube(page, { duration: LENGTH[SERMON.dayTwo] });
  await page.goto(DAY_TWO);
  await page.getByRole("button", { name: "Watch sermon", exact: true }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  // From the start, nothing is near enough to be coming up.
  await expect(page.getByTestId("sermon-moments")).not.toContainText("Coming up");
  await moment(page, "1 hour 13 minutes 4 seconds").click();
  await expect.poll(async () => (await ytLog(page)).commands).toContain("seek:4384");
  await expect.poll(() => playhead(page)).toBeGreaterThanOrEqual(4384);
  await expect(moment(page, "1 hour 13 minutes 4 seconds")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  // Back to an earlier one: the rows follow.
  await moment(page, "53 minutes 44 seconds").click();
  await expect.poll(async () => (await ytLog(page)).commands).toContain("seek:3224");
  await expect(moment(page, "53 minutes 44 seconds")).toHaveAttribute("aria-selected", "true");
  await expect(moment(page, "1 hour 13 minutes 4 seconds")).toHaveAttribute("aria-selected", "false");
  await expect(moment(page, "58 minutes 7 seconds")).toContainText("Coming up in 4 min");
  const log = await ytLog(page);
  expect(log.created).toBe(1);
  expect(log.destroyed).toBe(0);
});

test("a link to a time marks that moment and starts there", async ({ page }) => {
  await fakeYouTube(page, { duration: LENGTH[SERMON.dayOne] });
  await page.goto(`${DAY_ONE}?t=4120`);
  // Before playing, the moment it opens at stands out.
  await expect(moment(page, "1 hour 8 minutes 40 seconds")).toHaveAccessibleName(
    /^1 hour 8 minutes 40 seconds\. Up next\. Learning to say no\./,
  );
  const play = page.getByRole("button", { name: "Play from 1 hour 8 minutes 40 seconds", exact: true });
  await expect(play).toContainText("Play from 1:08:40");
  await play.click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  expect((await ytLog(page)).starts).toEqual([4120]);
});

test.describe("as a guest", () => {
  test.use({ viewer: "guest" });

  test("a moment asks for a free account before playing", async ({ page }) => {
    await fakeYouTube(page, { duration: LENGTH[SERMON.dayOne] });
    await page.goto(DAY_ONE);
    await moment(page, "50 minutes 4 seconds").click();
    await expect(
      page.getByRole("heading", { name: "Create a free account to watch" }),
    ).toBeVisible();
    expect((await ytLog(page)).created).toBe(0);
  });
});
