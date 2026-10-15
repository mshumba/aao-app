import type { Page } from "@playwright/test";
import { expect, shown, test } from "./fixtures";

// While search works: nothing for a quick answer, then the shuffling
// artwork over one honest line, and each search a request of its own (an
// older answer never replaces a newer one; clearing the field cancels).
// The stand-in search's development-only switches (src/learning/fixtures.ts)
// set how long it takes and whether it answers after being cancelled.

const NEED = "I keep falling into the same sin";
const FREE = "Why do I feel so far from God";
const FIRST_QUOTE = "Bad actions are incubated through the outlet of the mind";

type Fake = { delay?: number | Record<string, number>; ignoreAbort?: boolean; care?: boolean };

function setFake(page: Page, fake: Fake) {
  return page.addInitScript((f) => {
    (globalThis as { __aaoSearchFake?: Fake }).__aaoSearchFake = f;
  }, fake);
}

function searchLog(page: Page) {
  return page.evaluate(
    () => (globalThis as { __aaoSearchLog?: { q: string; outcome: string }[] }).__aaoSearchLog ?? [],
  );
}

const field = (page: Page) => page.getByRole("searchbox", { name: "What are you going through?" });
const results = (page: Page) => shown(page.getByTestId("moment-result"));
const loader = (page: Page) => page.getByTestId("search-loader");
/** The polite live region under the field. */
const live = (page: Page) => page.getByTestId("search-status");

/** Counts loaders and placeholders that ever appear, from now on. */
async function watchLoading(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __loading: number };
    w.__loading = 0;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="search-loader"], [data-testid="result-placeholder"]'))
        w.__loading += 1;
    }).observe(document.body, { subtree: true, childList: true });
  });
  return () => page.evaluate(() => (window as unknown as { __loading: number }).__loading);
}

/** Where each artwork tile in the fan is drawn now. */
function tilePlaces(page: Page) {
  return page
    .getByTestId("fan-tile")
    .evaluateAll((tiles) => tiles.map((t) => `${getComputedStyle(t).transform}|${getComputedStyle(t).zIndex}`));
}

test("a quick answer goes straight to its results, with no loader", async ({ page }) => {
  await setFake(page, { delay: 120 });
  await page.goto("/search");
  await expect(field(page)).toBeVisible();
  const loading = await watchLoading(page);
  await shown(page.getByRole("group", { name: "Common needs" }))
    .getByRole("button", { name: "The same sin again", exact: true })
    .click();
  await expect(results(page)).toHaveCount(6);
  // Searching it again answers from this session's copy.
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("button", { name: `Search again: ${NEED}`, exact: true }).click();
  await expect(results(page)).toHaveCount(6);
  expect(await loading()).toBe(0);
});

test("a slow search shuffles real artwork over what it's doing, then shows the results at once", async ({
  page,
}) => {
  await setFake(page, { delay: 9500 });
  await page.goto(`/search?q=${encodeURIComponent(FREE)}`);
  await expect(loader(page)).toBeVisible();
  // A fan of the library's artwork, decorative only.
  const tiles = page.getByTestId("fan-tile");
  await expect(tiles).toHaveCount(4);
  expect(
    await tiles.evaluateAll((all) => all.every((t) => t.closest('[aria-hidden="true"]') !== null)),
  ).toBe(true);
  // The line says what search is doing, in order, and the live region says it too.
  await expect(live(page)).toHaveText("Understanding what you’re going through…");
  await expect(live(page)).toHaveAttribute("aria-live", "polite");
  await expect(live(page)).toHaveText("Searching 4 sermons…");
  await expect(page.getByTestId("search-loader-status").last()).toHaveText("Searching 4 sermons…");
  await expect(live(page)).toHaveText("Choosing the clearest moments…");
  // Sand placeholders hold the results' place meanwhile.
  await expect(page.getByTestId("result-placeholder")).toHaveCount(3);
  // The fan is shuffling.
  const before = await tilePlaces(page);
  await page.waitForTimeout(450);
  expect(await tilePlaces(page)).not.toEqual(before);
  await expect(live(page)).toHaveText("Taking longer than usual. Still searching…", { timeout: 8000 });
  // The answer: the loader goes and the results show.
  await expect(results(page)).toHaveCount(6, { timeout: 5000 });
  await expect(loader(page)).toHaveCount(0);
  await expect(page.getByTestId("result-placeholder")).toHaveCount(0);
  await expect(live(page)).toHaveText("6 moments found");
});

test("a need is understood already: the line says what it's searching for", async ({ page }) => {
  await setFake(page, { delay: 3000 });
  await page.goto(`/search?q=${encodeURIComponent(NEED)}`);
  await expect(loader(page)).toBeVisible();
  await expect(live(page)).toHaveText("Searching 4 sermons for breaking a habit of sin…");
  await expect(page.getByTestId("search-loader-status").last()).toContainText("breaking a habit of sin");
  await expect(results(page)).toHaveCount(6);
});

test.describe("with Reduce Motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the fan holds still and only the line changes", async ({ page }) => {
    await setFake(page, { delay: 5000 });
    await page.goto(`/search?q=${encodeURIComponent(FREE)}`);
    await expect(loader(page)).toBeVisible();
    const before = await tilePlaces(page);
    await expect(live(page)).toHaveText("Searching 4 sermons…");
    expect(await tilePlaces(page)).toEqual(before);
    await expect(results(page)).toHaveCount(6);
  });
});

test("an older search answering late never replaces the newer one's results", async ({ page }) => {
  const OLD = "I'm afraid of what's coming";
  // The first answer still arrives after it was cancelled, as a reply on its way does.
  await setFake(page, { delay: { [OLD.toLowerCase()]: 2500, [NEED.toLowerCase()]: 300 }, ignoreAbort: true });
  await page.goto(`/search?q=${encodeURIComponent(OLD)}`);
  await expect(loader(page)).toBeVisible();
  await field(page).fill(NEED);
  await field(page).press("Enter");
  await expect(results(page)).toHaveCount(6);
  await expect(results(page).first()).toContainText(FIRST_QUOTE);
  await expect.poll(() => searchLog(page)).toContainEqual({ q: OLD, outcome: "answered" });
  await page.waitForTimeout(300);
  await expect(results(page).first()).toContainText(FIRST_QUOTE);
  await expect(shown(page.getByText("Moments about breaking a habit of sin", { exact: true }))).toBeVisible();
  await expect(field(page)).toHaveValue(NEED);
});

test("clearing the field cancels the search and goes back to the start", async ({ page }) => {
  await setFake(page, { delay: 3000 });
  await page.goto(`/search?q=${encodeURIComponent(NEED)}`);
  await expect(loader(page)).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(field(page)).toHaveValue("");
  await expect(loader(page)).toHaveCount(0);
  await expect(shown(page.getByRole("group", { name: "Common needs" }))).toBeVisible();
  await expect.poll(() => searchLog(page)).toContainEqual({ q: NEED, outcome: "aborted" });
  // Nothing comes back for it.
  await page.waitForTimeout(3300);
  expect(await searchLog(page)).not.toContainEqual({ q: NEED, outcome: "answered" });
  await expect(results(page)).toHaveCount(0);
});
