/**
 * The daily path reminder: opt-in, one a day for the guided path the viewer
 * is on, as local notifications on the phone. Mount RemindersProvider over
 * the screens and ReminderTaps beside them (src/app/_layout.tsx).
 */
export { RemindersProvider, ReminderTaps, useReminders } from "./RemindersProvider";
export { ReminderOffer } from "./ReminderOffer";
export { TimeSheet } from "./TimeSheet";
export { timeText, whenText } from "./plan";
