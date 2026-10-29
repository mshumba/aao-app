import { expect, test } from "@playwright/test";
import { sampleSermons } from "../src/data/sermons";
import { fixtureDays, fixturePaths } from "../src/learning/fixtures";
import { activePath, applyOp, emptyProgress, type ProgressOp } from "../src/learning/progress";
import type { ActivePath, PathDay } from "../src/learning/types";
import { WEEKDAYS } from "../src/lib/dates";
import {
  NUDGE_DAYS,
  cleanTime,
  comesAt,
  firstReminder,
  keptTime,
  lastShownAt,
  planForPhone,
  planReminders,
  reminderTarget,
  suggestedTime,
  timeText,
  trackDue,
  whenText,
  type DueRecord,
  type ReminderTarget,
} from "../src/reminders/plan";
import type { ReminderTime } from "../src/reminders/types";

// The daily path reminder's rules (src/reminders/plan.ts), run without the
// app or a phone: what's scheduled, given the day due on the viewer's path,
// their chosen time and the clock. Every date is on the test machine's own
// clock, as the phone's would be, except where a test takes the phone to
// another time zone.

/** 2026, on the local clock: `day` of `month` (1-12) at hh:mm. */
const at = (month: number, day: number, hour = 0, minute = 0) => new Date(2026, month - 1, day, hour, minute);

