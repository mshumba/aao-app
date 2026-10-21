import type { ReminderDevice } from "./types";

/** No reminders here: the web, or a phone build made without them. */
export const noReminders: ReminderDevice = {
  supported: false,
  permission: async () => "denied",
  request: async () => "denied",
  replace: async () => {},
  clearDelivered: async () => {},
  openSettings: async () => {},
  onOpen: () => () => {},
};
