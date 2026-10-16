import {
  CODE,
  expect,
  fakeYouTube,
  goOffline,
  goOnline,
  shown,
  tab,
  test,
  ytLog,
} from "./fixtures";

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
  // How far there is to go is written out, not only drawn.
  await expect(shown(page.getByText("Step 1 of 3", { exact: true }))).toBeVisible();
  const prayer = page.getByRole("checkbox", { name: /Prayer/ });
  await prayer.click();
  await expect(prayer).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("topics-continue").click();

  // Step 2: account, by email code.
  await expect(
    page.getByRole("heading", { name: "Create your free account" }),
  ).toBeVisible();
  await expect(shown(page.getByText("Step 2 of 3", { exact: true }))).toBeVisible();
  await page.getByTestId("continue-email").click();
  await page.getByTestId("email-input").fill("mufaro.shumba@example.com");
  await page.getByTestId("email-send-code").click();
  await page.getByTestId("code-input").fill(CODE);

  // Step 3: name.
  await expect(
    page.getByRole("heading", { name: "What should we call you?" }),
  ).toBeVisible();
  await expect(shown(page.getByText("Step 3 of 3", { exact: true }))).toBeVisible();
  await page.getByTestId("name-input").fill("Mufaro");
  await page.getByTestId("name-continue").click();

  // Done: one recommended sermon from the chosen topic.
  await expect(
    page.getByRole("heading", { name: /You’re all set, Mufaro/ }),
  ).toBeVisible();
  await page.getByTestId("done-start-watching").click();
  await expect(page).toHaveURL(/\/sermon\//);
  await expect.poll(async () => (await ytLog(page)).commands).toContain("play");

  // Signed in and onboarded: no welcome after a reload.
  await page.goto("/");
  await expect(page.getByTestId("welcome-get-started")).toHaveCount(0);
  await expect(shown(page.getByText(/, Mufaro$/))).toBeVisible();
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

test("Apple's name is kept until the account can save it", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("welcome-get-started").click();
  await page.getByTestId("topics-continue").click();
  await expect(
    page.getByRole("heading", { name: "Create your free account" }),
  ).toBeVisible();
  // The connection drops as Apple hands over: the account's profile can't
  // be read, nor Apple's name saved to it.
  await goOffline(page);
  await page.getByTestId("continue-apple").click();
  // No asking for a name the account may already have; a way on instead.
  await expect(page.getByTestId("name-skip")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "What should we call you?" }),
  ).toHaveCount(0);

  await goOnline(page);
  // Apple's name reaches the profile, and onboarding carries on with it.
  await expect(
    page.getByRole("heading", { name: /You’re all set, Apple/ }),
  ).toBeVisible();
  await page.getByTestId("done-home").click();
  await expect(shown(page.getByText(/, Apple/))).toBeVisible();
});

test("a new account made in onboarding is welcomed on Home with confetti", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("welcome-get-started").click();
  await page.getByTestId("topics-continue").click();
  await page.getByTestId("continue-google").click();
  // Google gives a name, so the name step is skipped.
  await expect(page.getByRole("heading", { name: /You’re all set, Google/ })).toBeVisible();
  // The flow's own check mark is its celebration; Home's comes on arrival.
  await expect(page.getByTestId("welcome-confetti")).toHaveCount(0);
  await page.getByTestId("done-home").click();
  await expect(tab(page, "Home")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("welcome-confetti")).toBeVisible();
  await expect(page.getByTestId("start-here")).toBeVisible();
  await expect(page.getByTestId("welcome-confetti")).toHaveCount(0, { timeout: 3000 });
});
