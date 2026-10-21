import type { Page } from "@playwright/test";
import {
  MEMBER,
  expect,
  fakeYouTube,
  goOffline,
  goOnline,
  pressControl,
  seedStorage,
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
const COPY_KEY = `aao.watchProgress.v1.${MEMBER.id}`;

type Place = { sermonId: string; positionSeconds: number; durationSeconds: number; finished: boolean };

/** What the account service holds for an account (the member's by default). */
async function onServer(page: Page, owner = MEMBER.id): Promise<(Place & { updatedAt: string })[]> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "{}").progress ?? [],
    `aao.local.data.v1.${owner}`,
  );
}

/** An account's positions waiting on the device to be sent. */
async function waiting(page: Page, owner = MEMBER.id): Promise<(Place & { savedAt: string })[]> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "[]"), `aao.watchQueue.v1.${owner}`);
}

/** The device's copies of accounts' watch progress, by key. */
async function copies(page: Page) {
  return page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("aao.watchProgress.v1.")));
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function position(page: Page) {
  return page.getByRole("slider", { name: "Playback position", includeHidden: true });
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
  await pressControl(page, page.getByTestId("now-playing-toggle"));
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
  await pressControl(page, toggle);
  await expect(page.getByTestId("playback-status")).toHaveText("Paused");
  await expect.poll(async () => (await waiting(page)).length).toBe(1);
  const older = (await waiting(page))[0].positionSeconds;

  // Still offline, the viewer plays on and pauses later in the sermon.
  await pressControl(page, toggle);
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  await expect
    .poll(async () => Number(await position(page).getAttribute("aria-valuenow")))
    .toBeGreaterThanOrEqual(older + 10);
  await pressControl(page, toggle);
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

test.describe("another device", () => {
  // slow@example.com's progress arrives 6 s after the app asks for it.
  const SLOW = { id: "local:slow@example.com", email: "slow@example.com", provider: "email" };
  test.use({ viewer: "guest" });

  test("a newer place saved on another device wins over this device's older copy", async ({ page }) => {
    const place = { sermonId: SERMON, durationSeconds: 6441, finished: false };
    await seedStorage(
      page,
      {
        "aao.local.session.v1": SLOW,
        // What this device last showed: 10:00, two days ago.
        [`aao.watchProgress.v1.${SLOW.id}`]: [
          { ...place, positionSeconds: 600, updatedAt: "2026-10-11T10:00:00.000Z" },
        ],
      },
      "slow",
    );
    // Since then, the web app saved 40:00.
    await seedWatchProgress(
      page,
      [{ ...place, positionSeconds: 2400, updatedAt: "2026-10-12T10:00:00.000Z" }],
      SLOW.id,
    );
    await fakeYouTube(page, { duration: 6441 });
    await page.goto(`/sermon/${SERMON}`);

    // Until the account's list arrives, the device's copy is all there is.
    await page.getByRole("button", { name: "Resume at 10:00", exact: true }).click();
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    expect((await ytLog(page)).starts).toEqual([600]);
    await pressControl(page, page.getByTestId("now-playing-toggle"));
    await expect(page.getByTestId("playback-status")).toHaveText("Paused");

    // The list arrives: the viewer moves to the newer place, and nothing
    // from the older copy is saved over it.
    await expect.poll(async () => (await ytLog(page)).commands, { timeout: 10_000 }).toContain("seek:2400");
    await expect(page.getByTestId("resume-note")).toHaveText(/Resuming at 40:00/);
    expect((await onServer(page, SLOW.id)).map((saved) => saved.positionSeconds)).toEqual([2400]);
    expect((await waiting(page, SLOW.id)).filter((saved) => saved.positionSeconds < 2400)).toEqual([]);
  });
});

test("signing out takes the account's places off the device, but a place not yet sent waits for it", async ({
  page,
}) => {
  // Left by an account signed out while the app was closed.
  await seedStorage(page, { "aao.watchProgress.v1.local:gone@example.com": [] }, "gone");
  await fakeYouTube(page);
  await page.goto(`/sermon/${SERMON}`);
  // Only the account signed in keeps a copy.
  await expect.poll(() => copies(page)).toEqual([COPY_KEY]);
  await page.getByRole("button", { name: "Watch sermon", exact: true }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  await expect
    .poll(async () => Number(await position(page).getAttribute("aria-valuenow")))
    .toBeGreaterThanOrEqual(20);
  await goOffline(page);
  await pressControl(page, page.getByTestId("now-playing-toggle"));
  await expect.poll(async () => (await waiting(page)).length).toBe(1);

  await page.goto("/account");
  await page.getByTestId("sign-out").click();
  await expect(page.getByTestId("toast")).toContainText("Signed out");
  await expect.poll(() => copies(page)).toEqual([]);
  // The place it hadn't sent stays under the account, for when it's back.
  expect(await waiting(page)).toHaveLength(1);
});
