import type { Page } from "@playwright/test";
import {
  HABIT,
  LENGTH,
  SERMON,
  expect,
  fakeYouTube,
  playhead,
  seedPathProgress,
  seedWatchProgress,
  storedPathProgress,
  shown,
  tab,
  test,
  ytLog,
} from "./fixtures";

// Home, as the approved concept's screen 01: a dark hero with the newest
// sermons as a pager the viewer moves, the question field with common
// needs, the path you're on (or paths to start), then the library.

function dots(page: Page) {
  return page.getByRole("slider", { name: "Newest sermons" });
}

function heroWatch(page: Page) {
  return page.getByTestId("hero-watch");
}

/** The hero page that's showing: the only one screen readers can reach. */
function heroTitle(page: Page) {
  return shown(page.getByTestId("hero-pager").getByRole("button"));
}

test.describe("on 14 October 2026, in the evening", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-14T19:30:00"));
  });

  test("the hero greets the viewer and shows the newest sermon", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Good evening" })).toBeVisible();
    await expect(shown(page.locator("h1"))).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Account", exact: true }).first()).toBeVisible();
    // Older than a week, so it's the latest, not "new".
    await expect(heroTitle(page)).toHaveAccessibleName(
      "Latest. 27 Sep. 3 hours 35 minutes. Pray Without Ceasing",
    );
    await expect(heroWatch(page)).toHaveAccessibleName("Watch sermon: Pray Without Ceasing");
    await expect(dots(page)).toHaveAttribute("aria-valuetext", "1 of 4");
    await heroTitle(page).click();
    await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.pray}$`));
    expect((await ytLog(page)).created).toBe(0);
  });

  test("a name set in Account is in the greeting", async ({ page }) => {
    await page.goto("/account/name");
    await page.getByTestId("name-input").fill("Mufaro Shumba");
    await page.getByTestId("save-name").click();
    await expect(page.getByTestId("toast")).toContainText("Name updated");
    await page.goto("/");
    // The first name, with the italic name as part of one heading.
    await expect(
      page.getByRole("heading", { level: 1, name: "Good evening, Mufaro", exact: true }),
    ).toBeVisible();
  });
});

test("a sermon uploaded this week is called new", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-29T08:00:00"));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Good morning" })).toBeVisible();
  await expect(heroTitle(page)).toHaveAccessibleName(
    "New this week. 3 hours 35 minutes. Pray Without Ceasing",
  );
});

/**
 * Page `n` (1-based) is showing and the pager has finished sliding there.
 * A person waits for the slide; inputs during it can be lost (reported).
 */
async function onPage(page: Page, n: number) {
  await expect(dots(page)).toHaveAttribute("aria-valuetext", `${n} of 4`);
  await expect
    .poll(() =>
      page.getByTestId("hero-pager").evaluate((el) => Math.round(el.scrollLeft / el.clientWidth)),
    )
    .toBe(n - 1);
  await expect(dots(page)).toHaveAttribute("aria-valuetext", `${n} of 4`);
}

test("the hero pager moves only when the viewer moves it", async ({ page }) => {
  await page.goto("/");
  await onPage(page, 1);
  // Never on its own.
  await page.waitForTimeout(4000);
  await onPage(page, 1);
  await expect(heroWatch(page)).toHaveAccessibleName("Watch sermon: Pray Without Ceasing");
  // A tap on the dots shows the next; Watch and the title follow it.
  await dots(page).click();
  await onPage(page, 2);
  await expect(heroWatch(page)).toHaveAccessibleName("Watch sermon: Apostolic Shift: Grand Finale");
  await expect(heroTitle(page)).toHaveAccessibleName(/\. Apostolic Shift: Grand Finale$/);
  await expect(page.getByRole("button", { name: "Save Apostolic Shift: Grand Finale" })).toBeVisible();
  // Arrow keys move either way, and the dots wrap round.
  await dots(page).focus();
  await page.keyboard.press("ArrowRight");
  await onPage(page, 3);
  await page.keyboard.press("ArrowLeft");
  await onPage(page, 2);
  await page.keyboard.press("ArrowLeft");
  await onPage(page, 1);
  await page.keyboard.press("ArrowLeft");
  await onPage(page, 4);
  await expect(heroWatch(page)).toHaveAccessibleName("Watch sermon: Apostolic Shift: Day One");
  // The dots are drawn small but touched at 44pt.
  const box = (await dots(page).boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
});

test("with reduced motion the pager changes page without sliding", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await dots(page).click();
  // Straight there: the very next frame is already on page 2.
  await expect(dots(page)).toHaveAttribute("aria-valuetext", "2 of 4");
  expect(
    await page
      .getByTestId("hero-pager")
      .evaluate((el) => new Promise((done) => requestAnimationFrame(() => done(Math.round(el.scrollLeft / el.clientWidth))))),
  ).toBe(1);
});

test("Watch in the hero plays the sermon showing", async ({ page }) => {
  await fakeYouTube(page, { duration: LENGTH[SERMON.finale] });
  await page.goto("/");
  await dots(page).click();
  await heroWatch(page).click();
  await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.finale}$`));
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  expect((await ytLog(page)).created).toBe(1);
});

