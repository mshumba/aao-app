import { CODE, MEMBER, expect, goOffline, goOnline, shown, tab, test } from "./fixtures";

test.describe("signed in", () => {
  test("Account shows the profile; sign out returns to the guest card", async ({
    page,
  }) => {
    await page.goto("/account");
    await expect(shown(page.getByText(MEMBER.email))).toBeVisible();
    await page.getByTestId("sign-out").click();
    await expect(page.getByTestId("toast")).toContainText("Signed out");
    await expect(
      shown(page.getByRole("heading", { name: "Create your free account" })),
    ).toBeVisible();
    await page.reload();
    await expect(
      shown(page.getByRole("heading", { name: "Create your free account" })),
    ).toBeVisible();
  });

  test("a name set in Account greets the viewer on Home", async ({ page }) => {
    await page.goto("/account/name");
    await page.getByTestId("name-input").fill("Ada");
    await page.getByTestId("save-name").click();
    await expect(page.getByTestId("toast")).toContainText("Name updated");
    await page.goto("/");
    await expect(shown(page.getByText(/, Ada$/))).toBeVisible();
  });

  test("saving and unsaving a sermon updates Saved", async ({ page }) => {
    await page.goto("/sermon/H9sRbSUt0YE");
    const save = page.getByTestId("save-sermon");
    await save.click();
    await expect(save).toContainText("Saved");
    await expect(page.getByTestId("toast")).toContainText("Saved to your library");
    await page.goto("/saved");
    await expect(
      page.getByRole("button", { name: /^Apostolic Shift: Grand Finale\./ }),
    ).toBeVisible();
    await page.goto("/sermon/H9sRbSUt0YE");
    // Shown as saved once the account's list has arrived after the reload.
    await expect(page.getByTestId("save-sermon")).toContainText("Saved");
    await page.getByTestId("save-sermon").click();
    await expect(page.getByTestId("save-sermon")).not.toContainText("Saved");
    await page.goto("/saved");
    await expect(page.getByRole("heading", { name: "Nothing saved yet" })).toBeVisible();
  });

  test("deleting the account asks first, then signs out for good", async ({
    page,
  }) => {
    await page.goto("/account");
    await page.getByTestId("delete-account-row").click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Delete your account?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Keep my account" }).click();
    await expect(shown(page.getByText(MEMBER.email))).toBeVisible();

    await page.getByTestId("delete-account-row").click();
    await page.getByTestId("confirm-delete").click();
    await expect(page.getByTestId("toast")).toContainText("deleted");
    await tab(page, "Account").click();
    await expect(
      shown(page.getByRole("heading", { name: "Create your free account" })),
    ).toBeVisible();
  });

  test("topics chosen while signed in leave with the account", async ({ page }) => {
    await page.goto("/account/topics");
    await page.getByRole("checkbox", { name: /Faith/ }).click();
    await page.getByTestId("save-topics").click();
    await expect(page.getByTestId("toast")).toContainText("Topics updated");
    await page.goto("/account");
    await expect(shown(page.getByText("Faith", { exact: true }))).toBeVisible();
    await page.getByTestId("sign-out").click();
    await expect(page.getByTestId("toast")).toContainText("Signed out");
    // Nothing of the account's choice stays behind for the guest…
    await expect(
      shown(page.getByRole("heading", { name: "Create your free account" })),
    ).toBeVisible();
    await expect(shown(page.getByText("Faith", { exact: true }))).toHaveCount(0);
    // …or fills the next account made on this device.
    await page.getByRole("button", { name: "Create free account" }).click();
    await page.getByTestId("continue-google").click();
    await expect(page.getByTestId("toast")).toContainText("signed in");
    await expect(shown(page.getByText("google.viewer@example.com"))).toBeVisible();
    await page.waitForTimeout(600);
    await expect(shown(page.getByText("Faith", { exact: true }))).toHaveCount(0);
  });

  test("a profile that doesn't load is fetched again, never replaced", async ({
    page,
  }) => {
    // The account already has a name and topics; this device has a topic
    // picked before signing in.
    await page.addInitScript((id) => {
      if (sessionStorage.getItem("__profile_seeded")) return;
      sessionStorage.setItem("__profile_seeded", "1");
      localStorage.setItem(
        `aao.local.data.v1.${id}`,
        JSON.stringify({
          profile: {
            displayName: "Grace",
            interests: ["faith"],
            onboardedAt: "2026-10-01T00:00:00.000Z",
          },
          saved: [],
        }),
      );
      localStorage.setItem(
        "aao.onboarding.v1",
        JSON.stringify({ welcomed: true, interests: ["prayer"] }),
      );
    }, MEMBER.id);
    await goOffline(page);
    await page.goto("/");
    await expect(tab(page, "Home")).toBeVisible();
    await page.waitForTimeout(600);
    await expect(shown(page.getByText(/, Grace$/))).toHaveCount(0);
    await tab(page, "Account").click();
    await expect(shown(page.getByText("Couldn’t load")).first()).toBeVisible();

    await goOnline(page);
    // Loaded as it is: the greeting has the account's own name…
    await tab(page, "Home").click();
    await expect(shown(page.getByText(/, Grace$/))).toBeVisible();
    // …and nothing was written over it.
    const stored = await page.evaluate(
      (id) => JSON.parse(localStorage.getItem(`aao.local.data.v1.${id}`) ?? "null"),
      MEMBER.id,
    );
    expect(stored.profile.displayName).toBe("Grace");
    expect(stored.profile.interests).toEqual(["faith"]);
  });

  test("topics chosen in Account are kept", async ({ page }) => {
    await page.goto("/account/topics");
    await page.getByRole("checkbox", { name: /Prayer/ }).click();
    await page.getByTestId("save-topics").click();
    await expect(page.getByTestId("toast")).toContainText("Topics updated");
    await page.goto("/account/topics");
    await expect(page.getByRole("checkbox", { name: /Prayer/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});

test.describe("guest", () => {
  test.use({ viewer: "guest" });

  async function openSignIn(page: import("@playwright/test").Page) {
    await page.goto("/account");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await page.getByTestId("continue-email").click();
    await page.getByTestId("email-use-password").click();
  }

  test("password sign-in explains a wrong password, then signs in", async ({
    page,
  }) => {
    await openSignIn(page);
    await page.getByTestId("password-email").fill("viewer@example.com");
    await page.getByTestId("password-input").fill("wrong-password");
    await page.getByTestId("password-submit").click();
    await expect(page.getByText(/don’t match/).first()).toBeVisible();
    // What was typed stays, so only the password needs fixing.
    await expect(page.getByTestId("password-email")).toHaveValue("viewer@example.com");
    await page.getByTestId("password-input").fill("a-long-password");
    await page.getByTestId("password-submit").click();
    await expect(page.getByTestId("toast")).toContainText("signed in");
    await tab(page, "Account").click();
    await expect(shown(page.getByText("viewer@example.com"))).toBeVisible();
  });

  test("password sign-up confirms the email with a code", async ({ page }) => {
    await page.goto("/account");
    await page.getByRole("button", { name: "Create free account" }).click();
    await page.getByTestId("continue-email").click();
    await page.getByTestId("email-use-password").click();
    await page.getByTestId("password-email").fill("taken@example.com");
    await page.getByTestId("password-input").fill("a-long-password");
    await page.getByTestId("password-submit").click();
    await expect(page.getByText(/already uses this email/).first()).toBeVisible();

    await page.getByTestId("password-email").fill("fresh@example.com");
    await page.getByTestId("password-input").fill("short");
    await page.getByTestId("password-submit").click();
    await expect(page.getByText(/at least 8 characters/i).first()).toBeVisible();
    await page.getByTestId("password-input").fill("a-long-password");
    await page.getByTestId("password-submit").click();
    // One email a minute, as Supabase allows.
    await expect(page.getByTestId("code-resend")).toContainText(/in (1:00|0:59)/);
    await page.getByTestId("code-input").fill(CODE);
    await expect(page.getByTestId("toast")).toContainText("signed in");
  });

  test("an account whose email was never confirmed can get a new code", async ({
    page,
  }) => {
    await openSignIn(page);
    await page.getByTestId("password-email").fill("unconfirmed@example.com");
    await page.getByTestId("password-input").fill("a-long-password");
    await page.getByTestId("password-submit").click();
    await expect(page.getByText(/Confirm your email first/).first()).toBeVisible();
    await page.getByTestId("password-confirm-email").click();
    await expect(page.getByText(/to confirm it’s yours/).first()).toBeVisible();
    await page.getByTestId("code-input").fill(CODE);
    await expect(page.getByTestId("toast")).toContainText("signed in");
  });

  test("an email link that expired says so, wherever the error comes back", async ({
    page,
  }) => {
    const error =
      "error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";
    for (const url of [`/auth/callback?${error}`, `/auth/callback#${error}`]) {
      await page.goto(url);
      await expect(page.getByText(/link has expired or was already used/)).toBeVisible();
      await expect(page.getByText(/cancelled/)).toHaveCount(0);
    }
  });

  test("forgot password resets with a code and a new password", async ({ page }) => {
    await openSignIn(page);
    await page.getByTestId("password-email").fill("viewer@example.com");
    await page.getByTestId("forgot-password").click();
    await page.getByTestId("reset-send-code").click();
    await page.getByTestId("code-input").fill(CODE);
    await page.getByTestId("new-password-input").fill("another-password");
    await page.getByTestId("new-password-save").click();
    await expect(page.getByTestId("toast")).toContainText("Password updated");
  });

  test("Saved explains it needs an account", async ({ page }) => {
    await page.goto("/saved");
    await expect(
      page.getByRole("button", { name: "Create free account" }),
    ).toBeVisible();
  });

  test("policies are reachable from Account", async ({ page }) => {
    await page.goto("/account");
    await page.getByRole("button", { name: "Privacy Policy" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: /Privacy/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Terms of Use" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /Terms/ })).toBeVisible();
  });
});
