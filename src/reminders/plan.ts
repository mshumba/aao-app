import type { ActivePath } from "../learning/types";
import { MONTHS, WEEKDAYS } from "../lib/dates";
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
 *   or on another device): the first comes the day after. One about the day
 *   before, left on the phone until the app next opened (that day done
 *   elsewhere), counts towards one a day but is never the new day's first.
 * - A day left undone gets gentle nudges, further apart each time: the next
 *   day, two days later, then weekly, and none after four weeks, counted
 *   from that day's first.
 * - A day's "is ready" comes once. Once a reminder about the day has come,
 *   the days it comes on are set: a new time, earlier or later, moves the
 *   ones still to come to that time on those days, and none comes a second
 *   time on a day. Until one has come, its first comes at the new time.
 * - Every one still to come for the day due waits on the phone (seven at
 *   most, where iOS keeps 64 for the whole app), so the nudges come even if
 *   the app isn't opened. They're planned again each time it opens or
 *   progress changes, and each is kept with the day it's about.
 */

/** The days after a day's first reminder that it comes again while that day is undone. */
export const NUDGE_DAYS = [0, 1, 3, 7, 14, 21, 28] as const;

/** The guided path a reminder is about, and its day due. */
export type ReminderTarget = {
  pathId: string;
  /** "Learning to wait on God". */
  name: string;
  day: number;
  /** The day's editorial line: "Lay aside every weight". */
  theme: string;
  youtubeId: string;
  /** When the viewer moved on to this day, here or on another device, if known (ActivePath's). */
  dueSince: string | null;
};

/**
 * The day due on the path, and since when. `watched`: `since` is when it
 * became due (the viewer moved on in the path then, here or elsewhere), so
 * that was a day on the path; false when this device only first saw it
 * then, and it may have been due for a while.
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
    dueSince: active.dueSince,
  };
}

const DAY_MS = 86_400_000;

/**
 * Keeps the record of the day due up to date. A new day is due from when
 * the viewer moved on to it, wherever they did (never later than now), when
 * that move is what changed it: a day of the same path done after the day
 * before became due or, coming from another path or none, a move since then
 * and in the last day (a path started on the web last night). Otherwise the
 * path's own time can't say when it took over (an older path back as the
 * newer one is finished or left, a day un-marked, a lapsed path handed
 * over), so it's due from now, as this device saw it change, and the first
 * one it ever sees (`was` undefined) isn't watched. Returns `was` itself
 * when nothing changed.
 */
export function trackDue(
  was: DueRecord | null | undefined,
  target: ReminderTarget | null,
  now: Date,
): DueRecord | null {
  if (!target) return null;
  if (was && was.pathId === target.pathId && was.day === target.day) return was;
  const moved = target.dueSince ? Date.parse(target.dueSince) : NaN;
  const before = was ? Date.parse(was.since) : -Infinity;
  const after = was?.pathId === target.pathId ? before : Math.max(before, now.getTime() - DAY_MS);
  if (moved > after)
    return {
      pathId: target.pathId,
      day: target.day,
      since: new Date(Math.min(moved, now.getTime())).toISOString(),
      watched: true,
    };
  return { pathId: target.pathId, day: target.day, since: now.toISOString(), watched: was !== undefined };
}

/** `time` on the day `days` after `date`'s, on the viewer's clock (so summer time never moves it). */
function on(date: Date, days: number, time: ReminderTime) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, time.hour, time.minute);
}

const MIDNIGHT: ReminderTime = { hour: 0, minute: 0 };

/** On the same day, on the viewer's clock. */
const sameDay = (a: Date, b: Date) => on(a, 0, MIDNIGHT).getTime() === on(b, 0, MIDNIGHT).getTime();

/** Days from `a`'s date to `b`'s on the viewer's clock (rounded, as a day with a clock change is 23 or 25 hours long). */
const daysApart = (a: Date, b: Date) => Math.round((on(b, 0, MIDNIGHT).getTime() - on(a, 0, MIDNIGHT).getTime()) / DAY_MS);