const WAIT: ReminderTarget = {
  pathId: "learning-to-wait-on-god",
  name: "Learning to wait on God",
  day: 3,
  theme: "Renewed strength while you wait",
  youtubeId: "ZSO5mhxiaq0",
  dueSince: null,
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

/** What the device keeps between plans: when each reminder put on the phone comes, and when the last one came. */
type Kept = { waiting: string[]; lastShown: string | null };

const NOTHING_KEPT: Kept = { waiting: [], lastShown: null };
/** Day 3, due since Day 2 was done on Monday 19 October at 2pm in London (9am in New York). */
const DAY_3: DueRecord = { pathId: WAIT.pathId, day: 3, since: "2026-10-19T13:00:00.000Z", watched: true };
/** 8pm, set at the start of the month. */
const SET = { time: EIGHT_PM, armedAt: "2026-10-01T11:00:00.000Z" };

/**
 * The app plans as it opens, as RemindersProvider does (planForPhone):
 * what has come, then what to put on the phone, kept as this phone keeps
 * it (`onClock`: iOS, otherwise Android).
 */
function opens(kept: Kept, now: Date, onClock: boolean, { time, armedAt } = SET, due = DAY_3) {
  const { list, ...next } = planForPhone(
    { ...kept, time, armedAt },
    { target: WAIT, due, now, enabled: true, onClock },
  );
  return { plan: list, kept: next };
}

/**
 * What comes on an iPhone the app plans on each time it's opened, with a
 * new time if one is chosen then, until `until`: every reminder still
 * waiting when its time comes, as "10/20 20:00 ready" or "… nudge".
 */
function comes(opened: { now: Date; time?: ReminderTime }[], until: Date) {
  let kept = NOTHING_KEPT;
  let setting = SET;
  return opened.flatMap(({ now, time }, k) => {
    if (time) setting = { time, armedAt: now.toISOString() };
    const { plan, kept: after } = opens(kept, now, true, setting);
    kept = after;
    const next = opened[k + 1]?.now ?? until;
    return plan
      .filter((r) => r.at < next)
      .map((r) => `${when([r])[0]} ${r.title.endsWith("is ready") ? "ready" : "nudge"}`);
  });
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
    // Tonight, then the next day (a missed day), two days later, then weekly for four weeks.
    expect(when(plan)).toEqual([
      "10/21 20:00",
      "10/22 20:00",
      "10/24 20:00",
      "10/28 20:00",
      "11/4 20:00",
      "11/11 20:00",
      "11/18 20:00",
    ]);
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

  test("a later time chosen after today's reminder has come brings tomorrow's nudge, not a second today", () => {
    // Day 3 due since 6pm yesterday; today's 8am "is ready" has come. At
    // 10am the viewer chooses 9pm: tonight would be a second one today.
    const ninePm = { hour: 21, minute: 0 };
    const retimed = {
      target: WAIT,
      time: ninePm,
      now: at(10, 21, 10),
      due: watched(at(10, 20, 18)),
      armedAt: at(10, 21, 10),
    };
    const plan = planReminders({ ...retimed, lastShown: at(10, 21, 8) });
    expect(when(plan)).toEqual([
      "10/22 21:00",
      "10/24 21:00",
      "10/28 21:00",
      "11/4 21:00",
      "11/11 21:00",
      "11/18 21:00",
    ]);
    expect(plan[0].title).toBe("Day 3 of Learning to wait on God is here when you’re ready");
    // Yesterday's doesn't hold tonight's back.
    const tonight = planReminders({ ...retimed, lastShown: at(10, 20, 20) });
    expect(when(tonight)[0]).toBe("10/21 21:00");
    expect(tonight[0].title).toBe("Day 3 of Learning to wait on God is ready");
    // Nor does one that came days ago move the nudges still to come.
    const nudges = planReminders({
      target: WAIT,
      time: EIGHT_PM,
      now: at(10, 23, 10),
      due: watched(at(10, 14, 21)),
      armedAt: at(10, 1, 12),
      lastShown: at(10, 22, 20),
    });
    expect(when(nudges)[0]).toBe("10/29 20:00");
  });

  test("opening the app after a day's reminder has come never starts the nudges again", () => {
    inZone("Europe/London", () => {
      // Day 2 done on Monday 19 October at 2pm, and the app opened again on
      // Tuesday and Thursday at 10pm, each time after that day's had come:
      // Tuesday's is ready, then Wednesday's, Friday's and weekly nudges.
      const monday = { now: at(10, 19, 14) };
      expect(comes([monday, { now: at(10, 20, 22) }, { now: at(10, 22, 22) }], at(12, 31))).toEqual([
        "10/20 20:00 ready",
        "10/21 20:00 nudge",
        "10/23 20:00 nudge",
        "10/27 20:00 nudge",
        "11/3 20:00 nudge",
        "11/10 20:00 nudge",
        "11/17 20:00 nudge",
      ]);
      // A later time chosen on Tuesday at 9pm, after that day's came:
      // nothing more that day, and Wednesday's is a nudge at the new time.
      expect(comes([monday, { now: at(10, 20, 21), time: { hour: 22, minute: 0 } }], at(12, 31))).toEqual([
        "10/20 20:00 ready",
        "10/21 22:00 nudge",
        "10/23 22:00 nudge",
        "10/27 22:00 nudge",
        "11/3 22:00 nudge",
        "11/10 22:00 nudge",
        "11/17 22:00 nudge",
      ]);
    });
  });

  test("when the last one came: the latest put on the phone that has come", () => {
    const now = at(10, 21, 10);
    // As an iPhone keeps them: the date and time on its clock.
    const waiting = [at(10, 21, 8), at(10, 22, 8), at(10, 24, 8)].map((d) => keptTime(d, true));
    expect(waiting).toEqual(["2026-10-21T08:00", "2026-10-22T08:00", "2026-10-24T08:00"]);
    expect(comesAt(waiting[0])).toBe(at(10, 21, 8).getTime());
    expect(lastShownAt(null, waiting, now)).toBe("2026-10-21T08:00");
    // None has come yet: the one before stays.
    expect(lastShownAt("2026-10-20T08:00", waiting.slice(1), now)).toBe("2026-10-20T08:00");
    expect(lastShownAt(undefined, undefined, now)).toBeNull();
    // As Android keeps them, and as every one was kept at first: moments.
    const moments = [at(10, 21, 8), at(10, 22, 8)].map((d) => keptTime(d, false));
    expect(moments[0]).toBe(at(10, 21, 8).toISOString());
    expect(lastShownAt(null, moments, now)).toBe(moments[0]);
    expect(lastShownAt(at(10, 20, 8).toISOString(), ["2026-10-21T08:00"], now)).toBe("2026-10-21T08:00");
    // Anything else isn't a time.
    expect(comesAt("8pm")).toBeNaN();
    expect(lastShownAt("8pm", ["8pm"], now)).toBeNull();
  });

  test("one a day at most, and every one still to come waits on the phone", () => {
    const plan = planReminders({ target: WAIT, time: EIGHT_PM, now: at(10, 21), due: seen(at(10, 21)), armedAt: at(10, 21) });
    expect(plan.length).toBe(NUDGE_DAYS.length);
    expect(plan.length).toBeLessThan(64);
    expect(new Set(plan.map((r) => r.at.toDateString())).size).toBe(plan.length);
    expect(new Set(plan.map((r) => r.id)).size).toBe(plan.length);
    expect(plan.every((r) => r.at.getHours() === 20 && r.at.getMinutes() === 0)).toBe(true);
  });

  test("a viewer who doesn't open the app still gets the weekly nudges, to four weeks", () => {
    // Planned once, the evening Day 3 became due, and never again.
    const plan = planReminders({
      target: WAIT,
      time: EIGHT_PM,
      now: at(10, 14, 21, 1),
      due: watched(at(10, 14, 21)),
      armedAt: at(10, 1, 12),
    });
    expect(when(plan)).toEqual([
      "10/15 20:00",
      "10/16 20:00",
      "10/18 20:00",
      "10/22 20:00",
      "10/29 20:00",
      "11/5 20:00",
      "11/12 20:00",
    ]);
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
      dueSince: "2026-10-20T19:00:00.000Z",
    } as unknown as ActivePath;
    expect(reminderTarget(active)).toEqual({ ...WAIT, dueSince: "2026-10-20T19:00:00.000Z" });
    expect(reminderTarget({ ...active, today: undefined })).toBeNull();
  });

  test("is tracked as it changes, from when the viewer moved on where that's known", () => {
    // The first this phone sees, with no time for it: due for who knows how long.
    const first = trackDue(undefined, WAIT, at(10, 21, 9));
    expect(first).toEqual({ pathId: WAIT.pathId, day: 3, since: at(10, 21, 9).toISOString(), watched: false });
    // Nothing changed: the same record, so nothing is written.
    expect(trackDue(first, WAIT, at(10, 22))).toBe(first);
    // Day 3 done here a moment ago: Day 4 is due from then.
    const now = at(10, 21, 9, 21);
    const doneHere = at(10, 21, 9, 20);
    expect(trackDue(first, { ...WAIT, day: 4, dueSince: doneHere.toISOString() }, now)).toEqual({
      pathId: WAIT.pathId,
      day: 4,
      since: doneHere.toISOString(),
      watched: true,
    });
    // With no time for it (progress kept before 0.3.0): due from when this phone saw it.
    expect(trackDue(first, { ...WAIT, day: 4 }, now)).toEqual({
      pathId: WAIT.pathId,
      day: 4,
      since: now.toISOString(),
      watched: true,
    });
    // A clock ahead elsewhere never puts it in the future.
    expect(trackDue(first, { ...WAIT, day: 4, dueSince: at(10, 21, 11).toISOString() }, now)?.since).toBe(
      now.toISOString(),
    );
    // Day 2 un-marked: Day 2 is due again, from now (the latest day done is no later than Day 3 became due).
    const onDay3 = { pathId: WAIT.pathId, day: 3, since: at(10, 20, 21).toISOString(), watched: true };
    expect(trackDue(onDay3, { ...WAIT, day: 2, dueSince: at(10, 20, 21).toISOString() }, now)).toEqual({
      pathId: WAIT.pathId,
      day: 2,
      since: now.toISOString(),
      watched: true,
    });
    // Path finished or left.
    expect(trackDue(first, null, now)).toBeNull();
    // A new path started after none.
    expect(trackDue(null, { ...WAIT, day: 1, dueSince: now.toISOString() }, now)).toEqual({
      pathId: WAIT.pathId,
      day: 1,
      since: now.toISOString(),
      watched: true,
    });
    // Or started on the web last night, after another path: due from then.
    expect(
      trackDue({ ...onDay3, pathId: "another" }, { ...WAIT, day: 1, dueSince: at(10, 20, 22).toISOString() }, now)
        ?.since,
    ).toBe(at(10, 20, 22).toISOString());
  });

  test("a day done on another device the evening before is reminded of tonight", () => {
    // Day 2 done on the web at 9pm Monday; the phone opens at 7am Tuesday.
    const due = trackDue(
      { pathId: WAIT.pathId, day: 2, since: at(10, 19, 7).toISOString(), watched: true },
      { ...WAIT, dueSince: at(10, 19, 21).toISOString() },
      at(10, 20, 7),
    )!;
    expect(due).toMatchObject({ day: 3, since: at(10, 19, 21).toISOString(), watched: true });
    const plan = planReminders({
      target: WAIT,
      time: EIGHT_PM,
      now: at(10, 20, 7),
      due: { since: new Date(due.since), watched: due.watched },
      armedAt: at(10, 1, 12),
    });
    expect(when(plan)[0]).toBe("10/20 20:00");
    expect(plan[0].title).toBe("Day 3 of Learning to wait on God is ready");
    // Done on the web this morning instead: not today, but tomorrow.
    const morning = trackDue(
      { pathId: WAIT.pathId, day: 2, since: at(10, 19, 7).toISOString(), watched: true },
      { ...WAIT, dueSince: at(10, 20, 6, 30).toISOString() },
      at(10, 20, 7),
    )!;
    expect(
      firstReminder(EIGHT_PM, { since: new Date(morning.since), watched: morning.watched }, at(10, 1, 12)),
    ).toEqual(at(10, 21, 20));
  });

  test("finishing the newer of two paths: the older one's day is ready the next day", () => {
    // Breaking free from habitual sin last moved on ten days ago (Day 4 on
    // the 11th); Learning to wait on God, started since, is on its last day.
    const HABIT = "breaking-free-from-habitual-sin";
    const done = (pathId: string, day: number, when: Date): ProgressOp => ({
      kind: "done",
      pathId,
      day,
      at: when.toISOString(),
    });
    const ops: ProgressOp[] = [
      { kind: "start", pathId: HABIT, at: at(10, 1, 9).toISOString() },
      done(HABIT, 1, at(10, 2, 21)),
      done(HABIT, 2, at(10, 3, 21)),
      done(HABIT, 3, at(10, 4, 21)),
      done(HABIT, 4, at(10, 11, 21)),
      { kind: "start", pathId: WAIT.pathId, at: at(10, 12, 9).toISOString() },
      done(WAIT.pathId, 1, at(10, 13, 21)),
      done(WAIT.pathId, 2, at(10, 14, 21)),
      done(WAIT.pathId, 3, at(10, 15, 21)),
      done(WAIT.pathId, 4, at(10, 20, 21)),
    ];
    const before = ops.reduce(applyOp, emptyProgress);
    const daysByPath = new Map<string, PathDay[]>();
    fixtureDays.forEach((d) => daysByPath.set(d.pathId, [...(daysByPath.get(d.pathId) ?? []), d]));
    const find = (id: string) => sampleSermons.find((s) => s.id === id);
    const targetOf = (state: typeof before) => reminderTarget(activePath(state, fixturePaths, daysByPath, find))!;

    // The phone saw Day 5 of waiting on God due on Tuesday evening.
    const seenDay5 = trackDue(
      { pathId: WAIT.pathId, day: 4, since: at(10, 15, 21).toISOString(), watched: true },
      targetOf(before),
      at(10, 20, 21, 1),
    )!;
    expect(seenDay5).toMatchObject({ pathId: WAIT.pathId, day: 5, since: at(10, 20, 21).toISOString() });

    // Wednesday morning it's done, and the older path is the one they're on again.
    const now = at(10, 21, 9, 30);
    const target = targetOf(applyOp(before, done(WAIT.pathId, 5, now)));
    expect(target).toMatchObject({ pathId: HABIT, day: 5, dueSince: at(10, 11, 21).toISOString() });
    const due = trackDue(seenDay5, target, now)!;
    expect(due).toEqual({ pathId: HABIT, day: 5, since: now.toISOString(), watched: true });
    const plan = planReminders({
      target,
      time: EIGHT_PM,
      now,
      due: { since: new Date(due.since), watched: due.watched },
      armedAt: at(9, 1, 12),
    });
    expect(when(plan).slice(0, 3)).toEqual(["10/22 20:00", "10/23 20:00", "10/25 20:00"]);
    expect(plan[0]).toMatchObject({
      title: "Day 5 of Breaking free from habitual sin is ready",
      body: "Gain mastery over your appetites",
    });

    // The same when it last moved on long ago, after the newer one stalled.
    const longAgo = { ...target, dueSince: at(9, 11, 21).toISOString() };
    const stalled = { pathId: WAIT.pathId, day: 5, since: at(9, 1, 21).toISOString(), watched: true };
    expect(trackDue(stalled, longAgo, now)?.since).toBe(now.toISOString());
  });

  test("a lapsed path taking over is due from now, not from when it last moved", () => {
    const now = at(10, 21, 9, 30);
    const lapsed = { ...WAIT, dueSince: at(9, 11, 21).toISOString() };
    const planFor = (due: DueRecord) =>
      planReminders({
        target: lapsed,
        time: EIGHT_PM,
        now,
        due: { since: new Date(due.since), watched: due.watched },
        armedAt: at(9, 1, 12),
      });
    // A guest's reminder handed over to their account, whose path last
    // moved forty days ago: first seen now, so ready tonight.
    const handedOver = trackDue(undefined, lapsed, now)!;
    expect(handedOver).toEqual({ pathId: WAIT.pathId, day: 3, since: now.toISOString(), watched: false });
    expect(when(planFor(handedOver))[0]).toBe("10/21 20:00");
    expect(planFor(handedOver)[0].title).toBe("Day 3 of Learning to wait on God is ready");
    // A finished path reopened by un-marking its last day: ready tomorrow.
    const reopened = trackDue(null, lapsed, now)!;
    expect(reopened).toEqual({ pathId: WAIT.pathId, day: 3, since: now.toISOString(), watched: true });
    expect(when(planFor(reopened))[0]).toBe("10/22 20:00");
    expect(planFor(reopened)[0].title).toBe("Day 3 of Learning to wait on God is ready");
  });
});

