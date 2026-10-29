import type { Session } from "@supabase/supabase-js";
import { signInMethod } from "../src/auth/signInMethod";
import { CODE, MEMBER, expect, goOffline, goOnline, pastDoubleTap, shown, tab, test } from "./fixtures";

// Account made with Google on the web, then signed into with Apple (same
// email) on an iPhone, then with Google on the web again.
const MADE = "2026-10-01T09:00:00Z";
const APPLE = "2026-10-14T18:00:00Z";
const GOOGLE_AGAIN = "2026-10-15T12:00:00Z";

/** A session as Supabase hands it over: the access token's `amr`, the user's identities. */
function session(amr: unknown, identities: Record<string, string>, first = "google") {
  const part = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return {
    access_token: `${part({ alg: "HS256" })}.${part({ sub: "u", amr })}.signature`,
    user: {
      id: "u",
      app_metadata: { provider: first, providers: Object.keys(identities) },
      identities: Object.entries(identities).map(([provider, at]) => ({
        id: provider,
        identity_id: provider,
        user_id: "u",
        provider,
        created_at: MADE,
        last_sign_in_at: at,
      })),
    },
  } as unknown as Session;
}
const oauthAt = (iso: string) => [{ method: "oauth", timestamp: Date.parse(iso) / 1000 }];

test("Account names how this session signed in, not how the account began", () => {
  // This phone's Apple sign-in, on an account Google made.
  expect(signInMethod(session(oauthAt(APPLE), { google: MADE, apple: APPLE }))).toBe("apple");
  // Still Apple once a refresh brings news of a later Google sign-in elsewhere.
  expect(signInMethod(session(oauthAt(APPLE), { google: GOOGLE_AGAIN, apple: APPLE }))).toBe(
    "apple",
  );
  // The web's later Google sign-in.
  expect(signInMethod(session(oauthAt(GOOGLE_AGAIN), { google: GOOGLE_AGAIN, apple: APPLE }))).toBe(
    "google",
  );
  // An emailed code or a password is email, whatever else is linked.
  const code = [{ method: "otp", timestamp: Date.parse(GOOGLE_AGAIN) / 1000 }];
  expect(signInMethod(session(code, { google: MADE, apple: APPLE, email: GOOGLE_AGAIN }))).toBe(
    "email",
  );
  expect(signInMethod(session(["password"], { email: MADE }, "email"))).toBe("email");
  // A token without methods: the identity used last, then the first provider.
  expect(signInMethod(session(undefined, { google: MADE, apple: APPLE }))).toBe("apple");
  expect(signInMethod(session(undefined, {}))).toBe("google");
});


