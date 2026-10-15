import type { Page } from "@playwright/test";
import { expect, rows, shown, tab, test, type TabName } from "./fixtures";

// Tabs are Home · Paths · Search · Account. Topics are no longer a tab:
// Search's empty field lists them under "Browse by topic", and each topic
// keeps its own page (/topics/[id]); old /topics links land on Search.

const notice = "Topics are sample labels, not yet checked against each sermon.";

function field(page: Page) {
  return page.getByRole("searchbox", { name: "What are you going through?" });
}

async function openTopic(page: Page, name: string) {
  await page.goto("/");
  await tab(page, "Search").click();
  await expect(shown(page.getByRole("heading", { name: "Browse by topic" }))).toBeVisible();
  await page.getByRole("button", { name, exact: true }).click();
}

test("tabs switch between peer destinations and keep each one's state", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("tablist")).toBeVisible();
  expect(
    await page.getByRole("tab").evaluateAll((tabs) => tabs.map((t) => t.getAttribute("aria-label"))),
  ).toEqual(["Home", "Paths", "Search", "Account"]);
  await expect(tab(page, "Home")).toHaveAttribute("aria-selected", "true");
  await tab(page, "Search").click();
  await field(page).fill("devotion");
  await tab(page, "Paths").click();
  await expect(page.getByRole("heading", { level: 1, name: "Paths" })).toBeVisible();
  await tab(page, "Search").click();
  // Returning to a tab finds it as it was left.
  await expect(field(page)).toHaveValue("devotion");
  await expect(rows(page)).toHaveCount(2);
  // Tab roots have no Back button; screens opened over them do.
  for (const name of ["Home", "Paths", "Search", "Account"] as const) {
    await tab(page, name).click();
    await expect(
      shown(page.getByRole("button", { name: "Back", exact: true })),
    ).toHaveCount(0);
  }
});

test("topic cards, topic page and sermon keep the return path", async ({ page }) => {
  await openTopic(page, "Prayer, 2 sermons");
  await expect(page).toHaveURL(/\/topics\/prayer$/);
  await expect(shown(page.getByText(notice, { exact: true }))).toBeVisible();
  await expect(rows(page)).toHaveCount(2);
  // On a topic page that topic leads each sermon's sample labels, even where
  // it is a sermon's secondary topic.
  await expect(
    page.getByRole("button", { name: /Sample topics: Prayer, Spiritual Growth\.$/ }),
  ).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: /Sample topics: Spiritual Growth, Prayer\.$/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /^Apostolic Shift: Day One\./ }).click();
  await expect(
    page.getByRole("button", { name: "Watch sermon", exact: true }),
  ).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Prayer" }),
  ).toBeVisible();
  // A second Back within 350ms counts as a double tap; pace it like a person.
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(tab(page, "Search")).toHaveAttribute("aria-selected", "true");
});

test("old Topics links land on Search's topics", async ({ page }) => {
  await page.goto("/topics");
  await expect(page).toHaveURL(/\/search$/);
  await expect(tab(page, "Search")).toHaveAttribute("aria-selected", "true");
  await expect(shown(page.getByRole("heading", { name: "Browse by topic" }))).toBeVisible();
  // A scoped search link opens that topic's page.
  await page.goto("/search?category=prayer");
  await expect(page).toHaveURL(/\/topics\/prayer$/);
  await expect(page.getByRole("heading", { level: 1, name: "Prayer" })).toBeVisible();
  await expect(rows(page)).toHaveCount(2);
});

test("empty topic recovery returns to the topics", async ({ page }) => {
  await openTopic(page, "Christian Living, No sermons yet");
  await expect(
    page.getByRole("heading", { name: "No sermons in Christian Living yet" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Browse other topics", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Prayer, 2 sermons", exact: true }),
  ).toBeVisible();
  await expect(tab(page, "Search")).toHaveAttribute("aria-selected", "true");
  await expect(
    shown(page.getByRole("button", { name: "Back", exact: true })),
  ).toHaveCount(0);
});

