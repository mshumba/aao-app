import type { Page } from "@playwright/test";
import { SERMON, expect, rows, seedWatchProgress, shown, test } from "./fixtures";

// The pages redesign: the blessing on Home, All sermons, "From your topics",
// Continue watching's See all, the privacy disclosures, and one look that
// holds at 320pt.

/** The five fixture blessings (src/home/blessing.ts), by their first words. */
const BLESSINGS = [
  "A little one will become a thousand",
  "Arise shine for your light is come",
  "The Lord increase your greatness",
  "The hand of Jesus will rest upon you",
  "His love shall be a covering around you",
];

async function blessingShown(page: Page) {
  const block = shown(page.getByTestId("home-blessing"));
  await expect(block).toBeVisible();
  const text = (await block.textContent()) ?? "";
  const which = BLESSINGS.findIndex((start) => text.includes(start));
  expect(which, text).toBeGreaterThanOrEqual(0);
  return { text, which };
}

test.describe("the blessing on Home", () => {
  test("shows under the greeting, text only, with its Bible reference", async ({ page }) => {
    await page.goto("/");
    const block = shown(page.getByTestId("home-blessing"));
    await expect(block).toBeVisible();
    // Read as one sentence, starting with what it is.
    expect((await block.textContent()) ?? "").toMatch(/^Blessing:/);
    // Nothing to play or open.
    await expect(block.getByRole("button")).toHaveCount(0);
    await expect(block.getByRole("link")).toHaveCount(0);
    // Under the greeting, above the sermon's title.
    const greeting = page.getByRole("heading", { level: 1 });
    expect((await block.boundingBox())!.y).toBeGreaterThan((await greeting.boundingBox())!.y);
  });

  test("a new one each time the app opens, none repeated until all are seen", async ({ page }) => {
    await page.goto("/");
    const seen: number[] = [];
    for (let i = 0; i < BLESSINGS.length; i++) {
      if (i) await page.reload();
      seen.push((await blessingShown(page)).which);
    }
    expect(new Set(seen).size).toBe(BLESSINGS.length);
    // The round starts again, never with the one just shown.
    await page.reload();
    expect((await blessingShown(page)).which).not.toBe(seen[seen.length - 1]);
  });

  test("coming back to the app brings a new one", async ({ page }) => {
    await page.goto("/");
    const first = await blessingShown(page);
    for (const state of ["hidden", "visible"]) {
      await page.evaluate((value) => {
        Object.defineProperty(document, "visibilityState", { value, configurable: true });
        Object.defineProperty(document, "hidden", { value: value === "hidden", configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
      }, state);
      await page.waitForTimeout(150);
    }
    await expect.poll(async () => (await blessingShown(page)).which).not.toBe(first.which);
  });

  test("a reference shows in gold capitals when the blessing has one", async ({ page }) => {
    // The first fixture is the only one left to see, so it's the one shown.
    await page.addInitScript(() => {
      localStorage.setItem(
        "aao.blessings.seen.v1",
        JSON.stringify(["bl-82336-67", "bl-80650-59", "bl-4867-64", "bl-49470-36"]),
      );
    });
    await page.goto("/");
    const block = shown(page.getByTestId("home-blessing"));
    await expect(block).toContainText("Isaiah 60:22; Job 8:7");
    await expect(block.getByText("Isaiah 60:22; Job 8:7")).toHaveCSS("text-transform", "uppercase");
  });
});

test.describe("All sermons", () => {
  test("Latest's See all lists every sermon, newest first", async ({ page }) => {
    await page.goto("/");
    await shown(page.getByTestId("latest-sermons"))
      .getByRole("button", { name: "See all", exact: true })
      .click();
    await expect(page).toHaveURL(/\/sermons$/);
    await expect(page.getByRole("heading", { level: 1, name: "All sermons" })).toBeVisible();
    await expect(rows(page)).toHaveCount(4);
    await expect(rows(page).first()).toHaveAccessibleName(/^Pray Without Ceasing\./);
    await expect(page.getByTestId("sermons-count")).toHaveText("4 sermons, newest first");
  });

  test("filters by series, topic and year, and finds a title", async ({ page }) => {
    await page.goto("/sermons");
    await expect(rows(page)).toHaveCount(4);

    await page.getByTestId("filter-series").click();
    await expect(page.getByTestId("filter-series")).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("radio", { name: "Apostolic Shift 2026" }).click();
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByTestId("filter-series")).toHaveAccessibleName("Apostolic Shift 2026");
    await expect(page.getByTestId("sermons-count")).toHaveText("3 sermons of 4");

    await page.getByTestId("filter-topic").click();
    await page.getByRole("radio", { name: "Faith" }).click();
    await expect(rows(page)).toHaveCount(2);

    await page.getByTestId("filter-year").click();
    await page.getByRole("radio", { name: "2026" }).click();
    await expect(rows(page)).toHaveCount(2);

    await page.getByTestId("sermons-search").fill("day one");
    await expect(rows(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "No sermons match" })).toBeVisible();
    await page.getByRole("button", { name: "Clear filters", exact: true }).click();
    await expect(rows(page)).toHaveCount(4);
    await expect(page.getByTestId("sermons-search")).toHaveValue("");

    await page.getByTestId("sermons-search").fill("finale");
    await expect(rows(page)).toHaveCount(2);
  });

  test("a link can choose the filter", async ({ page }) => {
    await page.goto("/sermons?series=apostolic-shift-2026");
    await expect(rows(page)).toHaveCount(3);
    await page.goto("/sermons?topic=no-such-topic");
    await expect(rows(page)).toHaveCount(4);
  });

  test("the choices are one radio group per filter, on the keyboard too", async ({ page }) => {
    await page.goto("/sermons");
    await page.getByTestId("filter-year").click();
    const group = page.getByRole("radiogroup", { name: "Year" });
    await expect(group.getByRole("radio", { name: "Any year" })).toHaveAttribute("aria-checked", "true");
    await group.getByRole("radio", { name: "Any year" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(group.getByRole("radio", { name: "2026" })).toHaveAttribute("aria-checked", "true");
  });
});

test.describe("From your topics", () => {
  test.use({ viewer: "guest" });

  test("puts the viewer's topics first on Home, and says they're samples", async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem("__topics_seeded")) return;
      sessionStorage.setItem("__topics_seeded", "1");
      localStorage.setItem("aao.onboarding.v1", JSON.stringify({ welcomed: true, interests: ["faith"] }));
    });
    await page.goto("/");
    const rail = shown(page.getByTestId("from-your-topics"));
    await expect(rail.getByRole("heading", { name: "From your topics" })).toBeVisible();
    await expect(rail.getByTestId("topic-card")).toHaveCount(2);
    await expect(rail).toContainText("Topics are sample labels");
    await rail.getByRole("button", { name: "See all", exact: true }).click();
    await expect(page).toHaveURL(/\/topics\/faith$/);
  });

  test("is not on Home before any topic is picked", async ({ page }) => {
    await page.goto("/");
    await expect(shown(page.getByTestId("latest-sermons"))).toBeVisible();
    await expect(page.getByTestId("from-your-topics")).toHaveCount(0);
  });
});

