import { requireOptionalNativeModule } from "expo";
import type {
  NotificationPermissionsStatus,
  NotificationResponse,
  SchedulableNotificationTriggerInput,
} from "expo-notifications";
import { Linking, Platform } from "react-native";
import { noReminders } from "./none";
import type { Permission, ReminderData, ReminderDevice } from "./types";

/**
 * The phone's notifications through expo-notifications: local ones, put on
 * the phone's own schedule, with no push server. The daily path reminder is
 * the only one the app schedules, so replacing them all touches nothing
 * else. It isn't the only one it shows: on Android the player's media
 * controls are a notification too, so clearing shown reminders takes only
 * theirs. The web has none (device.web.ts).
 *
 * On iOS each comes at a date and time on the phone's clock, so it follows
 * the phone into another time zone. Android has no such one-off trigger: a
 * reminder there comes at the moment worked out when it was planned, in the
 * zone the phone was in then, until the app next opens and plans again.
 *
 * A build made before expo-notifications was added (0.2.0, build 5 and
 * earlier) lacks its native module, and loading the library there would
 * throw at launch, so it's only loaded when the module is found: an update
 * that reaches such a build shows no reminders rather than failing.
 */
type Notifications = typeof import("expo-notifications");

/** Android's channel for it, which the viewer can turn off on its own in Settings. */
const CHANNEL = "path-reminder";

function isReminder(data: unknown): data is ReminderData {
  const d = data as Partial<ReminderData> | null;
  return (
    d?.kind === "path-reminder" &&
    typeof d.pathId === "string" &&
    typeof d.youtubeId === "string" &&
    typeof d.day === "number"
  );
}

function onPhone(N: Notifications): ReminderDevice {
  // A reminder that comes while the app is open still shows, quietly.
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  /** Android 8 and later show notifications in a channel; Android 13 needs it before asking. */
  const ensureChannel = async () => {
    if (Platform.OS !== "android") return;
    await N.setNotificationChannelAsync(CHANNEL, {
      name: "Daily path reminder",
      description: "One gentle note a day for the guided path you’re on",
      importance: N.AndroidImportance.DEFAULT,
    });
  };

  /**
   * iOS: the date and time on the phone's clock, with no time zone, so it
   * comes at that time wherever the phone is. Android: that moment.
   */
  const triggerAt = (at: Date): SchedulableNotificationTriggerInput =>
    Platform.OS === "ios"
      ? {
          type: N.SchedulableTriggerInputTypes.CALENDAR,
          year: at.getFullYear(),
          month: at.getMonth() + 1,
          day: at.getDate(),
          hour: at.getHours(),
          minute: at.getMinutes(),
          repeats: false,
        }
      : { type: N.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL };

  /** iOS asks once; Android 13 may ask twice, so a first "no" there can still be asked again. */
  const permissionOf = (status: NotificationPermissionsStatus): Permission => {
    if (status.granted || status.ios?.status === N.IosAuthorizationStatus.PROVISIONAL) return "granted";
    return status.canAskAgain ? "undetermined" : "denied";
  };

  return {
    supported: true,
    permission: async () => permissionOf(await N.getPermissionsAsync()),
    request: async () => {
      await ensureChannel();
      return permissionOf(
        await N.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }),
      );
    },
    replace: async (list) => {
      await N.cancelAllScheduledNotificationsAsync();
      if (!list.length) return;
      await ensureChannel();
      for (const reminder of list)
        await N.scheduleNotificationAsync({
          identifier: reminder.id,
          content: { title: reminder.title, body: reminder.body, data: reminder.data, sound: "default" },
          trigger: triggerAt(reminder.at),
        });
    },
    clearDelivered: async () => {
      const shown = await N.getPresentedNotificationsAsync();
      await Promise.all(
        shown
          .filter((n) => isReminder(n.request.content.data))
          .map((n) => N.dismissNotificationAsync(n.request.identifier)),
      );
    },
    openSettings: () => Linking.openSettings(),
    onOpen: (listener) => {
      const seen = new Set<string>();
      const handle = (response: NotificationResponse | null) => {
        if (!response || response.actionIdentifier !== N.DEFAULT_ACTION_IDENTIFIER) return;
        const { request, date } = response.notification;
        const key = `${request.identifier}:${date}`;
        if (seen.has(key) || !isReminder(request.content.data)) return;
        seen.add(key);
        // Taken, so a later look (a reload in development) doesn't open it again.
        N.clearLastNotificationResponse();
        listener(request.content.data);
      };
      // The tap that opened the app, then any while it's open.
      handle(N.getLastNotificationResponse());
      const subscription = N.addNotificationResponseReceivedListener(handle);
      return () => subscription.remove();
    },
  };
}

export const device: ReminderDevice = requireOptionalNativeModule("ExpoNotificationScheduler")
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    onPhone(require("expo-notifications") as Notifications)
  : noReminders;
