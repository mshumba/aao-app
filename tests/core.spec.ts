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

const lioness =
  "LIONESS CONFERENCE || PRAY WITHOUT CEASING || GRAND FINALE || 27TH SEPTEMBER 2026";

test("guest browse, exact sermon identity, search and back navigation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("iframe")).toHaveCount(0);
  await page
    .getByRole("button", { name: "What are you going through?", exact: true })
    .click();
  const input = page.getByRole("searchbox", { name: "What are you going through?" });
  // Home's question field opens the Search tab ready to type.
  await expect(input).toBeFocused();
  await expect(tab(page, "Search")).toHaveAttribute("aria-selected", "true");
  await input.fill("pray");
  // Titles only: topics aren't searched as words (they have their own pages).
  await expect(
    shown(page.getByTestId("result-count")),
  ).toHaveText("1 sermon");
  await page.getByRole("button", { name: /^Pray Without Ceasing\./ }).click();
  // A short headline leads; the verified title is kept exactly, with its
  // source, in the details.
  await expect(
    page.getByRole("heading", { level: 1, name: "Pray Without Ceasing", exact: true }),
  ).toBeVisible();
  await expect(
    shown(page.getByText("27 Sep 2026 · 3 hr 35 min", { exact: true })),
  ).toBeVisible();
  await expect(
    shown(page.getByText("Apostle Arome Osayi · Lioness Conference · Grand Finale", { exact: true })),
  ).toBeVisible();
  await expect(shown(page.getByText(lioness, { exact: true }))).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open in YouTube", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Watch sermon", exact: true }),
  ).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(input).toHaveValue("pray");
  await input.fill("no-such-sermon");
  // No title matches isn't an error: the first row says what Return does.
  await expect(
    shown(page.getByRole("button", { name: "Search for no-such-sermon", exact: true })),
  ).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(input).toHaveValue("");
  await expect(shown(page.getByRole("heading", { name: "Browse by topic" }))).toBeVisible();
});

test("each screen has one visible page heading", async ({ page }) => {
  for (const path of [
    "/",
    "/sermon/nUW8NT2Pe88",
    "/paths",
    "/path/breaking-free-from-habitual-sin",
    "/topics/prayer",
    "/search",
    "/search?q=fear",
    "/account",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("button").first()).toBeVisible();
    await expect(shown(page.locator("h1"))).toHaveCount(1);
  }
  await page.goto("/sermon/nUW8NT2Pe88");
  await expect(
    page.getByRole("heading", { level: 2, name: "More sermons" }),
  ).toBeVisible();
});

test("sermon rows give this year's dates without the year, older ones with it", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-16T12:00:00"));
  await page.goto("/sermons");
  const row = shown(page.getByTestId("sermon-row")).first();
  await expect(row).toContainText("27 Sep · 3 hr 35 min");
  await expect(row).not.toContainText("2026");
  // Read aloud in full.
  await expect(row).toHaveAccessibleName(/^Pray Without Ceasing\. .*27 Sep 2026, 3 hours 35 minutes\./);
  await page.clock.setFixedTime(new Date("2027-01-04T12:00:00"));
  await page.reload();
  await expect(shown(page.getByTestId("sermon-row")).first()).toContainText("27 Sep 2026 · 3 hr 35 min");
});

test("on a narrow phone a row's kicker shortens the event, never the session", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/sermons");
  const row = shown(page.getByTestId("sermon-row")).first();
  const session = row.getByText("· Grand Finale", { exact: true });
  // The kicker's first part (the artwork's fallback names the event too).
  const event = session.locator("xpath=preceding-sibling::*[1]");
  await expect(event).toHaveText("Lioness Conference");
  await expect(session).toBeVisible();
  const cut = (el: HTMLElement) => el.scrollWidth > el.clientWidth;
  // The event gives way…
  expect(await event.evaluate(cut)).toBe(true);
  // …and the session that tells a gathering's rows apart shows whole, on the same line.
  expect(await session.evaluate(cut)).toBe(false);
  const [e, t] = [(await event.boundingBox())!, (await session.boundingBox())!];
  expect(Math.abs(e.y - t.y)).toBeLessThan(2);
  expect(t.x).toBeGreaterThan(e.x);
  expect(t.x + t.width).toBeLessThanOrEqual(320 - 16 + 1);
  // Read in full.
  await expect(row).toHaveAccessibleName(/^Pray Without Ceasing\. Lioness Conference · Grand Finale, /);
});

test("unavailable sermon gives a route back to browse", async ({ page }) => {
  await page.goto("/sermon/not-a-real-id");
  await expect(
    page.getByRole("heading", { name: "This sermon isn’t available" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Browse sermons", exact: true })
    .click();
  await expect(tab(page, "Home")).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("button", { name: "What are you going through?", exact: true }),
  ).toBeVisible();
});

test("failed provider script offers retry and YouTube, only after Watch", async ({
  page,
}) => {
  let requests = 0;
  await page.route("https://www.youtube.com/iframe_api", (route) => {
    requests++;
    return route.abort();
  });
  await page.goto("/sermon/nUW8NT2Pe88");
  await expect(
    page.getByRole("button", { name: "Watch sermon", exact: true }),
  ).toBeVisible();
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "Watch sermon", exact: true }).click();
  await expect(
    page.getByText(
      "The player didn’t load. Check your connection and try again.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Watch on YouTube", exact: true }),
  ).toBeVisible();
  // Web has no announce API, so the message is exposed as an alert.
  await expect(page.getByRole("alert")).toHaveText(
    "The player didn’t load. Check your connection and try again.",
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect.poll(() => requests).toBe(2);
});

