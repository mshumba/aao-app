import type { Page } from "@playwright/test";
import {
  HABIT,
  LENGTH,
  SERMON,
  expect,
  fakeYouTube,
  rows,
  shown,
  tab,
  test,
  ytLog,
} from "./fixtures";

// "What are you going through?": search by need, answered with moments in
// the Apostle's own words. In local mode the search and quotes functions are
// the deterministic fakes in src/learning/fixtures.ts (no network): a need
// about a habit of sin returns six moments, the third of which comes back
// without a quote and has it filled in by the quotes function 600ms later.

const NEED = "I keep falling into the same sin";
const FIRST_QUOTE =
  "“Bad actions are incubated through the outlet of the mind until they find expression in the womb of the heart.”";
const LATE_QUOTE = "The foundation of all sin is self.";

function field(page: Page) {
  return page.getByRole("searchbox", { name: "What are you going through?" });
}

function results(page: Page) {
  return shown(page.getByTestId("moment-result"));
}

function needChip(page: Page, name: string) {
  return page
    .getByRole("list", { name: "Common needs" })
    .getByRole("button", { name, exact: true });
}

/** Counts quote placeholders shown inside result cards, from now on. */
async function watchQuotePlaceholders(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __quotePlaceholders: number };
    w.__quotePlaceholders = 0;
    new MutationObserver(() => {
      const n = document.querySelectorAll(
        '[data-testid="moment-result"] [aria-label="Finding the quote"]',
      ).length;
      w.__quotePlaceholders = Math.max(w.__quotePlaceholders, n);
    }).observe(document.body, { subtree: true, childList: true });
  });
  return () =>
    page.evaluate(
      () => (window as unknown as { __quotePlaceholders: number }).__quotePlaceholders,
    );
}

test("a need on Home finds moments in his words, and the path for it", async ({
  page,
}) => {
  await page.goto("/");
  await needChip(page, "The same sin again").click();
  await expect(tab(page, "Search")).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\/search\?q=I%20keep%20falling%20into%20the%20same%20sin$/);
  await expect(field(page)).toHaveValue(NEED);
  // What search understood, in plain words, with its count.
  await expect(
    shown(page.getByText("Finding moments about breaking a habit of sin", { exact: true })),
  ).toBeVisible();
  await expect(results(page)).toHaveCount(6);
  // "6 found" is seen; screen readers hear "6 moments found".
  await expect(page.getByText("6 found", { exact: true })).toBeVisible();
  // (Once beside the heading, once in the status announced as results land.)
  await expect(shown(page.getByText("6 moments found", { exact: true }))).toHaveCount(2);
  // Needs the same path answers, to try next.
  await expect(
    page.getByRole("list", { name: "Related needs" }).getByRole("button"),
  ).toHaveText(["Shame after falling", "Temptation", "Self-control"]);
  // A moment: the sermon, his words in quotation marks, and where they are.
  const first = results(page).first();
  await expect(first).toContainText("Apostolic Shift: Day Two Morning");
  await expect(first).toContainText(FIRST_QUOTE);
  const play = first.getByRole("button", { name: "Play from 53 minutes 44 seconds", exact: true });
  await expect(play).toContainText("Play from 53:44");
  // The sermons the moments come from, with how many each holds.
  await expect(
    page.getByRole("button", {
      name: "Apostolic Shift: Day Two Morning. 23 Sep 2026, 2 hours 49 minutes. 2 moments on this.",
      exact: true,
    }),
  ).toBeVisible();
  // "A path for this" opens the path.
  const path = page.getByTestId("search-path");
  await expect(path).toHaveAccessibleName(
    "A path for this. Breaking free from habitual sin. 7 messages. About 16 minutes a day",
  );
  await path.click();
  await expect(page).toHaveURL(new RegExp(`/path/${HABIT}$`));
  await expect(
    page.getByRole("heading", { level: 1, name: "Breaking free from habitual sin" }),
  ).toBeVisible();
});

test("a quote still being found holds its place, then his exact words fill in", async ({
  page,
}) => {
  await page.goto("/");
  const placeholders = await watchQuotePlaceholders(page);
  await needChip(page, "The same sin again").click();
  await expect(results(page)).toHaveCount(6);
  const late = results(page).nth(2);
  await expect(late).toContainText(`“${LATE_QUOTE}”`);
  // Exactly that one card waited for its quote, behind a placeholder.
  expect(await placeholders()).toBe(1);
  await expect(late.getByLabel("Finding the quote")).toHaveCount(0);
  // The raw lowercase transcript is never shown as a quote.
  const text = await page.locator("body").innerText();
  expect(text).not.toContain(LATE_QUOTE.toLowerCase().replace(/\.$/, ""));
  expect(text).not.toContain("bad actions are incubated");
});

