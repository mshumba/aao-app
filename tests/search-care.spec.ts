import type { Page } from "@playwright/test";
import { inDistress, maybeDistress } from "../src/search/care";
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

// Every wording the shared list (supabase/functions/_shared/distress.ts, used
// by the search function and the app) must read, both ways. "care": the card
// always shows and their words are never searched as typed. "maybe": the card
// shows when search can't read it (the model failed, or search failed).
// null: neither. The first block is the audit's appendix (16 October 2026).
const PHRASES: [phrase: string, reads: "care" | "maybe" | null][] = [
  // Matched before, still matched
  ["I want to die", "care"],
  ["I want to kill myself", "care"],
  ["suicidal", "care"],
  ["end it all", "care"],
  ["no reason to live", "care"],
  ["better off dead", "care"],
  ["self harm", "care"],
  ["cutting myself", "care"],
  ["I wan kill myself", "care"],
  ["je veux me suicider", "care"],
  // Missed before
  ["tired of living", "care"],
  ["I'm tired of living", "care"],
  ["I can't go on", "care"],
  ["i cant go on anymore", "care"],
  ["I hate my life", "care"],
  ["nobody would miss me", "care"],
  ["I wan die", "care"],
  ["I don tire for this life", "care"],
  ["wan comot for this world", "care"],
  ["je veux mourir", "care"],
  ["quero morrer", "care"],
  ["vou me matar", "care"],
  ["nataka kufa", "care"],
  ["najiua", "care"],
  // Teaching and grief, rightly not matched
  ["die to self", null],
  ["dying to self", null],
  ["kill the flesh", null],
  ["how to die to sin", null],
  ["death of a loved one", null],
  ["my father died", null],
  ["grief", null],
  // False positives before, not now
  ["I want to die to my flesh", null],
  ["I want to die daily", null],
  ["ready to die for Christ", null],
  ["suicide prevention sermon", null],
  ["killing myself slowly with sin", null],
  ["I want to die to the world", null],
  ["I want to die to self", null],
  ["dying to the flesh", null],
  ["I will die for Jesus", null],
  ["ready to die for Jesus", null],
  ["I want to die empty", null],
  ["to live is Christ and to die is gain", null],
  ["I don't want to die", null],
  ["mourir à soi-même", null],
  ["morrer para o mundo", null],
  // More plain wordings
  ["I want to end my life", "care"],
  ["thinking about suicide", "care"],
  ["There is no reason to live", "care"],
  ["Everyone would be better off dead without me", "care"],
  ["I don’t want to live anymore", "care"],
  ["I feel hopeless and can't go on", "care"],
  ["I wish I was never born", "care"],
  ["what's the point of living", "care"],
  ["life isn't worth living", "care"],
  ["I have nothing to live for", "care"],
  ["I'm ready to die", "care"],
  ["I want to die to self, but honestly I want to kill myself", "care"],
  ["I no wan live again", "care"],
  ["make I just die", "care"],
  ["j'ai envie de mourir", "care"],
  ["je vais me tuer", "care"],
  ["je ne veux plus vivre", "care"],
  ["Não quero mais viver", "care"],
  ["cansada de viver", "care"],
  ["nitajiua", "care"],
  ["sitaki kuishi", "care"],
  ["nimechoka na maisha", "care"],
  // Despair that may mean it
  ["I can't go on like this", "maybe"],
  ["I feel hopeless", "maybe"],
  ["everything feels pointless", "maybe"],
  ["I feel like a burden to my family", "maybe"],
  ["I'm so depressed", "maybe"],
  ["sermon on depression", "maybe"],
  ["I can't take it anymore", "maybe"],
  ["I just want to disappear", "maybe"],
  ["I don tire", "maybe"],
  ["je n'en peux plus", "maybe"],
  ["désespoir", "maybe"],
  ["não aguento mais", "maybe"],
  ["nimechoka", "maybe"],
  ["sina matumaini", "maybe"],
  // Ordinary searches
  ["I keep falling into the same sin", null],
  ["I'm afraid of what's coming", null],
  ["fear of death", null],
  ["how to give up smoking", null],
  ["life is worth living", null],
  ["the joy of the Lord is my strength", null],
  ["", null],
];

test("the phrase table: each wording reads as care, maybe or neither", () => {
  for (const [phrase, reads] of PHRASES) {
    expect(inDistress(phrase), `care: ${phrase}`).toBe(reads === "care");
    expect(maybeDistress(phrase), `maybe: ${phrase}`).toBe(reads !== null);
  }
});

test("search's care flag puts the card first, above comforting moments", async ({ page }) => {
  // Words the app's own list doesn't settle ("maybe"); search's reading does.
  await search(page, "I feel hopeless");
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

// Words that may mean distress: the card when search can't read them
// (failing closed), never otherwise.
const fails = { unavailable: "isn’t answering", busy: "is busy" } as const;
for (const fault of ["unavailable", "busy"] as const) {
  test(`words that may mean distress get the card when search ${fails[fault]}`, async ({ page }) => {
    await page.addInitScript((f) => {
      (globalThis as { __aaoSearchFault?: string }).__aaoSearchFault = f;
    }, fault);
    await search(page, "everything feels pointless");
    await expectCard(page);
    await expect(shown(page.getByTestId("care-calm"))).toContainText("The Apostle’s teaching couldn’t load just now.");
    await expect(page.getByTestId("search-unavailable")).toHaveCount(0);
    await expect(page.getByTestId("search-busy")).toHaveCount(0);
    await expect(shown(page.getByTestId("sermon-row"))).toHaveCount(0);
    expect(await cardFirst(page)).toBe(true);
  });
}

test("words that may mean distress, read as ordinary by search, show no card", async ({ page }) => {
  await search(page, "everything feels pointless");
  await expect(results(page).first()).toBeVisible();
  await expect(page.getByTestId("care-card")).toHaveCount(0);
});

test("a prayer to die to the flesh is not a crisis", async ({ page }) => {
  await search(page, "I want to die to my flesh");
  await expect(results(page).first()).toBeVisible();
  await expect(page.getByTestId("care-card")).toHaveCount(0);
});

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
