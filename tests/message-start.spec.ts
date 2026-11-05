import type { Page } from "@playwright/test";
import {
  LENGTH,
  SERMON,
  expect,
  fakeYouTube,
  playhead,
  seedWatchProgress,
  shown,
  test,
  ytLog,
} from "./fixtures";

// Every sermon starts where the Apostle starts preaching, after the worship
// and opening prayer, wherever it's opened from, with "Play from the start"
// under its title. Where the preaching starts comes from the sermon's card
// (public.sermon_cards.preaching_start). From the local fixtures
// (src/learning/fixtures.ts): the Grand Finale's card says 22:20 and Pray
// Without Ceasing's 21:00; Day One has no card, so it plays from the
// beginning. The player's own rules are in message-start-player.spec.ts.

const FINALE_MESSAGE = 1340;
const PRAY_MESSAGE = 1260;

const watch = (page: Page) => page.getByRole("button", { name: "Watch sermon", exact: true });
const note = (page: Page) => page.getByTestId("message-note");
const playFromStart = (page: Page) => page.getByRole("button", { name: "Play from the start", exact: true });
// On the poster, inside Watch (which is what screen readers hear).
const badge = (page: Page) =>
  page.getByText("Starts at the message · 22:20", { exact: true }).filter({ visible: true });

test("a sermon starts where the preaching starts, and Play from the start goes back to 0:00", async ({
  page,
}) => {
  await fakeYouTube(page, { duration: LENGTH[SERMON.finale] });
  await page.goto(`/sermon/${SERMON.finale}`);
  // Before Watch, the poster says where it will start (VoiceOver and
  // TalkBack hear it as Watch's hint, which the web leaves out).
  await expect(badge(page)).toHaveCount(1);
  await watch(page).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  expect((await ytLog(page)).starts).toEqual([FINALE_MESSAGE]);
  await expect(note(page)).toHaveText(/^Started at the message\s*·\s*Play from the start$/);
  // Screen readers hear the time in words, and the note is announced as it appears.
  await expect(note(page).getByText("Started at the message", { exact: true })).toHaveAccessibleName(
    "Started where the preaching starts, at 22 minutes 20 seconds",
  );
  await expect(note(page).locator("xpath=..")).toHaveAttribute("aria-live", "polite");
  await expect(page.getByTestId("resume-note")).toHaveCount(0);

  await playFromStart(page).click();
  await expect(note(page)).toHaveCount(0);
  // Carry on from Play/Pause, as after Start over.
  await expect(page.getByTestId("now-playing-toggle")).toBeFocused();
  expect((await ytLog(page)).commands).toContain("seek:0");
  await expect(page.getByTestId("elapsed")).toHaveText(/^0:0\d$/);
});

test("a sermon with no card plays from the beginning, with nothing to go back to", async ({ page }) => {
  await fakeYouTube(page, { duration: LENGTH[SERMON.dayOne] });
  await page.goto(`/sermon/${SERMON.dayOne}`);
  await expect(watch(page)).toBeVisible();
  await expect(page.getByText(/Starts at the message/)).toHaveCount(0);
  await watch(page).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  expect((await ytLog(page)).starts).toEqual([0]);
  await page.waitForTimeout(500);
  await expect(note(page)).toHaveCount(0);
});

test("a card that can't be loaded plays from the beginning", async ({ page }) => {
  await page.addInitScript(() => {
    (globalThis as { __aaoCardFault?: string | null }).__aaoCardFault = "offline";
  });
  await fakeYouTube(page, { duration: LENGTH[SERMON.finale] });
  await page.goto(`/sermon/${SERMON.finale}`);
  await watch(page).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  expect((await ytLog(page)).starts).toEqual([0]);
  await expect(note(page)).toHaveCount(0);
});

test("a saved place wins over where the preaching starts", async ({ page }) => {
  await seedWatchProgress(page, [
    {
      sermonId: SERMON.finale,
      positionSeconds: 250,
      durationSeconds: LENGTH[SERMON.finale],
      finished: false,
      updatedAt: "2026-11-05T09:00:00.000Z",
    },
  ]);
  await fakeYouTube(page, { duration: LENGTH[SERMON.finale] });
  await page.goto(`/sermon/${SERMON.finale}`);
  await page.getByRole("button", { name: "Resume at 4:10", exact: true }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  expect((await ytLog(page)).starts).toEqual([250]);
  await expect(page.getByTestId("resume-note")).toHaveText(/Resuming at 4:10/);
  await expect(note(page)).toHaveCount(0);
});

test("a time the link asks for (a moment, a shared time) wins too", async ({ page }) => {
  await fakeYouTube(page, { duration: LENGTH[SERMON.finale] });
  await page.goto(`/sermon/${SERMON.finale}?t=3405`);
  await page.getByRole("button", { name: "Play from 56 minutes 45 seconds", exact: true }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  expect((await ytLog(page)).starts).toEqual([3405]);
  await expect(note(page)).toHaveCount(0);
});

test("Home's Watch starts the newest sermon where the preaching starts", async ({ page }) => {
  await fakeYouTube(page, { duration: LENGTH[SERMON.pray] });
  await page.goto("/");
  await shown(page.getByTestId("hero-watch")).click();
  await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.pray}`));
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  expect((await ytLog(page)).starts).toEqual([PRAY_MESSAGE]);
  await expect(note(page)).toBeVisible();
});

test("a card that arrives after Watch moves the sermon to where the preaching starts", async ({ page }) => {
  // The card takes 2.5 seconds to arrive.
  await page.addInitScript(() => {
    (globalThis as { __aaoCardFault?: string | null }).__aaoCardFault = "slow";
  });
  await fakeYouTube(page, { duration: LENGTH[SERMON.finale] });
  await page.goto(`/sermon/${SERMON.finale}`);
  await watch(page).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  expect((await ytLog(page)).starts).toEqual([0]);
  await expect
    .poll(async () => (await ytLog(page)).commands, { timeout: 10_000 })
    .toContain(`seek:${FINALE_MESSAGE}`);
  await expect(note(page)).toBeVisible();
  expect(await playhead(page)).toBeGreaterThanOrEqual(FINALE_MESSAGE);
});

test("a video shorter than its listed length plays from the beginning, never past its end", async ({
  page,
}) => {
  // Listed at 2 hr 28 min, but the video is 20 minutes long.
  await fakeYouTube(page, { duration: 1200 });
  await page.goto(`/sermon/${SERMON.finale}`);
  await watch(page).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  await expect.poll(async () => (await ytLog(page)).commands).toContain("seek:0");
  await expect(note(page)).toHaveCount(0);
  // From the beginning (the fake player's clock runs at 5 seconds a second).
  expect(await playhead(page)).toBeLessThan(60);
});

test.describe("as a guest", () => {
  test.use({ viewer: "guest" });

  test("Watch carries where the preaching starts through signing up", async ({ page }) => {
    await fakeYouTube(page, { duration: LENGTH[SERMON.finale] });
    await page.goto(`/sermon/${SERMON.finale}`);
    // The poster shows where it will start for guests too.
    await expect(badge(page)).toHaveCount(1);
    await watch(page).click();
    await page.getByTestId("continue-apple").click();
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    expect((await ytLog(page)).starts).toEqual([FINALE_MESSAGE]);
    await expect(note(page)).toBeVisible();
  });
});
