import type { Page } from "@playwright/test";
import { expect, fakeYouTube, seedStorage, seedWatchProgress, test, ytLog } from "./fixtures";

// A saved place that arrives after Watch, in the app: the on-device account
// service sends slow@example.com's progress 6 s after it's asked for (when
// the app starts), so the sermon starts from the beginning before it does.
// The fake player's clock runs at 5 seconds per real second.
const SLOW = { id: "local:slow@example.com", email: "slow@example.com", provider: "email" };
const SERMON_ID = "H9sRbSUt0YE";

test.use({ viewer: "guest" });

test.beforeEach(async ({ page }) => {
  await seedStorage(page, { "aao.local.session.v1": SLOW }, "slow_session");
  await seedWatchProgress(
    page,
    [
      {
        sermonId: SERMON_ID,
        positionSeconds: 250,
        durationSeconds: 600,
        finished: false,
        updatedAt: "2026-10-16T10:00:00.000Z",
      },
    ],
    SLOW.id,
  );
  await fakeYouTube(page);
});

/** Watch before the account's progress has arrived, and pause just after it starts. */
async function watchThenPause(page: Page, before: () => Promise<void> = async () => {}) {
  await page.goto(`/sermon/${SERMON_ID}`);
  await page.getByRole("button", { name: "Watch sermon", exact: true }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  // Started from the beginning: the saved place hadn't arrived.
  expect((await ytLog(page)).starts).toEqual([0]);
  await before();
  await page.getByTestId("now-playing-toggle").click();
  await expect(page.getByTestId("playback-status")).toHaveText("Paused");
}

test("a saved place that arrives after Watch still resumes the sermon there", async ({ page }) => {
  await watchThenPause(page);
  await expect
    .poll(async () => (await ytLog(page)).commands, { timeout: 10_000 })
    .toContain("seek:250");
  await expect(page.getByTestId("resume-note")).toHaveText(/Resuming at 4:10/);
});

test("seeking back to the start before the saved place arrives keeps the viewer there", async ({
  page,
}) => {
  const slider = page.getByRole("slider", { name: "Playback position" });
  await watchThenPause(page, async () => {
    await slider.focus();
    await page.keyboard.press("Home");
    await expect.poll(async () => (await ytLog(page)).commands).toContain("seek:0");
  });
  // The account's answer lands meanwhile.
  await page.waitForTimeout(6500);
  expect((await ytLog(page)).commands).not.toContain("seek:250");
  await expect(page.getByTestId("resume-note")).toHaveCount(0);
  expect(Number(await slider.getAttribute("aria-valuenow"))).toBeLessThan(15);
});
