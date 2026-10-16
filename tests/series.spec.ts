import type { SermonRecord } from "../src/catalogue/records";
import { sessionLabel, seriesRowText, seriesRows } from "../src/data/seriesRow";
import { sampleRecords, seriesSermons, toSermon } from "../src/data/sermons";
import { expect, shown, test } from "./fixtures";

// A series page names the series once, on its cover; each row says which
// part of it the sermon is.

const CAMEROON = "Cameroon for Jesus Crusade & Conference 2026";

/** A sermon as the catalogue stores it, from a few fields. */
function sermon(fields: Partial<SermonRecord>) {
  return toSermon({ ...sampleRecords[0], series_key: "s", part: null, speaker: null, ...fields });
}

test("a session reads as its day, then the time of day", () => {
  expect(sessionLabel("Day 4 Morning")).toBe("Day 4 · Morning");
  expect(sessionLabel("Day 12 Evening")).toBe("Day 12 · Evening");
  expect(sessionLabel("Day 1")).toBe("Day 1");
  expect(sessionLabel("Grand Finale")).toBe("Grand Finale");
  expect(sessionLabel("Evening Session")).toBe("Evening Session");
});

test("a headline that only repeats the event gives way to the session", () => {
  // "CAMEROON FOR JESUS | DAY 4 MORNING | … | Crusade & Conference"
  const morning = sermon({
    headline: "Cameroon for Jesus",
    event: "Crusade & Conference",
    session: "Day 4 Morning",
    part: 4,
  });
  expect(seriesRowText(morning, CAMEROON)).toEqual({ title: "Day 4 · Morning", label: null });
  // The series' name with the session after it, in words or digits.
  const shift = sermon({ headline: "Apostolic Shift: Day Two Morning", session: "Day 2 Morning" });
  expect(seriesRowText(shift, "Apostolic Shift 2026").title).toBe("Day 2 · Morning");
  const iec = sermon({ headline: "IEC: Day 1 Evening", event: "IEC 2023", session: "Day 1 Evening" });
  expect(seriesRowText(iec, "IEC 2023").title).toBe("Day 1 · Evening");
  // A date read as a headline isn't a title either.
  const dated = sermon({ headline: "06 08 2021", event: "School of the Prophets", session: "Day 2 Morning" });
  expect(seriesRowText(dated, "School of the Prophets 2021").title).toBe("Day 2 · Morning");
});

test("a real message title stays, with the session as its label", () => {
  const guidance = sermon({ headline: "Angelic Guidance", event: "School of the Prophets", session: "Day 3 Evening" });
  expect(seriesRowText(guidance, "School of the Prophets 2021")).toEqual({
    title: "Angelic Guidance",
    label: "Day 3 · Evening",
  });
  // A guest preacher is still named.
  const guest = sermon({
    headline: "Womb Weapon",
    event: "Lioness Conference 2021",
    session: "Day 1",
    speaker: "Rev. Mrs. Dinna Osayi",
  });
  expect(seriesRowText(guest, "Lioness Conference 2021").label).toBe("Rev. Mrs. Dinna Osayi · Day 1");
  // Nothing to say instead: the headline stays.
  const plain = sermon({ headline: "School of the Spirit", event: "School of the Spirit", session: null });
  expect(seriesRowText(plain, "School of the Spirit 2020")).toEqual({
    title: "School of the Spirit",
    label: null,
  });
});

test("a series runs by day, then morning before evening", () => {
  const day = (session: string, part: number, preached: string, uploaded: string) =>
    sermon({
      youtube_id: session.replace(/\W/g, "").padEnd(11, "x"),
      series_key: "cameroon",
      headline: "Cameroon for Jesus",
      event: "Crusade & Conference",
      session,
      part,
      preached_on: preached,
      published_at: uploaded,
    });
  // As the catalogue returns them: Day 4's evening was uploaded first.
  const list = [
    day("Day 4 Evening", 4, "2026-10-03", "2026-10-03T19:00:00Z"),
    day("Day 4 Morning", 4, "2026-10-03", "2026-10-03T21:00:00Z"),
    day("Day 2 Evening", 2, "2026-10-01", "2026-10-01T20:00:00Z"),
    day("Day 3 Evening", 3, "2026-10-02", "2026-10-02T20:00:00Z"),
  ];
  expect(seriesSermons(list, "cameroon").map((s) => seriesRowText(s, CAMEROON).title)).toEqual([
    "Day 2 · Evening",
    "Day 3 · Evening",
    "Day 4 · Morning",
    "Day 4 · Evening",
  ]);
});

// The live catalogue's own cases (16 October 2026): YouTube ids, sessions,
// parts and dates as stored. A missing preached date is null.
type Live = [
  id: string,
  headline: string,
  session: string | null,
  part: number | null,
  preached: string | null,
  uploaded: string,
];

