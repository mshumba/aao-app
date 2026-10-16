import {
  expect,
  fakeYouTube,
  rows,
  sendToBackground,
  shown,
  tab,
  test,
  ytLog,
} from "./fixtures";

const watch = "Watch sermon";

test("before play, the length is given once and the band only times a real place", async ({
  page,
}) => {
  await page.goto("/sermon/nUW8NT2Pe88");
  const pill = page.getByRole("button", { name: watch, exact: true });
  await expect(pill).toBeVisible();
  // The kicker gives the length; the pill and the band don't repeat it.
  await expect(shown(page.getByText("27 Sep 2026 · 3 hr 35 min", { exact: true }))).toBeVisible();
  await expect(pill).not.toContainText("hr");
  // (The band's times are hidden from screen readers, so look on screen.)
  await expect(page.getByText("−3:35:00", { exact: true }).filter({ visible: true })).toHaveCount(0);
  await expect(page.getByText("0:00", { exact: true }).filter({ visible: true })).toHaveCount(0);
  // Opened at a moment, the band says where Play starts.
  await page.goto("/sermon/nUW8NT2Pe88?t=4120");
  await expect(page.getByRole("button", { name: "Play from 1 hour 8 minutes 40 seconds" })).toBeVisible();
  await expect(page.getByText("1:08:40", { exact: true }).filter({ visible: true })).toHaveCount(1);
  await expect(page.getByText("−2:26:20", { exact: true }).filter({ visible: true })).toHaveCount(1);
});

test("the menu's About this sermon shows the source line, even straight after opening", async ({
  page,
}) => {
  await page.goto("/");
  await rows(page).first().click();
  // At once, before the page below the stage has been drawn.
  await page.getByRole("button", { name: "More options" }).last().click();
  await page.getByRole("menuitem", { name: "About this sermon" }).click();
  const about = page.getByTestId("about-sermon").last();
  await expect(about).toBeInViewport();
  await expect(about.getByRole("button", { name: "Open in YouTube", exact: true })).toBeInViewport();
});

test("leaving the app while the player loads cancels the start", async ({
  page,
}) => {
  await fakeYouTube(page, { readyAfter: 1500 });
  await page.goto("/sermon/nUW8NT2Pe88");
  await page.getByRole("button", { name: watch, exact: true }).click();
  await sendToBackground(page);
  await expect(page.getByTestId("playback-status")).toHaveText("Press play to start");
  await page.waitForTimeout(300);
  expect((await ytLog(page)).commands).not.toContain("play");
});

test("Watch on YouTube while the player loads cancels the start", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await fakeYouTube(page, { readyAfter: 1500 });
  await page.goto("/sermon/nUW8NT2Pe88");
  await page.getByRole("button", { name: watch, exact: true }).click();
  await page
    .getByRole("button", { name: "Open in YouTube", exact: true })
    .click();
  await expect(page.getByTestId("playback-status")).toHaveText("Press play to start");
  await page.waitForTimeout(300);
  expect((await ytLog(page)).commands).not.toContain("play");
});

test("a slow player raises no errors while it loads", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await fakeYouTube(page, { readyAfter: 2500 });
  await page.goto("/sermon/nUW8NT2Pe88");
  await page.getByRole("button", { name: watch, exact: true }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing", {
    timeout: 8000,
  });
  expect(errors).toEqual([]);
});