/**
 * When a day's first reminder comes, while none about that day has: the
 * viewer's time next to come after the day was due (`since`), but never on
 * the day it became due as the device watched, never before reminders were
 * turned on or set to this time (`armedAt`), and never on the day the last
 * one came (`lastShown`, about another day): then it's the day after.
 */
export function firstReminder(
  time: ReminderTime,
  due: { since: Date; watched: boolean },
  armedAt: Date,
  lastShown?: Date | null,
) {
  const after = (moment: Date, nextDay: boolean) => {
    const same = on(moment, 0, time);
    return !nextDay && same > moment ? same : on(moment, 1, time);
  };
  const armed = after(armedAt, false);
  const dueFrom = after(due.since, due.watched);
  const first = armed > dueFrom ? armed : dueFrom;
  return lastShown && sameDay(first, lastShown) ? on(first, 1, time) : first;
}

/** What a reminder is about: its path and day, and how many days after that day's first it comes (0: the first, "is ready"). */
type About = { pathId: string; day: number; afterFirst: number };

/**
 * A reminder put on the phone, as the device keeps it: when it comes
 * (keptTime's) and what it's about, so the app can tell later which have
 * come, and which day's.
 */
export type KeptReminder = About & { at: string };

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * When a reminder put on the phone comes, kept as the phone keeps it, so
 * the app can tell later which have come. `onClock` (iOS): its date and
 * time on the phone's clock with no time zone ("2026-10-20T20:00"), as the
 * trigger has them, so it comes at that time wherever the phone is.
 * Otherwise (Android) the moment (ISO), which stays put until the app plans
 * again.
 */
