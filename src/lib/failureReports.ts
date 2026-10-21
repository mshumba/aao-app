/**
 * Failures the app handles (it shows a message, retries, falls back) but the
 * owner should hear about, because many of them at once mean something is
 * down: search, the sermon library, sign-in or saving watch positions. Plain
 * code with no Sentry or React Native imports, so its rules are tested on
 * their own (tests/failure-reports.spec.ts); src/lib/monitoring.ts sends them.
 *
 * - Each report is a fixed tag (`failure`) and, at most, a short code, an
 *   HTTP status and a step, all from the app's own vocabulary. Never a
 *   message, address, query or name: anything else is dropped, so nothing a
 *   person typed or who they are can reach Sentry (see the privacy policy).
 * - Rate-limited on each device: a few of each kind an hour and a cap for
 *   the session, so an outage sends a handful from each phone rather than
 *   one for every failed request. Sentry's own rate limit on the project's
 *   key caps the total (docs/development/failure-alerts.md).
 * - Only failures where a server answered with an error are reported by the
 *   callers. A phone that is offline or on a connection too weak to finish
 *   a request says nothing about the service.
 */

export type Failure =
  /** Search or quotes answered with an error (OpenAI down or out of balance shows here). */
  | "search_unavailable"
  /**
   * Search or quotes refused for its rate limit: code rate_limited_everyone
   * when the allowance everyone shares is used up, rate_limited_caller when
   * it was the caller's own.
   */
  | "search_over_quota"
  /** The sermon library couldn't be synced: the server answered with an error, or no sermons. */
  | "catalogue_sync"
  /** Signing in failed for a reason that isn't the viewer's to fix. */
  | "sign_in"
  /** A watch position couldn't be saved (or the account's positions read) on the server. */
  | "progress_save";

export type FailureDetails = {
  /** The app's or the server's error code, like "unavailable" or "provider_unavailable". */
  code?: string;
  /** The HTTP status the server answered with. */
  status?: number;
  /** Which request or screen step, like "search", "quotes", "verify" or "send". */
  step?: string;
};

/** What a report carries, as Sentry tags. */
export type FailureTags = { failure: Failure } & Partial<Record<"failure.code" | "failure.step" | "failure.status", string>>;

export const FAILURES: readonly Failure[] = [
  "search_unavailable",
  "search_over_quota",
  "catalogue_sync",
  "sign_in",
  "progress_save",
];

// Codes and steps are identifiers, never free text: letters, digits and _ . -
const WORD = /^[a-z][a-z0-9_.-]{0,39}$/i;

/** The tags for a report; any detail that isn't a plain identifier or an HTTP status is left out. */
export function failureTags(failure: Failure, details: FailureDetails = {}): FailureTags {
  const tags: FailureTags = { failure };
  if (typeof details.code === "string" && WORD.test(details.code)) tags["failure.code"] = details.code;
  if (typeof details.step === "string" && WORD.test(details.step)) tags["failure.step"] = details.step;
  const status = details.status;
  if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599)
    tags["failure.status"] = String(status);
  return tags;
}

export type ReportLimits = {
  /** At most this many of one kind… */
  perKind?: number;
  /** …in this long (ms). */
  windowMs?: number;
  /** And at most this many in all while the app runs. */
  total?: number;
  now?: () => number;
};

/**
 * A reporter that hands at most a few reports of each kind to `send` (see
 * ReportLimits). Returns whether this one was sent.
 */
export function createFailureReports(
  send: (tags: FailureTags) => void,
  { perKind = 2, windowMs = 60 * 60_000, total = 10, now = Date.now }: ReportLimits = {},
) {
  const sentAt = new Map<Failure, number[]>();
  let sent = 0;
  return function report(failure: Failure, details?: FailureDetails): boolean {
    if (!FAILURES.includes(failure) || sent >= total) return false;
    const at = now();
    const recent = (sentAt.get(failure) ?? []).filter((time) => at - time < windowMs);
    if (recent.length >= perKind) {
      sentAt.set(failure, recent);
      return false;
    }
    sentAt.set(failure, [...recent, at]);
    sent += 1;
    try {
      send(failureTags(failure, details));
    } catch {
      // Reporting never breaks what it reports on.
    }
    return true;
  };
}

/** The shape of a Sentry event, as far as scrubbing needs it. */
type Event = {
  tags?: Record<string, unknown>;
  user?: unknown;
  request?: unknown;
  breadcrumbs?: unknown;
  extra?: unknown;
};

/**
 * A handled-failure report leaves with its tags and the device, OS and app
 * version only: no breadcrumbs (they hold page addresses, which carry a
 * search on the web), request, extra data or user. Other events are left
 * as they are, apart from the user, which no event carries.
 */
export function scrubEvent<E extends Event>(event: E): E {
  delete event.user;
  if (typeof event.tags?.failure === "string") {
    delete event.breadcrumbs;
    delete event.request;
    delete event.extra;
  }
  return event;
}
