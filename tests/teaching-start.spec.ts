import type { Page } from "@playwright/test";
import {
  HABIT,
  LENGTH,
  SERMON,
  WAIT,
  expect,
  fakeYouTube,
  playhead,
  pressControl,
  seedStorage,
  seedWatchProgress,
  shown,
  test,
  ytLog,
} from "./fixtures";
import { MIN_RESUME } from "../src/player/progress";

// A day of a guided path or teaching series plays its whole sermon from
// where the Apostle starts preaching (path_days.teaching_start), unless the
// viewer has a place of their own in it. From the local fixtures
// (src/learning/fixtures.ts): Day 1 of "Breaking free from habitual sin" is
// Apostolic Shift: Day One, preached from 15:12 with its key moment at
// 24:58; Day 2 is the Grand Finale, preached from 22:20; Day 1 of "Learning
// to wait on God" is Pray Without Ceasing, preached from 21:00. The teaching
// series have no teaching start and play from the beginning
// (tests/paths-series.spec.ts).

const DAY_ONE_TEACHING = 912;
const FINALE_TEACHING = 1340;
const PRAY_TEACHING = 1260;
const DAY_ONE_KEY = 1498;

const watch = (page: Page) =>
  page.getByRole("button", { name: "Watch sermon", exact: true });

test("a path day starts where the Apostle starts preaching", async ({ page }) => {
  await fakeYouTube(page, { duration: LENGTH[SERMON.dayOne] });
  await page.goto(`/path/${HABIT}`);
  await page.getByTestId("path-cta").click();
  await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.dayOne}\\?path=${HABIT}&day=1$`));
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  expect((await ytLog(page)).starts).toEqual([DAY_ONE_TEACHING]);
  // Not a place of the viewer's, so nothing offers to start over.
  await expect(page.getByTestId("resume-note")).toHaveCount(0);
  expect(await playhead(page)).toBeGreaterThanOrEqual(DAY_ONE_TEACHING);
});

test("starting a path from Home plays Day 1 from where the preaching starts", async ({ page }) => {
  await fakeYouTube(page, { duration: LENGTH[SERMON.pray] });
  await page.goto("/");
  await page
    .getByTestId("start-here")
    .getByRole("button", { name: /^Start the path with day 1\. / })
    .click();
  await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.pray}\\?path=${WAIT}&day=1$`));
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  expect((await ytLog(page)).starts).toEqual([PRAY_TEACHING]);
});

test("a saved place in the day's sermon wins, even one before the preaching", async ({ page }) => {
  await seedWatchProgress(page, [
    {
      sermonId: SERMON.dayOne,
      positionSeconds: 300,
      durationSeconds: LENGTH[SERMON.dayOne],
      finished: false,
      updatedAt: "2026-10-20T09:00:00.000Z",
    },
  ]);
  await fakeYouTube(page, { duration: LENGTH[SERMON.dayOne] });
  await page.goto(`/path/${HABIT}`);
  await expect(page.getByTestId("path-cta")).toHaveAccessibleName("Start Day 1, 1 hour 42 minutes left");
  await page.getByTestId("path-cta").click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  expect((await ytLog(page)).starts).toEqual([300]);
  await expect(page.getByTestId("resume-note")).toHaveText(/Resuming at 5:00/);
});

test("a finished sermon plays its day from where the preaching starts again", async ({ page }) => {
  await seedWatchProgress(page, [
    {
      sermonId: SERMON.dayOne,
      positionSeconds: LENGTH[SERMON.dayOne],
      durationSeconds: LENGTH[SERMON.dayOne],
      finished: true,
      updatedAt: "2026-10-20T09:00:00.000Z",
    },
  ]);
  await fakeYouTube(page, { duration: LENGTH[SERMON.dayOne] });
  await page.goto(`/path/${HABIT}`);
  await page.getByTestId("path-cta").click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  expect((await ytLog(page)).starts).toEqual([DAY_ONE_TEACHING]);
  // Nor does the account's list move it, once read.
  await page.waitForTimeout(1000);
  expect((await ytLog(page)).commands.filter((c) => c.startsWith("seek:"))).toEqual([]);
});

test("a day's key moment still plays from the key moment", async ({ page }) => {
  await fakeYouTube(page, { duration: LENGTH[SERMON.dayOne] });
  await page.goto(`/path/${HABIT}`);
  await shown(page.getByTestId("path-day-1-key")).first().click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  expect((await ytLog(page)).starts).toEqual([DAY_ONE_KEY]);
});

