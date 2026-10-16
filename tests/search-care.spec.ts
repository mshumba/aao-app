import type { Page } from "@playwright/test";
import { inDistress } from "../src/search/care";
import { expect, shown, test } from "./fixtures";

// Someone who may be in distress: a calm card comes first, whether search
// says so (`care`) or their words plainly do, and when search can't answer
// it stays, with one calm line and never raw matches for their words. In
// local mode the stand-in search reads distress as the search function does
// (src/learning/fixtures.ts); development-only switches set its flag and
// its faults.

const TITLE = "You don’t have to carry this alone.";
const BODY = "If you might act on these thoughts, call your local emergency number now.";

type Fake = { delay?: number; care?: boolean };
type Fault = "offline" | "unavailable" | null;

const setFake = (page: Page, fake: Fake) =>
  page.addInitScript((f) => {
    (globalThis as { __aaoSearchFake?: Fake }).__aaoSearchFake = f;
  }, fake);
const setFault = (page: Page, fault: Fault) =>
  page.addInitScript((f) => {
    (globalThis as { __aaoSearchFault?: Fault }).__aaoSearchFault = f;
  }, fault);

const card = (page: Page) => shown(page.getByTestId("care-card"));
const results = (page: Page) => shown(page.getByTestId("moment-result"));
const live = (page: Page) => page.getByTestId("search-status");
const search = (page: Page, q: string) => page.goto(`/search?q=${encodeURIComponent(q)}`);

/** The card says all three things, and nothing on it closes it. */
async function expectCard(page: Page) {
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole("heading", { level: 2, name: TITLE })).toBeVisible();
  await expect(card(page)).toContainText(BODY);
  await expect(card(page).getByRole("link", { name: "Find a helpline", exact: true })).toBeVisible();
  await expect(card(page).getByRole("button")).toHaveCount(0);
}

/** Whether the card comes before every result in reading order. */
function cardFirst(page: Page) {
  return page.evaluate(() => {
    const c = document.querySelector('[data-testid="care-card"]');
    const results = [...document.querySelectorAll('[data-testid="moment-result"], [data-testid="sermon-row"]')];
    return !!c && results.every((r) => c.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
}

test("the plain wordings of distress are recognised, and teaching phrases are not", () => {
  for (const q of [
    "I want to die",
    "I want to kill myself",
    "I want to end my life",
    "thinking about suicide",
    "There is no reason to live",
    "Everyone would be better off dead without me",
    "I don’t want to live anymore",
  ])
    expect(inDistress(q), q).toBe(true);
  for (const q of [
    "I want to die to self",
    "dying to the flesh",
    "I'm afraid of what's coming",
    "I feel hopeless and can't go on",
    "",
  ])
    expect(inDistress(q), q).toBe(false);
});

test("search's care flag puts the card first, above comforting moments", async ({ page }) => {
  // Words the app's own list doesn't catch; search's reading does.
  await search(page, "I feel hopeless and can't go on");
  await expectCard(page);
  await expect(results(page)).toHaveCount(4);
  expect(await cardFirst(page)).toBe(true);
  await expect(shown(page.getByText("Moments about finding hope and comfort in God", { exact: true }))).toBeVisible();
  // Screen readers hear the card before what was found.
  await expect(live(page)).toHaveText(`${TITLE} ${BODY} 4 moments found`);
  // No sermon titles matched to their words.
  await expect(page.getByTestId("result-count")).toHaveCount(0);
});

test("plain words of distress show the card even when search doesn't flag them", async ({ page }) => {
  await setFake(page, { care: false });
  await search(page, "I want to end my life");
  await expectCard(page);
  await expect(results(page).first()).toBeVisible();
  expect(await cardFirst(page)).toBe(true);
  await expect(live(page)).toContainText(TITLE);
});

/** Everything the live region says, in order, from the page's start. */
async function recordLive(page: Page) {
  await page.addInitScript(() => {
    const said: string[] = ((window as unknown as { __said: string[] }).__said = []);
    new MutationObserver(() => {
      const text = document.querySelector('[data-testid="search-status"]')?.textContent ?? "";
      if (text && said[said.length - 1] !== text) said.push(text);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  return () => page.evaluate(() => (window as unknown as { __said: string[] }).__said);
}

test("the card shows as soon as they search, and is read first", async ({ page }) => {
  await setFake(page, { delay: 2500 });
  const said = await recordLive(page);
  await search(page, "I want to die");
  await expectCard(page);
  await expect(page.getByTestId("search-loader")).toBeVisible();
  await expect(results(page)).toHaveCount(0);
  await expect(results(page)).toHaveCount(4);
  await expectCard(page);
  const heard = await said();
  expect(heard[0]).toBe(`${TITLE} ${BODY}`);
  expect(heard[heard.length - 1]).toBe(`${TITLE} ${BODY} 4 moments found`);
});

test("Find a helpline opens findahelpline.com outside the app", async ({ page, context }) => {
  await context.route("https://findahelpline.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Find A Helpline</title>" }),
  );
  await search(page, "I want to die");
  const opened = context.waitForEvent("page");
  await card(page).getByRole("link", { name: "Find a helpline", exact: true }).click();
  const helpline = await opened;
  await expect(helpline).toHaveURL(/^https:\/\/findahelpline\.com\/?$/);
  // The app stays where it was.
  await expect(page).toHaveURL(/\/search\?q=/);
});

// A request that times out reaches the screen as "offline", like no connection.
const failures = { unavailable: "isn’t answering", offline: "times out or has no connection" } as const;
for (const fault of ["unavailable", "offline"] as const) {
  test(`when search ${failures[fault]}, the card stays with one calm line, and nothing else`, async ({
    page,
  }) => {
    await setFault(page, fault);
    await search(page, "I want to die");
    await expectCard(page);
    const calm = shown(page.getByTestId("care-calm"));
    await expect(calm).toContainText("The Apostle’s teaching couldn’t load just now.");
    // Not the usual states: no other needs to try, no sermon titles for their words.
    await expect(page.getByTestId("search-unavailable")).toHaveCount(0);
    await expect(page.getByTestId("search-offline")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Try one of these" })).toHaveCount(0);
    await expect(shown(page.getByTestId("sermon-row"))).toHaveCount(0);
    await expect(results(page)).toHaveCount(0);
    expect(await cardFirst(page)).toBe(true);
    await expect(live(page)).toHaveText(`${TITLE} ${BODY} The Apostle’s teaching couldn’t load just now.`);
    // Try again searches again.
    await page.evaluate(() => {
      (globalThis as { __aaoSearchFault?: Fault }).__aaoSearchFault = null;
    });
    await calm.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(results(page)).toHaveCount(4);
    await expectCard(page);
  });
}

test("words of distress aren't kept in recent searches", async ({ page }) => {
  await search(page, "I want to die");
  await expect(results(page)).toHaveCount(4);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(shown(page.getByRole("group", { name: "Common needs" }))).toBeVisible();
  await expect(page.getByRole("button", { name: "Search again: I want to die", exact: true })).toHaveCount(0);
  await expect(card(page)).toHaveCount(0);
});

test("an ordinary search shows no care card", async ({ page }) => {
  await search(page, "I keep falling into the same sin");
  await expect(results(page)).toHaveCount(6);
  await expect(page.getByTestId("care-card")).toHaveCount(0);
});
