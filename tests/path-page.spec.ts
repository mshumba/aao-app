import type { Page } from "@playwright/test";
import { HABIT, expect, seedPathProgress, shown, storedPathProgress, test } from "./fixtures";

// The path page's look, checked against the Appllama review (16 October
// 2026): a smaller cover, one surface per day's state, today's own "Mark
// done" ring, "Order set by the ministry" under the prose, and a light
// header pinned once the cover's title has gone. The fixture path,
// "Breaking free from habitual sin", has 7 days and 18 hours of sermons.

const ORDER_SET = "Order set by the ministry";
/** The pinned header's band under the status bar (CoverPage's BAND, no inset on the web). */
const BAND = 12 + 52;

function day(page: Page, n: number) {
  return shown(page.getByTestId(`path-day-${n}`)).first();
}

/** How opaque an element is drawn, with every layer it sits in. */
function drawnOpacity(page: Page, n: number, text: RegExp | string) {
  return day(page, n)
    .getByText(text)
    .first()
    .evaluate((el) => {
      let opacity = 1;
      for (let node: Element | null = el; node; node = node.parentElement)
        opacity *= Number(getComputedStyle(node).opacity);
      return Math.round(opacity * 100) / 100;
    });
}

/**
 * Where the page comes to rest at its foot: either the light header shows,
 * whole, or the cover's title sits wholly below it (never under Back).
 */
async function restsClear(page: Page) {
  await page.mouse.move(page.viewportSize()!.width / 2, page.viewportSize()!.height / 2);
  await page.mouse.wheel(0, 4000);
  await page.waitForTimeout(400);
  return page.evaluate((band) => {
    const shownEl = (els: Element[]) =>
      els.find((el) => !el.closest('[aria-hidden="true"]') && el.getBoundingClientRect().height > 0);
    const header = shownEl([...document.querySelectorAll('[data-testid="cover-band"]')]);
    const title = shownEl([...document.querySelectorAll('[role="heading"][aria-level="1"]')]);
    if (!header || !title) return "missing";
    if (getComputedStyle(header).opacity === "1") return "header";
    return title.getBoundingClientRect().top >= band ? "clear" : "under";
  }, BAND);
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
  // The kicker counts the days; the line under the title gives the length
  // alone, so "7 days" is said once.
  await expect(cover).toContainText("Guided path · 7 days");
  await expect(line).toHaveText(/^18h$/);
  expect((await cover.innerText()).match(/7 days/gi)).toHaveLength(1);
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

  test("the next day peeks with its lock and artwork, its words faded out", async ({ page }) => {
    await page.goto(`/path/${HABIT}`);
    await expect(day(page, 3)).toContainText("Stop sin while it is");
    // Day 4 at the row's edge: no clipped words ("Find / boo"), but its lock shows.
    await expect.poll(() => drawnOpacity(page, 4, /^Find the flesh/)).toBe(0);
    await expect.poll(() => drawnOpacity(page, 4, /^Day.4/)).toBe(0);
    expect(await drawnOpacity(page, 3, /^Stop sin while it is/)).toBe(1);
    const lock = day(page, 4).locator("svg").first();
    expect(
      await lock.evaluate((el) => {
        let opacity = 1;
        for (let node: Element | null = el; node; node = node.parentElement)
          opacity *= Number(getComputedStyle(node).opacity);
        return opacity;
      }),
    ).toBe(1);
    // Slid in, its words come back; Day 5's go.
    await page.getByTestId("path-days").first().evaluate((el) => {
      el.scrollLeft += (el.firstElementChild!.children[2] as HTMLElement).offsetWidth + 12;
    });
    await expect.poll(() => drawnOpacity(page, 4, /^Find the flesh/)).toBe(1);
    await expect.poll(() => drawnOpacity(page, 5, /^Gain mastery/)).toBe(0);
  });

  test("on a narrow card, “Opens after Day 3” sits under the theme", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(`/path/${HABIT}`);
    // The eyebrow keeps to its one line, "DAY 4"; the theme starts where the others do.
    const eyebrow = day(page, 4).getByText(/^Day.4$/);
    const opens = day(page, 4).getByText("Opens after Day 3", { exact: true });
    const theme = day(page, 4).getByText(/^Find the flesh/);
    await expect(opens).toHaveCount(1);
    const [e, o, t] = [(await eyebrow.boundingBox())!, (await opens.boundingBox())!, (await theme.boundingBox())!];
    expect(e.height).toBeLessThan(20);
    expect(o.y).toBeGreaterThanOrEqual(t.y + t.height - 1);
    const other = (await day(page, 3).getByText(/^Stop sin while it is/).boundingBox())!;
    expect(Math.abs(t.y - other.y)).toBeLessThan(1);
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

test("a day's card is as tall as its theme: one line leaves no empty line under it", async ({ page }) => {
  await page.goto(`/path/${HABIT}`);
  // "Lay aside every weight" keeps to one line at 375pt; Day 3's theme takes two.
  const one = day(page, 1).getByText("Lay aside every weight", { exact: true });
  const two = day(page, 3).getByText(/^Stop sin while it is/);
  await expect(one).toBeVisible();
  const [a, b] = [(await one.boundingBox())!, (await two.boundingBox())!];
  expect(a.height).toBeLessThan(30);
  expect(b.height).toBeGreaterThan(45);
  // Its sermon follows straight on (no reserved second line), and its card
  // ends sooner than Day 3's.
  const sermon = (await day(page, 1).getByText("Apostolic Shift: Day One", { exact: true }).boundingBox())!;
  expect(sermon.y - (a.y + a.height)).toBeLessThan(24);
  expect((await day(page, 1).boundingBox())!.height).toBeLessThan((await day(page, 3).boundingBox())!.height);
});

test("short pages rest with the header whole or the title clear of Back, never under it", async ({ page }) => {
  // The reported phone: 375×667 stopped with Back over the title.
  await page.goto(`/path/${HABIT}`);
  await expect(day(page, 1)).toBeVisible();
  expect(await restsClear(page)).not.toBe("under");
  for (const height of [560, 580, 600, 620, 640, 667, 700, 760]) {
    await page.setViewportSize({ width: 375, height });
    await page.waitForTimeout(300);
    expect([height, await restsClear(page)]).not.toEqual([height, "under"]);
  }
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/series/apostolic-shift-2026");
  await expect(page.getByTestId("series-page")).toBeVisible();
  for (const height of [480, 500, 520, 540, 560, 580, 600, 620]) {
    await page.setViewportSize({ width: 375, height });
    await page.waitForTimeout(300);
    expect([height, await restsClear(page)]).not.toEqual([height, "under"]);
  }
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
