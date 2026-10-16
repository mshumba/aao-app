import type { Page } from "@playwright/test";
import { HABIT, WAIT, expect, shown, test } from "./fixtures";

// What the results say once they're in, judged on everything found (the
// moments and the sermons), and drafts never labelled. Faults come from
// the stand-in search's development-only switch (src/learning/fixtures.ts).

const NEED = "I keep falling into the same sin";
const WAITING = "I'm tired of waiting on God";
const ORDER_SET = "Order set by the ministry";

type Fault = "empty" | "sermons_only" | null;
const setFault = (page: Page, fault: Fault) =>
  page.addInitScript((f) => {
    (globalThis as { __aaoSearchFault?: Fault }).__aaoSearchFault = f;
  }, fault);

const results = (page: Page) => shown(page.getByTestId("moment-result"));
const live = (page: Page) => page.getByTestId("search-status");
const search = (page: Page, q: string) => page.goto(`/search?q=${encodeURIComponent(q)}`);

test("once the moments are in, it says what they're about, not that it's still finding them", async ({
  page,
}) => {
  await search(page, NEED);
  await expect(results(page)).toHaveCount(6);
  await expect(shown(page.getByText("Moments about breaking a habit of sin", { exact: true }))).toBeVisible();
  await expect(page.getByText(/Finding moments/)).toHaveCount(0);
  await expect(live(page)).toHaveText("6 moments found");
});

test("sermons found without moments are never announced as nothing found", async ({ page }) => {
  await setFault(page, "sermons_only");
  await search(page, NEED);
  const sermons = shown(page.getByTestId("sermon-row"));
  await expect(sermons).toHaveCount(4);
  await expect(results(page)).toHaveCount(0);
  await expect(shown(page.getByText("Sermons about breaking a habit of sin", { exact: true }))).toBeVisible();
  await expect(live(page)).toHaveText("4 sermons found");
  await expect(page.getByText(/Nothing (found )?for/)).toHaveCount(0);
  await expect(page.getByTestId("search-empty")).toHaveCount(0);
});

test("nothing at all found says so", async ({ page }) => {
  await setFault(page, "empty");
  await search(page, "zzz");
  await expect(shown(page.getByTestId("search-empty"))).toBeVisible();
  await expect(live(page)).toHaveText("Nothing found for zzz yet");
  await expect(page.getByText(/Moments about|Sermons about/)).toHaveCount(0);
});

test("a path for this never says it's a draft, nor that the ministry set a draft's order", async ({ page }) => {
  await search(page, WAITING);
  const path = page.getByTestId("search-path");
  await expect(path).toHaveAccessibleName("A path for this. Learning to wait on God. 5 messages");
  await expect(path).toContainText("5 messages");
  await expect(path).not.toContainText(/Draft|awaiting/);
  await expect(path).not.toContainText(ORDER_SET);
  await path.click();
  await expect(page).toHaveURL(new RegExp(`/path/${WAIT}$`));

  await search(page, NEED);
  await expect(page.getByTestId("search-path")).toHaveAccessibleName(
    "A path for this. Breaking free from habitual sin. 7 messages",
  );
  await expect(page.getByTestId("search-path")).not.toContainText("Draft");
});

test("the guided paths list carries no draft label", async ({ page }) => {
  await page.goto("/search");
  const guided = shown(page.getByTestId("guided-path"));
  await expect(guided).toHaveCount(2);
  const wait = guided.filter({ hasText: "Learning to wait on God" });
  await expect(wait).toContainText("5 messages");
  await expect(wait).not.toContainText(/Draft|awaiting/);
  await expect(wait).not.toContainText(ORDER_SET);
  await expect(guided.filter({ hasText: "Breaking free from habitual sin" })).not.toContainText("Draft");
  await guided.filter({ hasText: "Breaking free from habitual sin" }).click();
  await expect(page).toHaveURL(new RegExp(`/path/${HABIT}$`));
});
