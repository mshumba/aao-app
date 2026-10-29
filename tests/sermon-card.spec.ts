import type { Locator, Page } from "@playwright/test";
import { fixtureCards } from "../src/learning/fixtures";
import { cardShown, forLine } from "../src/learning/format";
import type { SermonCardData } from "../src/learning/types";
import { expect, shown, test } from "./fixtures";

// A sermon's card on its About tab (src/sermon/Sections.tsx). In local mode
// three sample sermons have their live cards and Day One has none; a
// development-only switch makes cards fail as they do offline
// (src/learning/fixtures.ts).

const PRAY = "nUW8NT2Pe88";
const DAY_TWO = "yUDzMcZsVk8";
const DAY_ONE = "WYiA7rjenVI";
const prayCard = fixtureCards.find((card) => card.youtubeId === PRAY)!;
const WRITTEN = "Written automatically from the sermon’s transcript.";

const failCards = (page: Page) =>
  page.addInitScript(() => {
    (globalThis as { __aaoCardFault?: string | null }).__aaoCardFault = "offline";
  });

async function openAbout(page: Page, id: string) {
  await page.goto(`/sermon/${id}`);
  await page.getByRole("tab", { name: "About", exact: true }).click();
  // The source line is always there, card or not.
  await expect(shown(page.getByRole("button", { name: "Open in YouTube", exact: true }))).toBeVisible();
}

test.describe("what the page shows of a card", () => {
  const card = (change: Partial<SermonCardData> = {}): SermonCardData => ({ ...prayCard, ...change });

  test("its summary, points, scriptures and who it's for", () => {
    expect(cardShown(card())).toEqual({
      summary: prayCard.summary,
      points: prayCard.mainPoints,
      scriptures: prayCard.scriptures,
      forWhom:
        "For women and intercessors who want to pray persistently for their families and nation and walk in boldness and grace.",
    });
  });

  test("nothing for no card, or one whose transcript couldn't be read", () => {
    expect(cardShown(null)).toBeNull();
    expect(cardShown(undefined)).toBeNull();
    expect(cardShown(card({ mainPoints: [] }))).toBeNull();
    expect(cardShown(card({ mainPoints: [" ", ""] }))).toBeNull();
    expect(cardShown(card({ summary: "  " }))).toBeNull();
  });

  test("at most 8 scriptures, the most central first", () => {
    const ten = fixtureCards.find((c) => c.youtubeId === DAY_TWO)!;
    expect(ten.scriptures).toHaveLength(10);
    expect(cardShown(ten)!.scriptures).toEqual(ten.scriptures.slice(0, 8));
    expect(cardShown(card({ scriptures: [] }))!.scriptures).toEqual([]);
  });

  test("“For …” reads as a sentence, and only when the card names someone", () => {
    expect(forLine("Believers who keep falling into the same sin")).toBe(
      "For believers who keep falling into the same sin.",
    );
    expect(forLine("The sick and believers who want to see Christ's healing power")).toBe(
      "For the sick and believers who want to see Christ's healing power.",
    );
    // Words that keep their capital, and short forms.
    expect(forLine("Christian wives and mothers who want to build godly homes.")).toBe(
      "For Christian wives and mothers who want to build godly homes.",
    );
    expect(forLine("Spirit-filled believers hungry for more")).toBe("For Spirit-filled believers hungry for more.");
    expect(forLine("RCN members and friends")).toBe("For RCN members and friends.");
    // Cards whose transcript couldn't be read name no one.
    expect(forLine("Not determinable from this transcript; the captions are unusable.")).toBeNull();
    expect(forLine("No clear audience can be determined; the transcript is too garbled to judge.")).toBeNull();
    expect(forLine("")).toBeNull();
    expect(forLine("   ")).toBeNull();
  });
});

