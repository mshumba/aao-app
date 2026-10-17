import type { Page } from "@playwright/test";
import {
  MEMBER,
  expect,
  fakeYouTube,
  goOffline,
  goOnline,
  seedWatchProgress,
  shown,
  test,
  ytLog,
} from "./fixtures";

// Watch positions on a connection that comes and goes, in the app, with the
// on-device account service (which can't be reached while the browser says
// it's offline). The queue's own rules, and Supabase's renewal of the
// session offline, are tested in Node: tests/watch-queue.spec.ts and
// tests/offline-launch.spec.ts. The fake player's clock runs at 5 seconds
// per real second.

const SERMON = "WYiA7rjenVI";
const DATA_KEY = `aao.local.data.v1.${MEMBER.id}`;
const QUEUE_KEY = `aao.watchQueue.v1.${MEMBER.id}`;
const COPY_KEY = `aao.watchProgress.v1.${MEMBER.id}`;

type Place = { sermonId: string; positionSeconds: number; durationSeconds: number; finished: boolean };

/** What the account service holds for the member. */
async function onServer(page: Page): Promise<(Place & { updatedAt: string })[]> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}").progress ?? [], DATA_KEY);
}

/** Positions waiting on the device to be sent. */
async function waiting(page: Page): Promise<(Place & { savedAt: string })[]> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "[]"), QUEUE_KEY);
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function position(page: Page) {
  return page.getByRole("slider", { name: "Playback position" });
}

test("opened offline, a member still has Continue watching and their place in each sermon", async ({
  page,
}) => {
  await seedWatchProgress(page, [
    {
      sermonId: SERMON,
      positionSeconds: 3000,
      durationSeconds: 6420,
      finished: false,
      updatedAt: "2026-10-13T10:00:00.000Z",
    },
  ]);
  await fakeYouTube(page);
  await page.goto("/");
  await expect(shown(page.getByTestId("continue-card"))).toHaveCount(1);
  // The app keeps a copy of what it showed.
  await expect.poll(async () => page.evaluate((key) => localStorage.getItem(key), COPY_KEY)).not.toBeNull();

  // The next launch has no connection: the account service can't be read.
  await goOffline(page);
  await page.reload();
  await expect(shown(page.getByTestId("continue-card"))).toHaveCount(1);
  // The card resumes the sermon where it was left, as signed in online.
  await shown(page.getByTestId("continue-card")).first().click();
  await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON}`));
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  expect((await ytLog(page)).starts).toEqual([3000]);
});

test("a place saved offline is kept on the device, survives a relaunch and is sent when the connection returns", async ({
  page,
}) => {
  await fakeYouTube(page);
  await page.goto(`/sermon/${SERMON}`);
  await page.getByRole("button", { name: "Watch sermon", exact: true }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  await expect
    .poll(async () => Number(await position(page).getAttribute("aria-valuenow")))
    .toBeGreaterThanOrEqual(20);

  // The connection drops, and the viewer pauses: the save can't reach the
  // account, so it waits on the device instead of being thrown away.
  await goOffline(page);
  await page.getByTestId("now-playing-toggle").click();
  await expect(page.getByTestId("playback-status")).toHaveText("Paused");
  await expect.poll(async () => (await waiting(page)).length).toBe(1);
  const kept = (await waiting(page))[0];
  expect(kept).toMatchObject({ sermonId: SERMON, durationSeconds: 600, finished: false });
  expect(kept.positionSeconds).toBeGreaterThanOrEqual(20);
  expect(await onServer(page)).toEqual([]);

  // The app is closed and opened again, still offline: the sermon offers
  // that place, not an older one.
  await page.reload();
  await expect(
    page.getByRole("button", { name: `Resume at ${clock(kept.positionSeconds)}`, exact: true }),
  ).toBeVisible();
  expect(await waiting(page)).toHaveLength(1);

  // The connection returns: the place is sent, and the device lets it go.
  await goOnline(page);
  await expect
    .poll(async () => (await onServer(page)).find((place) => place.sermonId === SERMON)?.positionSeconds)
    .toBe(kept.positionSeconds);
  await expect.poll(async () => (await waiting(page)).length).toBe(0);
});

test("a newer place made while an older one waits is the one that lands", async ({ page }) => {
  await fakeYouTube(page);
  await page.goto(`/sermon/${SERMON}`);
  await page.getByRole("button", { name: "Watch sermon", exact: true }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  await expect
    .poll(async () => Number(await position(page).getAttribute("aria-valuenow")))
    .toBeGreaterThanOrEqual(20);
  await goOffline(page);
  const toggle = page.getByTestId("now-playing-toggle");
  await toggle.click();
  await expect(page.getByTestId("playback-status")).toHaveText("Paused");
  await expect.poll(async () => (await waiting(page)).length).toBe(1);
  const older = (await waiting(page))[0].positionSeconds;

  // Still offline, the viewer plays on and pauses later in the sermon.
  await toggle.click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  await expect
    .poll(async () => Number(await position(page).getAttribute("aria-valuenow")))
    .toBeGreaterThanOrEqual(older + 10);
  await toggle.click();
  await expect(page.getByTestId("playback-status")).toHaveText("Paused");
  await expect.poll(async () => (await waiting(page))[0]?.positionSeconds).toBeGreaterThanOrEqual(older + 10);
  // One place per sermon waits: the newest.
  expect(await waiting(page)).toHaveLength(1);
  const newer = (await waiting(page))[0].positionSeconds;

  await goOnline(page);
  await expect.poll(async () => (await waiting(page)).length).toBe(0);
  const landed = (await onServer(page)).filter((place) => place.sermonId === SERMON);
  expect(landed.map((place) => place.positionSeconds)).toEqual([newer]);
});
