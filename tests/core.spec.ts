import { expect, test } from "./fixtures";

test("guest browse, exact sermon identity, search and back navigation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("iframe")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Search sermons", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Search sermons" }).fill("pray");
  await page.getByRole("button", { name: /Open LIONESS CONFERENCE/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "LIONESS CONFERENCE || PRAY WITHOUT CEASING || GRAND FINALE || 27TH SEPTEMBER 2026",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play sermon", exact: true }),
  ).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Search sermons" }),
  ).toHaveValue("pray");
  await page
    .getByRole("textbox", { name: "Search sermons" })
    .fill("no-such-sermon");
  await expect(
    page.getByRole("heading", { name: "No messages found" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear search", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("textbox", { name: "Search sermons" }),
  ).toHaveValue("");
});

test("unavailable sermon gives a route back to browse", async ({ page }) => {
  await page.goto("/sermon/not-a-real-id");
  await expect(
    page.getByRole("heading", { name: "This sermon isn’t available" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Browse sermons", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Search sermons", exact: true }),
  ).toBeVisible();
});

test("failed provider script offers retry and external fallback, only after Play", async ({
  page,
}) => {
  let requests = 0;
  await page.route("https://www.youtube.com/iframe_api", (route) => {
    requests++;
    return route.abort();
  });
  await page.goto("/sermon/nUW8NT2Pe88");
  await expect(
    page.getByRole("button", { name: "Play sermon", exact: true }),
  ).toBeVisible();
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "Play sermon", exact: true }).click();
  await expect(
    page.getByText(
      "The player could not load. Check your connection and try again.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open on YouTube", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Try player again", exact: true })
    .click();
  await expect.poll(() => requests).toBe(2);
});

test("auxiliary state previews are labelled and actionable", async ({
  page,
}) => {
  await page.goto("/states");
  await expect(
    page.getByText("DEMO · PREVIEW CONTROLS", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "offline", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "You’re offline" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry connection (demo)", exact: true })
    .click();
  await expect(
    page.getByText("Getting the library ready…", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Finish loading demo", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your next message is on its way." }),
  ).toBeVisible();
});
