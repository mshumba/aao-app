import * as Sentry from "@sentry/react-native";
import { createFailureReports, scrubEvent } from "./failureReports";

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
  beforeSend: (event) => scrubEvent(event),
});

/**
 * Reports a failure the app handled, so the owner hears about outages
 * (src/lib/failureReports.ts says what's sent; docs/development/
 * failure-alerts.md sets up the alerts). Rate-limited; never throws. In
 * development it's logged to the console instead.
 */
export const reportFailure = createFailureReports((tags) => {
  if (monitoringEnabled)
    Sentry.captureMessage(`Handled failure: ${tags.failure}`, {
      level: "warning",
      tags,
      // One issue for each kind and code, however many phones report it.
      fingerprint: ["handled-failure", tags.failure, tags["failure.code"] ?? ""],
    });
  else if (__DEV__) console.info("[failure report]", JSON.stringify(tags));
});

export { Sentry };
