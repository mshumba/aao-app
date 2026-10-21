import { SERMON, expect, rows, seedWatchProgress, shown, test } from "./fixtures";

// The pages redesign: All sermons, "From your topics",
// Continue watching's See all, the privacy disclosures, and one look that
// holds at 320pt.

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
    "/paths",
    "/path/breaking-free-from-habitual-sin",
    "/path/knowing-the-holy-spirit",
    "/account/topics",
    "/account/name",
    "/account/delete",
  ]) {
    await page.goto(path);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(320);
  }
});

test("at 320pt the path's big button keeps every word, the length under the label", async ({ page }) => {
  const cta = page.getByTestId("path-cta");
  const cut = () =>
    cta.evaluate((el) =>
      [...el.querySelectorAll("*")].some(
        (n) => getComputedStyle(n).textOverflow === "ellipsis" && n.scrollWidth > n.clientWidth + 1,
      ),
    );
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/path/knowing-the-holy-spirit");
  await expect(cta).toHaveAccessibleName("Start Teaching 1, 3 hours 35 minutes");
  expect(await cut()).toBe(false);
  const label = await cta.getByText("Start Teaching 1", { exact: true }).boundingBox();
  const length = await cta.getByText("3 hr 35 min", { exact: true }).boundingBox();
  expect(length!.y).toBeGreaterThan(label!.y + label!.height - 2);
  // Where it fits, it stays one line.
  await page.setViewportSize({ width: 390, height: 640 });
  await expect(cta).toContainText("Start Teaching 1 · 3 hr 35 min");
  expect(await cut()).toBe(false);
});

test("a quick tap still shows as a press", async ({ page }) => {
  // A tap shorter than the press delay delivers press-in and press-out
  // together (on the web every press waits 50ms), which used to show nothing.
  await page.goto("/sermons");
  const chip = page.getByTestId("filter-year");
  await expect(chip).toBeVisible();
  const box = (await chip.boundingBox())!;
  // Every frame's scale, from just before the press until well after.
  await chip.evaluate((el) => {
    const w = window as unknown as { scales: number[] };
    w.scales = [];
    const t0 = performance.now();
    const step = () => {
      const m = /matrix\(([^,]+)/.exec(getComputedStyle(el).transform);
      w.scales.push(m ? Number(m[1]) : 1);
      if (performance.now() - t0 < 600) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.getByRole("radiogroup", { name: "Year" })).toBeVisible();
  await page.waitForTimeout(700);
  const scales = await page.evaluate(() => (window as unknown as { scales: number[] }).scales);
  expect(Math.min(...scales)).toBeLessThan(0.99);
  expect(scales.at(-1)).toBe(1);
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

test("Back stays at the top while a page scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 500 });
  for (const path of ["/sermons", "/about", "/privacy"]) {
    await page.goto(path);
    const back = page.getByRole("button", { name: "Back", exact: true });
    await expect(back).toBeInViewport();
    await page.mouse.move(187, 400);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 600);
    await page.waitForTimeout(300);
    await expect(back, path).toBeInViewport();
  }
});
