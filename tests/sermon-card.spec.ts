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

// Live cards (public.sermon_cards, read 28 Oct 2026).
const GARBLED: SermonCardData = {
  youtubeId: "LQ4uwv3YAU0",
  summary:
    "The transcript is too garbled and fragmentary to show any teaching on Lucifer, which the title suggests. It captures only a brief opening of prayer or worship in the Spirit and a later fragment about the power of the name of Jesus.",
  mainPoints: [
    "Opening declarations about the Spirit who raised Jesus from the dead",
    "Exhortation to build yourself up by praying in the Spirit",
    "Fragment on the power of Jesus' name over devils, blindness and death",
  ],
  scriptures: [],
  forWhom: "Not enough transcript to say; the title suggests a teaching on Lucifer.",
};
const EXCERPTS: SermonCardData = {
  youtubeId: "RmwJQKsQQMg",
  summary:
    "The Apostle teaches from Matthew 16:24-27 that salvation does not end with the new birth. The soul must also be saved through daily self-denial, and this present age is an age of investment before an age of evaluation and judgment. He closes with a short healing prayer for eyesight, followed by testimonies. The transcript covers only excerpts of the 2.5-hour service.",
  mainPoints: [
    "This age is the age of investment; the age to come is the age of evaluation and judgment.",
    "Christ dwells in your spirit, but the fallen personality in your soul still conflicts with Him.",
    "Discipleship costs self-denial: refuse what your soul desires so you keep covenant with Jesus.",
    "The salvation of your soul is a lifelong process that continues until death or Christ's return.",
    "Each day you make your own vow to Jesus by choosing His will over yours.",
    "He prays for eyesight healing and people testify of being healed.",
  ],
  scriptures: ["Matthew 16:24-27", "Hebrews 10:39"],
  forWhom: "Believers who want to grow beyond new birth and learn to deny fleshly desires so their souls are saved.",
};
const ELTON: SermonCardData = {
  youtubeId: "xMSzopDlBDk",
  summary:
    "The Apostle teaches that God has a reward system in which those who serve Him faithfully, and those who receive and refresh His true messengers, are rewarded now and in the age to come. He uses the life of the missionary-prophet Elton (Pilton in the captions), who lived in a small Nigerian town because God told him to, as an example of a man whose heart was set on the reward.",
  mainPoints: [
    "A true prophet has access to God's counsel and can reveal your destiny beyond what you know of yourself.",
    "Receiving a messenger of God in the capacity of his sending brings reward in this age and the age to come.",
    "Elton obeyed God's specific instruction, lived in a lonely town, refused offers of comfort elsewhere, and ministered to students.",
    "He lived with conviction that he would rule over Nigeria in the age to come, and was buried there as a witness.",
    "Anyone who refreshes or supports God's messengers or little ones does it to Christ and the Father, and will not lose their reward.",
  ],
  scriptures: ["Mark 9:41", "Matthew 25:40"],
  forWhom: "Believers and ministers who want to live with eternal reward in view and honour God's true messengers.",
};
const MERCY: SermonCardData = {
  youtubeId: "c3gLtJ3054E",
  summary:
    'Rev. Shaala Ukaa leads a prayer meeting titled "O Lord Have Mercy". He teaches from Psalm 102, Romans 9 and Daniel 9 that affliction signals God\'s set time to visit His people. He calls the church to repent, unite as one man and cry for mercy, then leads extended prayer.',
  mainPoints: [
    "Satan's patterns never change, and rising affliction often signals that God's set time of visitation is near.",
    "God shows mercy to whom He wills, and a humble, sincere posture attracts that mercy.",
    "Iniquity separates us from God and hinders prayer, as Isaiah 59 shows.",
    "Like Ezra's generation, the church must unite as one man and cry to God.",
    'Daniel prayed in the first person, "we have sinned", showing the intercessor\'s posture of identification.',
    "Prayer points: personal sincerity before God, mercy for the church, and deliverance from confusion.",
  ],
  scriptures: [
    "Psalm 102:11-13",
    "Daniel 9:5-8",
    "Romans 9:15",
    "Isaiah 59:1-3",
    "Acts 7:17-19",
    "Ezra 3:1",
    "Genesis 29:32",
    "Exodus 3:7",
  ],
  forWhom: "Believers who want to intercede for the church and nation and approach God with repentance and sincerity.",
};

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
    // It has points, but can't say who it's for, and its summary is about
    // the transcript.
    expect(cardShown(GARBLED)).toBeNull();
    expect(cardShown(card({ forWhom: GARBLED.forWhom }))).toBeNull();
    expect(cardShown(card({ summary: GARBLED.summary }))).toBeNull();
  });

  test("it describes the sermon, never the transcript", () => {
    // A closing sentence about the transcript is left out.
    expect(cardShown(EXCERPTS)).toEqual({
      summary:
        "The Apostle teaches from Matthew 16:24-27 that salvation does not end with the new birth. The soul must also be saved through daily self-denial, and this present age is an age of investment before an age of evaluation and judgment. He closes with a short healing prayer for eyesight, followed by testimonies.",
      points: EXCERPTS.mainPoints,
      scriptures: EXCERPTS.scriptures,
      forWhom:
        "For believers who want to grow beyond new birth and learn to deny fleshly desires so their souls are saved.",
    });
    // So is an aside in brackets.
    expect(cardShown(ELTON)!.summary).toBe(
      "The Apostle teaches that God has a reward system in which those who serve Him faithfully, and those who receive and refresh His true messengers, are rewarded now and in the age to come. He uses the life of the missionary-prophet Elton, who lived in a small Nigerian town because God told him to, as an example of a man whose heart was set on the reward.",
    );
    // A title's full stop doesn't end the sentence, and a clause after a
    // semicolon goes with its sentence.
    expect(
      cardShown(
        card({
          summary:
            "Rev. Tony George preaches on the full package of salvation, arguing that atonement deals with sin but deliverance is a further, demonstrated part of what God does for His people. Using Exodus 3, Deuteronomy 26:8 and Acts 12, he teaches that God sees, hears and comes down to deliver and bring people into their inheritance, and he calls the church to expect power, not just explanations. The service opens with long prayer and worship; the transcript cuts off mid-story.",
        }),
      )!.summary,
    ).toBe(
      "Rev. Tony George preaches on the full package of salvation, arguing that atonement deals with sin but deliverance is a further, demonstrated part of what God does for His people. Using Exodus 3, Deuteronomy 26:8 and Acts 12, he teaches that God sees, hears and comes down to deliver and bring people into their inheritance, and he calls the church to expect power, not just explanations.",
    );
    // A question in quotation marks doesn't end the sentence either.
    expect(
      cardShown(
        card({
          summary:
            "The Apostle teaches a Bible study on the four aspects of Jesus's ministry (teaching, preaching, healing and deliverance) and then on the reality of demons as personal beings with will, emotion and intellect. He shows how Satan works through the question \"Had God said?\" to undermine what God has spoken, and urges believers to stand on God's word rather than emotion. The transcript covers only some passages, and nothing in them deals directly with the title theme of hearing God.",
        }),
      )!.summary,
    ).toBe(
      "The Apostle teaches a Bible study on the four aspects of Jesus's ministry (teaching, preaching, healing and deliverance) and then on the reality of demons as personal beings with will, emotion and intellect. He shows how Satan works through the question “Had God said?” to undermine what God has spoken, and urges believers to stand on God's word rather than emotion.",
    );
    // Talking about it earlier on, the rest leans on that sentence: nothing shows.
    expect(
      cardShown(
        card({
          summary:
            "A weekly prayer meeting in the series \"Spirits and Man\" that opens with long prayer, worship and prophetic ministration before a teaching. The teacher, whose name the transcript never gives, uses Ezekiel 48:35 (Jehovah Shammah) to show God's postures toward us: for us, with us, and inside us. He says the Holy Spirit inside a believer is the greatest, and that obedience to God's instructions keeps us aligned with Him.",
        }),
      ),
    ).toBeNull();
    // Nor does a "For" line about it.
    expect(
      cardShown(
        card({
          summary:
            "This is the opening of an Apostolic Invasion meeting at the University for Development Studies in Tamale, Northern Ghana. It is made up of worship, praise, introductions of dignitaries, a welcome from the Student Christian Council and a video introducing the Apostle. The transcript ends before Apostle Arome Osayi begins to preach.",
          forWhom:
            "Those curious about the Apostolic Invasion in Northern Ghana; the sermon itself is not in this transcript.",
        }),
      ),
    ).toEqual(
      expect.objectContaining({
        summary:
          "This is the opening of an Apostolic Invasion meeting at the University for Development Studies in Tamale, Northern Ghana. It is made up of worship, praise, introductions of dignitaries, a welcome from the Student Christian Council and a video introducing the Apostle.",
        forWhom: null,
      }),
    );
  });

  test("quotation marks are curly, as in the app's own words", () => {
    const shown = cardShown(MERCY)!;
    expect(shown.summary).toBe(
      "Rev. Shaala Ukaa leads a prayer meeting titled “O Lord Have Mercy”. He teaches from Psalm 102, Romans 9 and Daniel 9 that affliction signals God's set time to visit His people. He calls the church to repent, unite as one man and cry for mercy, then leads extended prayer.",
    );
    expect(shown.points[4]).toBe(
      "Daniel prayed in the first person, “we have sinned”, showing the intercessor's posture of identification.",
    );
    expect(shown.points.filter((point, i) => point !== MERCY.mainPoints[i])).toHaveLength(1);
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
    // Nor does one that talks about the transcript.
    expect(
      forLine(
        "Anyone wanting a glimpse of the prayers at October Contact; the transcript is too fragmentary to serve as a teaching.",
      ),
    ).toBeNull();
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

test("a card that can't be loaded leaves the page as it was, and loads on the next visit", async ({ page }) => {
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
  // Back online, the next sermon opened brings its card…
  await page.evaluate(() => {
    (globalThis as { __aaoCardFault?: string | null }).__aaoCardFault = null;
  });
  await shown(page.getByRole("button", { name: /^Apostolic Shift: Grand Finale\./ })).first().click();
  await shown(page.getByRole("tab", { name: "About", exact: true })).click();
  await expect(shown(page.getByTestId("sermon-card"))).toBeVisible();
  // …and so does the one that failed, opened again (a new visit from More
  // sermons, not Back to the page that's still open, nor a reload, which
  // would set the fault again and forget what's in memory).
  await shown(page.getByRole("button", { name: /^Pray Without Ceasing\./ })).first().click();
  await expect(
    shown(page.getByRole("heading", { level: 1, name: "Pray Without Ceasing", exact: true })),
  ).toBeVisible();
  await shown(page.getByRole("tab", { name: "About", exact: true })).click();
  await expect(shown(page.getByTestId("sermon-summary"))).toHaveText(prayCard.summary, { useInnerText: true });
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
