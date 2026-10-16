import type { Page } from "@playwright/test";
import { HABIT, SERMON, expect, seedStorage, shown, tab, test } from "./fixtures";

// The blessing on its own screen (15 October 2026): at a cold start and
// after 30 minutes or more away, never over a link, the welcome or a quick
// switch away; text only, with its Bible reference; Continue goes on to Home.

/** The five fixture blessings (src/blessing/data.ts). */
const BLESSINGS = [
  {
    id: "bl-9994-0",
    text: "A little one will become a thousand, a small one will become a strong nation; though thy beginning be small, thy later end shall greatly increase.",
    ref: "Isaiah 60:22; Job 8:7",
  },
  {
    id: "bl-82336-67",
    text: "Arise shine for your light is come and the glory of the Lord is risen upon you.",
    ref: "Isaiah 60:1",
  },
  {
    id: "bl-80650-59",
    text: "The Lord increase your greatness and comfort you on every side.",
    ref: "Psalm 71:21",
  },
  {
    id: "bl-4867-64",
    text: "The hand of Jesus will rest upon you and his glory will cause your face to shine.",
    ref: null,
  },
  { id: "bl-49470-36", text: "His love shall be a covering around you.", ref: null },
];

const EVENING = new Date("2026-10-14T19:30:00");
const MINUTE = 60_000;

function blessingScreen(page: Page) {
  return page.getByRole("dialog");
}

function continueButton(page: Page) {
  return page.getByRole("button", { name: "Continue", exact: true });
}

/** Which fixture blessing is showing (its index), once the screen is up. */
async function blessingShown(page: Page) {
  await expect(page).toHaveURL(/\/blessing$/);
  const text = page.getByTestId("blessing-text");
  await expect(text).toBeVisible();
  const words = ((await text.textContent()) ?? "").trim();
  const which = BLESSINGS.findIndex((b) => b.text === words);
  expect(which, words).toBeGreaterThanOrEqual(0);
  return which;
}

async function onHome(page: Page) {
  await expect(page).toHaveURL(/\/$/);
  await expect(blessingScreen(page)).toHaveCount(0);
  await expect(shown(page.getByRole("heading", { level: 1 }))).toHaveText(/^Good (morning|afternoon|evening)/);
}

/** The app going to the background (another app, a hidden tab) or coming back. */
async function setVisible(page: Page, visible: boolean) {
  await page.evaluate((visible) => {
    const value = visible ? "visible" : "hidden";
    Object.defineProperty(document, "visibilityState", { value, configurable: true });
    Object.defineProperty(document, "hidden", { value: !visible, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  }, visible);
}

/** The CSS keyframes the greeting's entrance (its parent) plays. */
async function entranceFrames(page: Page) {
  return blessingScreen(page)
    .getByRole("heading", { level: 1 })
    .evaluate((el) => {
      const box = el.parentElement!;
      const name = getComputedStyle(box).animationName;
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const rule of Array.from(rules))
          if (rule instanceof CSSKeyframesRule && rule.name === name) return rule.cssText;
      }
      return null;
    });
}

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  // Automated browsers skip the blessing unless a test opts in (so every
  // other spec opens straight onto Home).
  await page.addInitScript(() => {
    (window as { __aaoBlessing?: string }).__aaoBlessing = "on";
  });
});

