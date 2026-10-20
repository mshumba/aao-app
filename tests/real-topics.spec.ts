import type { Page } from "@playwright/test";
import { fixtureTopics } from "../src/learning/fixtures";
import {
  HABIT,
  MEMBER,
  SERMON,
  expect,
  rows,
  seedPathProgress,
  seedStorage,
  shown,
  tab,
  test,
  type WatchProgress,
} from "./fixtures";

// The topics (supabase/seed/topics.sql, the test fixtures) and the bundled
// sermons' live topics: Pray Without Ceasing (3 hr 35 min) is Prayer's, Day
// One is Hearing God's, Day Two Morning is Purpose & Calling's, and the
// Grand Finale has none. The order within a topic is covered in
// catalog.spec.ts, as no topic has two sample sermons.

const SPIRIT = "knowing-the-holy-spirit";
const FACE = "seeking-the-face-of-god";
const ONBOARDED = "2026-10-01T00:00:00.000Z";

/** A guest's topics, kept on this device. */
function guestPicks(page: Page, interests: string[]) {
  return seedStorage(page, { "aao.onboarding.v1": { welcomed: true, interests } }, "picks");
}

/** The member's account, with these topics and saved places. */
function memberPicks(page: Page, interests: string[], progress: WatchProgress[] = []) {
  return seedStorage(
    page,
    {
      [`aao.local.data.v1.${MEMBER.id}`]: {
        profile: { displayName: "Mufaro", interests, onboardedAt: ONBOARDED },
        saved: [],
        progress,
      },
    },
    "member-picks",
  );
}

function storedJSON(page: Page, key: string) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null"), key);
}

/** The test IDs of what's in a list, in order. */
function order(list: ReturnType<Page["locator"]>, prefix: string) {
  return list.locator(`[data-testid^="${prefix}"]`).evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
}

/** The rail's cards, as their headlines. */
async function railHeadlines(page: Page) {
  const names = await shown(page.getByTestId("from-your-topics"))
    .getByTestId("topic-card")
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
  return names.map((name) => name.split(".")[0]);
}