test("a sermon's card shows on its About tab, as a description, not his words", async ({ page }) => {
  await openAbout(page, PRAY);
  const card = shown(page.getByTestId("sermon-card"));
  await expect(card).toBeVisible();
  const summary = card.getByTestId("sermon-summary");
  // As written, never in quotation marks.
  await expect(summary).toHaveText(prayCard.summary, { useInnerText: true });
  expect((await summary.innerText()).trim()).not.toMatch(/^[“"‘']/);
  // Nor in the serif his quotes are set in.
  expect(await summary.evaluate((el) => getComputedStyle(el).fontFamily)).not.toMatch(/Newsreader/);
  await expect(
    card.getByText(
      "For women and intercessors who want to pray persistently for their families and nation and walk in boldness and grace.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(card.getByRole("heading", { level: 2, name: "In this sermon", exact: true })).toBeVisible();
  const points = card.getByRole("listitem");
  await expect(points).toHaveCount(prayCard.mainPoints.length);
  await expect(points.first()).toContainText(prayCard.mainPoints[0]);
  await expect(card.getByTestId("sermon-scriptures")).toHaveText(
    "Scriptures: Acts 4:23-33; Acts 2:42; Acts 6:2-4; Isaiah 66:7-9; Judges 5:1-4; 1 Corinthians 3:10",
  );
  await expect(card.getByText(WRITTEN, { exact: true })).toBeVisible();
  // The player's notice is kept.
  const about = shown(page.getByTestId("about-sermon"));
  await expect(about.getByText(/^Plays (through YouTube|in AAO’s own player)/)).toBeVisible();
  // Read in this order: summary, who it's for, the heading, the points,
  // the scriptures, then where it's from.
  const top = async (locator: Locator) => (await locator.boundingBox())!.y;
  const order = [
    await top(summary),
    await top(card.getByText(/^For women and intercessors/)),
    await top(card.getByRole("heading", { name: "In this sermon" })),
    await top(points.first()),
    await top(points.last()),
    await top(card.getByTestId("sermon-scriptures")),
    await top(about.getByRole("button", { name: "Open in YouTube", exact: true })),
  ];
  expect([...order].sort((a, b) => a - b)).toEqual(order);
});

test("only the 8 most central scriptures are listed", async ({ page }) => {
  await openAbout(page, DAY_TWO);
  const line = shown(page.getByTestId("sermon-scriptures"));
  // (Each reference is kept on one line with no-break spaces.)
  await expect(line).toHaveText(/;\sIsaiah\s66:8$/);
  await expect(line).not.toContainText(/Matthew\s6:33/);
});

test("a sermon without a card shows nothing in its place", async ({ page }) => {
  await openAbout(page, DAY_ONE);
  await expect(page.getByTestId("sermon-card")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "In this sermon" })).toHaveCount(0);
  await expect(page.getByText(WRITTEN)).toHaveCount(0);
  const about = shown(page.getByTestId("about-sermon"));
  await expect(about.getByText(/^Plays (through YouTube|in AAO’s own player)/)).toBeVisible();
  await expect(shown(page.getByRole("heading", { level: 2, name: "More sermons" }))).toBeVisible();
});

test("a card that can't be loaded leaves the page as it was, and the next one loads", async ({ page }) => {
  const errors: string[] = [];
  // (Thumbnails are refused in every test, and logged as failed resources.)
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await failCards(page);
  await openAbout(page, PRAY);
  await expect(shown(page.getByRole("heading", { level: 2, name: "More sermons" }))).toBeVisible();
  await expect(page.getByTestId("sermon-card")).toHaveCount(0);
  await expect(page.getByText(WRITTEN)).toHaveCount(0);
  const about = shown(page.getByTestId("about-sermon"));
  await expect(about.getByText(/^Plays (through YouTube|in AAO’s own player)/)).toBeVisible();
  expect(errors).toEqual([]);
  // Back online, the next sermon opened brings its card.
  await page.evaluate(() => {
    (globalThis as { __aaoCardFault?: string | null }).__aaoCardFault = null;
  });
  await shown(page.getByRole("button", { name: /^Apostolic Shift: Grand Finale\./ })).first().click();
  await shown(page.getByRole("tab", { name: "About", exact: true })).click();
  await expect(shown(page.getByTestId("sermon-card"))).toBeVisible();
  expect(errors).toEqual([]);
});

test("a card fits a small phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openAbout(page, DAY_TWO);
  await expect(shown(page.getByTestId("sermon-card"))).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const box = (await shown(page.getByTestId("sermon-card")).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
});