test.describe("in the evening", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(EVENING);
  });

  test("a member opening the app is greeted by name with a blessing, then Continue goes Home", async ({
    page,
  }) => {
    // The one with a reference is the only one left to see.
    await seedStorage(page, { "aao.blessings.seen.v1": BLESSINGS.slice(1).map((b) => b.id) }, "seen");
    // A name, set in Account (opened from a link: no blessing there).
    await page.goto("/account/name");
    await expect(blessingScreen(page)).toHaveCount(0);
    await page.getByTestId("name-input").fill("Mufaro Shumba");
    await page.getByTestId("save-name").click();
    await expect(page.getByTestId("toast")).toContainText("Name updated");

    await page.goto("/");
    expect(await blessingShown(page)).toBe(0);
    const screen = blessingScreen(page);
    await expect(
      screen.getByRole("heading", { level: 1, name: "Good evening, Mufaro", exact: true }),
    ).toBeVisible();
    await expect(screen.getByText("A blessing for you")).toHaveCSS("text-transform", "uppercase");
    const reference = page.getByTestId("blessing-reference");
    await expect(reference).toHaveText(BLESSINGS[0].ref!);
    await expect(reference).toHaveCSS("text-transform", "uppercase");
    await expect(screen.getByText("Apostle Arome Osayi")).toBeVisible();
    // Never cut off: the whole blessing shows, in large Newsreader italic.
    const words = page.getByTestId("blessing-text");
    await expect(words).toHaveCSS("font-family", /Newsreader_\d+\w*_Italic/);
    expect(parseFloat(await words.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(24);
    expect(await words.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    // Read as "Blessing: ….", then focus is on Continue, the one control.
    await expect(screen).toHaveAccessibleName("Good evening, Mufaro");
    await expect(screen).toHaveAccessibleDescription(
      `Blessing: ${BLESSINGS[0].text.replace(/\.$/, "")}. ${BLESSINGS[0].ref}`,
    );
    await expect(continueButton(page)).toBeFocused();
    await expect(screen.getByRole("button")).toHaveCount(1);
    await expect(screen.getByRole("link")).toHaveCount(0);
    // Continue at the bottom, in thumb's reach.
    const button = (await continueButton(page).boundingBox())!;
    expect(button.y + button.height).toBeGreaterThan(844 * 0.85);

    await continueButton(page).click();
    await onHome(page);
    await expect(
      page.getByRole("heading", { level: 1, name: "Good evening, Mufaro", exact: true }),
    ).toBeVisible();
    // The hero no longer carries the blessing.
    await expect(page.getByTestId("home-blessing")).toHaveCount(0);
    await expect(page.getByText(BLESSINGS[0].text)).toHaveCount(0);
  });

  test.describe("as a guest", () => {
    test.use({ viewer: "guest" });

    test("the greeting has no name, and Escape goes on too", async ({ page }) => {
      await page.goto("/");
      const which = await blessingShown(page);
      await expect(
        blessingScreen(page).getByRole("heading", { level: 1, name: "Good evening", exact: true }),
      ).toBeVisible();
      const reference = page.getByTestId("blessing-reference");
      if (BLESSINGS[which].ref) await expect(reference).toHaveText(BLESSINGS[which].ref!);
      else await expect(reference).toHaveCount(0);
      await page.keyboard.press("Escape");
      await onHome(page);
      await expect(page.getByTestId("home-sign-in")).toBeVisible();
    });
  });
});

test("a link opens the app without the blessing, even on going Home after", async ({ page }) => {
  await page.goto(`/sermon/${SERMON.pray}`);
  await expect(page.getByRole("heading", { level: 1, name: /Pray Without Ceasing/ })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.pray}$`));
  await expect(blessingScreen(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await onHome(page);
  await page.waitForTimeout(800);
  await expect(blessingScreen(page)).toHaveCount(0);

  // A shared link and a path's link too.
  await page.goto(`/s/${SERMON.finale}`);
  await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.finale}$`));
  await page.goto(`/path/${HABIT}`);
  await expect(page.getByTestId("path-cta")).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page).toHaveURL(new RegExp(`/path/${HABIT}$`));
  await expect(blessingScreen(page)).toHaveCount(0);
});

test("a page opened at another tab doesn't bring the blessing on going Home after", async ({
  page,
}) => {
  for (const [start, name] of [
    ["/paths", "Paths"],
    ["/search", "Search"],
    ["/account", "Account"],
  ] as const) {
    await page.goto(start);
    await expect(page).toHaveURL(new RegExp(`${start}$`));
    await page.waitForTimeout(800);
    await expect(blessingScreen(page)).toHaveCount(0);
    await expect(tab(page, name)).toBeVisible();
    await tab(page, "Home").click();
    await onHome(page);
    await page.waitForTimeout(800);
    await expect(blessingScreen(page)).toHaveCount(0);
  }
});