test("a stalled player script can be retried without reloading", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await fakeYouTube(page, { stallFirst: true });
  await page.goto("/sermon/nUW8NT2Pe88");
  await page.getByRole("button", { name: watch, exact: true }).click();
  await expect(
    page.getByText(
      "The player didn’t load. Check your connection and try again.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
});

test("keyboard: focus follows Watch and Close, and the scrubber is a slider", async ({
  page,
}) => {
  await fakeYouTube(page);
  await page.goto("/sermon/nUW8NT2Pe88");
  await page.getByRole("button", { name: watch, exact: true }).focus();
  await page.keyboard.press("Enter");
  // The Watch button is replaced by the player; focus moves to Play/Pause.
  await expect(page.getByTestId("now-playing-toggle")).toBeFocused();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  const slider = page.getByRole("slider", { name: "Playback position" });
  await expect(slider).toHaveAttribute("aria-valuemax", "600");
  await slider.focus();
  await expect(slider).toBeFocused();
  const before = Number(await slider.getAttribute("aria-valuenow"));
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => Number(await slider.getAttribute("aria-valuenow")))
    .toBeGreaterThanOrEqual(before + 30);
  expect((await ytLog(page)).commands.some((c) => c.startsWith("seek:"))).toBe(
    true,
  );
  await page.keyboard.press("Home");
  await expect(page.getByTestId("elapsed")).toHaveText(/^0:0\d$/);
  // A hidden skip link after Back jumps to the player itself.
  await page.getByRole("button", { name: "Back", exact: true }).focus();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("button", { name: "Go to video player" });
  await expect(skip).toBeFocused();
  expect((await skip.boundingBox())!.width).toBeGreaterThan(48);
  await page.keyboard.press("Enter");
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName))
    .toBe("IFRAME");
  // Closing the dock returns focus to the page, not to nowhere.
  await page.getByRole("button", { name: "Back", exact: true }).click();
  const close = page.getByRole("button", { name: "Close player", exact: true });
  await close.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("player-dock")).toHaveCount(0);
  await expect(tab(page, "Home")).toBeFocused();
});