test("Save in the hero saves the sermon showing", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Save Pray Without Ceasing", exact: true }).click();
  await expect(page.getByTestId("toast")).toContainText(/Saved/);
  await expect(
    page.getByRole("button", { name: "Remove Pray Without Ceasing from saved", exact: true }),
  ).toBeVisible();
});

test("the question field opens Search ready to type, and a need searches it", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "What are you going through?", exact: true }).click();
  await expect(tab(page, "Search")).toHaveAttribute("aria-selected", "true");
  const field = page.getByRole("searchbox", { name: "What are you going through?" });
  await expect(field).toBeFocused();
  await tab(page, "Home").click();
  await page
    .getByRole("list", { name: "Common needs" })
    .getByRole("button", { name: "Prayer feels dry", exact: true })
    .click();
  await expect(field).toHaveValue("My prayer life feels dry");
  await expect(shown(page.getByTestId("moment-result")).first()).toBeVisible();
});

test("not on a path: Home offers paths to start", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("your-path")).toHaveCount(0);
  const rail = page.getByTestId("start-a-path");
  // The first path as the navy card, honest about who set its order. Day 1
  // reads as its theme, which is known before the sermon is.
  const first = rail.getByTestId("start-here");
  await expect(first.getByRole("button", { name: /^Start the path with day 1\. Lay aside every weight\. 1 hour 47 minutes$/ })).toBeVisible();
  await expect(rail.getByRole("heading", { name: "More paths" })).toBeVisible();
  // A draft path carries no label, and never claims the ministry set its order.
  const draft = rail.getByRole("button", { name: /^Learning to wait on God\./ });
  await expect(draft).not.toContainText(/Draft|awaiting ministry review/);
  await expect(draft).not.toContainText("Order set by the ministry");
  await draft.click();
  await expect(page).toHaveURL(/\/path\/learning-to-wait-on-god$/);
  await page.getByTestId("path-back").click();
  await page.getByTestId("start-a-path").getByRole("button", { name: "See all", exact: true }).click();
  await expect(tab(page, "Paths")).toHaveAttribute("aria-selected", "true");
});

