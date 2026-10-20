import {
  expect,
  fakeYouTube,
  finishYouTube,
  HABIT,
  LENGTH,
  pressControl,
  seedPathProgress,
  sendToBackground,
  SERMON,
  test,
  ytLog,
} from "./fixtures";

// Opening a path day is an explicit play request even when that sermon is
// already in the dock. Simply expanding the dock carries no such request.
test.describe("returning to a paused path sermon", () => {
  test.beforeEach(async ({ page }) => {
    await seedPathProgress(page, { [HABIT]: [1, 2] });
    await fakeYouTube(page, { duration: LENGTH[SERMON.dayTwo] });
    await page.goto(`/path/${HABIT}`);
    await page.getByTestId("path-cta").click();
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    await pressControl(page, page.getByTestId("now-playing-toggle"));
    await expect(page.getByTestId("playback-status")).toHaveText("Paused");
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/path/${HABIT}$`));
    await expect(page.getByTestId("dock-status")).toHaveText("Paused");
  });

  test("Continue plays the already-loaded sermon without another Play press", async ({ page }) => {
    await page.getByTestId("path-cta").click();
    await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.dayTwo}\\?path=${HABIT}&day=3$`));
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    // Keep the existing embed and its place when resuming.
    expect((await ytLog(page)).created).toBe(1);
  });

  test("backgrounding before the new sermon screen settles keeps playback paused", async ({ page }) => {
    const before = await ytLog(page);
    // Dispatch both in one browser task: background hold must precede the
    // route's deferred stage callback, as when a native push is interrupted.
    await page.getByTestId("path-cta").evaluate((button: HTMLElement) => {
      button.click();
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.dayTwo}\\?path=${HABIT}&day=3$`));
    await expect(page.getByTestId("player-full")).toBeVisible();
    await expect(page.getByTestId("playback-status")).toHaveText("Paused");
    expect((await ytLog(page)).commands.filter((command) => command === "play")).toEqual(
      before.commands.filter((command) => command === "play"),
    );
  });

  test("expanding the dock leaves the sermon paused", async ({ page }) => {
    const before = await ytLog(page);
    await page.getByRole("button", { name: /^Open Now Playing/ }).click();
    await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.dayTwo}$`));
    await expect(page.getByTestId("player-full")).toBeVisible();
    await expect(page.getByTestId("playback-status")).toHaveText("Paused");
    const after = await ytLog(page);
    expect(after.created).toBe(1);
    expect(after.commands.filter((command) => command === "play")).toEqual(
      before.commands.filter((command) => command === "play"),
    );
  });
});

test("opening a completed path day replays the already-ended sermon", async ({ page }) => {
  await seedPathProgress(page, { [HABIT]: [1, 2] });
  await fakeYouTube(page, { duration: LENGTH[SERMON.dayTwo] });
  await page.goto(`/path/${HABIT}`);
  await page.getByTestId("path-cta").click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  await finishYouTube(page);
  await expect(page.getByTestId("playback-status")).toHaveText("Sermon ended");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Day 3 done", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByTestId("path-day-3").click();
  await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.dayTwo}\\?path=${HABIT}&day=3$`));
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  expect((await ytLog(page)).created).toBe(1);
});

for (const background of [false, true]) {
  test(background
    ? "backgrounding cancels a path play request that is waiting for the player"
    : "Continue restores a canceled start while the same player is still loading", async ({ page }) => {
    await seedPathProgress(page, { [HABIT]: [1, 2] });
    await fakeYouTube(page, { duration: LENGTH[SERMON.dayTwo] });
    // Hold the provider script instead of relying on a fast series of clicks
    // to beat ready. Returning the route resumes the existing fake API.
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    await page.route("https://www.youtube.com/iframe_api", async (route) => {
      await pending;
      await route.fallback();
    });
    try {
      // At this height the dock hides its video and cancels autoplay.
      await page.setViewportSize({ width: 640, height: 360 });
      await page.goto(`/path/${HABIT}`);
      await page.getByTestId("path-cta").click();
      await expect(page.getByTestId("playback-status")).toHaveText("Loading the sermon…");
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await expect(page.getByTestId("dock-status")).toHaveText("Paused · Open to keep watching");
      await page.getByTestId("path-cta").click();
      await expect(page.getByTestId("player-full")).toBeVisible();
      await expect(page.getByTestId("playback-status")).toHaveText("Loading the sermon…");
      if (background) await sendToBackground(page);
      release();
      await expect(page.getByTestId("playback-status")).toHaveText(
        background ? "Press play to start" : "Playing",
      );
      const log = await ytLog(page);
      expect(log.created).toBe(1);
      expect(log.commands.filter((command) => command === "play")).toHaveLength(background ? 0 : 1);
    } finally {
      release();
    }
  });
}