test.describe("on a first launch", () => {
  test.use({ viewer: "new" });

  test("the welcome shows, never the blessing", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("welcome-get-started")).toBeVisible();
    await expect(page).toHaveURL(/\/welcome$/);
    await page.getByTestId("welcome-explore").click();
    await onHome(page);
    await page.waitForTimeout(800);
    await expect(blessingScreen(page)).toHaveCount(0);
  });
});

test("not again on a quick switch away and back, but after 30 minutes away, a new one", async ({
  page,
}) => {
  const start = new Date("2026-10-14T09:00:00").getTime();
  await page.clock.setFixedTime(start);
  await page.goto("/");
  const first = await blessingShown(page);
  await continueButton(page).click();
  await onHome(page);

  // Away for five minutes: straight back to Home.
  await setVisible(page, false);
  await page.clock.setFixedTime(start + 5 * MINUTE);
  await setVisible(page, true);
  await page.waitForTimeout(800);
  await onHome(page);

  // Away for 31 minutes: a new blessing, over Home.
  await setVisible(page, false);
  await page.clock.setFixedTime(start + 36 * MINUTE);
  await setVisible(page, true);
  const second = await blessingShown(page);
  expect(second).not.toBe(first);
  await expect(continueButton(page)).toBeFocused();
  await continueButton(page).click();
  await onHome(page);
});

test("coming back after 30 minutes mid-sermon leaves the sermon alone", async ({ page }) => {
  const start = new Date("2026-10-14T09:00:00").getTime();
  await page.clock.setFixedTime(start);
  await page.goto(`/sermon/${SERMON.pray}`);
  await expect(page.getByRole("heading", { level: 1, name: /Pray Without Ceasing/ })).toBeVisible();
  await setVisible(page, false);
  await page.clock.setFixedTime(start + 45 * MINUTE);
  await setVisible(page, true);
  await page.waitForTimeout(1000);
  await expect(page).toHaveURL(new RegExp(`/sermon/${SERMON.pray}$`));
  await expect(blessingScreen(page)).toHaveCount(0);
});

test("a new one each time the app opens, none repeated until all five are seen", async ({ page }) => {
  await page.goto("/");
  const seen: number[] = [];
  for (let i = 0; i < BLESSINGS.length; i++) {
    if (i) await page.reload();
    seen.push(await blessingShown(page));
  }
  expect(new Set(seen).size).toBe(BLESSINGS.length);
  // The round starts again, never with the one just shown.
  await page.reload();
  expect(await blessingShown(page)).not.toBe(seen[seen.length - 1]);
});

test("the words rise in; with reduced motion they only fade", async ({ page }) => {
  await page.goto("/");
  await blessingShown(page);
  let frames = await entranceFrames(page);
  expect(frames).toContain("opacity");
  expect(frames).toContain("translateY");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await blessingShown(page);
  frames = await entranceFrames(page);
  expect(frames).toContain("opacity");
  expect(frames).not.toContain("transform");
  await continueButton(page).click();
  await onHome(page);
});

test.describe("Home's hero on a wide window", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the artwork keeps to the page column, not the window's edge", async ({ page }) => {
    await page.goto("/");
    await blessingShown(page);
    await continueButton(page).click();
    await onHome(page);
    const column = { left: (1280 - 760) / 2, right: (1280 + 760) / 2 };
    // The avatar ends at the column's edge, 24 in.
    const avatar = (await page.getByTestId("home-avatar").boundingBox())!;
    expect(Math.round(avatar.x + avatar.width)).toBe(column.right - 24);
    // The first page's artwork: its right edge is the column's plus the
    // concept's crop (that part fades into the dark past the column), not
    // pinned to the window's edge with empty black between.
    const art = (await page.getByTestId("hero-art").boundingBox())!;
    const right = art.x + art.width;
    expect(right).toBeGreaterThan(column.right);
    expect(right).toBeLessThanOrEqual(column.right + 110);
    expect(art.x).toBeGreaterThanOrEqual(column.left);
  });
});
