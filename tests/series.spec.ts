import type { SermonRecord } from "../src/catalogue/records";
import { sessionLabel, seriesRowText } from "../src/data/seriesRow";
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
  const prayer = sermon({ headline: "The Life of Prayer", event: "IEC 2024", session: "Day 2 Evening" });
  expect(seriesRowText(prayer, "IEC 2024")).toEqual({
    title: "The Life of Prayer",
    label: "Day 2 · Evening",
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
