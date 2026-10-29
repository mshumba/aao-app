import type { Page } from "@playwright/test";
import { cardText, forLine } from "../src/learning/format";
import { SERMON, expect, shown, test } from "./fixtures";

// A sermon's card on its About tab (public.sermon_cards: what Claude wrote
// after reading the whole transcript). The local stand-in has Day One's
// real card and none for Pray Without Ceasing.

const KEY = "aao.learning.cards.v1";

async function openAbout(page: Page, id: string) {
  await page.goto(`/sermon/${id}`);
  await page.getByRole("tab", { name: "About", exact: true }).click();
  return shown(page.getByTestId("about-sermon"));
}

/** What the device keeps for a sermon: its card, null for none, undefined if never read. */
function kept(page: Page, id: string) {
  return page.evaluate(
    ([key, id]) => (JSON.parse(localStorage.getItem(key) ?? "{}")[id] as { data: unknown } | undefined)?.data,
    [KEY, id],
  );
}

/**
 * The stand-in for reading cards, online or failing as a dropped connection
 * does: `start` at first, then whatever `network` last set (kept across
 * reloads in this tab).
 */
async function networkFrom(page: Page, start: "online" | "offline") {
  await page.addInitScript((start) => {
    const now = sessionStorage.getItem("__card_network") ?? start;
    (globalThis as { __aaoCardFault?: string | null }).__aaoCardFault = now === "offline" ? "offline" : null;
  }, start);
}

function network(page: Page, now: "online" | "offline") {
  return page.evaluate((now) => sessionStorage.setItem("__card_network", now), now);
}

test.describe("its words", () => {
  test("who it's for reads on from For, or isn't said", () => {
    expect(
      forLine(
        "Ministers and believers who want to move only by God's voice and receive a personal commission and testimony from Him.",
      ),
    ).toBe(
      "For ministers and believers who want to move only by God’s voice and receive a personal commission and testimony from Him.",
    );
    // Names keep their capital.
    expect(forLine("Bible students, teachers and preachers who want to handle scripture accurately")).toBe(
      "For Bible students, teachers and preachers who want to handle scripture accurately.",
    );
    expect(forLine("Spirit-filled believers who speak in tongues but want real power")).toBe(
      "For Spirit-filled believers who speak in tongues but want real power.",
    );
    expect(forLine("The sick and believers who want to see Christ's healing power")).toBe(
      "For the sick and believers who want to see Christ’s healing power.",
    );
    // The reader's aside after a semicolon is left off.
    expect(forLine("Conference attendees wanting to join in worship and expectant prayer; not a teaching message.")).toBe(
      "For conference attendees wanting to join in worship and expectant prayer.",
    );
    expect(
      forLine("Anyone wanting a glimpse of the prayers at October Contact; the transcript is too fragmentary to serve as a teaching."),
    ).toBe("For anyone wanting a glimpse of the prayers at October Contact.");
    // No one to point it to, or a line about the transcript: nothing.
    expect(forLine("Not determinable from this transcript; listen to the video itself.")).toBeNull();
    expect(forLine("No one in particular; the transcript is unusable and the content cannot be judged.")).toBeNull();
    expect(forLine("Viewers curious about what the captions caught of the service")).toBeNull();
    expect(forLine("")).toBeNull();
  });

  test("a card is shown as written, with curled quotes, unless it found nothing", () => {
    const card = {
      youtubeId: "x",
      summary: "The Apostle teaches that God speaks through the 'testimony of Jesus'.",
      mainPoints: ["Jesus' baptism accredited Him.", " "],
      scriptures: ["Hebrews 1:1-2", "Hebrews 1:1-2", "Revelation 1:1"],
      forWhom: "",
    };
    expect(cardText(card)).toEqual({
      summary: "The Apostle teaches that God speaks through the ‘testimony of Jesus’.",
      points: ["Jesus’ baptism accredited Him."],
      scriptures: ["Hebrews 1:1-2", "Revelation 1:1"],
      forLine: null,
    });
    // The reader couldn't make out the transcript: no points, no card.
    expect(cardText({ ...card, mainPoints: [] })).toBeNull();
  });
});

