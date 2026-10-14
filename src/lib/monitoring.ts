import * as Sentry from "@sentry/react-native";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() ?? "";

/**
 * Crash and error reports from release builds only; development errors stay
 * on the developer's machine. Reports carry no names, emails or IP
 * addresses (see the privacy policy): device, OS, app version and the
 * error itself.
 */
export const monitoringEnabled = dsn !== "" && !__DEV__;

Sentry.init({
  dsn,
  enabled: monitoringEnabled,
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  beforeSend(event) {
    delete event.user;
    return event;
  },
});

export { Sentry };
