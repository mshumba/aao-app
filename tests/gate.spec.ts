/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
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
  for (const path of [
    "/paths",
    "/path/breaking-free-from-habitual-sin",
    "/search",
    "/search?q=fear",
    "/topics/prayer",
    "/account",
    pray,
  ]) {
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

test("Close and Escape leave the guest where they were, with nothing playing", async ({
  page,
}) => {
  await fakeYouTube(page);
  await page.goto(pray);
  await watch(page).click();
  await expect(
    page.getByRole("heading", { name: "Create a free account to watch" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
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
  await page.getByTestId("email-input").fill("mufaro@example.com");
  await page.getByTestId("email-send-code").click();
  await page.getByTestId("code-input").fill("000000");
  await expect(page.getByText(/expired/i).first()).toBeVisible();
  await page.getByTestId("code-input").fill("111111");
  await expect(page.getByText(/isn’t right/i).first()).toBeVisible();
  await page.getByTestId("code-input").fill(CODE);
  await expect(page.getByTestId("save-sermon")).toContainText("Saved");
});

test("a save made just after signing in stays saved", async ({ page }) => {
  // The account's saved list is still loading when the save runs; it must
  // neither judge "already saved" on an empty list nor be undone by it.
  await page.goto(pray);
  await page.getByTestId("save-sermon").click();
  await page.getByTestId("continue-google").click();
  await expect(
    page.getByTestId("toast").filter({ hasText: /Saved/ }),
  ).toBeVisible();
  await expect(page.getByTestId("save-sermon")).toContainText("Saved");
  // Still saved once the list has had time to arrive.
  await page.waitForTimeout(800);
  await expect(page.getByTestId("save-sermon")).toContainText("Saved");
  await page.goto("/saved");
  await expect(
    page.getByRole("button", { name: /^Pray Without Ceasing\./ }),
  ).toBeVisible();
});

test("an attempt abandoned by closing the tab isn't replayed by a later sign-in", async ({
  page,
}) => {
  await fakeYouTube(page);
  await page.goto(pray);
  await watch(page).click();
  await expect(
    page.getByRole("heading", { name: "Create a free account to watch" }),
  ).toBeVisible();
  // The tab closes part-way (nothing of the sheet's own clean-up runs), and
  // the guest comes back later to create an account from Account.
  await page.goto("/account");
  await page.getByRole("button", { name: "Create free account" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Create your free account" })).toBeVisible();
  await expect(sheet.getByText("Pray Without Ceasing")).toHaveCount(0);
  await page.getByTestId("continue-google").click();
  await expect(page.getByTestId("toast")).toContainText("signed in");
  await expect(page).toHaveURL(/\/account$/);
  await page.waitForTimeout(600);
  await expect(page).toHaveURL(/\/account$/);
  expect((await ytLog(page)).created).toBe(0);
});

test("a reload part-way through signing up still carries on with the sermon", async ({
  page,
}) => {
  await fakeYouTube(page);
  await page.goto(pray);
  await watch(page).click();
  const heading = page.getByRole("heading", { name: "Create a free account to watch" });
  await expect(heading).toBeVisible();
  await page.reload();
  await expect(heading).toBeVisible();
  await expect(page.getByRole("dialog").getByText("Pray Without Ceasing")).toBeVisible();
  await page.getByTestId("continue-google").click();
  await expect.poll(async () => (await ytLog(page)).commands).toContain("play");
  await expect(page).toHaveURL(new RegExp(`${pray}$`));
});

// Execute the real flow hooks with the two navigation snapshots observed in
// the CI failure. Only the surrounding hooks, router and intent runner are
// replaced; route counting and completion behavior come from app source.
function flowCompletion(current: string[], stale: string[], focused = false) {
  const filename = join(__dirname, "../src/auth/gate.tsx");
  const source = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set(["FLOW_ROUTES", "isFlowRoute", "isAuthRoute", "trailing", "useFinishFlow", "useCloseAuthRoutes"]);
  const declarations = source.statements.filter((node) =>
    ts.isFunctionDeclaration(node) ? names.has(node.name?.text ?? "") :
      ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => names.has(declaration.name.getText(source))),
  );
  const code = ts.transpileModule(declarations.map((node) => node.getText(source)).join("\n"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const navigation: unknown[][] = [];
  const pending = { kind: "watch", sermonId: "nUW8NT2Pe88" };
  const resumed: unknown[] = [];
  const timers: (() => void)[] = [];
  const exports: { useFinishFlow?: () => () => Promise<void>; useCloseAuthRoutes?: () => () => Promise<void> } = {};
  const stack = (names: string[]) => ({ index: names.length - 1, routes: names.map((name) => ({ name })) });
  runInNewContext(code, {
    exports,
    useCallback: (callback: unknown) => callback,
    useNavigation: () => ({ getState: () => stack(stale), isFocused: () => focused }),
    useNavigationContainerRef: () => ({ getRootState: () => ({ index: 0, routes: [{ name: "__root", state: stack(current) }] }) }),
    router: {
      dismiss: (count: number) => navigation.push(["dismiss", count]),
      canGoBack: () => true,
      back: () => navigation.push(["back"]),
      replace: (path: string) => navigation.push(["replace", path]),
    },
    Platform: { OS: "web" },
    takePendingIntent: async () => pending,
    runIntent: (intent: unknown) => resumed.push(intent),
    setTimeout: (callback: () => void) => { timers.push(callback); },
  });
  return {
    navigation, resumed, pending,
    finish: exports.useFinishFlow!(), closeAuth: exports.useCloseAuthRoutes!(),
    settle: () => { for (const callback of timers.splice(0)) callback(); },
  };
}

test("sign-in completion ignores a dismissed sheet's stale stack and still runs its intent", async () => {
  const flow = flowCompletion(["(tabs)", "sermon/[id]"], ["(tabs)", "sermon/[id]", "join"]);
  await flow.finish();
  expect(flow.navigation).toEqual([]);
  flow.settle();
  expect(flow.resumed).toEqual([flow.pending]);
});

test("sign-in completion closes the current flow even when its originating sheet is unfocused", async () => {
  const flow = flowCompletion(["(tabs)", "join", "auth/email", "auth/code"], ["(tabs)", "join"]);
  await flow.finish();
  expect(flow.navigation).toEqual([["dismiss", 3]]);
  flow.settle();
  expect(flow.resumed).toEqual([flow.pending]);
});

test("closing auth steps preserves the onboarding screens below them", async () => {
  const flow = flowCompletion(["(tabs)", "welcome", "onboarding/account", "join", "auth/email"], ["(tabs)", "join"]);
  const closing = flow.closeAuth();
  expect(flow.navigation).toEqual([["dismiss", 2]]);
  flow.settle();
  await closing;
  expect(flow.resumed).toEqual([]);
});

test("closing an already-dismissed auth sheet leaves live onboarding in place", async () => {
  const flow = flowCompletion(["(tabs)", "welcome", "onboarding/account"], ["(tabs)", "join"]);
  const closing = flow.closeAuth();
  expect(flow.navigation).toEqual([]);
  flow.settle();
  await closing;
});

test("leaving the sheet while a sign-in finishes keeps the guest on the sermon", async ({
  page,
}) => {
  // Keep the local provider's delayed result pending until the sheet is
  // actually gone; CPU speed must not decide which navigation finishes first.
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await fakeYouTube(page);
  await page.goto(pray);
  await watch(page).click();
  const sheet = page.getByRole("dialog", { name: "Create a free account to watch" });
  await expect(sheet).toBeVisible();
  await page.clock.pauseAt(new Date("2026-01-01T00:05:00Z"));
  const google = page.getByTestId("continue-google");
  await google.click();
  await expect(google).toHaveAttribute("aria-busy", "true");
  expect(await page.evaluate(() => localStorage.getItem("aao.local.session.v1"))).toBeNull();
  // Browser Back can dismiss a busy sheet even when its Close is disabled.
  await page.goBack();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${pray}$`));
  expect(await page.evaluate(() => localStorage.getItem("aao.local.session.v1"))).toBeNull();
  const departed: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame() && !frame.url().endsWith(pray)) departed.push(frame.url());
  });
  await page.clock.resume();
  await expect(page.getByTestId("toast")).toContainText("signed in");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("aao.local.session.v1")!).provider)).toBe("google");
  // The sermon underneath stays, and plays: the sign-in was for it.
  await expect.poll(async () => (await ytLog(page)).commands).toContain("play");
  await expect(page).toHaveURL(new RegExp(`${pray}$`));
  expect(departed, "sign-in must not briefly dismiss the sermon before reopening it").toEqual([]);
});

test("keyboard: the sign-up sheet holds focus while open and hands it back on close", async ({
  page,
}) => {
  await page.goto(pray);
  await watch(page).focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: "Create a free account to watch" });
  await expect(sheet).toBeFocused();
  const inSheet = () =>
    page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  // Tab and Shift+Tab cycle through the sheet's own controls, never the page
  // dimmed behind it.
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press(key);
      expect(await inSheet()).toBe(true);
    }
  }
  // The page behind can't be focused, clicked or read out meanwhile.
  expect(
    await page.evaluate(
      () => !!document.querySelector('[aria-label="Watch sermon"]')?.closest("[inert]"),
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(watch(page)).toBeFocused();
  expect(await page.evaluate(() => document.querySelectorAll("[inert]").length)).toBe(0);
  // The dimmed strip above the sheet still closes it.
  await watch(page).click();
  await expect(sheet).toBeVisible();
  // A second Back within 350ms counts as a double tap; pace it like a person.
  await page.waitForTimeout(400);
  await page.mouse.click(187, 20);
  await expect(sheet).toHaveCount(0);
});

test("keyboard: the consent links open with Enter and read at the sentence's size", async ({
  page,
}) => {
  await page.goto(pray);
  await watch(page).click();
  const sheet = page.getByRole("dialog");
  const terms = sheet.getByRole("link", { name: "Terms of Use" });
  await expect(terms).toHaveAttribute("href", "/terms");
  const sizes = await terms.evaluate((node) => [
    getComputedStyle(node).fontSize,
    getComputedStyle(node.parentElement!).fontSize,
  ]);
  expect(sizes[0]).toBe(sizes[1]);
  await terms.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("heading", { level: 1, name: /Terms/ })).toBeVisible();
  // Back on the sheet, focus is where it was.
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(terms).toBeFocused();
  await sheet.getByRole("link", { name: "Privacy Policy" }).press("Enter");
  await expect(page).toHaveURL(/\/privacy$/);
});

test("each page names itself in the browser tab", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Home · AAO");
  await page.goto("/search");
  await expect(page).toHaveTitle("Search · AAO");
  await page.goto("/paths");
  await expect(page).toHaveTitle("Paths · AAO");
  await page.goto("/path/learning-to-wait-on-god");
  await expect(page).toHaveTitle("Learning to wait on God · AAO");
  await page.goto("/path/no-such-path");
  await expect(page).toHaveTitle("Path not found · AAO");
  await page.goto("/account");
  await expect(page).toHaveTitle("Account · AAO");
  await page.goto("/topics/prayer");
  await expect(page).toHaveTitle("Prayer · AAO");
  await page.goto(pray);
  const title = /^Pray Without Ceasing.* · AAO$/;
  await expect(page).toHaveTitle(title);
  await watch(page).click();
  await expect(page).toHaveTitle("Create a free account to watch · AAO");
  await page.keyboard.press("Escape");
  await expect(page).toHaveTitle(title);
  await page.goto("/auth/email");
  await expect(page).not.toHaveTitle("AAO");
  await page.goto("/sermon/not-a-sermon");
  await expect(page).toHaveTitle("This sermon isn’t available · AAO");
});
