import type { Page } from "@playwright/test";
import { HABIT, MEMBER, expect, pastDoubleTap, pathProgressKey, rows, seedStorage, shown, tab, test } from "./fixtures";

// Some actions leave the screens opened over the tabs for a tab: Delete
// account and "Browse all sermons" for Home, "Choose your next path" for
// Paths (useExitTo in src/navigation.ts). On the web each lands on its tab
// and keeps every tab as it was, whether or not the viewer has switched tab
// since the app opened, however late the browser steps back.

/**
 * From now on, every step back through the browser's history lands 300ms
 * after it's asked for, as on a busy phone: later than expo-router waits
 * for one. Returns a wait for every step asked for to have landed.
 */
async function stepBackLate(page: Page) {
  await page.evaluate(() => {
    const late = window as unknown as { __steps: number };
    late.__steps = 0;
    const go = History.prototype.go;
    History.prototype.go = function (delta) {
      late.__steps += 1;
      setTimeout(() => go.call(this, delta), 300);
    };
    addEventListener("popstate", () => (late.__steps -= 1));
  });
  return () => page.waitForFunction(() => (window as unknown as { __steps: number }).__steps === 0);
}

/** Opens the app on Home, then switches tab and back first if `switched`. */
async function openHome(page: Page, switched: boolean) {
  await page.goto("/");
  if (!switched) return;
  await tab(page, "Search").click();
  await tab(page, "Home").click();
}

for (const switched of [false, true])
  test(`deleting the account lands on Home${switched ? ", Account reached by its tab" : ", Account opened at its address"}`, async ({
    page,
  }) => {
    if (switched) {
      await page.goto("/");
      await tab(page, "Account").click();
    } else await page.goto("/account");
    await page.getByTestId("delete-account-row").click();
    await pastDoubleTap(page);
    const landed = await stepBackLate(page);
    await page.getByTestId("confirm-delete").click();
    await expect(page.getByTestId("toast")).toContainText("deleted");
    // Once any step back has landed, it's still Home, with the toast.
    await landed();
    await expect(page).toHaveURL(/\/$/);
    await expect(tab(page, "Home")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("toast")).toContainText("deleted");
    // Home took the confirmation's place: the browser's Back returns to
    // Account, signed out.
    await page.goBack();
    await expect(
      shown(page.getByRole("heading", { name: "Create your free account" })),
    ).toBeVisible();
  });

for (const switched of [false, true])
  test(`Choose your next path lands on Paths from a path opened on Home${switched ? " after a tab switch" : " as the app opened"}`, async ({
    page,
  }) => {
    await seedStorage(page, {
      [pathProgressKey(MEMBER.id)]: {
        enrollments: {
          [HABIT]: { startedAt: "2026-10-10T08:00:00.000Z", finishedAt: "2026-10-17T08:00:00.000Z" },
        },
        done: { [HABIT]: [1, 2, 3, 4, 5, 6, 7] },
        pending: [],
      },
    });
    await openHome(page, switched);
    await page.getByRole("button", { name: /^Breaking free from habitual sin\. 7 days\./ }).click();
    const next = page.getByTestId("path-cta");
    await expect(next).toHaveAccessibleName("Choose your next path");
    await pastDoubleTap(page);
    const landed = await stepBackLate(page);
    await next.click();
    await landed();
    await expect(page).toHaveURL(/\/paths$/);
    await expect(tab(page, "Paths")).toHaveAttribute("aria-selected", "true");
    await expect(shown(page.getByRole("heading", { level: 1, name: "Paths" }))).toBeVisible();
  });

for (const switched of [false, true])
  test(`Browse all sermons keeps what was typed in Search${switched ? ", reached by its tab" : ", where the app opened"}`, async ({
    page,
  }) => {
    if (switched) {
      await page.goto("/");
      await tab(page, "Search").click();
    } else await page.goto("/search");
    const field = page.getByRole("searchbox", { name: "What are you going through?" });
    await field.fill("Apostolic");
    // Marks the field, to tell it from one drawn afresh.
    await field.evaluate((input) => input.setAttribute("data-kept", ""));
    await rows(page).first().click();
    await pastDoubleTap(page);
    await page.getByRole("tab", { name: "About", exact: true }).click();
    const landed = await stepBackLate(page);
    await page.getByRole("button", { name: "Browse all sermons", exact: true }).click();
    await landed();
    await expect(page).toHaveURL(/\/$/);
    await expect(tab(page, "Home")).toHaveAttribute("aria-selected", "true");
    await tab(page, "Search").click();
    await expect(field).toHaveValue("Apostolic");
    await expect(field).toHaveAttribute("data-kept", "");
  });
