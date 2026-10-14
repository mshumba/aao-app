import { expect, rows, shown, tab, test } from "./fixtures";

const notice = "Topics are sample labels, not yet checked against each sermon.";

test("tabs switch between peer destinations and keep each one's state", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("tablist")).toBeVisible();
  await expect(tab(page, "Home")).toHaveAttribute("aria-selected", "true");
  await tab(page, "Search").click();
  const input = page.getByRole("searchbox", { name: "Search sermons" });
  await input.fill("devotion");
  await tab(page, "Topics").click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Topics" }),
  ).toBeVisible();
  await tab(page, "Search").click();
  // Returning to a tab finds it as it was left.
  await expect(input).toHaveValue("devotion");
  await expect(rows(page)).toHaveCount(2);
  // Tab roots have no Back button; screens opened over them do.
  await expect(
    shown(page.getByRole("button", { name: "Back", exact: true })),
  ).toHaveCount(0);
});

test("topic library, topic page and sermon keep the return path", async ({
  page,
}) => {
  await page.goto("/");
  await tab(page, "Topics").click();
  await page
    .getByRole("button", { name: "Prayer, 2 sermons", exact: true })
    .click();
  await expect(
    shown(page.getByText(notice, { exact: true })),
  ).toBeVisible();
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
  await expect(tab(page, "Topics")).toHaveAttribute("aria-selected", "true");
});

test("topic filters narrow search results in place", async ({ page }) => {
  await page.goto("/search");
  await expect(rows(page)).toHaveCount(4);
  await page.getByRole("radio", { name: "Faith", exact: true }).click();
  await expect(page).toHaveURL(/\/search/);
  await expect(
    shown(page.getByTestId("result-count")),
  ).toHaveText("2 sermons in Faith");
  await page
    .getByRole("searchbox", { name: "Search sermons" })
    .fill("prayer");
  await expect(
    page.getByRole("heading", { name: "No sermons match “prayer” in Faith" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Search all topics", exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: "All", exact: true }),
  ).toBeChecked();
  await expect(rows(page)).toHaveCount(2);
  await page
    .getByRole("radio", { name: "Christian Living", exact: true })
    .click();
  await page.getByRole("button", { name: "Clear search", exact: true }).first().click();
  await expect(
    page.getByRole("heading", { name: "No sermons in Christian Living yet" }),
  ).toBeVisible();
});

test("a scoped search link selects its topic", async ({ page }) => {
  await page.goto("/search?category=prayer");
  await expect(
    page.getByRole("radio", { name: "Prayer", exact: true }),
  ).toBeChecked();
  await expect(
    shown(page.getByTestId("result-count")),
  ).toHaveText("2 sermons in Prayer");
});

test("empty topic recovery returns to the topic library", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "See all", exact: true }).click();
  await expect(tab(page, "Topics")).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("button", {
      name: "Christian Living, No sermons yet",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "No sermons in Christian Living yet" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Browse other topics", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Prayer, 2 sermons", exact: true }),
  ).toBeVisible();
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
  await page.goto("/search?category=no-such-topic");
  await expect(
    page.getByRole("heading", { name: "This topic isn’t available" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Search all sermons", exact: true })
    .click();
  await expect(rows(page)).toHaveCount(4);
});

test("labels, tabs and topic controls remain usable on a small screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  for (const path of ["/", "/search", "/sermon/H9sRbSUt0YE", "/account"]) {
    await page.goto(path);
    await expect(page.getByRole("button").first()).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
  }
  await page.goto("/");
  // Rows carry their sample topics in the accessible name, not by colour alone.
  await expect(
    page.getByRole("button", { name: /Sample topics: Faith\.$/ }),
  ).toHaveCount(1);
  for (const name of ["Home", "Topics", "Search", "Account"] as const) {
    const bounds = (await tab(page, name).boundingBox())!;
    expect(bounds.height).toBeGreaterThanOrEqual(48);
    expect(bounds.width).toBeGreaterThanOrEqual(48);
  }
  await tab(page, "Search").click();
  const chip = page.getByRole("radio", {
    name: "Spiritual Growth",
    exact: true,
  });
  expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await chip.click();
  await expect(rows(page)).toHaveCount(3);
});

test("keyboard: Space selects topic filters and tabs on web", async ({
  page,
}) => {
  await page.goto("/search");
  const prayer = page.getByRole("radio", { name: "Prayer", exact: true });
  await prayer.focus();
  await page.keyboard.press("Space");
  await expect(prayer).toBeChecked();
  await expect(rows(page)).toHaveCount(2);
  const topics = tab(page, "Topics");
  await topics.focus();
  await page.keyboard.press("Space");
  await expect(topics).toHaveAttribute("aria-selected", "true");
});

test("a deliberate Back soon after a swallowed double tap still works", async ({
  page,
}) => {
  await page.goto("/");
  await tab(page, "Topics").click();
  await page
    .getByRole("button", { name: "Prayer, 2 sermons", exact: true })
    .click();
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
  await expect(tab(page, "Topics")).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\/topics$/);
});

test("a link straight to a sermon or topic opens over Home", async ({
  page,
}) => {
  await page.goto("/sermon/nUW8NT2Pe88");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(tab(page, "Home")).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/topics/faith");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(tab(page, "Home")).toHaveAttribute("aria-selected", "true");
});

test("Home's search field keeps what the Search tab holds", async ({
  page,
}) => {
  await page.goto("/search?category=prayer");
  const input = page.getByRole("searchbox", { name: "Search sermons" });
  await input.fill("shift");
  await tab(page, "Home").click();
  await page.getByRole("button", { name: "Search sermons", exact: true }).click();
  await expect(input).toHaveValue("shift");
  await expect(input).toBeFocused();
  await expect(
    page.getByRole("radio", { name: "Prayer", exact: true }),
  ).toBeChecked();
});