/** Runs `run` with the clock in `zone`, as on a phone taken there (Node follows a new TZ at once). */
function inZone<T>(zone: string, run: () => T): T {
  const was = process.env.TZ;
  process.env.TZ = zone;
  try {
    return run();
  } finally {
    if (was === undefined) delete process.env.TZ;
    else process.env.TZ = was;
  }
}

test.describe("another time zone", () => {
  /** "Tue 20:00", on the clock where the test now is. */
  const local = (d: Date) => `${WEEKDAYS[d.getDay()].slice(0, 3)} ${d.toTimeString().slice(0, 5)}`;

  test("flying west: Tuesday's reminder still comes at 8pm there", () => {
    // Planned in London on Monday evening: Tuesday at 8pm there.
    const london = inZone("Europe/London", () => opens(NOTHING_KEPT, new Date("2026-10-19T20:00:00Z"), true));
    expect(london.kept.waiting[0]).toBe("2026-10-20T20:00");
    // In New York, opened at 4pm on Tuesday, before 8pm there: the iPhone
    // still has it waiting, at 8pm on its clock, and the app leaves it so.
    inZone("America/New_York", () => {
      const ny = opens(london.kept, new Date("2026-10-20T20:00:00Z"), true);
      expect(ny.kept.lastShown).toBeNull();
      expect(local(ny.plan[0].at)).toBe("Tue 20:00");
      expect(ny.plan[0].title).toBe("Day 3 of Learning to wait on God is ready");
      expect(ny.kept.waiting[0]).toBe("2026-10-20T20:00");
    });
    // Android kept the moment, and it came at 3pm in New York: tomorrow's is next.
    const android = inZone("Europe/London", () => opens(NOTHING_KEPT, new Date("2026-10-19T20:00:00Z"), false));
    expect(android.kept.waiting[0]).toBe("2026-10-20T19:00:00.000Z");
    inZone("America/New_York", () => {
      const ny = opens(android.kept, new Date("2026-10-20T20:00:00Z"), false);
      expect(ny.kept.lastShown).toBe("2026-10-20T19:00:00.000Z");
      expect(local(ny.plan[0].at)).toBe("Wed 20:00");
    });
  });

  test("flying east: a new time after Tuesday's has come waits until Wednesday", () => {
    // Planned in New York on Monday: Tuesday at 8pm there.
    const ny = inZone("America/New_York", () => opens(NOTHING_KEPT, new Date("2026-10-19T14:00:00Z"), true));
    expect(ny.kept.waiting[0]).toBe("2026-10-20T20:00");
    // In London the iPhone brought it at 8pm there. At 9pm the viewer
    // chooses 10pm: tonight would be a second one today.
    inZone("Europe/London", () => {
      const now = new Date("2026-10-20T20:00:00Z");
      const retimed = opens(ny.kept, now, true, { time: { hour: 22, minute: 0 }, armedAt: now.toISOString() });
      expect(retimed.kept.lastShown).toBe("2026-10-20T20:00");
      expect(local(retimed.plan[0].at)).toBe("Wed 22:00");
      expect(retimed.plan[0].title).toBe("Day 3 of Learning to wait on God is here when you’re ready");
    });
    // On Android it was still to come (at 1am in London): 10pm tonight takes its place, Tuesday's one.
    const android = inZone("America/New_York", () => opens(NOTHING_KEPT, new Date("2026-10-19T14:00:00Z"), false));
    inZone("Europe/London", () => {
      const now = new Date("2026-10-20T20:00:00Z");
      const retimed = opens(android.kept, now, false, { time: { hour: 22, minute: 0 }, armedAt: now.toISOString() });
      expect(retimed.kept.lastShown).toBeNull();
      expect(local(retimed.plan[0].at)).toBe("Tue 22:00");
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
