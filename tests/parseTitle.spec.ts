import { expect, test } from "@playwright/test";
import {
  parseTitle,
  seriesKeyFor,
  titleCase,
  type ParsedTitle,
} from "../src/catalogue/parseTitle";
import { eventLine } from "../src/data/display";
import { toSermon } from "../src/data/sermons";

// Real titles from the Apostle Arome Osayi channel, one per house style,
// with their upload time (which settles ambiguous dates).
const cases: [string, string, Partial<ParsedTitle>][] = [
  [
    "LIONESS CONFERENCE || PRAY WITHOUT CEASING || GRAND FINALE || 27TH SEPTEMBER 2026",
    "2026-09-27T20:39:22Z",
    {
      headline: "Pray Without Ceasing",
      event: "Lioness Conference",
      series: "Lioness Conference 2026",
      seriesKey: "lioness-conference-2026",
      session: "Grand Finale",
      part: null,
      speaker: null,
      preachedOn: "2026-09-27",
    },
  ],
  [
    "APOSTOLIC SHIFT | DAY TWO MORNING | Apostle Arome Osayi LIVE | The Votage | 23/09/26",
    "2026-09-23T11:45:00Z",
    {
      headline: "Apostolic Shift: Day 2 Morning",
      event: null,
      seriesKey: "apostolic-shift-2026",
      session: "Day 2 Morning",
      part: 2,
      venue: "The Votage",
      speaker: null,
      preachedOn: "2026-09-23",
    },
  ],
  [
    "THE MARRIAGE COVENANT - DR. AROME OSAYI",
    "2026-08-12T16:00:00Z",
    {
      headline: "The Marriage Covenant",
      event: null,
      seriesKey: null,
      part: null,
      speaker: null,
      preachedOn: null,
    },
  ],
  [
    "Apostle Arome Osayi - Hallowed Be Thy Name",
    "2019-07-07T10:00:00Z",
    { headline: "Hallowed Be Thy Name", speaker: null, seriesKey: null },
  ],
  [
    "GIFT OF PROPHECY 19 || MID-WEEK SERVICE || DR. AROME OSAYI || RCN MINNESOTA || 10TH DECEMBER 2025",
    "2025-12-11T03:00:00Z",
    {
      headline: "Gift of Prophecy 19",
      event: "Mid-Week Service",
      series: "Gift of Prophecy",
      seriesKey: "gift-of-prophecy",
      part: 19,
      venue: "RCN Minnesota",
      preachedOn: "2025-12-10",
    },
  ],
  [
    // Mixed case and a subtitle, still the same series as the line above.
    "Gift Of Prophecy 8: The Power Of A True Gathering - Dr. Arome Osayi",
    "2025-10-09T12:00:00Z",
    {
      headline: "Gift of Prophecy 8: The Power of a True Gathering",
      seriesKey: "gift-of-prophecy",
      part: 8,
    },
  ],
  [
    "40 DAYS PRAYER & FASTING 2025 | UNDERSTANDING THE PROPHETIC | RCN CANADA | DAY 31 |12TH FEB. 2025",
    "2025-02-13T02:00:00Z",
    {
      headline: "Understanding the Prophetic",
      event: "40 Days Prayer & Fasting 2025",
      seriesKey: "40-days-fasting-and-prayer-2025",
      part: 31,
      session: "Day 31",
      venue: "RCN Canada",
      preachedOn: "2025-02-12",
    },
  ],
  [
    // No message title: the headline is the occasion and the day.
    "40 DAYS FASTING & PRAYER 2026 || DAY 22 || DR. AROME OSAYI || RCN HOUSTON TX || 2ND FEBRUARY 2026",
    "2026-02-03T02:00:00Z",
    {
      headline: "40 Days Fasting & Prayer: Day 22",
      event: "40 Days Fasting & Prayer 2026",
      seriesKey: "40-days-fasting-and-prayer-2026",
      part: 22,
      venue: "RCN Houston TX",
      preachedOn: "2026-02-02",
    },
  ],
  [
    "DAY 36 || 40 DAYS PRAYER AND FASTING || 14TH FEBRUARY 2022 || APOSTLE AROME OSAYI",
    "2022-02-14T20:00:00Z",
    {
      headline: "40 Days Prayer and Fasting: Day 36",
      // The year comes from the preaching date when the title has none.
      seriesKey: "40-days-fasting-and-prayer-2022",
      part: 36,
    },
  ],
  [
    "AS IT IS IN HEAVEN 1 - APOSTLE AROME OSAYI",
    "2024-03-01T10:00:00Z",
    { headline: "As It Is in Heaven 1", series: "As It Is in Heaven", seriesKey: "as-it-is-in-heaven", part: 1 },
  ],
  [
    // A guest minister on the channel is named.
    "REV. ANTHONY AUDU || CHARACTERS AROUND THE ALTAR 2 || 6TH FEB. 2024",
    "2024-02-06T21:00:00Z",
    {
      headline: "Characters Around the Altar 2",
      speaker: "Rev. Anthony Audu",
      seriesKey: "characters-around-the-altar",
      part: 2,
      preachedOn: "2024-02-06",
    },
  ],
  [
    "RCN DALLAS APOSTOLIC CONFERENCE 2025 DAY 1 || DR. AROME OSAYI || REV. PHILIP GBIR || OCT 31 2025",
    "2025-11-01T04:00:00Z",
    {
      headline: "RCN Dallas Apostolic Conference: Day 1",
      speaker: "Dr. Arome Osayi & Rev. Philip Gbir",
      preachedOn: "2025-10-31",
    },
  ],
  [
    // US-style month first (13 can't be a month) and a venue that isn't RCN.
    "THE SALVATION OF THE SOUL | DR AROME OSAYI | APOSTOLIC VISIT AT RCN WARRI | GRAND FINALE | 9-13-26",
    "2026-09-13T22:00:00Z",
    {
      headline: "The Salvation of the Soul",
      event: "Apostolic Visit at RCN Warri",
      session: "Grand Finale",
      preachedOn: "2026-09-13",
    },
  ],
  [
    // Day first; the other reading (10 June) would be months before the upload.
    "40 DAYS PRAYER AND FAST || DAY 5 || 06-10-2021",
    "2021-10-06T18:00:00Z",
    { preachedOn: "2021-10-06", part: 5 },
  ],
  [
    "Wooing of The Spirit - Apostle Arome Osayi 25th Sept. 2010",
    "2024-08-12T10:00:00Z",
    { headline: "Wooing of the Spirit", preachedOn: "2010-09-25" },
  ],
  [
    "Source of Supernatural Power (Apst. Arome Osayi) Sat Morning, 30th June 2012",
    "2024-08-12T10:00:00Z",
    { headline: "Source of Supernatural Power", preachedOn: "2012-06-30", session: "Morning Session" },
  ],
  [
    "Kingdom Utensils ( Part I ) - Apostle Arome Osayi",
    "2023-04-21T10:00:00Z",
    { headline: "Kingdom Utensils (Part I)", seriesKey: "kingdom-utensils", part: 1 },
  ],
  [
    "WOMEN CONFERENCE: THE CRY OF THE LIONESSES (DAY 4)  || REV. BARR. MARY OCHENJELE  ||  21ST MAY 2020",
    "2020-05-21T20:00:00Z",
    {
      headline: "The Cry of the Lionesses",
      event: "Women Conference",
      session: "Day 4",
      speaker: "Rev. Barr. Mary Ochenjele",
    },
  ],
  [
    "OBEYING GOD'S MARCHING ORDERS - DR. AROME OSAYI (USA APOSTOLIC INVASION DAY 1)",
    "2025-08-30T10:00:00Z",
    {
      headline: "Obeying God's Marching Orders",
      event: "USA Apostolic Invasion",
      session: "Day 1",
    },
  ],
  [
    "THE CHURCH OF JESUS VS THE SYNAGOGUE OF SATAN - APOSTLE AROME OSAYI @ KINGDOM RECALIBRATION",
    "2023-12-19T10:00:00Z",
    {
      headline: "The Church of Jesus vs the Synagogue of Satan",
      event: "Kingdom Recalibration",
      venue: null,
    },
  ],
  [
    "TIME-OUT WITH APOSTLE AROME OSAYI",
    "2024-08-12T10:00:00Z",
    { headline: "Time-Out", speaker: null },
  ],
  [
    "Prayer - Power Over Depravity (Apst. Arome Osayi) Sat,26 Nov 2011",
    "2024-08-12T10:00:00Z",
    { headline: "Prayer: Power Over Depravity", preachedOn: "2011-11-26" },
  ],
  [
    "PRAYER FOR NIGERIA - APOSTLE AROME OSAYI",
    "2023-09-04T10:00:00Z",
    { headline: "Prayer for Nigeria", venue: null },
  ],
  [
    "APOSTLE AROME OSAYI'S BIRTHDAY CELEBRATION || 2ND DECEMBER 2022",
    "2022-12-02T10:00:00Z",
    { headline: "Apostle Arome Osayi's Birthday Celebration", speaker: null },
  ],
  [
    "OPERATION NIGERIA || DAY 5  EVENING SERVICE || 11TH JUNE 2022",
    "2022-06-11T20:00:00Z",
    { headline: "Operation Nigeria: Day 5 Evening", part: 5, session: "Day 5 Evening" },
  ],
  [
    // Newer titles: a subtitle after the bar, not an event.
    "The Heavenly Calling | Understanding Your Purpose in Christ | Apostle Arome Osayi",
    "2026-10-13T16:00:00Z",
    { headline: "The Heavenly Calling", event: null, speaker: null },
  ],
  [
    "Understanding the Spirit of Apostasy Day 3 Eve | Apt Arome Osayi, Pastor Nathaniel Bassey | 19/09/26",
    "2026-09-20T02:00:00Z",
    {
      headline: "Understanding the Spirit of Apostasy: Day 3 Evening",
      speaker: "Apt Arome Osayi & Pastor Nathaniel Bassey",
      preachedOn: "2026-09-19",
    },
  ],
  [
    // A generic occasion takes its series name from the message beside it.
    "CAMEROON FOR JESUS | DAY 4 EVENING | Apostle Arome Osayi LIVE | Crusade & Conference | 3-10-2026",
    "2026-10-03T20:00:00Z",
    {
      headline: "Cameroon for Jesus",
      event: "Crusade & Conference",
      series: "Cameroon for Jesus Crusade & Conference 2026",
      session: "Day 4 Evening",
    },
  ],
  [
    "26 YEARS GRAND CELEBRATION | Apostle Arome Osayi LIVE | Maputo, Mozambique | 11-10-2026",
    "2026-10-11T18:00:00Z",
    { headline: "26 Years Grand Celebration", venue: "Maputo, Mozambique", preachedOn: "2026-10-11" },
  ],
  [
    "WEEKLY PRAYER MEETING || TUESDAY 19-10-2021",
    "2021-10-19T20:00:00Z",
    // Weekly meetings aren't a series.
    { headline: "Weekly Prayer Meeting", seriesKey: null, preachedOn: "2021-10-19" },
  ],
  [
    // A city is the venue, never the headline, and DC stays in capitals.
    "PROCLAIM FREEDOM CRUSADE || BETHEL CAMPUS FELLOWSHIP || WASHINGTON DC || DR. AROME OSAYI || 11-10-25",
    "2025-10-11T20:58:32Z",
    {
      headline: "Proclaim Freedom Crusade",
      event: "Proclaim Freedom Crusade",
      venue: "Bethel Campus Fellowship, Washington DC",
      preachedOn: "2025-10-11",
    },
  ],
  [
    // Where he preached isn't the message when the title has one.
    "APOSTLE AROME OSAYI IN CAMEROON || LIMBE INVASION CRUSADE || JESUS TAKE OVER || GRAND FINALE",
    "2024-02-19T10:40:26Z",
    {
      headline: "Jesus Take Over",
      event: "Limbe Invasion Crusade",
      venue: "Cameroon",
      session: "Grand Finale",
      speaker: null,
    },
  ],
  [
    // The occasion in the channel's own words, spelling and all.
    "APOSTLE AROME OSAYI || RCN MAGODO INUAGURATION || 20 AUG 2023",
    "2023-08-20T11:54:50Z",
    { headline: "RCN Magodo Inuaguration", event: "RCN Magodo Inuaguration", venue: null, seriesKey: null },
  ],
  [
    // A French message keeps French small words in lower case.
    "GATHERING OF NATIONS 2026 | CONQUÊTE ET EXPANSION | Apostle Arome Osayi LIVE | Day 1 | 5-10-2026",
    "2026-10-05T20:15:39Z",
    {
      headline: "Conquête et Expansion",
      event: "Gathering of Nations 2026",
      seriesKey: "gathering-of-nations-2026",
      session: "Day 1",
      preachedOn: "2026-10-05",
    },
  ],
  [
    "IU CAMPUS APOSTOLIC CONFERENCE || INDIANA, USA || APST AROME OSAYI || DAY 2 || 21ST FEB. 2025",
    "2025-02-23T02:25:13Z",
    {
      headline: "IU Campus Apostolic Conference: Day 2",
      event: "IU Campus Apostolic Conference",
      venue: "Indiana, USA",
      preachedOn: "2025-02-21",
    },
  ],
  [
    "OPERATION OF THE SONS OF GOD || APOSTLE AROME OSAYI || APOSTOLIC CONFERENCE SA || 6TH SEPTEMBER 2024",
    "2024-09-06T21:23:48Z",
    {
      headline: "Operation of the Sons of God",
      event: "Apostolic Conference SA",
      seriesKey: "apostolic-conference-sa-2024",
    },
  ],
  [
    // "PA" is an elder's title, not initials; "RN" (sic) is kept as written.
    "REV. TOR UJA & PA MASHIKA | GBOKO CRUSADE (RCN MISSIONS) DAY 3 (MORNING SESSION) | 24TH OCTOBER,2020",
    "2020-10-24T09:49:04Z",
    { headline: "Gboko Crusade: Day 3 Morning", speaker: "Rev. Tor Uja & Pa Mashika", venue: "RCN Missions" },
  ],
  [
    "APOSTOLIC VISITATION | DR. AROME OSAYI I DAY 1 | RN CANADA | JUNE 22ND 2025",
    "2025-06-23T02:12:05Z",
    { headline: "Apostolic Visitation: Day 1", venue: "RN Canada", preachedOn: "2025-06-22" },
  ],
];