test("Play from opens the sermon at that moment and plays from there", async ({
  page,
}) => {
  await fakeYouTube(page, { duration: LENGTH[SERMON.dayTwo] });
  await page.goto(`/search?q=${encodeURIComponent(NEED)}`);
  await results(page)
    .first()
    .getByRole("button", { name: "Play from 53 minutes 44 seconds", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.dayTwo}\\?t=3224&from=search&q=`));
  await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  // Loaded at the moment itself, not from the start or a saved place.
  expect((await ytLog(page)).starts).toEqual([3224]);
  await expect(page.getByTestId("resume-note")).toHaveCount(0);
  // The stage says where it came from, and the moment is the one playing.
  await expect(page.getByLabel(`From your search: ${NEED}`)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^53 minutes 44 seconds\. Playing\. Victory over sin\./ }),
  ).toHaveAttribute("aria-selected", "true");
  // Back returns to the same results.
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(field(page)).toHaveValue(NEED);
  await expect(results(page)).toHaveCount(6);
});

test("typing suggests needs and sermon titles; finding moments waits for Return", async ({
  page,
}) => {
  await page.goto("/search");
  await field(page).fill("pray");
  await expect(
    page.getByRole("button", { name: "Search for pray", exact: true }),
  ).toBeVisible();
  // A need that matches what's typed, and the sermon titles that do.
  await expect(
    page.getByRole("button", { name: "Search: My prayer life feels dry", exact: true }),
  ).toBeVisible();
  await expect(shown(page.getByTestId("result-count"))).toHaveText("2 sermons");
  await expect(rows(page)).toHaveCount(2);
  // Nothing is sent while typing.
  await expect(results(page)).toHaveCount(0);
  await field(page).press("Enter");
  await expect(results(page)).toHaveCount(6);
  // Title matches stay for a title-like question.
  await expect(shown(page.getByTestId("result-count"))).toHaveText("2 sermons");

  // The question is kept as a recent search, which can run again or go.
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(field(page)).toHaveValue("");
  await expect(field(page)).toBeFocused();
  const again = page.getByRole("button", { name: "Search again: pray", exact: true });
  await expect(again).toBeVisible();
  await again.click();
  await expect(field(page)).toHaveValue("pray");
  await expect(results(page)).toHaveCount(6);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("button", { name: "Remove “pray” from recent searches", exact: true }).click();
  await expect(again).toHaveCount(0);
});

test("a related need searches again for that need", async ({ page }) => {
  await page.goto(`/search?q=${encodeURIComponent(NEED)}`);
  await expect(results(page)).toHaveCount(6);
  await page
    .getByRole("list", { name: "Related needs" })
    .getByRole("button", { name: "Temptation", exact: true })
    .click();
  // The chip's short name runs its need's full question.
  await expect(field(page)).toHaveValue("I'm being tempted");
  await expect(
    shown(page.getByText("Finding moments about resisting temptation", { exact: true })),
  ).toBeVisible();
  await expect(results(page).first()).toContainText(
    "“Temptation is idiosyncratic; temptation is particular to you.”",
  );
});

test("the empty field offers common needs and topics to browse", async ({ page }) => {
  await page.goto("/search");
  await expect(
    page.getByRole("heading", { level: 1, name: "What are you going through?" }),
  ).toBeVisible();
  const needs = page.getByRole("group", { name: "Common needs" }).getByRole("button");
  await expect(needs).toHaveCount(10);
  await needs.filter({ hasText: "Fear" }).click();
  await expect(field(page)).toHaveValue("I'm afraid of what's coming");
  await expect(results(page)).toHaveCount(6);
});

test("saving from a moment saves its sermon to the library", async ({ page }) => {
  await page.goto(`/search?q=${encodeURIComponent(NEED)}`);
  const save = results(page)
    .first()
    .getByRole("button", { name: "Save Apostolic Shift: Day Two Morning to your library", exact: true });
  await save.click();
  await expect(page.getByTestId("toast")).toContainText("Saved to your library");
  // Every card from that sermon now shows it saved.
  await expect(
    shown(
      page.getByRole("button", {
        name: "Saved. Remove Apostolic Shift: Day Two Morning from your library",
        exact: true,
      }),
    ),
  ).toHaveCount(2);
  await page.goto("/saved");
  await expect(
    page.getByRole("button", { name: /^Apostolic Shift: Day Two Morning\./ }),
  ).toBeVisible();
});

test.describe("as a guest", () => {
  test.use({ viewer: "guest" });

  test("saving from a moment asks for a free account first", async ({ page }) => {
    await page.goto(`/search?q=${encodeURIComponent(NEED)}`);
    await results(page)
      .first()
      .getByRole("button", { name: "Save Apostolic Shift: Day Two Morning to your library", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Create a free account to save sermons" }),
    ).toBeVisible();
  });

  test("Play from asks for an account, then plays the sermon", async ({ page }) => {
    await fakeYouTube(page, { duration: LENGTH[SERMON.dayTwo] });
    await page.goto(`/search?q=${encodeURIComponent(NEED)}`);
    await results(page)
      .first()
      .getByRole("button", { name: "Play from 53 minutes 44 seconds", exact: true })
      .click();
    const heading = page.getByRole("heading", { name: "Create a free account to watch" });
    await expect(heading).toBeVisible();
    expect((await ytLog(page)).created).toBe(0);
    await page.getByTestId("continue-google").click();
    await expect(heading).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.dayTwo}`));
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
  });

  test("after signing up, Play from still starts at that moment", async ({ page }) => {
    // The sign-up carries the moment's time through to the player.
    await fakeYouTube(page, { duration: LENGTH[SERMON.dayTwo] });
    await page.goto(`/search?q=${encodeURIComponent(NEED)}`);
    await results(page)
      .first()
      .getByRole("button", { name: "Play from 53 minutes 44 seconds", exact: true })
      .click();
    await page.getByTestId("continue-google").click();
    await expect(page.getByTestId("playback-status")).toHaveText("Playing");
    expect((await ytLog(page)).starts).toEqual([3224]);
  });
});

