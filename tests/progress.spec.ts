import type { Page } from "@playwright/test";
import {
  MEMBER,
  expect,
  fakeYouTube,
  pressControl,
  sendToBackground,
  showControls,
  shown,
  test,
  ytLog,
} from "./fixtures";

// Watch progress on the on-device account service, which keeps it with the
// member's data in localStorage. The fake player is 10 minutes long and its
// clock runs at 5 seconds per real second.
const DATA_KEY = `aao.local.data.v1.${MEMBER.id}`;

type Saved = {
  sermonId: string;
  positionSeconds: number;
  durationSeconds: number;
  finished: boolean;
  updatedAt: string;
};

async function savedProgress(page: Page, key = DATA_KEY): Promise<Saved[]> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw).progress ?? []) : [];
  }, key);
}

async function savedFor(page: Page, sermonId: string, key = DATA_KEY) {
  return (await savedProgress(page, key)).find((item) => item.sermonId === sermonId);
}

/** Seeds an account (the member's by default) with progress, once per tab, before the app loads. */
async function seedProgress(page: Page, progress: Saved[], key = DATA_KEY) {
  await page.addInitScript(
    ({ key, progress }) => {
      if (sessionStorage.getItem("__aao_progress_seeded")) return;
      sessionStorage.setItem("__aao_progress_seeded", "1");
      localStorage.setItem(
        key,
        JSON.stringify({
          profile: { displayName: null, interests: [], onboardedAt: "2026-10-01T00:00:00.000Z" },
          saved: [],
          progress,
        }),
      );
    },
    { key, progress },
  );
}

const seeded: Saved[] = [
  // Finished, and the most recent: not offered again.
  {
    sermonId: "yUDzMcZsVk8",
    positionSeconds: 10140,
    durationSeconds: 10140,
    finished: true,
    updatedAt: "2026-10-14T11:00:00.000Z",
  },
  // Only just started: nothing to continue.
  {
    sermonId: "nUW8NT2Pe88",
    positionSeconds: 5,
    durationSeconds: 12900,
    finished: false,
    updatedAt: "2026-10-14T12:00:00.000Z",
  },
  {
    sermonId: "WYiA7rjenVI",
    positionSeconds: 3000,
    durationSeconds: 6420,
    finished: false,
    updatedAt: "2026-10-13T10:00:00.000Z",
  },
  {
    sermonId: "H9sRbSUt0YE",
    positionSeconds: 250,
    durationSeconds: 600,
    finished: false,
    updatedAt: "2026-10-14T10:00:00.000Z",
  },
];

function position(page: Page) {
  return page.getByRole("slider", { name: "Playback position", includeHidden: true });
}

async function playUntil(page: Page, seconds: number) {
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  await expect
    .poll(async () => Number(await position(page).getAttribute("aria-valuenow")))
    .toBeGreaterThanOrEqual(seconds);
}

test.describe("with saved progress", () => {
  test.beforeEach(async ({ page }) => {
    await seedProgress(page, seeded);
  });

  test("Home's Continue watching lists unfinished sermons, most recent first", async ({
    page,
  }) => {
    await page.goto("/");
    const row = shown(page.getByTestId("continue-watching"));
    await expect(row.getByRole("heading", { name: "Continue watching" })).toBeVisible();
    const cards = shown(page.getByTestId("continue-card"));
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toHaveAccessibleName(
      "Apostolic Shift: Grand Finale. 6 min left.",
    );
    await expect(cards.nth(1)).toHaveAccessibleName("Apostolic Shift: Day One. 57 min left.");
    await expect(cards.nth(0)).toContainText("6 min left");
    // Each card shows how far in the viewer is.
    const fill = cards.nth(0).getByTestId("progress-bar").locator("> div");
    await expect
      .poll(async () => {
        const [bar, track] = await Promise.all([
          fill.boundingBox(),
          cards.nth(0).getByTestId("progress-bar").boundingBox(),
        ]);
        return Math.round((bar!.width / track!.width) * 100);
      })
      .toBe(42);
    // As the concept orders Home: under the hero and the question field,
    // above the latest sermons.
    const field = page.getByRole("button", { name: "What are you going through?", exact: true });
    const latest = shown(page.getByTestId("latest-sermons"));
    const top = (await row.boundingBox())!.y;
    expect(top).toBeGreaterThan((await field.boundingBox())!.y);
    expect(top).toBeLessThan((await latest.boundingBox())!.y);
  });

  test("a Continue watching card resumes the sermon where it was left", async ({
    page,
  }) => {
    await fakeYouTube(page);
    await page.goto("/");
    await shown(page.getByTestId("continue-card")).first().click();
    await expect(page).toHaveURL(/\/sermon\/H9sRbSUt0YE$/);
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    expect((await ytLog(page)).starts).toEqual([250]);
    // It opens straight into the full player, never the dock.
    await expect(page.getByTestId("player-full")).toBeVisible();
    await expect(page.getByTestId("resume-note")).toHaveText(/Resuming at 4:10/);
  });

  test("the sermon page offers to resume, and Start over plays from the beginning", async ({
    page,
  }) => {
    await fakeYouTube(page);
    await page.goto("/sermon/H9sRbSUt0YE");
    const resume = page.getByRole("button", { name: "Resume at 4:10", exact: true });
    await expect(resume).toBeVisible();
    // How far in, along the bottom of the poster.
    await expect(resume.getByTestId("progress-bar")).toBeVisible();
    await resume.click();
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    expect((await ytLog(page)).starts).toEqual([250]);
    await expect(page.getByTestId("resume-note")).toBeVisible();
    await page.getByRole("button", { name: "Start over", exact: true }).click();
    await expect(page.getByTestId("resume-note")).toHaveCount(0);
    await expect(page.getByTestId("now-playing-toggle")).toBeFocused();
    expect((await ytLog(page)).commands).toContain("seek:0");
    await expect(page.getByTestId("elapsed")).toHaveText(/^0:0\d$/);
  });

  test("watching to the end marks it finished and drops it from Continue watching", async ({
    page,
  }) => {
    await fakeYouTube(page);
    await page.goto("/sermon/H9sRbSUt0YE");
    await page.getByRole("button", { name: "Resume at 4:10", exact: true }).click();
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    await showControls(page);
    await position(page).focus();
    await page.keyboard.press("End");
    await pressControl(page, page.getByTestId("now-playing-toggle"));
    await expect.poll(async () => (await savedFor(page, "H9sRbSUt0YE"))?.finished).toBe(true);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    const cards = shown(page.getByTestId("continue-card"));
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toHaveAccessibleName(/^Apostolic Shift: Day One\./);
    // Watched to the end, it starts from the beginning next time.
    await page.goto("/sermon/H9sRbSUt0YE");
    await expect(page.getByRole("button", { name: "Watch sermon", exact: true })).toBeVisible();
  });
});

