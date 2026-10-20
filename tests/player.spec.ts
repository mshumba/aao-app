import {
  HABIT,
  LENGTH,
  SERMON,
  expect,
  fakeYouTube,
  pressControl,
  rows,
  seedPathProgress,
  sendToBackground,
  showControls,
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
  // The meta block gives the date and length once; the poster and rail don't repeat it.
  await expect(shown(page.getByText("27 Sep 2026", { exact: true }))).toBeVisible();
  await expect(shown(page.getByText("3 hr 35 min", { exact: true }))).toBeVisible();
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
  await page.getByTestId("stage-header-right").last().click();
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
  await page.getByRole("tab", { name: "About", exact: true }).click();
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
    .toBeGreaterThanOrEqual(before + 15);
  expect((await ytLog(page)).commands.some((c) => c.startsWith("seek:"))).toBe(
    true,
  );
  await page.keyboard.press("Home");
  await expect(page.getByTestId("elapsed")).toHaveText(/^0:0\d$/);
  // A hidden skip link after Back jumps straight to the video player's
  // Play/Pause control, bringing the controls back if they have faded.
  await page.getByRole("button", { name: "Back", exact: true }).focus();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("button", { name: "Go to video player" });
  await expect(skip).toBeFocused();
  expect((await skip.boundingBox())!.width).toBeGreaterThan(48);
  await expect(page.getByRole("button", { name: "Show video controls", exact: true })).toBeVisible({
    timeout: 6000,
  });
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("now-playing-toggle")).toBeFocused();
  await expect(page.getByRole("button", { name: "Hide video controls", exact: true })).toBeVisible();
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
  await showControls(page);
  const bar = (await page.getByTestId("scrubber").boundingBox())!;
  const y = bar.y + bar.height / 2;
  // The rail stops 8px in from each side of the strip.
  const at = (f: number) => bar.x + 8 + (bar.width - 16) * f;
  await page.mouse.move(at(0.2), y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(at(0.2 + i * 0.06), y);
  // While dragging, the time previews the target, and the thumb is under
  // the finger (drawn every frame, not from the throttled time).
  await expect(page.getByTestId("elapsed")).toHaveText(/^(7:5\d|8:0\d)$/);
  const thumb = (await page.getByTestId("scrubber-drag-thumb").boundingBox())!;
  expect(Math.abs(thumb.x + thumb.width / 2 - at(0.8))).toBeLessThanOrEqual(12);
  await page.mouse.up();
  await expect
    .poll(async () => (await ytLog(page)).commands.some((c) => /^seek:(47\d|48\d)$/.test(c)))
    .toBe(true);
  // Letting go swaps the drag thumb for the resting one (a fresh view, so a
  // phone can't keep the drag's place and size on it), which then follows
  // the next seek at its normal size.
  await expect(page.getByTestId("scrubber-drag-thumb")).toHaveCount(0);
  await showControls(page);
  await page.getByRole("slider", { name: "Playback position" }).focus();
  await page.keyboard.press("Home");
  await expect.poll(async () => (await ytLog(page)).commands).toContain("seek:0");
  await expect
    .poll(async () => {
      const rest = (await page.getByTestId("scrubber-thumb").boundingBox())!;
      return Math.abs(rest.x + rest.width / 2 - at(0)) <= 12 && rest.width < 18;
    })
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
  // Play/Pause sits on the video, and the title below can be scrolled into view.
  const toggle = page.getByTestId("now-playing-toggle");
  const t = (await toggle.boundingBox())!;
  expect(t.y).toBeGreaterThanOrEqual(video.y);
  expect(t.y + t.height).toBeLessThanOrEqual(video.y + video.height);
  const h1 = shown(page.locator("h1"));
  await h1.scrollIntoViewIfNeeded();
  const h = (await h1.boundingBox())!;
  expect(h.y).toBeGreaterThanOrEqual(video.y + video.height - 2);
  expect(h.y + h.height).toBeLessThanOrEqual(360);
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
  await expect(status).toHaveText("Tap Play to start", {
    timeout: 6000,
  });
  // Shown, not just announced, because it asks the viewer to act.
  expect((await status.boundingBox())!.width).toBeGreaterThan(80);
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
  await expect(status).toHaveText("Tap Play to start", {
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
    "Still loading. If it doesn’t start, tap Play.",
    { timeout: 6000 },
  );
  await expect(page.getByTestId("now-playing-toggle")).toHaveAttribute(
    "aria-label",
    "Play",
  );
  await expect(status).toHaveText("Tap Play to start", {
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
  await page.getByRole("tab", { name: "About", exact: true }).click();
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

test("a player that fails in full screen leaves full screen, so Try again can be reached", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fakeYouTube(page, { error: 5, readyAfter: 1500 });
  await page.goto("/sermon/nUW8NT2Pe88");
  await page.getByRole("button", { name: watch, exact: true }).click();
  // Full screen while it's still loading.
  const fs = page.getByTestId("player-fullscreen-button");
  await fs.click();
  await expect(fs).toHaveAttribute("aria-label", "Exit full screen");
  const slot = page.getByTestId("player-error");
  await expect(slot).toBeVisible();
  // The page isn't left hidden behind a full-screen player that's gone.
  await expect(page.locator('[aria-hidden="true"] [data-testid="player-error"]')).toHaveCount(0);
  await slot.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Loading the sermon…");
  await expect(fs).toHaveAttribute("aria-label", "Full screen");
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

test("stage overlay controls toggle captions, fill the window in full screen on the web, and stack rapid ±15 skips", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fakeYouTube(page);
  await page.goto("/sermon/nUW8NT2Pe88");
  await page.getByRole("button", { name: watch, exact: true }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  // Toggle captions on and off through YouTube's captions module. The fake
  // player, like the real one, still names the English track after captions
  // are switched off: the badge follows what CC asked for.
  const cc = page.getByTestId("player-cc-button");
  await expect(cc).toHaveAttribute("aria-label", "Closed captions off");
  await pressControl(page, cc);
  await expect(cc).toHaveAttribute("aria-label", "Closed captions on");
  await pressControl(page, cc);
  await expect(cc).toHaveAttribute("aria-label", "Closed captions off");
  await page.waitForTimeout(700);
  await expect(cc).toHaveAttribute("aria-label", "Closed captions off");
  await pressControl(page, cc);
  await expect(cc).toHaveAttribute("aria-label", "Closed captions on");
  // Three rapid +15s taps stack to +45s instead of losing an intermediate tap.
  await pressControl(page, page.getByTestId("now-playing-toggle"));
  await expect(page.getByTestId("playback-status")).toHaveText("Paused");
  const before = Number(
    await page.getByRole("slider", { name: "Playback position" }).getAttribute("aria-valuenow"),
  );
  const skipFwd = page.getByTestId("player-skip-forward");
  await skipFwd.click();
  await skipFwd.click();
  await skipFwd.click();
  await expect
    .poll(async () =>
      Number(
        await page.getByRole("slider", { name: "Playback position" }).getAttribute("aria-valuenow"),
      ),
    )
    .toBeGreaterThanOrEqual(before + 44);
  const log = await ytLog(page);
  expect(log.commands.filter((c) => c === "captions:en")).toHaveLength(2);
  expect(log.commands).toContain("captions:off");
  // Full screen in place: a browser turns its own page, so the video fills
  // the window as it is, without being turned.
  const fs = page.getByTestId("player-fullscreen-button");
  await expect(fs).toHaveAttribute("aria-label", "Full screen");
  await fs.click();
  await expect(fs).toHaveAttribute("aria-label", "Exit full screen");
  const box = (await page.getByTestId("player-full").boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.y).toBe(0);
  expect(box.width).toBe(390);
  expect(box.height).toBe(844);
  const innerSize = await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="player-full"]');
    const videoView = shell?.firstElementChild as HTMLElement | null;
    return videoView
      ? {
          offsetWidth: videoView.offsetWidth,
          offsetHeight: videoView.offsetHeight,
          transform: getComputedStyle(videoView).transform,
        }
      : null;
  });
  expect(innerSize?.offsetWidth).toBe(390);
  expect(innerSize?.offsetHeight).toBe(844);
  expect(innerSize?.transform).toBe("none");
  await page.keyboard.press("Escape");
  await expect(fs).toHaveAttribute("aria-label", "Full screen");
  expect((await ytLog(page)).created).toBe(1);
});

test("the controls fade 3 s after play, but not while keyboard focus is on them", async ({
  page,
}) => {
  await fakeYouTube(page);
  await page.goto("/sermon/nUW8NT2Pe88");
  const hide = page.getByRole("button", { name: "Hide video controls", exact: true });
  const show = page.getByRole("button", { name: "Show video controls", exact: true });
  // Watch by keyboard: focus moves to Pause, and the controls stay up.
  await page.getByRole("button", { name: watch, exact: true }).focus();
  await page.keyboard.press("Enter");
  const toggle = page.getByTestId("now-playing-toggle");
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  await expect(toggle).toBeFocused();
  await page.waitForTimeout(4000);
  await expect(hide).toBeVisible();
  await expect(toggle).toBeFocused();
  // Focus leaves the player: they fade about 3 s later.
  const left = Date.now();
  await page.locator("h1").filter({ visible: true }).last().click();
  await expect(show).toBeVisible({ timeout: 8000 });
  expect(Date.now() - left).toBeGreaterThanOrEqual(2500);
  // A tap brings them back, and they fade again, though the tap focused
  // the video (a pointer's focus doesn't hold them).
  await show.click();
  await expect(hide).toBeVisible();
  await expect(show).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
});

test("on a 320pt phone the controls keep clear of YouTube's logo corner and the times fit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await fakeYouTube(page, { duration: LENGTH[SERMON.pray] });
  await page.goto(`/sermon/${SERMON.pray}`);
  await page.getByRole("button", { name: watch, exact: true }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  await expect(page.getByTestId("duration")).toHaveText("3:35:14");
  const box = (await page.getByTestId("player-full").boundingBox())!;
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  // The full-screen button ends before the 96pt logo corner, and the speed
  // pill, with no room left in the bottom row, sits beside CC under the
  // title strip.
  const fs = (await page.getByTestId("player-fullscreen-button").boundingBox())!;
  expect(fs.x + fs.width).toBeLessThanOrEqual(right - 96 + 0.5);
  const speed = (await page.getByTestId("player-speed-button").boundingBox())!;
  expect(speed.y).toBeGreaterThanOrEqual(box.y + 48);
  expect(speed.y + speed.height).toBeLessThanOrEqual(box.y + 48 + 36 + 0.5);
  const rail = (await page.getByTestId("scrubber").boundingBox())!;
  expect(rail.width).toBeGreaterThanOrEqual(60);
  // Neither time is cut short.
  for (const id of ["elapsed", "duration"])
    expect(
      await page.getByTestId(id).evaluate((el) => el.scrollWidth <= el.clientWidth),
      id,
    ).toBe(true);
  const hitTestId = (x: number, y: number) =>
    page.evaluate(
      ([px, py]) =>
        document.elementFromPoint(px, py)?.closest("[data-testid]")?.getAttribute("data-testid") ?? null,
      [x, y] as const,
    );
  expect(await hitTestId(right - 48, bottom - 22)).toBe("fake-yt");
  expect(await hitTestId(right - 8, bottom - 4)).toBe("fake-yt");
});

test("the path's days drawer shows this day and the next, and a locked day says why", async ({
  page,
}) => {
  await seedPathProgress(page, { [HABIT]: [1, 2] });
  await page.goto(`/sermon/${SERMON.dayTwo}?path=${HABIT}&day=3`);
  await page.getByRole("button", { name: "Path days", exact: true }).click();
  const drawer = page.getByTestId("stage-days-drawer");
  await expect(drawer).toBeVisible();
  // Today's day (this one) and the next; the rest are on the path's page.
  await expect(drawer.getByTestId("stage-drawer-day")).toHaveCount(2);
  await expect(drawer.getByRole("menuitem", { name: /^Day 3 of 7, this day\. / })).toBeVisible();
  await expect(drawer.getByTestId("stage-drawer-done")).toHaveText("2 of 7 days done");
  await expect(drawer.getByRole("menuitem", { name: /^Go to / })).toBeVisible();
  // The backdrop isn't a control of its own for assistive tech.
  await expect(page.getByRole("button", { name: "Close drawer" })).toHaveCount(0);
  await drawer.getByRole("menuitem", { name: /^Day 4 of 7, opens after Day 3\. / }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByTestId("locked-day")).toBeVisible();
  await expect(page.getByTestId("locked-day")).toContainText("Day 4 opens after Day 3");
});