test("a double tap on Watch loads the player once", async ({ page }) => {
  await fakeYouTube(page);
  await page.goto("/sermon/nUW8NT2Pe88");
  await page
    .getByRole("button", { name: "Watch sermon", exact: true })
    .dblclick();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  expect((await ytLog(page)).created).toBe(1);
});

test("embedding-disabled errors don't offer a retry that can't work", async ({
  page,
}) => {
  await fakeYouTube(page, 150);
  await page.goto("/sermon/nUW8NT2Pe88");
  await page.getByRole("button", { name: "Watch sermon", exact: true }).click();
  await expect(
    page.getByText("This sermon can only be watched on YouTube.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Watch on YouTube", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toHaveCount(0);
});

test("Watch starts playback and nothing stays over the provider player", async ({
  page,
}) => {
  await fakeYouTube(page);
  await page.goto("/sermon/nUW8NT2Pe88");
  await page.getByRole("button", { name: "Watch sermon", exact: true }).click();
  // The viewer's tap starts the sermon; no second press is needed.
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  expect((await ytLog(page)).commands).toContain("play");
  await expect(page.getByTestId("player-cover")).toHaveCount(0);
  await expect(page.getByTestId("player-full")).toBeVisible();
  // The provider's player is the topmost thing at its centre and corners.
  const box = (await page.getByTestId("player-full").boundingBox())!;
  const unobscured = await page.evaluate(
    ({ x, y, width, height }) =>
      [
        [0.5, 0.5],
        [0.05, 0.95],
        [0.95, 0.95],
      ].every(([fx, fy]) =>
        document
          .elementFromPoint(x + width * fx, y + height * fy)
          ?.closest('[data-testid="fake-yt"]'),
      ),
    box,
  );
  expect(unobscured).toBe(true);
  expect(box.height).toBeGreaterThanOrEqual(200);
});

test("Now Playing controls drive the provider player", async ({ page }) => {
  await fakeYouTube(page);
  await page.goto("/sermon/nUW8NT2Pe88");
  await page.getByRole("button", { name: "Watch sermon", exact: true }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Paused");
  await page
    .getByRole("button", { name: "Forward 30 seconds", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Playback speed 1 times", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Playback speed 1.25 times", exact: true }),
  ).toBeVisible();
  // Tap the middle of the scrubber: a 10-minute video seeks to about 5:00.
  const bar = (await page.getByTestId("scrubber").boundingBox())!;
  await page.mouse.click(bar.x + bar.width / 2, bar.y + bar.height / 2);
  await expect(page.getByTestId("elapsed")).toHaveText(/^(4:5\d|5:0\d)$/);
  const { commands } = await ytLog(page);
  expect(commands).toContain("pause");
  // Forward 30 from wherever playback had reached (a few seconds in).
  expect(commands.some((c) => /^seek:(3\d|4\d)$/.test(c))).toBe(true);
  expect(commands).toContain("rate:1.25");
  // Middle of a 10-minute bar, give or take a pixel.
  expect(commands.some((c) => /^seek:(29\d|30\d)$/.test(c))).toBe(true);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
});

test("leaving a playing sermon docks it; it keeps playing across tabs", async ({
  page,
}) => {
  await fakeYouTube(page);
  await page.goto("/");
  await rows(page).first().click();
  await page.getByRole("button", { name: "Watch sermon", exact: true }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  const dock = page.getByTestId("player-dock");
  await expect(dock).toBeVisible();
  // Playing: the dock says how much is left ("9:56 left"), or "Playing".
  await expect(page.getByTestId("dock-status")).toHaveText(/^(Playing|[\d:]+ left)$/);
  for (const name of ["Paths", "Search", "Account", "Home"] as const) {
    await tab(page, name).click();
    await expect(dock).toBeVisible();
  }
  // Same player instance throughout: nothing reloaded or restarted.
  expect((await ytLog(page)).created).toBe(1);
  expect((await ytLog(page)).destroyed).toBe(0);
  // Content can still scroll clear of the dock: Home's last sermon.
  const last = rows(page).last();
  await last.scrollIntoViewIfNeeded();
  const [f, d] = [(await last.boundingBox())!, (await dock.boundingBox())!];
  expect(f.y + f.height).toBeLessThanOrEqual(d.y);
  // The dock pauses, reopens Now Playing, and closes.
  await dock.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByTestId("dock-status")).toHaveText("Paused");
  await page.getByRole("button", { name: /^Open Now Playing/ }).click();
  await expect(page.getByTestId("player-full")).toBeVisible();
  await expect(page.getByTestId("playback-status")).toHaveText("Paused");
  // A second Back within 350ms counts as a double tap; pace it like a person.
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Close player", exact: true }).click();
  await expect(page.getByTestId("player-dock")).toHaveCount(0);
  expect((await ytLog(page)).destroyed).toBe(1);
});

test("starting another sermon replaces the docked one", async ({ page }) => {
  await fakeYouTube(page);
  await page.goto("/sermon/nUW8NT2Pe88");
  await page.getByRole("button", { name: "Watch sermon", exact: true }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  // Open another sermon from "More sermons": the first keeps playing, docked.
  await rows(page).first().click();
  await expect(page.getByTestId("player-dock")).toBeVisible();
  // Playing: the dock says how much is left ("9:56 left"), or "Playing".
  await expect(page.getByTestId("dock-status")).toHaveText(/^(Playing|[\d:]+ left)$/);
  await page.getByRole("button", { name: "Watch sermon", exact: true }).click();
  await expect(page.getByTestId("player-full")).toBeVisible();
  await expect(page.getByTestId("player-dock")).toHaveCount(0);
  const log = await ytLog(page);
  expect(log.created).toBe(2);
  expect(log.destroyed).toBe(1);
});

test("leaving the app pauses the sermon (no background audio)", async ({
  page,
}) => {
  await fakeYouTube(page);
  await page.goto("/sermon/nUW8NT2Pe88");
  await page.getByRole("button", { name: "Watch sermon", exact: true }).click();
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  await sendToBackground(page);
  await expect(page.getByTestId("playback-status")).toHaveText("Paused");
});

test("a double tap on a sermon opens it once", async ({ page }) => {
  await page.goto("/");
  await rows(page).first().dblclick();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Apostolic Shift",
  );
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "What are you going through?", exact: true }),
  ).toBeVisible();
});