test.describe("signed in", () => {
  test("Account shows the profile; sign out returns to the guest card", async ({
    page,
  }) => {
    await page.goto("/account");
    // No name yet: the email is the page's heading, said once.
    await expect(
      shown(page.getByRole("heading", { level: 1, name: MEMBER.email, exact: true })),
    ).toBeVisible();
    await expect(shown(page.getByText(MEMBER.email))).toHaveCount(1);
    await expect(shown(page.getByText("Signed in with email"))).toBeVisible();
    // The name is set from its row; saved sermons and topics are the library.
    await expect(page.getByRole("button", { name: "Name, Not set", exact: true })).toBeVisible();
    await expect(page.getByText("Add your name")).toHaveCount(0);
    await expect(shown(page.getByRole("heading", { name: "Library", exact: true }))).toBeVisible();
    await expect(shown(page.getByRole("heading", { name: "Your account" }))).toHaveCount(0);
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
    await page.getByTestId("name-input").fill("Mufaro");
    await page.getByTestId("save-name").click();
    await expect(page.getByTestId("toast")).toContainText("Name updated");
    // The name heads Account, with the email under it.
    await page.goto("/account");
    await expect(shown(page.getByRole("heading", { level: 1, name: "Mufaro", exact: true }))).toBeVisible();
    await expect(shown(page.getByText(MEMBER.email))).toBeVisible();
    await page.goto("/");
    await expect(shown(page.getByText(/, Mufaro$/))).toBeVisible();
  });

  test("saving and unsaving a sermon updates Saved", async ({ page }) => {
    await page.goto("/sermon/H9sRbSUt0YE");
    const save = page.getByTestId("save-sermon");
    await save.click();
    await expect(save).toContainText("Saved");
    // The sermon page's own wording: "Saved".
    await expect(page.getByTestId("toast")).toContainText(/Saved/);
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
    // No Apple ID linked, so no word about one.
    await expect(page.getByText(/stop using Apple ID with AAO/)).toHaveCount(0);
    // Where the row was pressed depends on how Account had scrolled, and
    // "Keep my account" can sit within a few points of it, so each press
    // waits out the double tap the last one could have started.
    await pastDoubleTap(page);
    await page.getByRole("button", { name: "Keep my account" }).click();
    // Back on Account, under its own heading: the question names the email
    // too.
    await expect(
      page.getByRole("heading", { level: 1, name: "Delete your account?" }),
    ).toBeHidden();
    await expect(
      shown(page.getByRole("heading", { level: 1, name: MEMBER.email, exact: true })),
    ).toBeVisible();

    await pastDoubleTap(page);
    await page.getByTestId("delete-account-row").click();
    await page.getByTestId("confirm-delete").click();
    // There's no leaving while it deletes.
    await expect(shown(page.getByRole("button", { name: "Back", exact: true }))).toBeDisabled();
    await expect(page.getByTestId("toast")).toContainText("deleted");
    await tab(page, "Account").click();
    await expect(
      shown(page.getByRole("heading", { name: "Create your free account" })),
    ).toBeVisible();
  });

  test("topics chosen while signed in leave with the account", async ({ page }) => {
    await page.goto("/account/topics");
    await page.getByRole("checkbox", { name: "Faith & Hope" }).click();
    await page.getByTestId("save-topics").click();
    await expect(page.getByTestId("toast")).toContainText("Topics updated");
    await page.goto("/account");
    await expect(shown(page.getByText("Faith & Hope", { exact: true }))).toBeVisible();
    await page.getByTestId("sign-out").click();
    await expect(page.getByTestId("toast")).toContainText("Signed out");
    // Nothing of the account's choice stays behind for the guest…
    await expect(
      shown(page.getByRole("heading", { name: "Create your free account" })),
    ).toBeVisible();
    await expect(shown(page.getByText("Faith & Hope", { exact: true }))).toHaveCount(0);
    // …or fills the next account made on this device.
    await page.getByRole("button", { name: "Create free account" }).click();
    await page.getByTestId("continue-google").click();
    await expect(page.getByTestId("toast")).toContainText("signed in");
    await expect(shown(page.getByText("google.viewer@example.com"))).toBeVisible();
    await page.waitForTimeout(600);
    await expect(shown(page.getByText("Faith & Hope", { exact: true }))).toHaveCount(0);
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
            interests: ["faith-hope"],
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
    expect(stored.profile.interests).toEqual(["faith-hope"]);
  });

  test("topics chosen in Account are kept", async ({ page }) => {
    await page.goto("/account/topics");
    await page.getByRole("checkbox", { name: "Prayer" }).click();
    await page.getByTestId("save-topics").click();
    await expect(page.getByTestId("toast")).toContainText("Topics updated");
    await page.goto("/account/topics");
    await expect(page.getByRole("checkbox", { name: "Prayer" })).toHaveAttribute(
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
    await page.getByTestId("password-email").fill("mufaro@example.com");
    await page.getByTestId("password-input").fill("wrong-password");
    await page.getByTestId("password-submit").click();
    await expect(page.getByText(/don’t match/).first()).toBeVisible();
    // What was typed stays, so only the password needs fixing.
    await expect(page.getByTestId("password-email")).toHaveValue("mufaro@example.com");
    await page.getByTestId("password-input").fill("a-long-password");
    await page.getByTestId("password-submit").click();
    await expect(page.getByTestId("toast")).toContainText("signed in");
    await tab(page, "Account").click();
    await expect(shown(page.getByText("mufaro@example.com"))).toBeVisible();
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

  test("signing in with Apple says so in Account", async ({ page }) => {
    await page.goto("/account");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByTestId("continue-apple").click();
    await expect(page.getByTestId("toast")).toContainText("signed in");
    await tab(page, "Account").click();
    await expect(shown(page.getByText("Signed in with Apple"))).toBeVisible();
  });

  test("deleting an account with Apple linked says how to stop using the Apple ID, however it signed in", async ({
    page,
  }) => {
    await page.goto("/account");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByTestId("continue-apple").click();
    await expect(page.getByTestId("toast")).toContainText("signed in");
    await page.goto("/account");
    await page.getByTestId("sign-out").click();
    await expect(page.getByTestId("toast")).toContainText("Signed out");
    // The same account, with a password this time.
    await openSignIn(page);
    await page.getByTestId("password-email").fill("apple.viewer@example.com");
    await page.getByTestId("password-input").fill("a-long-password");
    await page.getByTestId("password-submit").click();
    await expect(page.getByTestId("toast")).toContainText("signed in");
    await page.goto("/account");
    await expect(shown(page.getByText("Signed in with email"))).toBeVisible();
    await page.goto("/account/delete");
    await expect(shown(page.getByText(/stop using Apple ID with AAO/))).toBeVisible();
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
    await page.getByTestId("password-email").fill("mufaro@example.com");
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
      page.getByRole("heading", { level: 2, name: "Save sermons with a free account" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create free account" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("a guest's Account is headed as a profile is, over the invitation", async ({ page }) => {
    await page.goto("/account");
    const title = shown(page.getByRole("heading", { level: 1, name: "Account", exact: true }));
    await expect(title).toBeVisible();
    await expect(shown(page.getByText("Not signed in", { exact: true }))).toBeVisible();
    // The page has one title; the sand card's is a section under it.
    await expect(shown(page.getByRole("heading", { level: 1 }))).toHaveCount(1);
    const invite = shown(page.getByRole("heading", { level: 2, name: "Create your free account" }));
    await expect(invite).toBeVisible();
    expect((await title.boundingBox())!.y).toBeLessThan((await invite.boundingBox())!.y);
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