test("parses each house style of title", () => {
  for (const [title, publishedAt, expected] of cases) {
    const parsed = parseTitle(title, publishedAt);
    expect(parsed, title).toMatchObject(expected);
  }
});

test("headlines are short and never carry the separators or the channel's name", () => {
  for (const [title, publishedAt] of cases) {
    const { headline } = parseTitle(title, publishedAt);
    expect(headline.length, title).toBeLessThanOrEqual(title.length);
    expect(headline, title).not.toMatch(/\||\bOSAYI\b/);
    expect(headline, title).not.toMatch(/\d{1,2}(st|nd|rd|th)?\s+\w+\s+20\d\d/i);
  }
});

test("a date after the upload is not believed", () => {
  // Would be 3 December, after a 3 October upload: the title is wrong.
  expect(parseTitle("SOME MESSAGE || 3RD DECEMBER 2025", "2025-10-03T10:00:00Z").preachedOn).toBeNull();
  // Without an upload time the day-first reading wins.
  expect(parseTitle("SOME MESSAGE || 05-10-2026").preachedOn).toBe("2026-10-05");
});

test("title case keeps acronyms and lowercases small words", () => {
  expect(titleCase("THE GIFT OF GOD'S GRACE")).toBe("The Gift of God's Grace");
  expect(titleCase("IEC 2024 || RCN MINNESOTA")).toBe("IEC 2024 || RCN Minnesota");
  expect(titleCase("MID-WEEK SERVICE ON THE 2ND DAY")).toBe("Mid-Week Service on the 2nd Day");
  // Mixed-case titles keep their own capitals.
  expect(titleCase("The Economy of the mingled Spirit")).toBe("The Economy of the mingled Spirit");
  // Initials stay in capitals: known ones, ones with no vowel, and two
  // letters that aren't an English word.
  expect(titleCase("WASHINGTON DC")).toBe("Washington DC");
  expect(titleCase("RCN DMV (MARYLAND)")).toBe("RCN DMV (Maryland)");
  expect(titleCase("SPECIAL SUNDAY SERVICE JCM RCCG MANCHESTER")).toBe(
    "Special Sunday Service JCM RCCG Manchester",
  );
  expect(titleCase("TG CONFERENCE")).toBe("TG Conference");
  expect(titleCase("IPPC JOS 2024")).toBe("IPPC Jos 2024");
  // Short words and abbreviations still read as words.
  expect(titleCase("UNDERSTANDING EL SHADDAI")).toBe("Understanding El Shaddai");
  expect(titleCase("SANCTIFICATION PT. 2")).toBe("Sanctification Pt. 2");
  expect(titleCase("BE SOBER, BE VIGILANT")).toBe("Be Sober, Be Vigilant");
  expect(titleCase("DO YOU KNOW GOD?")).toBe("Do You Know God?");
  expect(titleCase("THE CHURCH OF JESUS VS THE SYNAGOGUE OF SATAN")).toBe(
    "The Church of Jesus vs the Synagogue of Satan",
  );
  // The words as written: a misspelling isn't corrected.
  expect(titleCase("RCN MAGODO INUAGURATION")).toBe("RCN Magodo Inuaguration");
});

