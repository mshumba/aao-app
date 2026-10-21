import { expect, test } from "@playwright/test";
import type { ActivePath } from "../src/learning/types";
import {
  MAX_PENDING,
  cleanTime,
  firstReminder,
  planReminders,
  reminderTarget,
  suggestedTime,
  timeText,
  trackDue,
  whenText,
  type ReminderTarget,
} from "../src/reminders/plan";

// The daily path reminder's rules (src/reminders/plan.ts), run without the
// app or a phone: what's scheduled, given the day due on the viewer's path,
// their chosen time and the clock. Every date is on the test machine's own
// clock, as the phone's would be.

/** 2026, on the local clock: `day` of `month` (1-12) at hh:mm. */
const at = (month: number, day: number, hour = 0, minute = 0) => new Date(2026, month - 1, day, hour, minute);

const WAIT: ReminderTarget = {
  pathId: "learning-to-wait-on-god",
  name: "Learning to wait on God",
  day: 3,
  theme: "Renewed strength while you wait",
  youtubeId: "ZSO5mhxiaq0",
};
const EIGHT_PM = { hour: 20, minute: 0 };

/** A day due since `since` that became due as the phone watched (a day done, the path started). */
const watched = (since: Date) => ({ since, watched: true });
/** A day already due when the phone first saw it at `since`. */
const seen = (since: Date) => ({ since, watched: false });

/** When each planned reminder comes, as local "day hh:mm" (October and November 2026). */
function when(list: { at: Date }[]) {
  return list.map(
    (r) =>
      `${r.at.getMonth() + 1}/${r.at.getDate()} ${String(r.at.getHours()).padStart(2, "0")}:${String(
        r.at.getMinutes(),
      ).padStart(2, "0")}`,
  );
}

test.describe("what's scheduled", () => {
  test("reminders turned on in the morning start that evening, then nudge after missed days", () => {
    // Day 3 was already due when this phone first saw it.
    const plan = planReminders({
      target: WAIT,
      time: EIGHT_PM,
      now: at(10, 21, 9, 15),
      due: seen(at(10, 21, 9, 14)),
      armedAt: at(10, 21, 9, 15),
    });
    // Tonight, then the next day (a missed day), two days later and a week on.
    expect(when(plan)).toEqual(["10/21 20:00", "10/22 20:00", "10/24 20:00", "10/28 20:00"]);
    expect(plan[0]).toMatchObject({
      title: "Day 3 of Learning to wait on God is ready",
      body: "Renewed strength while you wait",
      data: { kind: "path-reminder", pathId: WAIT.pathId, day: 3, youtubeId: WAIT.youtubeId },
    });
    for (const nudge of plan.slice(1))
      expect(nudge).toMatchObject({
        title: "Day 3 of Learning to wait on God is here when you’re ready",
        body: "No rush. Pick it up whenever suits you.",
      });
  });

  test("never on a day the viewer did a day: the next is ready tomorrow", () => {
    // Day 2 finished this morning, so Day 3 is due from 7:40.
    const plan = planReminders({
      target: WAIT,
      time: EIGHT_PM,
      now: at(10, 21, 7, 41),
      due: watched(at(10, 21, 7, 40)),
      armedAt: at(10, 1, 12),
    });
    expect(when(plan)[0]).toBe("10/22 20:00");
    expect(plan[0].title).toBe("Day 3 of Learning to wait on God is ready");
  });

  test("a path started today is first reminded of tomorrow", () => {
    expect(firstReminder(EIGHT_PM, watched(at(10, 21, 6, 30)), at(10, 21, 6, 31))).toEqual(at(10, 22, 20));
  });

  test("turned on after today's time has passed, the first is tomorrow", () => {
    expect(firstReminder(EIGHT_PM, seen(at(10, 21, 21)), at(10, 21, 21, 5))).toEqual(at(10, 22, 20));
    // At the very minute, too: a reminder never comes for a moment already gone.
    expect(firstReminder(EIGHT_PM, seen(at(10, 21, 19)), at(10, 21, 20))).toEqual(at(10, 22, 20));
  });

  test("turned on long ago, a day first seen today is ready tonight, not a nudge", () => {
    // A phone that has had reminders on since the 1st, seeing Day 3 for the
    // first time this morning (it was done elsewhere, or this is a new install).
    const plan = planReminders({
      target: WAIT,
      time: EIGHT_PM,
      now: at(10, 21, 9),
      due: seen(at(10, 21, 9)),
      armedAt: at(10, 1, 12),
    });
    expect(when(plan)[0]).toBe("10/21 20:00");
    expect(plan[0].title).toBe("Day 3 of Learning to wait on God is ready");
  });

  test("days missed: what's past is dropped and the nudges thin out, then stop after four weeks", () => {
    // Day 3 due since the 14th; the app opens on the 20th.
    const later = planReminders({
      target: WAIT,
      time: EIGHT_PM,
      now: at(10, 20, 10),
      due: watched(at(10, 14, 21)),
      armedAt: at(10, 1, 12),
    });
    // The first was the 15th; the 16th and 18th have gone: a week, two, three and four on.
    expect(when(later)).toEqual(["10/22 20:00", "10/29 20:00", "11/5 20:00", "11/12 20:00"]);
    expect(later.every((r) => r.title.endsWith("is here when you’re ready"))).toBe(true);

    const gone = planReminders({
      target: WAIT,
      time: EIGHT_PM,
      now: at(11, 20, 10),
      due: watched(at(10, 14, 21)),
      armedAt: at(10, 1, 12),
    });
    expect(gone).toEqual([]);
  });

  test("choosing a new time starts again from that time", () => {
    // Long overdue, but the viewer has just set 12:30pm: today's is "ready".
    const plan = planReminders({
      target: WAIT,
      time: { hour: 12, minute: 30 },
      now: at(10, 21, 10),
      due: watched(at(10, 10, 21)),
      armedAt: at(10, 21, 10),
    });
    expect(when(plan)[0]).toBe("10/21 12:30");
    expect(plan[0].title).toBe("Day 3 of Learning to wait on God is ready");
  });

  test("one a day at most, and only a few waiting at once", () => {
    const plan = planReminders({ target: WAIT, time: EIGHT_PM, now: at(10, 21), due: seen(at(10, 21)), armedAt: at(10, 21) });
    expect(plan.length).toBe(MAX_PENDING);
    expect(MAX_PENDING).toBeLessThan(64);
    expect(new Set(plan.map((r) => r.at.toDateString())).size).toBe(plan.length);
    expect(new Set(plan.map((r) => r.id)).size).toBe(plan.length);
    expect(plan.every((r) => r.at.getHours() === 20 && r.at.getMinutes() === 0)).toBe(true);
  });

  test("a day with no theme still says something", () => {
    const [first] = planReminders({
      target: { ...WAIT, theme: "" },
      time: EIGHT_PM,
      now: at(10, 21, 9),
      due: seen(at(10, 21, 9)),
      armedAt: at(10, 21, 9),
    });
    expect(first.body).toBe("Your next message is waiting for you.");
  });
});

