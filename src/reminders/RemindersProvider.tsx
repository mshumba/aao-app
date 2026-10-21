import { router } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import { useAccount } from "../auth/AccountProvider";
import { useActivePath } from "../learning";
import { keys, readJSON, writeJSON } from "../lib/storage";
import { sermonHref } from "../paths/model";
import { device } from "./device";
import {
  cleanTime,
  planReminders,
  reminderTarget,
  suggestedTime,
  trackDue,
  type DueRecord,
  type ReminderTarget,
} from "./plan";
import type { Permission, PlannedReminder, ReminderTime } from "./types";

/**
 * The daily path reminder (the owner's rules, 16 October 2026): opt-in
 * only, offered on a guided path's day (ReminderOffer) and switched in
 * Account › Daily reminder; one a day at the viewer's time, for the guided
 * path they're on (plan.ts says when, and what it says). Local
 * notifications, put on the phone's own schedule (device.ts); the web has
 * none.
 *
 * Kept on this device for whoever is using it. Another viewer (signing in,
 * signing out, deleting the account) starts with reminders off, and the
 * last one's stop. Whenever the app opens or comes back, or the day due
 * changes (a day done, the path finished or left), the next few are put on
 * the phone again; with no path, none are.
 */

type Stored = {
  /** Whose these are: the account's user ID, or "guest". */
  owner: string;
  enabled: boolean;
  /** Null until reminders are first turned on (until then the time offered is about now). */
  time: ReminderTime | null;
  /** "Remind me each day?" was answered, or reminders were set in Account. */
  asked: boolean;
  /** When reminders were last turned on or given a new time. */
  armedAt: string | null;
  /** The day due on their guided path as this device saw it; missing until it has looked. */
  due?: DueRecord | null;
};

const fresh = (owner: string): Stored => ({ owner, enabled: false, time: null, asked: false, armedAt: null });

type Reminders = {
  /** Reminders work here (the phone apps); the web explains instead. */
  supported: boolean;
  /** This viewer's setting has been read from the device. */
  ready: boolean;
  enabled: boolean;
  /** Their time, or (before they've chosen one) about now. */
  time: ReminderTime;
  /** They've answered "Remind me each day?" (or set reminders in Account). */
  asked: boolean;
  /** Whether the phone allows notifications; null until it has said. */
  permission: Permission | null;
  /** The guided path the reminders are about, while they're on one. */
  target: ReminderTarget | null;
  /** What's waiting on the phone, soonest first, and when that was worked out. */
  upcoming: { list: PlannedReminder[]; at: Date };
  /** Turns them on at this time, asking the phone first; resolves what the phone allows. */
  turnOn: (time: ReminderTime) => Promise<Permission>;
  turnOff: () => void;
  setTime: (time: ReminderTime) => void;
  /** "Not now": the offer isn't made again. */
  decline: () => void;
  /** Asks the phone again, where it still can (Android after a first "no"). */
  allow: () => Promise<Permission>;
  openSettings: () => void;
};

const RemindersContext = createContext<Reminders | null>(null);