test("unknown topic links explain the problem and recover explicitly", async ({
  page,
}) => {
  await page.goto("/topics/no-such-topic");
  await expect(
    page.getByRole("heading", { name: "This topic isn’t available" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Browse topics", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Faith, 2 sermons", exact: true }),
  ).toBeVisible();
  // An unknown topic in a search link says so, and the topics are there.
  await page.goto("/search?category=no-such-topic");
  await expect(
    shown(page.getByText("That topic link is out of date. Browse the topics below, or ask in your own words.")),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Faith, 2 sermons", exact: true }),
  ).toBeVisible();
});

test("labels, tabs and touch targets remain usable on a small screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  for (const path of [
    "/",
    "/paths",
    "/path/breaking-free-from-habitual-sin",
    "/search",
    "/search?q=I%20keep%20falling%20into%20the%20same%20sin",
    "/sermon/H9sRbSUt0YE",
    "/account",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("button").first()).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      path,
    ).toBeLessThanOrEqual(320);
  }
  await page.goto("/");
  // Rows carry their sample topics in the accessible name, not by colour alone.
  await expect(
    page.getByRole("button", { name: /Sample topics: Faith\.$/ }),
  ).toHaveCount(1);
  for (const name of ["Home", "Paths", "Search", "Account"] as TabName[]) {
    const bounds = (await tab(page, name).boundingBox())!;
    expect(bounds.height, name).toBeGreaterThanOrEqual(44);
    expect(bounds.width, name).toBeGreaterThanOrEqual(44);
  }
  // Need chips are drawn at 36pt, above the 24px minimum on the web.
  const chip = page
    .getByRole("list", { name: "Common needs" })
    .getByRole("button", { name: "Fear", exact: true });
  expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(36);
});

test("need chips answer a 44pt touch on the web too", async ({ page }) => {
  // Drawn at 36pt; on the web too (where hitSlop doesn't apply) the touch
  // area reaches past the drawn edges.
  await page.goto("/");
  const chip = page
    .getByRole("list", { name: "Common needs" })
    .getByRole("button", { name: "Fear", exact: true });
  const hit = await chip.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    // 4pt above and below the drawn chip still lands on it.
    return [r.top - 4, r.bottom + 3].every((y) => el.contains(document.elementFromPoint(x, y)));
  });
  expect(hit).toBe(true);
});

test("keyboard: Space and Enter select tabs on web", async ({ page }) => {
  await page.goto("/");
  const paths = tab(page, "Paths");
  await paths.focus();
  await page.keyboard.press("Space");
  await expect(paths).toHaveAttribute("aria-selected", "true");
  const search = tab(page, "Search");
  await search.focus();
  await page.keyboard.press("Enter");
  await expect(search).toHaveAttribute("aria-selected", "true");
});

test("a deliberate Back soon after a swallowed double tap still works", async ({
  page,
}) => {
  await openTopic(page, "Prayer, 2 sermons");
  await rows(page).first().click();
  await expect(
    page.getByRole("button", { name: "Watch sermon", exact: true }),
  ).toBeVisible();
  const back = shown(page.getByRole("button", { name: "Back", exact: true }));
  const box = (await back.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  // Taps at about 0, 150 and 500ms: the second is a double tap and is
  // ignored; the third is deliberate and goes up another level.
  await page.mouse.click(x, y);
  await page.waitForTimeout(150);
  await page.mouse.click(x, y);
  await page.waitForTimeout(350);
  await page.mouse.click(x, y);
  await expect(tab(page, "Search")).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\/search$/);
});

test("a link straight to a sermon, topic or path opens over Home", async ({
  page,
}) => {
  await page.goto("/sermon/nUW8NT2Pe88");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(tab(page, "Home")).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/topics/faith");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(tab(page, "Home")).toHaveAttribute("aria-selected", "true");
  await page.goto("/path/breaking-free-from-habitual-sin");
  await page.getByTestId("path-back").click();
  await expect(tab(page, "Home")).toHaveAttribute("aria-selected", "true");
});

test("Home's question field keeps what the Search tab holds", async ({
  page,
}) => {
  await page.goto("/search");
  await field(page).fill("shift");
  await tab(page, "Home").click();
  await page.getByRole("button", { name: "What are you going through?", exact: true }).click();
  await expect(field(page)).toHaveValue("shift");
  await expect(field(page)).toBeFocused();
  await expect(shown(page.getByTestId("result-count"))).toHaveText("3 sermons");
});