test.describe("the day due", () => {
  test("is the active path's day, or nothing", () => {
    expect(reminderTarget(null)).toBeNull();
    const active = {
      path: { id: WAIT.pathId, name: WAIT.name, kind: "path" },
      day: 3,
      today: { theme: WAIT.theme, youtubeId: WAIT.youtubeId },
    } as unknown as ActivePath;
    expect(reminderTarget(active)).toEqual(WAIT);
    expect(reminderTarget({ ...active, today: undefined })).toBeNull();
  });

  test("is tracked as it changes, here or on another device", () => {
    const now = at(10, 21, 9);
    // The first this phone sees: due for who knows how long.
    const first = trackDue(undefined, WAIT, now);
    expect(first).toEqual({ pathId: WAIT.pathId, day: 3, since: now.toISOString(), watched: false });
    // Nothing changed: the same record, so nothing is written.
    expect(trackDue(first, WAIT, at(10, 22))).toBe(first);
    // Day 3 done: Day 4 is due from now.
    expect(trackDue(first, { ...WAIT, day: 4 }, now)).toEqual({
      pathId: WAIT.pathId,
      day: 4,
      since: now.toISOString(),
      watched: true,
    });
    // Path finished or left.
    expect(trackDue(first, null, now)).toBeNull();
    // A new path started after none.
    expect(trackDue(null, { ...WAIT, day: 1 }, now)).toEqual({
      pathId: WAIT.pathId,
      day: 1,
      since: now.toISOString(),
      watched: true,
    });
  });
});

test.describe("times", () => {
  test("read as the app writes them", () => {
    expect(timeText({ hour: 7, minute: 0 })).toBe("7am");
    expect(timeText({ hour: 20, minute: 30 })).toBe("8:30pm");
    expect(timeText({ hour: 12, minute: 0 })).toBe("12pm");
    expect(timeText({ hour: 0, minute: 15 })).toBe("12:15am");
    expect(timeText({ hour: 9, minute: 5 })).toBe("9:05am");
  });

  test("the suggested time is about now, within waking hours", () => {
    expect(suggestedTime(at(10, 21, 20, 7))).toEqual({ hour: 20, minute: 0 });
    expect(suggestedTime(at(10, 21, 13, 45))).toEqual({ hour: 13, minute: 30 });
    expect(suggestedTime(at(10, 21, 2, 10))).toEqual({ hour: 6, minute: 0 });
    expect(suggestedTime(at(10, 21, 23, 50))).toEqual({ hour: 21, minute: 0 });
  });

  test("when the next one comes, as a sentence ends", () => {
    const now = at(10, 21, 10); // a Wednesday
    expect(whenText(at(10, 21, 20), now)).toBe("today at 8pm");
    expect(whenText(at(10, 22, 20, 30), now)).toBe("tomorrow at 8:30pm");
    expect(whenText(at(10, 23, 7), now)).toBe("on Friday at 7am");
    expect(whenText(at(11, 3, 20), now)).toBe("on 3 November at 8pm");
  });

  test("only a real time is read back from the device", () => {
    expect(cleanTime({ hour: 20, minute: 30 })).toEqual({ hour: 20, minute: 30 });
    expect(cleanTime({ hour: 24, minute: 0 })).toBeNull();
    expect(cleanTime({ hour: 8 })).toBeNull();
    expect(cleanTime("8pm")).toBeNull();
    expect(cleanTime(null)).toBeNull();
  });
});
