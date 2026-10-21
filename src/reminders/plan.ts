import type { ActivePath } from "../learning/types";
import type { PlannedReminder, ReminderTime } from "./types";

/**
 * The daily path reminder as plain data: what it's about, when it comes and
 * what it says (the owner's rules, 16 October 2026). Tested in Node
 * (tests/reminders-plan.spec.ts).
 *
 * - One a day at most, at the viewer's time, for the guided path they're on
 *   (never a teaching series), naming the day: "Day 3 of Learning to wait on
 *   God is ready".
 * - Never on a day they've moved on in it (a day done, the path started, here
 *   or on another device): the first comes the day after.
 * - A day left undone gets gentle nudges, further apart each time: the next
 *   day, two days later, then weekly, and none after four weeks.
 * - The app plans a few at a time, each time it opens or progress changes,
 *   so few are ever waiting (iOS keeps 64 for the whole app).
 */

/** The days after a day's first reminder that it comes again while that day is undone. */
export const NUDGE_DAYS = [0, 1, 3, 7, 14, 21, 28] as const;

/** At most this many waiting at once. */
export const MAX_PENDING = 4;

/** The guided path a reminder is about, and its day due. */
export type ReminderTarget = {
  pathId: string;
  /** "Learning to wait on God". */
  name: string;
  day: number;
  /** The day's editorial line: "Lay aside every weight". */
  theme: string;
  youtubeId: string;
};

/**
 * The day due on the path, and since when as this device saw it. `watched`:
 * it became due while the device was watching (a day done, the path
 * started, here or elsewhere), so that was a day on the path; false for the
 * first one it ever saw, which may have been due for a while.
 */
export type DueRecord = { pathId: string; day: number; since: string; watched: boolean };

/** The day due on a guided path the viewer is on, or null when they're on none. */
export function reminderTarget(active: ActivePath | null): ReminderTarget | null {
  if (!active?.today) return null;
  return {
    pathId: active.path.id,
    name: active.path.name,
    day: active.day,
    theme: active.today.theme,
    youtubeId: active.today.youtubeId,
  };
}

/**
 * Keeps the record of the day due up to date: a new day (or path) is due
 * from now. The first one this device ever sees (`was` undefined) isn't
 * watched. Returns `was` itself when nothing changed.
 */
export function trackDue(
  was: DueRecord | null | undefined,
  target: ReminderTarget | null,
  now: Date,
): DueRecord | null {
  if (!target) return null;
  if (was && was.pathId === target.pathId && was.day === target.day) return was;
  return { pathId: target.pathId, day: target.day, since: now.toISOString(), watched: was !== undefined };
}

/** `time` on the day `days` after `date`'s, on the viewer's clock (so summer time never moves it). */
function on(date: Date, days: number, time: ReminderTime) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, time.hour, time.minute);
}

/**
 * When a day's first reminder comes: the viewer's time next to come after
 * the day was due (`since`), but never on the day it became due as the
 * device watched, and never before reminders were turned on or set to this
 * time (`armedAt`).
 */
export function firstReminder(time: ReminderTime, due: { since: Date; watched: boolean }, armedAt: Date) {
  const after = (moment: Date, nextDay: boolean) => {
    const same = on(moment, 0, time);
    return !nextDay && same > moment ? same : on(moment, 1, time);
  };
  const armed = after(armedAt, false);
  const dueFrom = after(due.since, due.watched);
  return armed > dueFrom ? armed : dueFrom;
}

/** What a reminder says: the day is ready, or, after a missed day, still there. */
export function reminderCopy(target: ReminderTarget, nudge: boolean) {
  const day = `Day ${target.day} of ${target.name}`;
  return nudge
    ? { title: `${day} is here when you’re ready`, body: "No rush. Pick it up whenever suits you." }
    : { title: `${day} is ready`, body: target.theme || "Your next message is waiting for you." };
}

/** The reminders to have waiting now, soonest first. */
export function planReminders({
  target,
  time,
  now,
  due,
  armedAt,
}: {
  target: ReminderTarget;
  time: ReminderTime;
  now: Date;
  due: { since: Date; watched: boolean };
  armedAt: Date;
}): PlannedReminder[] {
  const first = firstReminder(time, due, armedAt);
  return NUDGE_DAYS.map((days, i) => ({ i, at: on(first, days, time) }))
    .filter(({ at }) => at > now)
    .slice(0, MAX_PENDING)
    .map(({ i, at }) => ({
      id: `path-reminder-${i}`,
      at,
      ...reminderCopy(target, i > 0),
      data: { kind: "path-reminder", pathId: target.pathId, day: target.day, youtubeId: target.youtubeId },
    }));
}

/** 7:00 → "7am", 20:30 → "8:30pm". */
export function timeText({ hour, minute }: ReminderTime) {
  const minutes = minute ? `:${String(minute).padStart(2, "0")}` : "";
  return `${hour % 12 || 12}${minutes}${hour < 12 ? "am" : "pm"}`;
}

/** About now, for someone choosing a time: on the hour or half hour, from 6am to 9pm. */
export function suggestedTime(now: Date): ReminderTime {
  const minutes = now.getHours() * 60 + (now.getMinutes() >= 30 ? 30 : 0);
  const kept = Math.min(21 * 60, Math.max(6 * 60, minutes));
  return { hour: Math.floor(kept / 60), minute: kept % 60 };
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** When a reminder comes, as a sentence ends: "tomorrow at 8pm", "on Friday at 8pm", "on 3 November at 8pm". */
export function whenText(at: Date, now: Date) {
  const midnight = { hour: 0, minute: 0 };
  // Rounded, as a day with a clock change is 23 or 25 hours long.
  const days = Math.round((on(at, 0, midnight).getTime() - on(now, 0, midnight).getTime()) / 86_400_000);
  const time = timeText({ hour: at.getHours(), minute: at.getMinutes() });
  if (days === 0) return `today at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  if (days < 7) return `on ${WEEKDAYS[at.getDay()]} at ${time}`;
  return `on ${at.getDate()} ${MONTHS[at.getMonth()]} at ${time}`;
}

/** A stored time, if it is one. */
export function cleanTime(value: unknown): ReminderTime | null {
  const t = value as Partial<ReminderTime> | null;
  if (!t || !Number.isInteger(t.hour) || !Number.isInteger(t.minute)) return null;
  const { hour, minute } = t as ReminderTime;
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60 ? { hour, minute } : null;
}
