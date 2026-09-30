import { expect, test } from "./fixtures";

test("menu, topic library, scoped search and detail preserve the return path", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("button", { name: "Browse by topic", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Prayer, 2 demo messages", exact: true })
    .click();
  await expect(
    page
      .getByText(
        "Demo topics and tags · message content has not been reviewed.",
        {
          exact: true,
        },
      )
      .last(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Open / })).toHaveCount(2);
  await page
    .getByRole("button", { name: "Search this topic", exact: true })
    .click();
  const input = page.getByRole("textbox", { name: "Search sermons" });
  await input.fill("devotion");
  await expect(page.getByRole("button", { name: /^Open / })).toHaveCount(2);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(input).toHaveValue("devotion");
  await expect(
    page.getByRole("button", { name: "Clear topic filter", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Open LIONESS/ }).click();
  await expect(
    page.getByRole("button", { name: "Play sermon", exact: true }),
  ).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(input).toHaveValue("devotion");
  await input.fill("faith");
  await expect(
    page.getByRole("heading", { name: "No messages found" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Search all topics", exact: true })
    .click();
  await expect(input).toHaveValue("faith");
  await expect(page.getByRole("button", { name: /^Open / })).toHaveCount(2);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Search this topic", exact: true }),
  ).toBeVisible();
});

test("empty topic recovery reuses the library instead of creating a back loop", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Browse by topic", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Christian Living, 0 demo messages",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "A little room to grow." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Browse other topics", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Prayer, 2 demo messages", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Search sermons", exact: true }),
  ).toBeVisible();
});

test("unknown topic links explain the problem and recover explicitly", async ({
  page,
}) => {
  await page.goto("/library/no-such-topic");
  await expect(
    page.getByRole("heading", { name: "This topic isn’t available" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Browse other topics", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Faith, 2 demo messages", exact: true }),
  ).toBeVisible();
  await page.goto("/search?category=no-such-topic");
  await expect(
    page.getByRole("heading", { name: "This topic isn’t available" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Search all messages", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /^Open / })).toHaveCount(4);
});

test("card labels, topic controls and menu remain usable on a small screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await expect(page.getByText("Faith · Demo", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Spiritual Growth · Demo", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  for (const title of [
    "Browse sermons",
    "Browse by topic",
    "Search",
    "Account (demo)",
  ]) {
    const button = page.getByRole("button", { name: title, exact: true });
    const bounds = await button.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(48);
    expect(bounds?.width).toBeGreaterThanOrEqual(48);
  }
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", { name: "Search sermons", exact: true })
    .click();
  const chip = page.getByRole("button", {
    name: "Browse Spiritual Growth",
    exact: true,
  });
  const bounds = await chip.boundingBox();
  expect(bounds?.height).toBeGreaterThanOrEqual(48);
  await chip.click();
  await expect(page.getByRole("button", { name: /^Open / })).toHaveCount(3);
});

test("menu reuses ancestor library and scoped search screens without back loops", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Browse by topic", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Prayer, 2 demo messages", exact: true })
    .click();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("button", { name: "Browse by topic", exact: true })
    .click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Search sermons", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Browse by topic", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Prayer, 2 demo messages", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Search this topic", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Search sermons" }).fill("devotion");
  await page.getByRole("button", { name: /^Open LIONESS/ }).click();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Search sermons" }),
  ).toHaveValue("devotion");
  await expect(
    page.getByRole("button", { name: "Clear topic filter", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Search this topic", exact: true }),
  ).toBeVisible();
});