function live(key: string, event: string, rows: Live[]) {
  return rows.map(([youtube_id, headline, session, part, preached_on, published_at]) =>
    sermon({ youtube_id, series_key: key, headline, event, session, part, preached_on, published_at }),
  );
}

test("a sermon with no preached date takes its place in its run by day and time of day", () => {
  // Day 1 Evening and Day 2 Morning have only their uploads' dates, after Day 3.
  const list = live("sotp", "School of the Prophets", [
    ["lltproBK5oU", "Perception", "Day 1 Evening", 1, null, "2021-08-08T18:30:08+00:00"],
    ["IjfGIUvYD-A", "06 08 2021", "Day 2 Morning", 2, null, "2021-08-08T20:30:11+00:00"],
    ["JTGLRawbrCY", "School of the Prophets: Day 2 Evening", "Day 2 Evening", 2, "2021-08-06", "2021-08-09T08:01:00+00:00"],
    ["qQR9nr_DJX0", "School of the Prophets: Day 3 Morning", "Day 3 Morning", 3, "2021-08-07", "2021-08-20T13:08:04+00:00"],
    ["FHIR-pbml3E", "Angelic Guidance", "Day 3 Evening", 3, "2021-08-07", "2021-08-22T02:10:44+00:00"],
  ]);
  expect(seriesSermons(list, "sotp").map((s) => s.session)).toEqual([
    "Day 1 Evening",
    "Day 2 Morning",
    "Day 2 Evening",
    "Day 3 Morning",
    "Day 3 Evening",
  ]);
});

test("a gathering's runs stay apart, in date order", () => {
  // Minnesota met in September and again in December.
  const minnesota = live("mn", "Minnesota Apostolic Conference", [
    ["UwN-Tx0DDXM", "Minnesota Apostolic Conference: Day 3", "Day 3", 3, "2025-12-14", "2025-12-15T01:44:46+00:00"],
    ["b3Vkbelkmsc", "Minnesota Apostolic Conference: Day 1", "Day 1", 1, "2025-12-12", "2025-12-13T04:36:36+00:00"],
    ["WPNESIfbAgg", "Minnesota Apostolic Conference: Day 2", "Day 2", 2, "2025-12-13", "2025-12-14T05:34:20+00:00"],
    ["EtwURSuKJ94", "Minnesota Apostolic Conference: Day 2", "Day 2", 2, "2025-09-20", "2025-09-21T03:43:12+00:00"],
    ["DRiXTSTzx1E", "Minnesota Apostolic Conference: Day 1", "Day 1", 1, "2025-09-19", "2025-09-20T03:44:16+00:00"],
  ]);
  expect(seriesSermons(minnesota, "mn").map((s) => `${s.session}, ${s.date}`)).toEqual([
    "Day 1, 19 Sep 2025",
    "Day 2, 20 Sep 2025",
    "Day 1, 12 Dec 2025",
    "Day 2, 13 Dec 2025",
    "Day 3, 14 Dec 2025",
  ]);
  // A Day 1 with no preached date, uploaded five months after July's days,
  // stays with December's uploads rather than joining July's.
  const empowerment = live("aec", "Apostolic Empowerment Conference", [
    ["QEH2hWi-yuM", "The Speakings of Altars", null, null, null, "2023-12-11T14:52:16+00:00"],
    ["1xWV3KBd8YE", "Altars of the Earth", "Day 1", 1, null, "2023-12-09T06:04:17+00:00"],
    ["nX7SwhjUu00", "Apostolic Empowerment Conference: Day 3 Evening", "Day 3 Evening", 3, "2023-07-09", "2023-07-09T22:19:54+00:00"],
    ["JV1D2Nba8Zs", "Apostolic Empowerment Conference: Day 2 Evening", "Day 2 Evening", 2, "2023-07-08", "2023-07-08T20:49:48+00:00"],
    ["bUh-5dc3awc", "Apostolic Empowerment Conference", null, null, "2023-07-07", "2023-07-07T21:27:40+00:00"],
    ["0AfcZGzYhO4", "Do You Know God?", null, null, null, "2023-12-11T14:48:00+00:00"],
  ]);
  expect(seriesSermons(empowerment, "aec").map((s) => s.headline)).toEqual([
    "Apostolic Empowerment Conference",
    "Apostolic Empowerment Conference: Day 2 Evening",
    "Apostolic Empowerment Conference: Day 3 Evening",
    "Altars of the Earth",
    "Do You Know God?",
    "The Speakings of Altars",
  ]);
});