test("French titles lower-case French small words", () => {
  expect(titleCase("CONQUÊTE ET EXPANSION")).toBe("Conquête et Expansion");
  expect(titleCase("Conquête Et Expansion")).toBe("Conquête et Expansion");
  expect(titleCase("LA PUISSANCE DE LA PRIÈRE POUR LES NATIONS")).toBe(
    "La Puissance de la Prière pour les Nations",
  );
  expect(titleCase("L'ÉGLISE ET L'ESPRIT DU SEIGNEUR")).toBe("L'Église et l'Esprit du Seigneur");
  // English titles are untouched by French rules.
  expect(titleCase("PRAYER FOR THE NATIONS")).toBe("Prayer for the Nations");
});

test("series keys treat prayer-and-fasting wordings as one programme", () => {
  expect(seriesKeyFor("40 Days Prayer & Fasting 2025")).toBe(
    seriesKeyFor("40 DAYS FASTING AND PRAYERS 2025"),
  );
  expect(seriesKeyFor("Conquête et Expansion")).toBe("conquete-et-expansion");
});

test("never throws and always returns a headline", () => {
  for (const title of ["", "   ", "||", "2024", "APOSTLE AROME OSAYI", "🇱🇻"]) {
    const parsed = parseTitle(title, "2024-01-01T00:00:00Z");
    expect(typeof parsed.headline).toBe("string");
  }
});