test.describe("onboarding", () => {
  test.use({ viewer: "new" });

  test("offers every topic, each with its line and icon, and ends with their paths", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("welcome-get-started").click();
    const options = page.getByRole("checkbox");
    await expect(options).toHaveCount(fixtureTopics.length);
    expect(await options.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")))).toEqual(
      fixtureTopics.map((t) => t.label),
    );
    for (const topic of fixtureTopics) {
      const card = page.getByTestId(`topic-option-${topic.id}`);
      await expect(card).toContainText(topic.description);
      // Its icon, drawn from the bundled outlines (never an empty box).
      await expect(card.locator("svg[data-icon] path")).toHaveCount(1);
    }

    await page.getByRole("checkbox", { name: "The Holy Spirit" }).click();
    await page.getByRole("checkbox", { name: "Grace & Holiness" }).click();
    await page.getByTestId("topics-continue").click();
    await page.getByTestId("continue-google").click();

    await expect(page.getByRole("heading", { name: /You’re all set/ })).toBeVisible();
    // Their topics, in the topics' own order whatever order they were tapped in.
    await expect(page.getByRole("list", { name: "Your topics" }).getByRole("listitem")).toHaveText([
      "Grace & Holiness",
      "The Holy Spirit",
    ]);
    // Each topic's best path first, the topics taking turns. Grace &
    // Holiness's own first path isn't in the test data, so its second leads.
    const paths = shown(page.getByTestId("topic-paths"));
    await expect(paths).toContainText("Paths for your topics");
    expect(await order(paths, "path-card-")).toEqual([`path-card-${HABIT}`, `path-card-${SPIRIT}`, `path-card-${FACE}`]);

    // A path closes onboarding and opens the path.
    await paths.getByTestId(`path-card-${HABIT}`).click();
    await expect(page).toHaveURL(new RegExp(`/path/${HABIT}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Breaking free from habitual sin" })).toBeVisible();
    await page.getByTestId("path-back").click();
    await expect(tab(page, "Home")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("welcome-get-started")).toHaveCount(0);
  });
});

test.describe("Home, as a guest", () => {
  test.use({ viewer: "guest" });

  test("From your topics takes each topic's sermons in turn", async ({ page }) => {
    await guestPicks(page, ["purpose-calling", "hearing-god"]);
    await page.goto("/");
    const rail = shown(page.getByTestId("from-your-topics"));
    await expect(rail.getByRole("heading", { name: "From your topics" })).toBeVisible();
    await expect(rail).toContainText("Hearing God · Purpose & Calling");
    // The topics in their own order, whatever order they were picked in.
    await expect.poll(() => railHeadlines(page)).toEqual(["Apostolic Shift: Day One", "Apostolic Shift: Day Two Morning"]);
    await expect(rail).not.toContainText("sample");
    // "See all" is for one topic's page.
    await expect(rail.getByRole("button", { name: "See all", exact: true })).toHaveCount(0);
  });

  test("From your topics with one topic opens its page", async ({ page }) => {
    await guestPicks(page, ["hearing-god"]);
    await page.goto("/");
    const rail = shown(page.getByTestId("from-your-topics"));
    await expect.poll(() => railHeadlines(page)).toEqual(["Apostolic Shift: Day One"]);
    await rail.getByRole("button", { name: "See all", exact: true }).click();
    await expect(page).toHaveURL(/\/topics\/hearing-god$/);
  });

  test("From your topics leaves out sermons over three hours, and isn't there before a pick", async ({ page }) => {
    await page.goto("/");
    await expect(shown(page.getByTestId("latest-sermons"))).toBeVisible();
    await expect(page.getByTestId("from-your-topics")).toHaveCount(0);
    await expect(page.getByTestId("topic-paths")).toHaveCount(0);

    // Prayer's one sample sermon runs 3 hr 35 min: Home doesn't offer it.
    await tab(page, "Account").click();
    await shown(page.getByRole("button", { name: /^Your topics/ })).click();
    await page.getByRole("checkbox", { name: "Prayer" }).click();
    await page.getByTestId("save-topics").click();
    await tab(page, "Home").click();
    await expect(shown(page.getByTestId("topic-paths"))).toBeVisible();
    await expect(page.getByTestId("from-your-topics")).toHaveCount(0);
  });

  test("suggests each topic's paths in turn", async ({ page }) => {
    await guestPicks(page, ["grace-holiness", "holy-spirit"]);
    await page.goto("/");
    const paths = shown(page.getByTestId("topic-paths"));
    await expect(paths).toContainText("Paths for your topics");
    expect(await order(paths, "path-card-")).toEqual([`path-card-${HABIT}`, `path-card-${SPIRIT}`, `path-card-${FACE}`]);
    await paths.getByTestId(`path-card-${SPIRIT}`).click();
    await expect(page).toHaveURL(new RegExp(`/path/${SPIRIT}$`));
  });
});

test.describe("Home, signed in", () => {
  test("From your topics leaves out what they've finished", async ({ page }) => {
    await memberPicks(page, ["purpose-calling", "hearing-god"], [
      {
        sermonId: SERMON.dayTwo,
        positionSeconds: 10190,
        durationSeconds: 10195,
        finished: true,
        updatedAt: "2026-10-14T10:00:00.000Z",
      },
    ]);
    await page.goto("/");
    await expect.poll(() => railHeadlines(page)).toEqual(["Apostolic Shift: Day One"]);
  });

  test("path suggestions skip the path they're on", async ({ page }) => {
    await memberPicks(page, ["grace-holiness", "holy-spirit"]);
    await seedPathProgress(page, { [HABIT]: [1] });
    await page.goto("/");
    await expect(shown(page.getByTestId("your-path"))).toBeVisible();
    const paths = shown(page.getByTestId("topic-paths"));
    await expect(paths).toContainText("Paths for your topics");
    expect(await order(paths, "path-card-")).toEqual([`path-card-${SPIRIT}`, `path-card-${FACE}`]);
  });
});

test.describe("a topic's page", () => {
  test.use({ viewer: "guest" });

  test("lists its sermons and says how they were matched", async ({ page }) => {
    await page.goto("/topics/purpose-calling");
    const topic = shown(page.getByTestId("topic-page"));
    await expect(topic.getByRole("heading", { level: 1, name: "Purpose & Calling" })).toBeVisible();
    await expect(topic).toContainText("Topic · 1 sermon");
    await expect(topic).toContainText("Finding your assignment and walking in it.");
    expect(await rows(page).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")?.split(".")[0]))).toEqual([
      "Apostolic Shift: Day Two Morning",
    ]);
    // Short of a page, so there's nothing more to show.
    await expect(shown(page.getByRole("button", { name: /^Show / }))).toHaveCount(0);
    await expect(
      shown(page.getByText("Topics are matched automatically from each sermon’s transcript.", { exact: true })),
    ).toBeVisible();
  });

  test("Search's topic cards count each topic's sermons and open its page", async ({ page }) => {
    await page.goto("/search");
    await expect(shown(page.getByRole("heading", { name: "Browse by topic" }))).toBeVisible();
    await shown(page.getByRole("button", { name: "Purpose & Calling, 1 sermon", exact: true })).click();
    await expect(page).toHaveURL(/\/topics\/purpose-calling$/);
  });
});

test.describe("old topic ids", () => {
  const OLD = ["spiritual-growth", "prayer", "faith", "christian-living"];

  test.describe("on a guest's device", () => {
    test.use({ viewer: "guest" });

    test("are dropped, keeping the ones that are still topics", async ({ page }) => {
      await guestPicks(page, OLD);
      await page.goto("/account");
      await expect(shown(page.getByRole("button", { name: /^Your topics/ }))).toContainText("Prayer");
      await expect.poll(() => storedJSON(page, "aao.onboarding.v1")).toEqual({ welcomed: true, interests: ["prayer"] });
      await shown(page.getByRole("button", { name: /^Your topics/ })).click();
      await expect(page.getByRole("checkbox", { name: "Prayer" })).toHaveAttribute("aria-checked", "true");
      await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(1);
    });

    test("in a link find no topic", async ({ page }) => {
      await page.goto("/topics/faith");
      await expect(page.getByRole("heading", { name: "This topic isn’t available" })).toBeVisible();
      await page.goto("/search?category=faith");
      await expect(
        shown(page.getByText("That topic link is out of date. Browse the topics below, or ask in your own words.")),
      ).toBeVisible();
    });
  });

  test("in an account are shown only as current topics, and left for the server to remap", async ({ page }) => {
    await memberPicks(page, ["faith", "prayer"]);
    await page.goto("/account");
    const row = shown(page.getByRole("button", { name: /^Your topics/ }));
    await expect(row).toContainText("Prayer");
    await expect(row).not.toContainText("faith");
    // The app never rewrites an account's topics on its own.
    await page.waitForTimeout(500);
    expect((await storedJSON(page, `aao.local.data.v1.${MEMBER.id}`)).profile.interests).toEqual(["faith", "prayer"]);
    // Saving from Account keeps what they see.
    await row.click();
    await page.getByTestId("save-topics").click();
    await expect
      .poll(async () => (await storedJSON(page, `aao.local.data.v1.${MEMBER.id}`)).profile.interests)
      .toEqual(["prayer"]);
  });
});