// slow@example.com's saved places reach the app 6 s after it asks for them
// (src/auth/localBackend.ts), so a day starts before they're known. The
// fake player's clock runs at 5 seconds per real second.
test.describe("a saved place that arrives after Watch", () => {
  test.use({ viewer: "guest" });
  const SLOW = { id: "local:slow@example.com", email: "slow@example.com", provider: "email" };

  test.beforeEach(async ({ page }) => {
    await seedStorage(page, { "aao.local.session.v1": SLOW }, "slow_session");
  });

  test("still moves the day there", async ({ page }) => {
    await seedWatchProgress(
      page,
      [
        {
          sermonId: SERMON.finale,
          positionSeconds: 250,
          durationSeconds: LENGTH[SERMON.finale],
          finished: false,
          updatedAt: "2026-10-20T09:00:00.000Z",
        },
      ],
      SLOW.id,
    );
    await fakeYouTube(page, { duration: LENGTH[SERMON.finale] });
    await page.goto(`/sermon/${SERMON.finale}?path=${HABIT}&day=2`);
    await watch(page).click();
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    expect((await ytLog(page)).starts).toEqual([FINALE_TEACHING]);
    // Paused at once: watching on from there would keep the viewer there.
    await pressControl(page, page.getByTestId("now-playing-toggle"));
    await expect(page.getByTestId("playback-status")).toHaveText("Paused");
    await expect
      .poll(async () => (await ytLog(page)).commands, { timeout: 10_000 })
      .toContain("seek:250");
    await expect(page.getByTestId("resume-note")).toHaveText(/Resuming at 4:10/);
  });

  test("leaves the day where the preaching starts when there is none", async ({ page }) => {
    await seedWatchProgress(page, [], SLOW.id);
    await fakeYouTube(page, { duration: LENGTH[SERMON.finale] });
    await page.goto(`/sermon/${SERMON.finale}?path=${HABIT}&day=2`);
    await watch(page).click();
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    expect((await ytLog(page)).starts).toEqual([FINALE_TEACHING]);
    // Paused, so the account's late answer gets the full comparison: with no
    // place to move to, the day stays where the preaching starts.
    await pressControl(page, page.getByTestId("now-playing-toggle"));
    await expect(page.getByTestId("playback-status")).toHaveText("Paused");
    await page.waitForTimeout(6500);
    expect((await ytLog(page)).commands.filter((c) => c.startsWith("seek:"))).toEqual([]);
    expect(await playhead(page)).toBeGreaterThanOrEqual(FINALE_TEACHING);
    expect(await playhead(page)).toBeLessThan(FINALE_TEACHING + MIN_RESUME);
    await expect(page.getByTestId("resume-note")).toHaveCount(0);
  });
});

test.describe("as a guest", () => {
  test.use({ viewer: "guest" });

  test("Watch on a path day carries its teaching start through signing up", async ({ page }) => {
    await fakeYouTube(page, { duration: LENGTH[SERMON.dayOne] });
    await page.goto(`/sermon/${SERMON.dayOne}?path=${HABIT}&day=1`);
    await watch(page).click();
    const heading = page.getByRole("heading", { name: "Create a free account to start this path" });
    await expect(heading).toBeVisible();
    expect((await ytLog(page)).created).toBe(0);
    await page.getByTestId("continue-apple").click();
    await expect(heading).toHaveCount(0);
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    expect((await ytLog(page)).starts).toEqual([DAY_ONE_TEACHING]);
  });
});

test("a few seconds of a path day leave no place: next time it starts where the preaching starts again", async ({ page }) => {
  await fakeYouTube(page, { duration: LENGTH[SERMON.dayOne] });
  await page.goto(`/sermon/${SERMON.dayOne}?path=${HABIT}&day=1`);
  await watch(page).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  await pressControl(page, page.getByTestId("now-playing-toggle"));
  await expect(page.getByTestId("playback-status")).toHaveText("Paused");
  expect(await playhead(page)).toBeLessThan(DAY_ONE_TEACHING + MIN_RESUME);
  // Leave and come back: no "Resuming at", and it starts at the teaching again.
  await page.goto(`/path/${HABIT}`);
  await page.goto(`/sermon/${SERMON.dayOne}?path=${HABIT}&day=1`);
  await expect(page.getByTestId("resume-note")).toHaveCount(0);
  await watch(page).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  expect((await ytLog(page)).starts.at(-1)).toBe(DAY_ONE_TEACHING);
});