test("the label over a headline never just repeats the preacher's name", () => {
  // What the import writes for a title, as the app shows it.
  const shown = (title: string, publishedAt: string) => {
    const p = parseTitle(title, publishedAt);
    return toSermon({
      youtube_id: "abcdefghijk",
      title,
      headline: p.headline,
      event: p.event,
      series_key: p.seriesKey,
      part: p.part,
      session: p.session,
      speaker: p.speaker,
      venue: p.venue,
      preached_on: p.preachedOn,
      published_at: publishedAt,
      duration_seconds: 3600,
      thumbnail_url: null,
      video_ready_at: null,
    });
  };
  // Nothing but the message and his name: no label at all.
  expect(eventLine(shown("REMNANT HOUR || APOSTLE AROME OSAYI || 23/12/2021", "2021-12-23T20:00:00Z"))).toBe("");
  expect(eventLine(shown("THE MARRIAGE COVENANT - DR. AROME OSAYI", "2026-08-12T16:00:00Z"))).toBe("");
  // The occasion is the headline already: the venue says where instead.
  expect(
    eventLine(
      shown(
        "PROCLAIM FREEDOM CRUSADE || BETHEL CAMPUS FELLOWSHIP || WASHINGTON DC || DR. AROME OSAYI || 11-10-25",
        "2025-10-11T20:58:32Z",
      ),
    ),
  ).toBe("Bethel Campus Fellowship, Washington DC");
  // A guest minister is still named.
  expect(
    eventLine(shown("REV. ANTHONY AUDU || CHARACTERS AROUND THE ALTAR 2 || 6TH FEB. 2024", "2024-02-06T21:00:00Z")),
  ).toBe("Rev. Anthony Audu");
});
