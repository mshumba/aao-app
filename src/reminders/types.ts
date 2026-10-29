/** A time of day on the viewer's own clock, 24-hour. */
export type ReminderTime = { hour: number; minute: number };

/** What a reminder carries, so a tap opens its day. */
export type ReminderData = {
  kind: "path-reminder";
  pathId: string;
  day: number;
  youtubeId: string;
};

/** One reminder to schedule on the phone. */
export type PlannedReminder = {
  id: string;
  at: Date;
  /** How many days after its day's first it comes (plan.ts NUDGE_DAYS): 0 for the first, "is ready". */
  afterFirst: number;
  title: string;
  body: string;
  data: ReminderData;
};

/**
 * Whether the phone lets the app show notifications. "undetermined": it
 * hasn't asked yet (or, on Android, may ask again).
 */
export type Permission = "granted" | "denied" | "undetermined";

/**
 * The phone's notifications, as the reminders use them (device.ts, or
 * device.web.ts, where there are none).
 */
export type ReminderDevice = {
  /** False on the web: reminders come through the phone apps. */
  supported: boolean;
  /**
   * Each comes at a date and time on the phone's clock, following it into
   * another time zone (iOS), rather than at a moment (Android).
   */
  onClock: boolean;
  permission: () => Promise<Permission>;
  /** Shows the system's question when it's undetermined; otherwise answers without asking. */
  request: () => Promise<Permission>;
  /** Replaces every reminder waiting to be shown with these. */
  replace: (list: readonly PlannedReminder[]) => Promise<void>;
  /** Takes away reminders already shown (in Notification Centre). */
  clearDelivered: () => Promise<void>;
  /** The app's page in the phone's Settings. */
  openSettings: () => Promise<void>;
  /** Calls `listener` when a reminder is tapped, including the one that opened the app. */
  onOpen: (listener: (data: ReminderData) => void) => () => void;
};