test("a night watch, preached after midnight, follows its day's evening", () => {
  const list = live("on", "Operation Nigeria", [
    ["nwoIecTSD8I", "Night Watch", "Day 5", 5, "2022-06-12", "2022-06-12T02:07:50+00:00"],
    ["kcSrPcTuHwc", "Operation Nigeria: Day 5 Evening", "Day 5 Evening", 5, "2022-06-11", "2022-06-11T23:39:51+00:00"],
    ["b0uM4Ww7EXA", "Night Watch", "Day 4", 4, "2022-06-11", "2022-06-11T02:08:53+00:00"],
    ["4ZwnaIvtKzU", "Operation Nigeria: Day 4", "Day 4", 4, "2022-06-10", "2022-06-10T18:38:58+00:00"],
    ["dMLXTypBGeM", "Operation Nigeria: Day 4 Evening", "Day 4 Evening", 4, "2022-06-10", "2022-06-10T16:16:24+00:00"],
  ]);
  expect(seriesSermons(list, "on").map((s) => `${s.headline} (${s.session})`)).toEqual([
    "Operation Nigeria: Day 4 (Day 4)",
    "Operation Nigeria: Day 4 Evening (Day 4 Evening)",
    "Night Watch (Day 4)",
    "Operation Nigeria: Day 5 Evening (Day 5 Evening)",
    "Night Watch (Day 5)",
  ]);
});

test("a theme on half or more of a series' rows reads as the series' own", () => {
  // IEC 2024 put its theme on 12 of its 14 sessions.
  const sessions = [
    "Day 1", "Day 2 Morning", "Day 2 Evening", "Day 3 Morning", "Day 3 Evening", "Day 4 Morning",
    "Day 4 Evening", "Day 5 Morning", "Day 5 Evening", "Day 6 Morning", "Day 6 Evening", "Day 7 Morning",
  ];
  const theme = sessions.map((session) => sermon({ headline: "The Life of Prayer", event: "IEC 2024", session }));
  const dedication = sermon({ headline: "Hospital Dedication", event: "IEC 2024", session: "Day 7 Morning" });
  const finale = sermon({ headline: "IEC: Grand Finale", event: "IEC 2024", session: "Grand Finale" });
  const rows = seriesRows([...theme, dedication, finale], "IEC 2024");
  expect(rows.map((row) => row.title)).toEqual([...sessions.map(sessionLabel), "Hospital Dedication", "Grand Finale"]);
  expect(rows[1].label).toBeNull();
  expect(rows[12].label).toBe("Day 7 · Morning");
  // Two rows of five aren't a theme: they keep their title.
  const rain = sermon({ headline: "Prayer Rain", event: "IEC 2024", session: "Day 3" });
  const fewer = seriesRows([...theme.slice(0, 2), dedication, finale, rain], "IEC 2024");
  expect(fewer[0]).toEqual({ sermon: theme[0], title: "The Life of Prayer", label: "Day 1" });
  // Operation Nigeria 2022's night watch follows most days' sessions; read as
  // the series' own, two rows would read "Day 4".
  const nigeria = [
    sermon({ headline: "Operation Nigeria: Day 4", event: "Operation Nigeria", session: "Day 4" }),
    sermon({ headline: "Operation Nigeria: Day 4 Evening", event: "Operation Nigeria", session: "Day 4 Evening" }),
    sermon({ headline: "Night Watch", event: "Operation Nigeria", session: "Day 4" }),
    sermon({ headline: "Night Watch", event: "Operation Nigeria", session: "Day 5" }),
  ];
  expect(seriesRows(nigeria, "Operation Nigeria 2022").map((row) => row.title)).toEqual([
    "Day 4",
    "Day 4 · Evening",
    "Night Watch",
    "Night Watch",
  ]);
});

test("a series page lists its sessions without repeating the series", async ({ page }) => {
  await page.goto("/series/apostolic-shift-2026");
  const cover = page.getByTestId("series-page");
  await expect(shown(cover.getByText("Apostolic Shift 2026").first())).toBeVisible();
  const rows = shown(page.getByTestId("sermon-row"));
  await expect(rows).toHaveCount(3);
  // Day One, Day Two Morning, then the Grand Finale, each by its session.
  await expect(rows.nth(0)).toHaveAccessibleName(/^Day 1\. 22 Sep 2026, 1 hour 47 minutes\./);
  await expect(rows.nth(1)).toHaveAccessibleName(/^Day 2\. Morning\. 23 Sep 2026, /);
  await expect(rows.nth(2)).toHaveAccessibleName(/^Grand Finale\. 23 Sep 2026, /);
  await expect(rows.nth(1)).toContainText("Day 2 · Morning");
  // (The artwork's stand-in, when a thumbnail can't load, still names it.)
  for (let i = 0; i < 3; i++) await expect(rows.nth(i)).not.toHaveAccessibleName(/Apostolic Shift/);
});