test("dragging the scrubber sideways seeks where it's released", async ({
  page,
}) => {
  await fakeYouTube(page);
  await page.goto("/sermon/nUW8NT2Pe88");
  await page.getByRole("button", { name: watch, exact: true }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  const bar = (await page.getByTestId("scrubber").boundingBox())!;
  const y = bar.y + bar.height / 2;
  // The rail stops 20px in from each side of the strip, level with the times.
  const at = (f: number) => bar.x + 20 + (bar.width - 40) * f;
  await page.mouse.move(at(0.2), y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(at(0.2 + i * 0.06), y);
  // While dragging, the time previews the target.
  await expect(page.getByTestId("elapsed")).toHaveText(/^(7:5\d|8:0\d)$/);
  await page.mouse.up();
  await expect
    .poll(async () => (await ytLog(page)).commands.some((c) => /^seek:(47\d|48\d)$/.test(c)))
    .toBe(true);
});

test("a docked failure is announced and named in the dock", async ({
  page,
}) => {
  await fakeYouTube(page, { error: 5, readyAfter: 800 });
  await page.goto("/");
  await rows(page).first().click();
  await page.getByRole("button", { name: watch, exact: true }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByTestId("dock-status")).toHaveText("Couldn’t play");
  await expect(
    page.getByRole("button", { name: /^Open Now Playing: .*\. Couldn’t play$/ }),
  ).toBeVisible();
  // Screen readers hear the reason; on screen the dock's status says it.
  const alert = page.getByRole("alert");
  await expect(alert).toHaveText(
    "The player couldn’t start on this device. Try again, or watch on YouTube.",
  );
  expect((await alert.boundingBox())!.width).toBeLessThanOrEqual(1);
  await expect(
    page.getByRole("region", { name: "Now playing" }),
  ).toBeVisible();
});

test("on a short window the player leaves room for the page", async ({
  page,
}) => {
  // A laptop browser zoomed to 200%.
  await page.setViewportSize({ width: 640, height: 360 });
  await fakeYouTube(page);
  await page.goto("/");
  await rows(page).first().click();
  await page.getByRole("button", { name: watch, exact: true }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  const video = (await page.getByTestId("player-full").boundingBox())!;
  expect(video.height).toBeGreaterThanOrEqual(200);
  expect(video.width).toBeGreaterThanOrEqual(200);
  // The title and controls can still be scrolled into view below it.
  const toggle = page.getByTestId("now-playing-toggle");
  await toggle.scrollIntoViewIfNeeded();
  const t = (await toggle.boundingBox())!;
  expect(t.y).toBeGreaterThanOrEqual(video.y + video.height);
  expect(t.y + t.height).toBeLessThanOrEqual(360);
  // Docked, there's no room for a video: the dock becomes a paused bar.
  await page.getByRole("button", { name: "Back", exact: true }).click();
  const dock = page.getByTestId("player-dock");
  await expect(page.getByTestId("dock-status")).toHaveText(
    "Paused · Open to keep watching",
  );
  await expect(page.getByTestId("fake-yt")).toBeHidden();
  expect((await ytLog(page)).commands).toContain("pause");
  expect((await dock.boundingBox())!.height).toBeLessThan(80);
  // Reopening shows the video again, where it paused, without reloading it.
  await page.getByRole("button", { name: /^Open Now Playing/ }).click();
  await expect(page.getByTestId("fake-yt")).toBeVisible();
  await expect(page.getByTestId("playback-status")).toHaveText("Paused");
  expect((await ytLog(page)).created).toBe(1);
});

test("keyboard focus scrolls clear of the docked player", async ({ page }) => {
  await fakeYouTube(page);
  await page.goto("/");
  await rows(page).first().click();
  await page.getByRole("button", { name: watch, exact: true }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  const dock = (await page.getByTestId("player-dock").boundingBox())!;
  // Tab through Home's content; every focused control stays above the dock.
  await tab(page, "Home").focus();
  await page.keyboard.press("Shift+Tab");
  for (let i = 0; i < 6; i++) {
    const box = await page.evaluate(() => {
      const r = document.activeElement?.getBoundingClientRect();
      return r ? { top: r.top, bottom: r.bottom } : null;
    });
    expect(box!.bottom).toBeLessThanOrEqual(dock.y + 1);
    await page.keyboard.press("Shift+Tab");
  }
});

test("when a browser refuses to start the video, the viewer is told how", async ({
  page,
}) => {
  await fakeYouTube(page, { blockAutoplay: true });
  await page.goto("/sermon/nUW8NT2Pe88");
  await page.getByRole("button", { name: watch, exact: true }).click();
  const status = page.getByTestId("playback-status");
  await expect(status).toHaveText("Tap play in the video to start", {
    timeout: 6000,
  });
  // Shown, not just announced, because it asks the viewer to act.
  expect((await status.boundingBox())!.width).toBeGreaterThan(100);
  await page.getByTestId("now-playing-toggle").click();
  await expect(status).toHaveText("Playing");
  // Playing is plain to see, so it's announced but not shown.
  await expect(status).toHaveCSS("opacity", "0");
});

test("a start that pauses or stalls instead of playing still gets advice", async ({
  page,
}) => {
  await fakeYouTube(page, { blockAutoplay: "paused" });
  await page.goto("/sermon/nUW8NT2Pe88");
  await page.getByRole("button", { name: watch, exact: true }).click();
  const status = page.getByTestId("playback-status");
  // While the app's own start is unresolved it says it's loading, not
  // "Press play" or a hidden "Paused".
  await expect(status).toHaveText("Loading the sermon…");
  await expect(status).toHaveText("Tap play in the video to start", {
    timeout: 6000,
  });
  await expect(status).toHaveCSS("opacity", "1");
  // The toggle doesn't claim to be playing.
  await expect(page.getByTestId("now-playing-toggle")).toHaveAttribute(
    "aria-label",
    "Play",
  );

  await page.goto("about:blank");
  await fakeYouTube(page, { blockAutoplay: "stall" });
  await page.goto("/sermon/nUW8NT2Pe88");
  await page.getByRole("button", { name: watch, exact: true }).click();
  await expect(status).toHaveText(
    "Still loading. If it doesn’t start, tap play in the video.",
    { timeout: 6000 },
  );
  await expect(page.getByTestId("now-playing-toggle")).toHaveAttribute(
    "aria-label",
    "Play",
  );
  await expect(status).toHaveText("Tap play in the video to start", {
    timeout: 9000,
  });
});

test("when the player fails, keyboard focus moves to the way forward", async ({
  page,
}) => {
  await fakeYouTube(page, { error: 5, readyAfter: 800 });
  await page.goto("/sermon/nUW8NT2Pe88");
  await page.getByRole("button", { name: watch, exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("now-playing-toggle")).toBeFocused();
  const slot = page.getByTestId("player-error");
  await expect(slot.getByRole("button", { name: "Try again" })).toBeFocused();
  await expect(slot.getByRole("button", { name: "Try again" })).toHaveAttribute(
    "aria-describedby",
    "player-error-message",
  );

  await page.goto("about:blank");
  await fakeYouTube(page, { error: 150, readyAfter: 800 });
  await page.goto("/sermon/nUW8NT2Pe88");
  await page.getByRole("button", { name: watch, exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByTestId("player-error").getByRole("button", { name: "Watch on YouTube" }),
  ).toBeFocused();
});

test("with a sermon docked, another sermon's page still has room", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await fakeYouTube(page);
  await page.goto("/sermon/nUW8NT2Pe88");
  await page.getByRole("button", { name: watch, exact: true }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  await rows(page).first().click();
  const dock = (await page.getByTestId("player-dock").boundingBox())!;
  // The poster scrolls with the page instead of being pinned above it, so
  // the page keeps a usable band above the dock (it had 26px before).
  const scrollTop = await page.evaluate(() => {
    const h1s = [...document.querySelectorAll("h1")].filter(
      (h) => !h.closest('[aria-hidden="true"]'),
    );
    let node: Element | null = h1s[h1s.length - 1];
    while (node && !/(auto|scroll)/.test(getComputedStyle(node).overflowY))
      node = node.parentElement;
    return node!.getBoundingClientRect().top;
  });
  expect(dock.y - scrollTop).toBeGreaterThanOrEqual(200);
  // While it plays, the dock says how long is left (and is named "Playing").
  await expect(page.getByTestId("dock-status")).toHaveText(/^\d+:\d\d left$/);
  await expect(
    page.getByRole("button", { name: /^Open Now Playing: .*\. Playing$/ }),
  ).toBeVisible();
});

test("a failed player explains itself where the video was", async ({
  page,
}) => {
  await fakeYouTube(page, { error: 150 });
  await page.goto("/sermon/nUW8NT2Pe88");
  await page.getByRole("button", { name: watch, exact: true }).click();
  const slot = page.getByTestId("player-error");
  await expect(slot.getByRole("alert")).toHaveText(
    "This sermon can only be watched on YouTube.",
  );
  await expect(
    slot.getByRole("button", { name: "Watch on YouTube", exact: true }),
  ).toBeVisible();
  // No retry that can't work, and no transport for a player that isn't there.
  await expect(slot.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await expect(page.getByTestId("now-playing-toggle")).toHaveCount(0);
  const box = (await slot.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(200);
  expect(box.y).toBeLessThan(150);
});

test("on a desktop window the video leaves room and the dock is a corner card", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await fakeYouTube(page);
  await page.goto("/");
  await rows(page).first().click();
  await page.getByRole("button", { name: watch, exact: true }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  const video = (await page.getByTestId("player-full").boundingBox())!;
  expect(video.height).toBeLessThanOrEqual(800 * 0.45 + 1);
  // The title and the controls are on screen without scrolling.
  const h1 = (await page.getByRole("heading", { level: 1 }).last().boundingBox())!;
  const toggle = (await page.getByTestId("now-playing-toggle").boundingBox())!;
  expect(h1.y + h1.height).toBeLessThanOrEqual(800);
  expect(toggle.y + toggle.height).toBeLessThanOrEqual(800);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  const dock = (await page.getByTestId("player-dock").boundingBox())!;
  expect(dock.width).toBeLessThanOrEqual(380);
  expect(dock.height).toBeLessThanOrEqual(280);
  expect(dock.x + dock.width).toBeGreaterThan(1280 - 40);
});