test("pausing saves the place, and the sermon resumes there after a reload", async ({
  page,
}) => {
  await fakeYouTube(page);
  await page.goto("/sermon/WYiA7rjenVI");
  await page.getByRole("button", { name: "Watch sermon", exact: true }).click();
  await playUntil(page, 20);
  await pressControl(page, page.getByTestId("now-playing-toggle"));
  await expect(page.getByTestId("playback-status")).toHaveText("Paused");
  await expect.poll(async () => (await savedFor(page, "WYiA7rjenVI"))?.positionSeconds ?? 0)
    .toBeGreaterThanOrEqual(20);
  const saved = (await savedFor(page, "WYiA7rjenVI"))!;
  expect(saved).toMatchObject({ durationSeconds: 600, finished: false });

  await page.reload();
  const at = `${Math.floor(saved.positionSeconds / 60)}:${String(saved.positionSeconds % 60).padStart(2, "0")}`;
  await page.getByRole("button", { name: `Resume at ${at}`, exact: true }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  expect((await ytLog(page)).starts).toEqual([saved.positionSeconds]);
  await expect(page.getByTestId("resume-note")).toHaveText(new RegExp(`Resuming at ${at}`));

  // Home lists it while it keeps playing in the dock.
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByTestId("player-dock")).toBeVisible();
  await expect(shown(page.getByTestId("continue-card"))).toHaveCount(1);
  await expect(shown(page.getByTestId("continue-card")).first()).toHaveAccessibleName(
    /^Apostolic Shift: Day One\./,
  );
});

test("docking, closing and leaving the app each save the place", async ({ page }) => {
  await fakeYouTube(page);
  await page.goto("/sermon/WYiA7rjenVI");
  await page.getByRole("button", { name: "Watch sermon", exact: true }).click();
  await playUntil(page, 20);
  // Docked: still playing, place saved.
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByTestId("player-dock")).toBeVisible();
  await expect.poll(async () => (await savedFor(page, "WYiA7rjenVI"))?.positionSeconds ?? 0)
    .toBeGreaterThanOrEqual(20);
  const docked = (await savedFor(page, "WYiA7rjenVI"))!.positionSeconds;

  // Leaving the app pauses and saves where it got to.
  await page.waitForTimeout(1000);
  await sendToBackground(page);
  await expect.poll(async () => (await savedFor(page, "WYiA7rjenVI"))!.positionSeconds)
    .toBeGreaterThan(docked);
  const left = (await savedFor(page, "WYiA7rjenVI"))!.positionSeconds;

  // Closing the player keeps the place, even when nothing new played.
  await page.getByRole("button", { name: "Close player", exact: true }).click();
  await expect(page.getByTestId("player-dock")).toHaveCount(0);
  expect((await savedFor(page, "WYiA7rjenVI"))!.positionSeconds).toBe(left);
});

