import { CODE, expect, fakeYouTube, shown, test, ytLog } from "./fixtures";

// Guests browse freely; Watch and Save ask for a free account, then carry on
// with what was tapped. A shared link plays without one.
test.use({ viewer: "guest" });

const pray = "/sermon/nUW8NT2Pe88";
const shift = "H9sRbSUt0YE";

function watch(page: import("@playwright/test").Page) {
  return page.getByRole("button", { name: "Watch sermon", exact: true });
}

test("guests browse every tab and sermon page without being asked", async ({
  page,
}) => {
  await page.goto("/");
  for (const path of ["/topics", "/search", "/account", pray]) {
    await page.goto(path);
    await expect(page.getByRole("button").first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Create a free account to/ }),
    ).toHaveCount(0);
  }
});

test("Watch asks a guest for a free account, then plays that sermon", async ({
  page,
}) => {
  await fakeYouTube(page);
  await page.goto(pray);
  await watch(page).click();
  const heading = page.getByRole("heading", {
    name: "Create a free account to watch",
  });
  await expect(heading).toBeVisible();
  // The sheet names the sermon that was tapped.
  await expect(page.getByText("Pray Without Ceasing").last()).toBeVisible();
  expect((await ytLog(page)).created).toBe(0);

  await page.getByTestId("continue-apple").click();
  await expect(heading).toHaveCount(0);
  // The tapped action carries on: the sermon loads and starts.
  await expect.poll(async () => (await ytLog(page)).commands).toContain("play");
  await expect(page).toHaveURL(new RegExp(`${pray}$`));
  await expect(page.getByTestId("toast")).toContainText("signed in");
});

test("Not now and Close leave the guest where they were, with nothing playing", async ({
  page,
}) => {
  await fakeYouTube(page);
  await page.goto(pray);
  await watch(page).click();
  await page.getByTestId("join-not-now").click();
  await expect(
    page.getByRole("heading", { name: "Create a free account to watch" }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${pray}$`));
  expect((await ytLog(page)).created).toBe(0);

  await watch(page).click();
  await page.getByTestId("join-close").click();
  await expect(
    page.getByRole("heading", { name: "Create a free account to watch" }),
  ).toHaveCount(0);
  expect((await ytLog(page)).created).toBe(0);
});

test("Save asks for an account, signs up with an email code, then saves", async ({
  page,
}) => {
  await page.goto(pray);
  await page.getByTestId("save-sermon").click();
  await expect(
    page.getByRole("heading", { name: "Create a free account to save sermons" }),
  ).toBeVisible();
  await page.getByTestId("continue-email").click();
  await page.getByTestId("email-input").fill("new.viewer@example.com");
  await page.getByTestId("email-send-code").click();
  await expect(page.getByText("new.viewer@example.com").first()).toBeVisible();
  await page.getByTestId("code-input").fill(CODE);
  // Back on the sermon, now saved.
  await expect(page).toHaveURL(new RegExp(`${pray}$`));
  await expect(page.getByTestId("save-sermon")).toContainText("Saved");
  await page.goto("/saved");
  await expect(
    page.getByRole("button", { name: /^Pray Without Ceasing\./ }),
  ).toBeVisible();
});

test("a shared link plays for a guest, only for that sermon", async ({ page }) => {
  await fakeYouTube(page);
  await page.goto(`/s/${shift}`);
  await expect(page).toHaveURL(new RegExp(`/sermon/${shift}$`));
  await expect(shown(page.getByText("Shared with you"))).toBeVisible();
  await watch(page).click();
  await expect(
    page.getByRole("heading", { name: "Create a free account to watch" }),
  ).toHaveCount(0);
  await expect.poll(async () => (await ytLog(page)).commands).toContain("play");

  // Another sermon still asks.
  await page.goto(pray);
  await watch(page).click();
  await expect(
    page.getByRole("heading", { name: "Create a free account to watch" }),
  ).toBeVisible();
});

test("a shared link on a first launch skips the welcome", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route(/^https:\/\/(i\.ytimg\.com|img\.youtube\.com)\//, (route) =>
    route.abort(),
  );
  await page.goto(`/s/${shift}`);
  await expect(page).toHaveURL(new RegExp(`/sermon/${shift}$`));
  await expect(page.getByTestId("welcome-get-started")).toHaveCount(0);
  await expect(watch(page)).toBeVisible();
  await context.close();
});

test("an invalid code keeps the guest on the code step with a fix", async ({
  page,
}) => {
  await page.goto(pray);
  await page.getByTestId("save-sermon").click();
  await page.getByTestId("continue-email").click();
  await page.getByTestId("email-input").fill("viewer@example.com");
  await page.getByTestId("email-send-code").click();
  await page.getByTestId("code-input").fill("000000");
  await expect(page.getByText(/expired/i).first()).toBeVisible();
  await page.getByTestId("code-input").fill("111111");
  await expect(page.getByText(/isn’t right/i).first()).toBeVisible();
  await page.getByTestId("code-input").fill(CODE);
  await expect(page.getByTestId("save-sermon")).toContainText("Saved");
});
