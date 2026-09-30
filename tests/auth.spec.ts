import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

const demoBadge = "DEMO — no account service";

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
}

async function openAccount(page: Page) {
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("button", { name: "Account (demo)", exact: true })
    .click();
  await expect(page.getByText(demoBadge, { exact: true })).toBeVisible();
}

async function openSignIn(page: Page) {
  await openAccount(page);
  await page
    .getByRole("button", { name: "Sign in (demo)", exact: true })
    .click();
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
}

async function fillDemoValues(page: Page) {
  await page
    .getByRole("button", { name: "Use demo values", exact: true })
    .click();
  await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
    "viewer@example.com",
  );
}

async function successfulSignIn(page: Page) {
  await openSignIn(page);
  await fillDemoValues(page);
  await page
    .getByRole("button", { name: "Sign in (demo)", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "You’re in. For this demo." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Return to sermons", exact: true })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Menu", exact: true }),
  ).toBeVisible();
  await settle(page);
});

test("guest search survives account mode replacements and closing", async ({
  page,
}) => {
  await page.getByRole("button", { name: /Search sermons/ }).click();
  await page
    .getByRole("textbox", { name: "Search sermons", exact: true })
    .fill("pray");
  await expect(page.getByText("Search results", { exact: true })).toBeVisible();
  await openSignIn(page);
  await page
    .getByRole("button", { name: "Create account (demo)", exact: true })
    .click();
  await expect(
    page.getByLabel("Confirm password", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(demoBadge, { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Back to sign in", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await expect(page.getByText(demoBadge, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Search sermons", exact: true }),
  ).toHaveValue("pray");
  await expect(page).toHaveURL(/\/search$/);
});

test("empty and malformed fields explain the error and focus the first invalid field", async ({
  page,
}) => {
  await openSignIn(page);
  await page
    .getByRole("button", { name: "Sign in (demo)", exact: true })
    .click();
  await expect(
    page.getByText("Enter an email address.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address", { exact: true })).toBeFocused();

  await page
    .getByLabel("Email address", { exact: true })
    .fill("invalid-address");
  await page
    .getByRole("button", { name: "Sign in (demo)", exact: true })
    .click();
  await expect(
    page.getByText("Check the email format.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address", { exact: true })).toBeFocused();

  await page
    .getByLabel("Email address", { exact: true })
    .fill("viewer@example.com");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page
    .getByRole("button", { name: "Sign in (demo)", exact: true })
    .click();
  await expect(
    page.getByText("Use at least 8 characters for this demo.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
});

test("sign-in is temporary and both sign-out and reload restore guest state", async ({
  page,
}) => {
  await successfulSignIn(page);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(
    page.getByText("Demo Viewer · signed in (demo)", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sign out of demo", exact: true })
    .click();
  await expect(
    page.getByText("Browse freely. No account needed.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await successfulSignIn(page);
  await page.reload();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(
    page.getByText("Browse freely. No account needed.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Account (demo)", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sign in (demo)", exact: true })
    .click();
  await expect(page.getByLabel("Email address", { exact: true })).toBeEmpty();
  await expect(page.getByLabel("Password", { exact: true })).toBeEmpty();
});

test("signup mismatch and chosen rejection are reproducible, followed by demo success", async ({
  page,
}) => {
  await openAccount(page);
  await page
    .getByRole("button", { name: "Create account (demo)", exact: true })
    .click();
  await fillDemoValues(page);
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("different-demo-value");
  await page
    .getByRole("button", { name: "Create demo account", exact: true })
    .click();
  await expect(
    page.getByText("Passwords don’t match.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Confirm password", { exact: true }),
  ).toBeFocused();

  await fillDemoValues(page);
  await page.getByRole("radio", { name: "Rejected", exact: true }).click();
  await page
    .getByRole("button", { name: "Create demo account", exact: true })
    .click();
  await expect(
    page.getByText("Demo: email already in use.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Success", exact: true }).click();
  await page
    .getByRole("button", { name: "Create demo account", exact: true })
    .click();
  await expect(
    page.getByText("Demo account shown — nothing was created or saved.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("reset confirms that no email was sent and returns to an empty sign-in form", async ({
  page,
}) => {
  await openSignIn(page);
  await fillDemoValues(page);
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await expect(page.getByLabel("Email address", { exact: true })).toBeEmpty();
  await fillDemoValues(page);
  await page
    .getByRole("button", { name: "Send reset link (demo)", exact: true })
    .click();
  await expect(
    page.getByText("No email was sent — this is a demo.", { exact: true }),
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
  await fillDemoValues(page);
  await page
    .getByRole("button", { name: "Sign in (demo)", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Signing in…", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  // The local operation lasts 800ms. Observe beyond it to catch late sign-in.
  await page.waitForTimeout(1_000);
  await expect(
    page.getByText("Browse freely. No account needed.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Account (demo)", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sign in (demo)", exact: true })
    .click();
  await expect(page.getByLabel("Email address", { exact: true })).toBeEmpty();
  await expect(page.getByLabel("Password", { exact: true })).toBeEmpty();
});

test("password visibility and small-screen scrolling leave all actions reachable", async ({
  page,
}, testInfo) => {
  await openSignIn(page);
  await fillDemoValues(page);
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
    page.getByRole("button", { name: "Watch sermon", exact: true }),
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

  await fillDemoValues(page);
  await page.getByRole("radio", { name: "Rejected", exact: true }).click();
  await page
    .getByRole("button", { name: "Sign in (demo)", exact: true })
    .click();
  await expect(
    page.getByText("Demo: sign-in rejected.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Success", exact: true }).click();
  await page
    .getByRole("button", { name: "Sign in (demo)", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "You’re in. For this demo." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Return to sermons", exact: true })
    .click();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("button", { name: "Sign out of demo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Account (demo)", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create account (demo)", exact: true })
    .click();
  await fillDemoValues(page);
  await page
    .getByRole("button", { name: "Create demo account", exact: true })
    .click();
  await expect(
    page.getByText("Demo account shown — nothing was created or saved.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Return to sermons", exact: true })
    .click();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("button", { name: "Sign out of demo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Account (demo)", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sign in (demo)", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await fillDemoValues(page);
  await page
    .getByRole("button", { name: "Send reset link (demo)", exact: true })
    .click();
  await expect(
    page.getByText("No email was sent — this is a demo.", { exact: true }),
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