test("Continue watching's See all lists every sermon in progress, with titles", async ({ page }) => {
  await seedWatchProgress(page, [
    { sermonId: SERMON.finale, positionSeconds: 4000, durationSeconds: 8915, finished: false, updatedAt: "2026-10-14T10:00:00.000Z" },
    { sermonId: SERMON.dayOne, positionSeconds: 600, durationSeconds: 6441, finished: false, updatedAt: "2026-10-14T09:00:00.000Z" },
    { sermonId: SERMON.dayTwo, positionSeconds: 900, durationSeconds: 10195, finished: false, updatedAt: "2026-10-14T08:00:00.000Z" },
  ]);
  await page.goto("/");
  const section = shown(page.getByTestId("continue-watching"));
  // The rail: artwork with the time left on it, no title under it.
  await expect(section.getByTestId("continue-card")).toHaveCount(3);
  await expect(section.getByTestId("continue-card").first()).toContainText("left");
  await expect(section.getByTestId("continue-card").first()).not.toContainText("Grand Finale");
  await section.getByRole("button", { name: "See all", exact: true }).click();
  const list = section.getByTestId("continue-all");
  await expect(list.getByTestId("continue-card")).toHaveCount(3);
  await expect(list.getByTestId("continue-card").first()).toContainText("Apostolic Shift: Grand Finale");
  await expect(list.getByTestId("continue-card").first()).toHaveAccessibleName(/left\.$/);
  await section.getByRole("button", { name: "Show less", exact: true }).click();
  await expect(section.getByTestId("continue-all")).toHaveCount(0);
});

test("the privacy page says what search sends and keeps", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 2, name: "When you search" })).toBeVisible();
  for (const words of [
    /sent to OpenAI/,
    /up to 24 hours/,
    /isn’t linked to you/,
    /recent searches are kept on this device/i,
    /progress through guided paths/,
  ])
    await expect(page.getByText(words).first()).toBeVisible();
});

test("one look at 320pt: no page runs off the side", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of [
    "/",
    "/account",
    "/saved",
    "/sermons",
    "/privacy",
    "/terms",
    "/about",
    "/topics/faith",
    "/series/apostolic-shift-2026",
    "/account/topics",
    "/account/name",
    "/account/delete",
  ]) {
    await page.goto(path);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(320);
  }
});

test("Back and the filters answer a 44pt touch", async ({ page }) => {
  await page.goto("/sermons");
  for (const control of [
    page.getByRole("button", { name: "Back", exact: true }),
    page.getByTestId("filter-year"),
  ]) {
    const reach = await control.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      // 22pt either side of the centre still lands on it.
      return [y - 21, y + 21].every((at) => el.contains(document.elementFromPoint(x, at)));
    });
    expect(reach).toBe(true);
  }
});