export function RemindersProvider({ children }: { children: ReactNode }) {
  const account = useAccount();
  const owner = account.user?.id ?? "guest";
  const { active, loading } = useActivePath("path");
  const target = useMemo(() => reminderTarget(active), [active]);

  // The device's copy as read or last written.
  const [saved, setSaved] = useState<Stored | null>(null);
  // This viewer's, once the device's copy and the account are known. Another
  // viewer's (someone signed in or out, or deleted the account) reads as
  // off: theirs start fresh, and the last one's stop below.
  const stored = useMemo(
    () => (!saved || !account.ready ? null : saved.owner === owner ? saved : fresh(owner)),
    [saved, account.ready, owner],
  );
  const current = useRef<Stored | null>(null);
  useEffect(() => {
    current.current = stored;
  }, [stored]);
  const [permission, setPermission] = useState<Permission | null>(null);
  // Bumped when the app comes back, so what's waiting is worked out again.
  const [wake, setWake] = useState(0);
  const [offered, setOffered] = useState(() => suggestedTime(new Date()));
  const [upcoming, setUpcoming] = useState<Reminders["upcoming"]>(() => ({ list: [], at: new Date() }));

  const change = useCallback((edit: (was: Stored) => Stored) => {
    if (!current.current) return;
    const next = edit(current.current);
    if (next === current.current) return;
    current.current = next;
    setSaved(next);
    void writeJSON(keys.reminders, next);
  }, []);

  // The phone's calls run one at a time, in order, so a later plan never
  // lands before an earlier one.
  const queue = useRef(Promise.resolve());
  const run = useCallback((task: () => Promise<void>) => {
    queue.current = queue.current.then(task).catch(() => {});
  }, []);

  useEffect(() => {
    if (!device.supported) return;
    let alive = true;
    // A phone that can't say reads as not yet allowed: Account offers to ask.
    const check = () =>
      void device
        .permission()
        .catch((): Permission => "undetermined")
        .then((now) => alive && setPermission(now));
    readJSON<Stored | null>(keys.reminders, null).then((kept) => {
      // Nothing kept yet reads as someone else's, so it starts fresh.
      if (alive)
        setSaved(kept && typeof kept.owner === "string" ? { ...kept, time: cleanTime(kept.time) } : fresh(""));
    });
    check();
    // Back from Settings (notifications allowed or not), or a day later.
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      check();
      setOffered(suggestedTime(new Date()));
      setWake((n) => n + 1);
    });
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  // Puts on the phone what should be waiting there now: when the setting,
  // the day due or what the phone allows changes, and when the app comes
  // back. The day due is kept as it changes (a day done, the path started,
  // finished or left, here or elsewhere); what was shown about the day
  // before, or about another viewer's, is out of date.
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (!stored || loading || permission == null) return;
    const now = new Date();
    const due = trackDue(stored.due, target, now);
    const list =
      stored.enabled && stored.time && target && due && permission === "granted"
        ? planReminders({
            target,
            time: stored.time,
            now,
            due: { since: new Date(due.since), watched: due.watched },
            armedAt: stored.armedAt ? new Date(stored.armedAt) : now,
          })
        : [];
    const another = stored !== saved;
    const moved = due !== stored.due;
    const key = JSON.stringify(list.map((r) => [r.id, r.at.getTime(), r.title, r.body]));
    if (!another && !moved && key === applied.current) return;
    applied.current = key;
    run(async () => {
      // On the latest setting, which a tap may have changed meanwhile, and
      // only while it's still this viewer's.
      if (another || moved) change((latest) => (latest.owner === stored.owner ? { ...latest, due } : latest));
      if (another || (moved && stored.due !== undefined)) await device.clearDelivered();
      try {
        await device.replace(list);
        setUpcoming({ list, at: now });
      } catch {
        // Tried again the next time anything changes, or the app comes back.
        applied.current = null;
      }
    });
  }, [stored, saved, loading, target, permission, wake, run, change]);

  const turnOn = useCallback(
    async (time: ReminderTime) => {
      let now: Permission;
      try {
        now = await device.permission();
        if (now === "undetermined") now = await device.request();
      } catch {
        now = "undetermined";
      }
      setPermission(now);
      // Kept on even when the phone says no: they start once it's allowed.
      change((was) => ({ ...was, enabled: true, asked: true, time, armedAt: new Date().toISOString() }));
      return now;
    },
    [change],
  );
  const turnOff = useCallback(() => {
    change((was) => ({ ...was, enabled: false, asked: true }));
    run(() => device.clearDelivered());
  }, [change, run]);
  const setTime = useCallback(
    (time: ReminderTime) => change((was) => ({ ...was, time, armedAt: new Date().toISOString() })),
    [change],
  );
  const decline = useCallback(() => change((was) => ({ ...was, asked: true })), [change]);
  const allow = useCallback(async () => {
    const now = await device.request().catch((): Permission => "undetermined");
    setPermission(now);
    return now;
  }, []);
  const openSettings = useCallback(() => void device.openSettings(), []);

  const value = useMemo<Reminders>(
    () => ({
      supported: device.supported,
      ready: !!stored,
      enabled: !!stored?.enabled,
      time: stored?.time ?? offered,
      asked: !!stored?.asked,
      permission,
      target,
      upcoming,
      turnOn,
      turnOff,
      setTime,
      decline,
      allow,
      openSettings,
    }),
    [stored, offered, permission, target, upcoming, turnOn, turnOff, setTime, decline, allow, openSettings],
  );

  return <RemindersContext.Provider value={value}>{children}</RemindersContext.Provider>;
}

export function useReminders() {
  const value = useContext(RemindersContext);
  if (!value) throw new Error("useReminders needs RemindersProvider (src/reminders).");
  return value;
}

/**
 * A tapped reminder opens its day: the sermon's page as that day of the
 * path, ready to play. Mounted beside the screens, so it can open one as
 * the app starts from the tap.
 */
export function ReminderTaps() {
  useEffect(
    () =>
      device.onOpen((data) =>
        router.push(sermonHref(data.youtubeId, { path: { id: data.pathId, day: data.day } })),
      ),
    [],
  );
  return null;
}
