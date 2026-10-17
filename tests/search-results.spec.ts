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
type Fake = { quoteless?: boolean; matched?: number };
const setFake = (page: Page, fake: Fake) =>
  page.addInitScript((f) => {
    (globalThis as { __aaoSearchFake?: Fake }).__aaoSearchFake = f;
  }, fake);

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
  await expect(path).toHaveAccessibleName("A path for this. Learning to wait on God. 5 days");
  await expect(path).toContainText("5 days");
  await expect(path).not.toContainText(/Draft|awaiting/);
  await expect(path).not.toContainText(ORDER_SET);
  await path.click();
  await expect(page).toHaveURL(new RegExp(`/path/${WAIT}$`));

  await search(page, NEED);
  await expect(page.getByTestId("search-path")).toHaveAccessibleName(
    "A path for this. Breaking free from habitual sin. 7 days",
  );
  await expect(page.getByTestId("search-path")).not.toContainText("Draft");
});

test("the guided paths list carries no draft label", async ({ page }) => {
  await page.goto("/search");
  const guided = shown(page.getByTestId("guided-path"));
  await expect(guided).toHaveCount(2);
  const wait = guided.filter({ hasText: "Learning to wait on God" });
  // Under "Guided paths", never "Guided path" again; before it's started,
  // the path's promise (once started, where you are).
  await expect(wait).not.toContainText(/guided path/i);
  await expect(wait).toContainText("Five days on staying faithful when God's promise seems slow.");
  // The promise gives the length, so no "5 days" over it says it twice.
  await expect(wait).not.toContainText(/5 days/i);
  await expect(wait).toHaveAccessibleName(
    /^Learning to wait on God\. Five days on staying faithful when God.s promise seems slow\.?$/,
  );
  await expect(wait).not.toContainText(/Draft|awaiting/);
  await expect(wait).not.toContainText(ORDER_SET);
  await expect(guided.filter({ hasText: "Breaking free from habitual sin" })).not.toContainText("Draft");
  await guided.filter({ hasText: "Breaking free from habitual sin" }).click();
  await expect(page).toHaveURL(new RegExp(`/path/${HABIT}$`));
});

test("the first moment plays from the navy pill, the rest from a quieter time chip", async ({ page }) => {
  await search(page, NEED);
  await expect(results(page)).toHaveCount(6);
  await expect(
    results(page).first().getByRole("button", { name: "Play from 53 minutes 44 seconds", exact: true }),
  ).toHaveText("Play from 53:44");
  // Read the same way; seen as just the time.
  const second = results(page).nth(1);
  await expect(second.getByRole("button", { name: "Play from 56 minutes 45 seconds", exact: true })).toHaveText(
    "56:45",
  );
  // Save is a bare bookmark beside the title, named as before.
  await expect(second.getByRole("button", { name: "Save Apostolic Shift: Grand Finale", exact: true })).toBeVisible();
});

test("more moments matched than are listed: the count says Top 6", async ({ page }) => {
  await setFake(page, { matched: 40 });
  await search(page, NEED);
  await expect(results(page)).toHaveCount(6);
  // (Seen only: on the web screen readers read the words below instead.)
  await expect(page.getByText("Top 6", { exact: true })).toBeVisible();
  // Screen readers hear how many matched in all.
  await expect(shown(page.getByText("Top 6 of 40 moments", { exact: true }))).toHaveCount(1);
});

test("on a narrow phone the count stays on the heading's line, the title wrapping beside it", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await setFake(page, { matched: 40 });
  await search(page, NEED);
  await expect(results(page)).toHaveCount(6);
  const title = shown(page.getByRole("heading", { level: 2, name: "Moments that speak to this" }));
  // (Seen only, as above: hidden from screen readers on the web.)
  const count = page.getByText("Top 6", { exact: true }).filter({ visible: true });
  const [t, n] = [(await title.boundingBox())!, (await count.boundingBox())!];
  // Beside the title's first line (27pt), not under it, and inside the page.
  expect(n.y).toBeLessThan(t.y + 27);
  expect(n.x).toBeGreaterThanOrEqual(t.x + t.width);
  expect(n.x + n.width).toBeLessThanOrEqual(320 - 24 + 1);
  // The title's last word never stands alone on its second line.
  expect(t.height).toBeGreaterThan(40);
  expect(await title.evaluate((el) => el.textContent)).toBe("Moments that speak to\u00a0this");
});

test("a moment whose quote doesn't pass is listed after the quoted ones, never as an empty card", async ({
  page,
}) => {
  await setFake(page, { quoteless: true });
  await search(page, NEED);
  const also = shown(page.getByTestId("moment-also"));
  await expect(also).toHaveCount(1);
  await expect(results(page)).toHaveCount(5);
  await expect(shown(page.getByRole("heading", { name: "Also mentioned in" }))).toBeVisible();
  // It opens its sermon or plays from the moment, like a card.
  await expect(also.getByRole("button", { name: /^Pray Without Ceasing\. 27 Sep 2026, 3 hours 35 minutes$/ })).toBeVisible();
  await expect(also.getByRole("button", { name: "Play from 1 hour 35 minutes 10 seconds", exact: true })).toHaveText(
    "1:35:10",
  );
  // His words never show as a lower-case transcript instead.
  expect(await page.locator("body").innerText()).not.toContain("the foundation of all sin is self");
});
