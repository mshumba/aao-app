import { CODE, expect, fakeYouTube, shown, tab, test, ytLog } from "./fixtures";

// A first launch: no account, no onboarding yet.
test.use({ viewer: "new" });

test("the welcome shows once; Explore first browses as a guest", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("welcome-get-started")).toBeVisible();
  await expect(shown(page.locator("h1"))).toHaveCount(1);
  await page.getByTestId("welcome-explore").click();
  await expect(page.getByTestId("welcome-get-started")).toHaveCount(0);
  await expect(tab(page, "Home")).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(tab(page, "Home")).toBeVisible();
  await expect(page.getByTestId("welcome-get-started")).toHaveCount(0);
});

test("Get started picks topics, creates an account and starts watching", async ({
  page,
}) => {
  await fakeYouTube(page);
  await page.goto("/");
  await page.getByTestId("welcome-get-started").click();

  // Step 1: topics.
  await expect(
    page.getByRole("heading", { name: "What would you like to grow in?" }),
  ).toBeVisible();
  const prayer = page.getByRole("checkbox", { name: /Prayer/ });
  await prayer.click();
  await expect(prayer).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("topics-continue").click();

  // Step 2: account, by email code.
  await expect(
    page.getByRole("heading", { name: "Create your free account" }),
  ).toBeVisible();
  await page.getByTestId("continue-email").click();
  await page.getByTestId("email-input").fill("ada@example.com");
  await page.getByTestId("email-send-code").click();
  await page.getByTestId("code-input").fill(CODE);

  // Step 3: name.
  await expect(
    page.getByRole("heading", { name: "What should we call you?" }),
  ).toBeVisible();
  await page.getByTestId("name-input").fill("Ada");
  await page.getByTestId("name-continue").click();

  // Done: one recommended sermon from the chosen topic.
  await expect(
    page.getByRole("heading", { name: /You’re all set, Ada/ }),
  ).toBeVisible();
  await page.getByTestId("done-start-watching").click();
  await expect(page).toHaveURL(/\/sermon\//);
  await expect.poll(async () => (await ytLog(page)).commands).toContain("play");

  // Signed in and onboarded: no welcome after a reload.
  await page.goto("/");
  await expect(page.getByTestId("welcome-get-started")).toHaveCount(0);
  await expect(shown(page.getByText(/, Ada$/))).toBeVisible();
});

test("Not now on the account step keeps the chosen topics on the device", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("welcome-get-started").click();
  await page.getByRole("checkbox", { name: /Faith/ }).click();
  await page.getByTestId("topics-continue").click();
  await page.getByTestId("onboarding-not-now").click();
  await expect(tab(page, "Home")).toHaveAttribute("aria-selected", "true");
  await tab(page, "Account").click();
  await expect(
    shown(page.getByRole("heading", { name: "Create your free account" })),
  ).toBeVisible();
  await expect(shown(page.getByText("Faith", { exact: true })).first()).toBeVisible();
});

test("I already have an account signs in and skips the rest", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("welcome-sign-in").click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByTestId("continue-google").click();
  // Google gives a name, so the name step is skipped.
  await expect(
    page.getByRole("heading", { name: /You’re all set/ }),
  ).toBeVisible();
  await page.getByTestId("done-home").click();
  await expect(tab(page, "Home")).toHaveAttribute("aria-selected", "true");
});
