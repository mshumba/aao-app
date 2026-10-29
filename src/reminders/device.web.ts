import { authMode } from "../auth/config";
import { noReminders } from "./none";
import type { Permission, ReminderData, ReminderDevice } from "./types";

/**
 * The web has no reminders: they come through the iPhone and Android apps.
 * Account › Daily reminder says so, and a path's day offers nothing.
 *
 * The automated tests stand in for a phone: in the on-device test mode
 * (EXPO_PUBLIC_AUTH_MODE=local), `window.__aaoReminders` set before the app
 * loads is taken as the phone's notifications (tests/reminders.spec.ts).
 */

/** The tests' phone: what it answers, and what's waiting on it. */
export type ReminderStandIn = {
  /** What the phone allows now; a test changes it as Settings would. */
  permission: Permission;
  /** What the system's question answers while it's undetermined. */
  answer: Permission;
  /** How often the question was asked. */
  asked: number;
  /** What's waiting, as the phone would show it. */
  scheduled: { id: string; at: string; title: string; body: string; data: ReminderData }[];
  /** How often shown reminders were cleared, and Settings opened. */
  cleared: number;
  settings: number;
  /** Set by the app: call it as a tap on a reminder would. */
  open: ((data: ReminderData) => void) | null;
};

const standIn =
  authMode === "local" ? (globalThis as { __aaoReminders?: ReminderStandIn }).__aaoReminders : undefined;

function stoodIn(phone: ReminderStandIn): ReminderDevice {
  return {
    supported: true,
    // Kept on the clock, as an iPhone's are.
    onClock: true,
    permission: async () => phone.permission,
    request: async () => {
      if (phone.permission === "undetermined") {
        phone.asked += 1;
        phone.permission = phone.answer;
      }
      return phone.permission;
    },
    replace: async (list) => {
      phone.scheduled = list.map((r) => ({ id: r.id, at: r.at.toISOString(), title: r.title, body: r.body, data: r.data }));
    },
    clearDelivered: async () => {
      phone.cleared += 1;
    },
    openSettings: async () => {
      phone.settings += 1;
    },
    onOpen: (listener) => {
      phone.open = listener;
      return () => {
        if (phone.open === listener) phone.open = null;
      };
    },
  };
}

export const device: ReminderDevice = standIn ? stoodIn(standIn) : noReminders;