// The calm states, through the stand-in search's development-only fault
// switch (src/learning/fixtures.ts).
test.describe("when search can't answer", () => {
  type Fault = "offline" | "rate_limited" | "unavailable" | "empty" | null;
  const setFault = (page: Page, fault: Fault) =>
    page.addInitScript((f) => {
      (globalThis as { __aaoSearchFault?: Fault }).__aaoSearchFault = f;
    }, fault);
  const clearFault = (page: Page) =>
    page.evaluate(() => {
      (globalThis as { __aaoSearchFault?: Fault }).__aaoSearchFault = null;
    });

  test("not answering: says so calmly, offers needs, and Try again searches", async ({ page }) => {
    await setFault(page, "unavailable");
    await page.goto(`/search?q=${encodeURIComponent(NEED)}`);
    const state = shown(page.getByTestId("search-unavailable"));
    await expect(state.getByRole("heading", { name: "Search isn’t answering" })).toBeVisible();
    await expect(state).toContainText("Finding moments by meaning isn’t available right now.");
    await expect(state.getByRole("group", { name: "Try one of these" }).getByRole("button")).toHaveCount(4);
    await expect(results(page)).toHaveCount(0);
    await clearFault(page);
    await state.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(results(page)).toHaveCount(6);
  });

  test("too many searches: asks to try again in a minute", async ({ page }) => {
    await setFault(page, "rate_limited");
    await page.goto(`/search?q=${encodeURIComponent(NEED)}`);
    const state = shown(page.getByTestId("search-busy"));
    await expect(state.getByRole("heading", { name: "Too many searches at once" })).toBeVisible();
    await expect(state).toContainText("Try again in a minute.");
    await expect(results(page)).toHaveCount(0);
  });

  test("offline: says search needs a connection, and titles still match", async ({ page, context }) => {
    await setFault(page, "offline");
    await page.goto("/search");
    await expect(field(page)).toBeVisible();
    await context.setOffline(true);
    await field(page).fill(NEED);
    await field(page).press("Enter");
    const state = shown(page.getByTestId("search-offline"));
    await expect(state.getByRole("heading", { name: "Search needs a connection" })).toBeVisible();
    await expect(state).toContainText("Reconnect and try again. Sermon titles still match as you type.");
    await context.setOffline(false);
  });

  test("nothing found: suggests a simpler word, or a common need", async ({ page }) => {
    await setFault(page, "empty");
    await page.goto(`/search?q=${encodeURIComponent("zzz")}`);
    const state = shown(page.getByTestId("search-empty"));
    await expect(state.getByRole("heading", { name: "Nothing for “zzz” yet" })).toBeVisible();
    await expect(state.getByRole("group", { name: "Try one of these" }).getByRole("button")).toHaveCount(4);
    await expect(results(page)).toHaveCount(0);
  });
});
