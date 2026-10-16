import type { Page } from "@playwright/test";
import { HABIT, expect, seedPathProgress, shown, storedPathProgress, test } from "./fixtures";

// The path page's look, checked against the Appllama review (16 October
// 2026): a smaller cover, one surface per day's state, today's own "Mark
// done" ring, "Order set by the ministry" under the prose, and a light
// header pinned once the cover's title has gone. The fixture path,
// "Breaking free from habitual sin", has 7 days and 18 hours of sermons.

const ORDER_SET = "Order set by the ministry";

function day(page: Page, n: number) {
  return shown(page.getByTestId(`path-day-${n}`)).first();
}

/** The colour a day's card is drawn on (the card holds the day's button). */
function surface(page: Page, n: number) {
  return day(page, n).evaluate((el) => getComputedStyle(el.parentElement!).backgroundColor);
}

/** How many of the cover's progress segments are drawn. */
function segments(page: Page) {
  return page
    .getByTestId("path-cover")
    .first()
    .evaluate((cover) =>
      [...cover.querySelectorAll("div")].filter((el) => {
        const box = el.getBoundingClientRect();
        return box.height === 4 && box.width > 8 && getComputedStyle(el).borderRadius === "2px";
      }).length,
    );
}

test("before a path starts, its cover gives its days and length, with no empty segments", async ({ page }) => {
  await page.goto(`/path/${HABIT}`);
  const cover = page.getByTestId("path-cover").first();
  const line = cover.getByRole("img", { name: "7 days, not started. About 18 hours." });
  await expect(line).toBeVisible();
  await expect(line).toHaveText(/^7 days\s*·\s*18h$/);
  expect(await segments(page)).toBe(0);
  // Started, the segments are back, with where you are.
  await seedPathProgress(page, { [HABIT]: [1, 2] });
  await page.reload();
  await expect(cover.getByRole("img", { name: /^Day 3 of 7\. 2 done\./ })).toBeVisible();
  await expect.poll(() => segments(page)).toBe(7);
});

test.describe("part way through", () => {
  test.beforeEach(async ({ page }) => {
    await seedPathProgress(page, { [HABIT]: [1, 2] });
  });

  test("each day's card shows its state: done on sand, today lifted, the days ahead locked", async ({ page }) => {
    await page.goto(`/path/${HABIT}`);
    await expect(day(page, 3)).toContainText("Stop sin while it is a thought");
    expect(await surface(page, 2)).toBe("rgb(239, 233, 222)");
    expect(await surface(page, 3)).toBe("rgb(255, 255, 255)");
    expect(await surface(page, 4)).toBe("rgba(0, 0, 0, 0)");
    // "DAY 3 · TODAY": the eyebrow's caps, written in sentence case.
    const name = day(page, 3).getByText(/^Day.3 · Today$/);
    await expect(name).toHaveCSS("text-transform", "uppercase");
    // Only the next day says when it opens; every day ahead has its lock.
    await expect(day(page, 4)).toContainText("Opens after Day 3");
    await expect(day(page, 5)).not.toContainText("Opens after");
    const locks = (n: number) =>
      day(page, n).evaluate(
        (el) => [...el.querySelectorAll("svg")].filter((svg) => svg.getBoundingClientRect().width === 14).length,
      );
    for (const n of [4, 5, 6, 7]) expect(await locks(n)).toBe(1);
    expect(await locks(3)).toBe(0);
  });

  test("today's ring marks the day done, and takes a press just beside it", async ({ page }) => {
    await page.goto(`/path/${HABIT}`);
    const card = (await day(page, 3).boundingBox())!;
    const ring = page.getByRole("button", { name: "Mark Day 3 done", exact: true });
    const box = (await ring.boundingBox())!;
    // At the end of the card's first line, inside it.
    expect(box.width).toBe(28);
    expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width);
    expect(box.y - card.y).toBeLessThan(20);
    // 44pt to touch: a press 6pt to its left still counts.
    await ring.click({ position: { x: -6, y: 14 } });
    await expect.poll(async () => (await storedPathProgress(page))?.done[HABIT]).toEqual([1, 2, 3]);
    await expect(page.getByRole("dialog", { name: "Day 3 done" })).toBeVisible();
  });

  test("“Why this path” stands alone, the ministry's order quietly under it", async ({ page }) => {
    await page.goto(`/path/${HABIT}`);
    const kicker = shown(page.getByText("Why this path", { exact: true }));
    const prose = shown(page.getByText(/^For the sin that keeps coming back/));
    const trust = shown(page.getByText(ORDER_SET, { exact: true }));
    const [k, p, t] = [(await kicker.boundingBox())!, (await prose.boundingBox())!, (await trust.boundingBox())!];
    expect(p.y).toBeGreaterThanOrEqual(k.y + k.height);
    expect(t.y).toBeGreaterThanOrEqual(p.y + p.height);
    await expect(trust).toHaveCSS("font-size", "13px");
    await expect(trust).toHaveCSS("color", "rgb(91, 97, 106)");
  });

  test("a quick second press of “Later days” moves on another day", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/path/${HABIT}`);
    const later = page.getByRole("button", { name: "Later days", exact: true });
    await expect(later).toBeVisible();
    await expect.poll(async () => (await day(page, 3).boundingBox())!.x).toBeGreaterThan(0);
    const three = (await day(page, 3).boundingBox())!;
    const four = (await day(page, 4).boundingBox())!;
    const step = four.x - three.x;
    // Pressed twice before the row has moved at all: two days on, not one.
    await later.evaluate((el: HTMLElement) => {
      el.click();
      el.click();
    });
    await expect.poll(async () => Math.round(three.x - (await day(page, 3).boundingBox())!.x)).toBe(Math.round(step * 2));
  });

  test("once the cover's title has gone, a light header pins the page's name", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 560 });
    await page.goto(`/path/${HABIT}`);
    const band = page.getByTestId("cover-band");
    const back = page.getByTestId("path-back");
    await expect(band).toHaveCSS("opacity", "0");
    await expect(back).toHaveCSS("background-color", "rgba(15, 17, 21, 0.42)");
    await page.mouse.move(195, 300);
    await page.mouse.wheel(0, 1200);
    await expect(band).toHaveCSS("opacity", "1");
    await expect(band).toContainText("Breaking free from habitual sin");
    await expect(band).toHaveCSS("background-color", "rgb(247, 244, 238)");
    // The buttons turn white on it.
    await expect(back).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(page.getByTestId("path-share")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  });
});

test("a series page pins the same header once its title has gone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 480 });
  await page.goto("/series/apostolic-shift-2026");
  const band = page.getByTestId("cover-band");
  const back = page.getByTestId("series-page").getByRole("button", { name: "Back", exact: true });
  await expect(band).toHaveCSS("opacity", "0");
  await expect(back).toHaveCSS("background-color", "rgba(15, 17, 21, 0.42)");
  await page.mouse.move(195, 300);
  await page.mouse.wheel(0, 1200);
  await expect(band).toHaveCSS("opacity", "1");
  await expect(band).toContainText("Apostolic Shift 2026");
  await expect(back).toHaveCSS("background-color", "rgb(255, 255, 255)");
});
