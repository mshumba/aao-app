import { expect, shown, tab, test } from "./fixtures";
import type { Page } from "@playwright/test";

const demoPanel = "This is a demo";
const guestHeading = "Sign in or create an account";
const signedInLine = "Signed in to the demo";

async function expectGuest(page: Page) {
  await expect(
    page.getByRole("heading", { name: guestHeading, exact: true }),
  ).toBeVisible();
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
}

async function openAccount(page: Page) {
  await tab(page, "Account").click();
  await expectGuest(page);
  await expect(shown(page.getByText(demoPanel, { exact: true }))).toBeVisible();
}

async function openSignIn(page: Page) {
  await openAccount(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
}

async function fillSample(page: Page) {
  await page
    .getByRole("button", { name: "Fill in sample details", exact: true })
    .click();
  await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
    "viewer@example.com",
  );
}

async function successfulSignIn(page: Page) {
  await openSignIn(page);
  await fillSample(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "You’re signed in" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to sermons", exact: true })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    tab(page, "Home"),
  ).toBeVisible();
  await settle(page);
});

test("guest search survives account mode replacements and closing", async ({
  page,
}) => {
  await page.getByRole("button", { name: /Search sermons/ }).click();
  await page
    .getByRole("searchbox", { name: "Search sermons", exact: true })
    .fill("pray");
  await expect(shown(page.getByTestId("result-count"))).toHaveText("2 sermons");
  await openSignIn(page);
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await expect(
    page.getByLabel("Confirm password", { exact: true }),
  ).toBeVisible();
  await expect(shown(page.getByText(demoPanel, { exact: true }))).toBeVisible();
  await page
    .getByRole("button", { name: "Back to sign in", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await expect(shown(page.getByText(demoPanel, { exact: true }))).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  // Close returns to the Account tab; the Search tab kept its query.
  await expect(tab(page, "Account")).toHaveAttribute("aria-selected", "true");
  await tab(page, "Search").click();
  await expect(
    page.getByRole("searchbox", { name: "Search sermons", exact: true }),
  ).toHaveValue("pray");
  await expect(page).toHaveURL(/\/search$/);
});

test("empty and malformed fields explain the error and focus the first invalid field", async ({
  page,
}) => {
  await openSignIn(page);
  const email = page.getByLabel("Email address", { exact: true });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Enter your email address.", { exact: true }),
  ).toBeVisible();
  // Web has no announceForAccessibility, so the inserted error is an alert and
  // describes its field. This checks the semantics, not speech.
  await expect(
    page.getByText("Enter your email address.", { exact: true }),
  ).toHaveAttribute("role", "alert");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAccessibleDescription("Enter your email address.");
  await expect(email).toBeFocused();

  await email.fill("invalid-address");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Enter an email address like name@example.com.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(email).toBeFocused();

  await email.fill("viewer@example.com");
  // Editing a field clears its stale error before the next submit.
  await expect(
    page.getByText("Enter an email address like name@example.com.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(email).toHaveAttribute("aria-invalid", "false");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Use at least 8 characters.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
});

test("sign-in is temporary and both sign-out and reload restore guest state", async ({
  page,
}) => {
  // The account card describes the account, not playback.
  await tab(page, "Account").click();
  await expectGuest(page);
  await expect(page.getByText(/watching stays open/)).toHaveCount(0);

  await successfulSignIn(page);
  // "Back to sermons" lands on Home.
  await expect(tab(page, "Home")).toHaveAttribute("aria-selected", "true");
  await tab(page, "Account").click();
  await expect(
    page.getByRole("heading", { name: "Demo Viewer", exact: true }),
  ).toBeVisible();
  await expect(shown(page.getByText(signedInLine, { exact: true }))).toBeVisible();
  await page
    .getByRole("button", { name: "Sign out of demo", exact: true })
    .click();
  await expectGuest(page);

  await successfulSignIn(page);
  await page.reload();
  await tab(page, "Account").click();
  await expectGuest(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Email address", { exact: true })).toBeEmpty();
  await expect(page.getByLabel("Password", { exact: true })).toBeEmpty();
});

test("signup mismatch and chosen error are reproducible, followed by demo success", async ({
  page,
}) => {
  await openAccount(page);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await fillSample(page);
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("different-demo-value");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByText("Enter the same password in both fields.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Confirm password", { exact: true }),
  ).toBeFocused();

  await fillSample(page);
  await page.getByRole("radio", { name: "Error", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Error", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByText("An account already uses this email.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Success", exact: true }).click();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByText(
      "No account was created and nothing was saved. This demo sign-in ends when you sign out or reload the app.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("reset confirms that no email was sent and returns to an empty sign-in form", async ({
  page,
}) => {
  await openSignIn(page);
  await fillSample(page);
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await expect(page.getByLabel("Email address", { exact: true })).toBeEmpty();
  await fillSample(page);
  await page
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "No email was sent" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to sign in", exact: true })
    .click();
  await expect(page.getByLabel("Email address", { exact: true })).toBeEmpty();
  await expect(page.getByLabel("Password", { exact: true })).toBeEmpty();
});

test("closing a busy demo cancels sign-in and clears the form", async ({
  page,
}) => {
  await openSignIn(page);
  await fillSample(page);
  const submit = page.getByRole("button", { name: "Sign in", exact: true });
  await submit.click();
  // Busy keeps its label (nothing is really being sent), reports aria-busy,
  // ignores further presses and keeps keyboard focus rather than dropping it.
  await expect(submit).toHaveAttribute("aria-busy", "true");
  await expect(submit).toBeFocused();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  // The local operation lasts 800ms. Observe beyond it to catch late sign-in.
  await page.waitForTimeout(1_000);
  await expectGuest(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Email address", { exact: true })).toBeEmpty();
  await expect(page.getByLabel("Password", { exact: true })).toBeEmpty();
});

test("password visibility and small-screen scrolling leave all actions reachable", async ({
  page,
}, testInfo) => {
  await openSignIn(page);
  await fillSample(page);
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page
    .getByRole("button", { name: "Hide password", exact: true })
    .click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  await expect(
    page.getByLabel("Email address", { exact: true }),
  ).toHaveAttribute("autocomplete", "off");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "autocomplete",
    "off",
  );
  const close = page.getByRole("button", { name: "Close", exact: true });
  await close.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("demo-sign-in-375x667.png"),
  });
  const viewportWidth = page.viewportSize()!.width;
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(viewportWidth);
  const guestAction = page.getByRole("button", {
    name: "Continue as guest",
    exact: true,
  });
  await guestAction.scrollIntoViewIfNeeded();
  await expect(guestAction).toBeInViewport();
  const bounds = await guestAction.boundingBox();
  expect(bounds?.height).toBeGreaterThanOrEqual(48);
  await guestAction.click();
  await expect(
    page.getByRole("button", { name: /^Watch sermon/ }),
  ).toBeVisible();
});

test("account submissions make no requests or persistent-storage calls", async ({
  page,
}, testInfo) => {
  await openSignIn(page);
  await settle(page);
  const requests: string[] = [];
  const devRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    // Expo's dev refresh channel is tooling traffic, not an account request.
    if (
      url.hostname === "localhost" &&
      /^\/(?:_expo|hot|inspector)(?:\/|$)/.test(url.pathname)
    )
      devRequests.push(request.url());
    else requests.push(`${request.method()} ${request.url()}`);
  });
  const before = await page.context().storageState();
  await page.evaluate(() => {
    const state = window as typeof window & { __aaoStorageCalls: string[] };
    state.__aaoStorageCalls = [];
    for (const method of [
      "getItem",
      "setItem",
      "removeItem",
      "clear",
      "key",
    ] as const) {
      const original = Storage.prototype[method];
      Object.defineProperty(Storage.prototype, method, {
        configurable: true,
        writable: true,
        value: function (this: Storage, ...args: unknown[]) {
          state.__aaoStorageCalls.push(`Storage.${method}`);
          return Reflect.apply(original, this, args);
        },
      });
    }
    for (const method of ["open", "deleteDatabase"] as const) {
      const original = IDBFactory.prototype[method];
      Object.defineProperty(IDBFactory.prototype, method, {
        configurable: true,
        writable: true,
        value: function (this: IDBFactory, ...args: unknown[]) {
          state.__aaoStorageCalls.push(`IndexedDB.${method}`);
          return Reflect.apply(original, this, args);
        },
      });
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      Document.prototype,
      "cookie",
    );
    if (descriptor?.set) {
      Object.defineProperty(Document.prototype, "cookie", {
        ...descriptor,
        set(value: string) {
          state.__aaoStorageCalls.push("cookie.write");
          descriptor.set!.call(this, value);
        },
      });
    }
  });

  await fillSample(page);
  await page.getByRole("radio", { name: "Error", exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Incorrect email or password.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Success", exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "You’re signed in" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to sermons", exact: true })
    .click();
  await tab(page, "Account").click();
  await page
    .getByRole("button", { name: "Sign out of demo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await fillSample(page);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByText(
      "No account was created and nothing was saved. This demo sign-in ends when you sign out or reload the app.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to sermons", exact: true })
    .click();
  await tab(page, "Account").click();
  await page
    .getByRole("button", { name: "Sign out of demo", exact: true })
    .click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await fillSample(page);
  await page
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "No email was sent" }),
  ).toBeVisible();

  const calls = await page.evaluate(
    () =>
      (window as typeof window & { __aaoStorageCalls: string[] })
        .__aaoStorageCalls,
  );
  const after = await page.context().storageState();
  await testInfo.attach("account-privacy-observation", {
    body: JSON.stringify(
      {
        requests,
        excludedExpoDevRequests: devRequests,
        persistentStorageCalls: calls,
        storageUnchanged: JSON.stringify(before) === JSON.stringify(after),
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  expect(
    requests,
    "All account operations should complete locally without requests.",
  ).toEqual([]);
  expect(
    calls,
    "Account operations should not access persistent storage.",
  ).toEqual([]);
  expect(after).toEqual(before);
});