export function keptTime(at: Date, onClock: boolean) {
  if (!onClock) return at.toISOString();
  const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  return `${day}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/**
 * The moment a kept time comes, on the phone's clock as it is now (NaN if
 * it isn't one). A moment (Android's, or one an iPhone kept in the earlier
 * form) is read as it is.
 */
export function comesAt(kept: string) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(kept)?.slice(1).map(Number);
  if (!parts) return Date.parse(kept);
  const [year, month, day, hour, minute] = parts;
  return new Date(year, month - 1, day, hour, minute).getTime();
}

/**
 * The last reminder that came, as kept: the latest of those put on the
 * phone (`waiting`) that has come by `now`, or `was` if that's later.
 */
export function lastShownAt(
  was: KeptReminder | null | undefined,
  waiting: readonly KeptReminder[] | undefined,
  now: Date,
) {
  const come = [...(was ? [was] : []), ...(waiting ?? []).filter((kept) => comesAt(kept.at) <= now.getTime())];
  return come.filter((kept) => Number.isFinite(comesAt(kept.at))).sort((a, b) => comesAt(b.at) - comesAt(a.at))[0] ?? null;
}

/**
 * The reminders the device kept, as RemindersProvider loads them. An
 * earlier version kept their times alone; each is read as that version read
 * it, about the day due it last saw (`due`, which it planned them for) and
 * counted from that day's first as firstReminder gives it with the time and
 * `armedAt` kept beside them, so plans after the update keep to the days it
 * would have (where it had started a day's again at a new time, from that
 * start). With no day due or no time there's nothing to count from, and
 * they're dropped.
 */
export function readKept(kept: {
  time: ReminderTime | null;
  armedAt: string | null;
  due?: DueRecord | null;
  waiting?: readonly (KeptReminder | string)[];
  lastShown?: KeptReminder | string | null;
}) {
  const { time, armedAt, due } = kept;
  const first =
    due && time && armedAt && firstReminder(time, { since: new Date(due.since), watched: due.watched }, new Date(armedAt));
  const read = (r: KeptReminder | string | null | undefined): KeptReminder[] => {
    if (typeof r !== "string") return r ? [r] : [];
    if (!due || !first) return [];
    return [{ at: r, pathId: due.pathId, day: due.day, afterFirst: daysApart(first, new Date(comesAt(r))) }];
  };
  return { waiting: (kept.waiting ?? []).flatMap(read), lastShown: read(kept.lastShown)[0] ?? null };
}

/** What a reminder says: the day is ready, or, after a missed day, still there. */
function reminderCopy(target: ReminderTarget, nudge: boolean) {
  const day = `Day ${target.day} of ${target.name}`;
  return nudge
    ? { title: `${day} is here when you’re ready`, body: "No rush. Pick it up whenever suits you." }
    : { title: `${day} is ready`, body: target.theme || "Your next message is waiting for you." };
}

/**
 * The reminders to have waiting now, soonest first: the day's first, then
 * one on each of NUDGE_DAYS after it, at the viewer's time, from now on,
 * with none on the day the last one came. Once one about this day has come
 * (`lastShown`), they're counted from that day's first as that one places
 * it, whatever the time now, so a new time only moves those still to come;
 * until then, from firstReminder.
 */
export function planReminders({
  target,
  time,
  now,
  due,
  armedAt,
  lastShown,
}: {
  target: ReminderTarget;
  time: ReminderTime;
  now: Date;
  due: { since: Date; watched: boolean };
  armedAt: Date;
  /** The last reminder that came, if one has: when, and what it was about. */
  lastShown?: (About & { at: Date }) | null;
}): PlannedReminder[] {
  const ours = lastShown?.pathId === target.pathId && lastShown.day === target.day;
  const first = ours
    ? on(lastShown.at, -lastShown.afterFirst, time)
    : firstReminder(time, due, armedAt, lastShown?.at);
  return NUDGE_DAYS.map((afterFirst, i) => ({ i, afterFirst, at: on(first, afterFirst, time) }))
    .filter(({ at }) => at > now && !(lastShown && sameDay(at, lastShown.at)))
    .map(({ i, afterFirst, at }) => ({
      id: `path-reminder-${i}`,
      at,
      afterFirst,
      ...reminderCopy(target, i > 0),
      data: { kind: "path-reminder", pathId: target.pathId, day: target.day, youtubeId: target.youtubeId },
    }));
}

/**
 * Each time the app plans (RemindersProvider: as it opens or comes back,
 * or the setting or the day due changes): the day due now (trackDue), the
 * last reminder that came, from what the device kept, then the reminders to
 * have waiting now (none unless `enabled`, with a time and a day due), each
 * kept with when it comes, as the phone keeps it (`onClock`: iOS), and what
 * it's about.
 */
export function planForPhone(
  kept: {
    time: ReminderTime | null;
    /** When reminders were last turned on or given a new time. */
    armedAt: string | null;
    /** The day due as the device last saw it; undefined until it has looked. */
    due?: DueRecord | null;
    /** What was last put on the phone (readKept's). */
    waiting?: readonly KeptReminder[];
    /** The last of them that came. */
    lastShown?: KeptReminder | null;
  },
  {
    target,
    now,
    enabled,
    onClock,
  }: {
    target: ReminderTarget | null;
    now: Date;
    /** Reminders are on, and the phone allows them. */
    enabled: boolean;
    onClock: boolean;
  },
) {
  const due = trackDue(kept.due, target, now);
  const lastShown = lastShownAt(kept.lastShown, kept.waiting, now);
  const list =
    enabled && kept.time && target && due
      ? planReminders({
          target,
          time: kept.time,
          now,
          due: { since: new Date(due.since), watched: due.watched },
          armedAt: kept.armedAt ? new Date(kept.armedAt) : now,
          lastShown: lastShown && { ...lastShown, at: new Date(comesAt(lastShown.at)) },
        })
      : [];
  const waiting = list.map(({ at, afterFirst, data }) => ({
    at: keptTime(at, onClock),
    pathId: data.pathId,
    day: data.day,
    afterFirst,
  }));
  return { list, due, waiting, lastShown };
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

/** When a reminder comes, as a sentence ends: "tomorrow at 8pm", "on Friday at 8pm", "on 3 November at 8pm". */
export function whenText(at: Date, now: Date) {
  const days = daysApart(now, at);
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