test("missing artwork falls back to the event name or an icon", async ({
  page,
}) => {
  // The fixture blocks every YouTube image request.
  await page.goto("/");
  // Home's rows name the event on the dark tile instead.
  await expect(rows(page)).toHaveCount(3);
  for (const row of await rows(page).all()) await expect(row).toContainText("The Votage");
  // Every list uses the same row, so a topic's rows do the same: the
  // occasion's name on the sermon's dark tile.
  await page.goto("/topics/purpose-calling");
  await expect(rows(page)).toHaveCount(1);
  for (const row of await rows(page).all())
    await expect(row.getByText(/^(Lioness Conference|Apostolic Shift)$/)).toBeVisible();
});

test("sample screens are labelled, actionable and render without errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/states");
  await expect(
    page.getByRole("heading", { level: 1, name: "Sample screens" }),
  ).toBeVisible();
  for (const name of ["Loading", "Error", "Missing artwork", "Empty"])
    await page.getByRole("radio", { name, exact: true }).click();
  await page.getByRole("radio", { name: "Offline", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Offline", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("heading", { name: "You’re offline" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByText("Loading sermons…", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Finish loading", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "No sermons here yet" }),
  ).toBeVisible();
  // A stray text node between views is a hard error on native.
  expect(errors.filter((e) => /text node|Text strings/i.test(e))).toEqual([]);
});

test("press feedback scales, or dims when the system asks for less motion", async ({
  page,
}) => {
  const pressedStyle = async () => {
    const row = rows(page).first();
    await row.scrollIntoViewIfNeeded();
    await row.hover();
    await page.mouse.down();
    await page.waitForTimeout(250);
    const style = await row.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { transform: cs.transform, opacity: cs.opacity };
    });
    await page.mouse.move(0, 0);
    await page.mouse.up();
    return style;
  };
  await page.goto("/");
  const full = await pressedStyle();
  expect(full.transform).toContain("matrix(0.98");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const reduced = await pressedStyle();
  expect(
    reduced.transform === "none" || reduced.transform.startsWith("matrix(1,"),
  ).toBe(true);
  expect(Number(reduced.opacity)).toBeLessThan(1);
});

test("a double tap on Back goes back one screen, not two", async ({ page }) => {
  await page.goto("/");
  await tab(page, "Search").click();
  await page
    .getByRole("button", { name: "Prayer, 1 sermon", exact: true })
    .click();
  await rows(page).first().click();
  await expect(
    page.getByRole("button", { name: "Watch sermon", exact: true }),
  ).toBeVisible();
  const back = shown(page.getByRole("button", { name: "Back", exact: true }));
  const box = (await back.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(150);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(
    page.getByRole("heading", { level: 1, name: "Prayer" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/topics\/prayer$/);
});

test("repeated link parameters don't break the app", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/search?q=pray&q=faith");
  await expect(
    page.getByRole("searchbox", { name: "What are you going through?" }),
  ).toHaveValue("pray");
  await page.goto("/path/breaking-free-from-habitual-sin?id=x&id=y");
  await expect(
    page.getByRole("heading", { level: 1, name: "Breaking free from habitual sin" }),
  ).toBeVisible();
  await page.goto("/sermon/nUW8NT2Pe88?id=x");
  await expect(
    page.getByRole("button", { name: "Watch sermon", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
