import type { Page } from "@playwright/test";
import { MEMBER, expect, seedWatchProgress, shown, tab, test } from "./fixtures";

// Switching accounts on one device while the first account's watch progress
// is still on its way (the stand-in sends slow@example.com's after 6 s).
const SLOW = "local:slow@example.com";

test.use({ viewer: "guest" });

// Through the Account tab, never a reload: a reload would drop the first
// account's request, and the race with it.
async function signInWithPassword(page: Page, email: string) {
  await tab(page, "Account").click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByTestId("continue-email").click();
  await page.getByTestId("email-use-password").click();
  await page.getByTestId("password-email").fill(email);
  await page.getByTestId("password-input").fill("a-long-password");
  await page.getByTestId("password-submit").click();
  await expect(page.getByTestId("toast")).toContainText("signed in");
}

test("a late answer for the account that signed out leaves the new account's Continue watching", async ({
  page,
}) => {
  await seedWatchProgress(
    page,
    [
      {
        sermonId: "nUW8NT2Pe88",
        positionSeconds: 3000,
        durationSeconds: 12900,
        finished: false,
        updatedAt: "2026-10-15T10:00:00.000Z",
      },
    ],
    SLOW,
  );
  await seedWatchProgress(page, [
    {
      sermonId: "WYiA7rjenVI",
      positionSeconds: 3000,
      durationSeconds: 6420,
      finished: false,
      updatedAt: "2026-10-15T11:00:00.000Z",
    },
  ]);

  await page.goto("/account");
  await signInWithPassword(page, "slow@example.com");
  // Signed out again before its progress arrives.
  await tab(page, "Account").click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();

  await signInWithPassword(page, MEMBER.email);
  await tab(page, "Home").click();
  const rail = page.getByTestId("continue-watching");
  await expect(shown(rail)).toBeVisible();

  // The first account's answer lands now; the rail stays.
  await page.waitForTimeout(6500);
  await expect(shown(rail)).toBeVisible();
});