test("docked on Home, the hero and Continue watching show the place just saved", async ({
  page,
}) => {
  await fakeYouTube(page);
  await page.goto("/");
  const watch = shown(page.getByTestId("hero-watch"));
  await expect(watch).toHaveAccessibleName(/^Watch sermon: /);
  await expect(page.getByTestId("continue-watching")).toHaveCount(0);
  await watch.click();
  const id = page.url().split("/sermon/")[1];
  await playUntil(page, 20);
  // Home follows only its own sermons' progress; docking saves one of them.
  await page.getByRole("button", { name: "Back", exact: true }).click();
  const dock = page.getByTestId("player-dock");
  await expect(dock).toBeVisible();
  await expect.poll(async () => (await savedFor(page, id))?.positionSeconds ?? 0)
    .toBeGreaterThanOrEqual(20);
  const docked = (await savedFor(page, id))!.positionSeconds;
  await expect(watch).toHaveAccessibleName(new RegExp(`^Resume sermon: .+, from ${spoken(docked)}$`));
  await expect(shown(page.getByTestId("continue-card"))).toHaveCount(1);
  // Pausing in the dock saves a later place, which the hero picks up
  // without Home being opened again.
  await page.waitForTimeout(1500);
  await dock.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByTestId("dock-status")).toHaveText("Paused");
  await expect.poll(async () => (await savedFor(page, id))!.positionSeconds).toBeGreaterThan(docked);
  const paused = (await savedFor(page, id))!.positionSeconds;
  await expect(watch).toHaveAccessibleName(new RegExp(`, from ${spoken(paused)}$`));
});

/** How the hero says a place: "1 minute 5 seconds". */
function spoken(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return [m && `${m} minute${m === 1 ? "" : "s"}`, s && `${s} second${s === 1 ? "" : "s"}`]
    .filter(Boolean)
    .join(" ");
}

test("the place is saved every 15 seconds while a sermon plays", async ({ page }) => {
  test.setTimeout(60_000);
  await fakeYouTube(page);
  await page.goto("/sermon/WYiA7rjenVI");
  await page.getByRole("button", { name: "Watch sermon", exact: true }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  // Nothing yet; then a save without pausing, docking or closing.
  await page.waitForTimeout(5000);
  expect(await savedFor(page, "WYiA7rjenVI")).toBeUndefined();
  await expect
    .poll(async () => (await savedFor(page, "WYiA7rjenVI"))?.positionSeconds ?? 0, {
      timeout: 20_000,
    })
    .toBeGreaterThanOrEqual(50);
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
});

test("Continue watching is hidden when there's nothing to continue", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Watch sermon: / })).toBeVisible();
  await expect(page.getByTestId("continue-watching")).toHaveCount(0);
});

test.describe("as a guest", () => {
  test.use({ viewer: "guest" });

  test("signing in to watch resumes where the account left off, without overwriting it", async ({
    page,
  }) => {
    // The local service signs in with Apple as this account.
    const apple = "aao.local.data.v1.local:apple.viewer@example.com";
    await seedProgress(page, seeded, apple);
    await fakeYouTube(page);
    await page.goto("/sermon/H9sRbSUt0YE");
    await page.getByRole("button", { name: "Watch sermon", exact: true }).click();
    await page.getByTestId("continue-apple").click();
    // The sermon started before the account's progress arrived, then caught up.
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    await expect(page.getByTestId("resume-note")).toHaveText(/Resuming at 4:10/);
    await expect
      .poll(async () => Number(await position(page).getAttribute("aria-valuenow")))
      .toBeGreaterThanOrEqual(250);
    const log = await ytLog(page);
    expect(log.starts.includes(250) || log.commands.includes("seek:250")).toBe(true);
    await pressControl(page, page.getByTestId("now-playing-toggle"));
    await expect
      .poll(async () => (await savedFor(page, "H9sRbSUt0YE", apple))?.positionSeconds)
      .toBeGreaterThanOrEqual(250);
  });

  test("signing in to watch still plays when the player is slow to load", async ({ page }) => {
    // A slow player is still loading when the account's place arrives, so the
    // sermon restarts there; the first player's late "ready" must not count.
    const apple = "aao.local.data.v1.local:apple.viewer@example.com";
    await seedProgress(page, seeded, apple);
    await fakeYouTube(page, { readyAfter: 900 });
    await page.goto("/sermon/H9sRbSUt0YE");
    await page.getByRole("button", { name: "Watch sermon", exact: true }).click();
    await page.getByTestId("continue-apple").click();
    await expect(page.getByTestId("playback-status")).toHaveText("Playing", { timeout: 15000 });
    await expect(page.getByTestId("resume-note")).toHaveText(/Resuming at 4:10/);
  });

  test("Continue watching is hidden, even with an account's progress on the device", async ({
    page,
  }) => {
    await seedProgress(page, seeded);
    await page.goto("/");
    await expect(page.getByRole("button", { name: /^Watch sermon: / })).toBeVisible();
    await expect(page.getByTestId("continue-watching")).toHaveCount(0);
  });
});