test("a sermon's card shows on its About tab, before where it's from", async ({ page }) => {
  const about = await openAbout(page, SERMON.dayOne);
  const card = about.getByTestId("sermon-card");
  await expect(card.getByRole("heading", { name: "About this sermon", level: 2 })).toBeVisible();
  // Said to be a description, and never set in quotation marks.
  await expect(card.getByText("Summarised automatically from the sermon’s transcript.", { exact: true })).toBeVisible();
  const summary = card.getByText(/^The Apostle teaches from Jesus’ baptism and wilderness temptation/);
  await expect(summary).toBeVisible();
  await expect(summary).toHaveText(/ministration\.$/);
  await expect(
    card.getByText(
      "For ministers and believers who want to move only by God’s voice and receive a personal commission and testimony from Him.",
      { exact: true },
    ),
  ).toBeVisible();

  await expect(card.getByRole("heading", { name: "In this sermon", level: 3 })).toBeVisible();
  const [points, scriptures] = [card.getByRole("list").nth(0), card.getByRole("list").nth(1)];
  await expect(points.getByRole("listitem")).toHaveCount(6);
  await expect(points.getByRole("listitem").first()).toContainText(
    "Jesus’ baptism accredited Him, and His wilderness temptation was the ‘second leg’ against Satan after Adam’s defeat.",
  );
  await expect(card.getByRole("heading", { name: "Key scriptures", level: 3 })).toBeVisible();
  await expect(scriptures.getByRole("listitem")).toHaveText([
    "Matthew 4:1-4",
    "Revelation 19:9-10",
    "Acts 9:1-6",
    "Acts 26:16-18",
    "Hebrews 1:1-2",
    "Revelation 1:1",
    "1 John 5:6-8",
  ]);

  // Read in this order (VoiceOver follows it), and the notice stays.
  const text = await about.innerText();
  const order = [
    "About this sermon",
    "Summarised automatically",
    "The Apostle teaches",
    "For ministers",
    "In this sermon",
    "Jesus’ baptism accredited",
    "Key scriptures",
    "Matthew 4:1-4",
    "On YouTube as “APOSTOLIC SHIFT | DAY ONE",
    "Open in YouTube",
    "Plays through YouTube. Loading the player connects to Google, which may set cookies.",
  ].map((words) => text.indexOf(words));
  expect(order).not.toContain(-1);
  expect(order).toEqual([...order].sort((a, b) => a - b));
  // The bullets are drawn, not read.
  await expect(points.getByText("•").first()).toHaveAttribute("aria-hidden", "true");
});

test("the menu's About this sermon brings the card into view", async ({ page }) => {
  await page.goto(`/sermon/${SERMON.dayOne}`);
  await shown(page.getByTestId("stage-header-right")).click();
  await page.getByRole("menuitem", { name: "About this sermon" }).click();
  await expect(shown(page.getByRole("heading", { name: "About this sermon", level: 2 }))).toBeInViewport();
});

test("a sermon without a card shows only where it's from", async ({ page }) => {
  const about = await openAbout(page, SERMON.pray);
  await expect(about.getByRole("button", { name: "Open in YouTube", exact: true })).toBeVisible();
  await expect(about).toContainText("On YouTube as “LIONESS CONFERENCE || PRAY WITHOUT CEASING");
  await expect(about.getByText(/^Plays through YouTube\./)).toBeVisible();
  // Asked and answered: it has none (kept, so it isn't asked again at once).
  await expect.poll(() => kept(page, SERMON.pray)).toBeNull();
  await expect(page.getByTestId("sermon-card")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "About this sermon" })).toHaveCount(0);
});

test("offline, the card fails quietly, the page carries on, and it shows once back online", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await networkFrom(page, "offline");
  await page.goto(`/sermon/${SERMON.dayOne}`);
  // The moments still list, and About still says where it's from.
  await expect(shown(page.getByTestId("sermon-moments")).getByTestId("moment-row")).toHaveCount(4);
  await page.getByRole("tab", { name: "About", exact: true }).click();
  const about = shown(page.getByTestId("about-sermon"));
  await expect(about.getByRole("button", { name: "Open in YouTube", exact: true })).toBeVisible();
  await expect(about.getByText(/^Plays through YouTube\./)).toBeVisible();
  await expect(shown(page.getByTestId("sermon-card"))).toHaveCount(0);
  await expect(page.getByText(/went wrong|try again/i)).toHaveCount(0);
  // A failed read isn't kept as "no card"...
  expect(await kept(page, SERMON.dayOne)).toBeUndefined();
  // ...so the next visit, online, reads it.
  await network(page, "online");
  await openAbout(page, SERMON.dayOne);
  await expect(shown(page.getByTestId("sermon-card"))).toBeVisible();
  expect(errors).toEqual([]);
});

test("a card read before still shows offline once it's old", async ({ page }) => {
  await networkFrom(page, "online");
  await openAbout(page, SERMON.dayOne);
  await expect(shown(page.getByTestId("sermon-card"))).toBeVisible();
  await expect.poll(() => kept(page, SERMON.dayOne)).toBeTruthy();
  // Two days later, and offline: the read fails, and the copy stays.
  await page.evaluate((key) => {
    const cards = JSON.parse(localStorage.getItem(key)!);
    for (const id of Object.keys(cards)) cards[id].at -= 2 * 24 * 60 * 60 * 1000;
    localStorage.setItem(key, JSON.stringify(cards));
  }, KEY);
  await network(page, "offline");
  await openAbout(page, SERMON.dayOne);
  await expect(shown(page.getByTestId("sermon-card")).getByRole("heading", { name: "About this sermon" })).toBeVisible();
  await expect(shown(page.getByTestId("sermon-card"))).toContainText("The Apostle teaches from Jesus’ baptism");
});

test("at a narrow width, nothing in the card runs off the page", async ({ page }) => {
  // A 320pt phone, or a laptop window at 400% zoom.
  await page.setViewportSize({ width: 320, height: 640 });
  const about = await openAbout(page, SERMON.dayOne);
  const card = about.getByTestId("sermon-card");
  await expect(card).toBeVisible();
  const overflow = await card.evaluate((root) =>
    [...root.querySelectorAll("*")].some((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5),
  );
  expect(overflow).toBe(false);
});