test.describe("on a path", () => {
  test.beforeEach(async ({ page }) => {
    await seedPathProgress(page, { [HABIT]: [1, 2] });
  });

  test("Your path shows today, and plays today's sermon, whole", async ({ page }) => {
    await fakeYouTube(page, { duration: LENGTH[SERMON.dayTwo] });
    await page.goto("/");
    const card = page.getByTestId("your-path");
    await expect(
      card.getByRole("button", {
        name: "Your path. Day 3 of 7. Breaking free from habitual sin. 2 of 7 done.",
        exact: true,
      }),
    ).toBeVisible();
    const play = card.getByRole("button", { name: /^Play today, day 3\. / });
    await expect(play).toHaveAccessibleName(
      "Play today, day 3. Apostolic Shift: Day Two Morning. 2 hours 49 minutes. 2 of 7 done",
    );
    await expect(shown(page.getByTestId("start-a-path"))).toHaveCount(0);
    await play.click();
    await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.dayTwo}$`));
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    expect((await ytLog(page)).starts).toEqual([0]);
    // Recognised as today's day of the path.
    await expect(page.getByTestId("part-of-path")).toHaveAccessibleName(
      "Part of your path. Day 3 of 7. Breaking free from habitual sin. 2 of 7 done.",
    );
  });

  test("today's sermon watched from Home marks the day done, and Home moves to the next day", async ({
    page,
  }) => {
    // 15 seconds short of 95% of the sermon (the fake clock runs 5x).
    await seedWatchProgress(page, [
      {
        sermonId: SERMON.dayTwo,
        positionSeconds: 9670,
        durationSeconds: LENGTH[SERMON.dayTwo],
        finished: false,
        updatedAt: "2026-10-14T09:00:00.000Z",
      },
    ]);
    await fakeYouTube(page, { duration: LENGTH[SERMON.dayTwo] });
    await page.goto("/");
    const play = page.getByTestId("your-path").getByRole("button", { name: /^Play today, day 3\. / });
    await expect(play).toHaveAccessibleName(/\. 9 minutes left\. 2 of 7 done$/);
    await play.click();
    await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.dayTwo}$`));
    expect((await ytLog(page)).starts).toEqual([9670]);
    await expect(page.getByTestId("toast")).toContainText("Day 3 done", { timeout: 15_000 });
    await expect.poll(async () => (await storedPathProgress(page))?.done[HABIT]).toEqual([1, 2, 3]);
    // The sermon carries on.
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    await expect.poll(() => playhead(page)).toBeGreaterThan(9690);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(
      page.getByTestId("your-path").getByRole("button", {
        name: "Your path. Day 4 of 7. Breaking free from habitual sin. 3 of 7 done.",
        exact: true,
      }),
    ).toBeVisible();
  });

  test("Home's play and the path page's Continue start today's day at the same place", async ({
    page,
  }) => {
    // Both resume the whole sermon where the viewer left off.
    await seedWatchProgress(page, [
      {
        sermonId: SERMON.dayTwo,
        positionSeconds: 3990,
        durationSeconds: LENGTH[SERMON.dayTwo],
        finished: false,
        updatedAt: "2026-10-14T09:00:00.000Z",
      },
    ]);
    await fakeYouTube(page, { duration: LENGTH[SERMON.dayTwo] });
    await page.goto(`/path/${HABIT}`);
    await expect(page.getByTestId("path-cta")).toHaveAccessibleName("Continue Day 3, 1 hour 43 minutes left");
    await page.getByTestId("path-cta").click();
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    const fromPath = (await ytLog(page)).starts[0];
    expect(fromPath).toBe(3990);
    await page.goto("about:blank");
    await page.goto("/");
    const play = page.getByTestId("your-path").getByRole("button", { name: /^Play today, day 3\. / });
    await expect(play).toHaveAccessibleName(/1 hour 43 minutes left/);
    await play.click();
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    expect((await ytLog(page)).starts[0]).toBe(fromPath);
  });

  test("the card itself opens the path", async ({ page }) => {
    await page.goto("/");
    await page
      .getByTestId("your-path")
      .getByRole("button", { name: /^Your path\. Day 3 of 7\./ })
      .click();
    await expect(page).toHaveURL(new RegExp(`/path/${HABIT}$`));
  });
});

test.describe("as a guest", () => {
  test.use({ viewer: "guest" });

  test("the hero offers Sign in, and Watch asks for an account", async ({ page }) => {
    await fakeYouTube(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)$/ })).toBeVisible();
    await heroWatch(page).click();
    await expect(
      page.getByRole("heading", { name: "Create a free account to watch" }),
    ).toBeVisible();
    expect((await ytLog(page)).created).toBe(0);
    await page.keyboard.press("Escape");
    await page.getByTestId("home-sign-in").click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });
});
