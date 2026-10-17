# Failure alerts

The app sends crashes to Sentry from release builds. It also sends **handled failures**: failures where the person sees a calm message or a retry, but many at once mean part of the service is down. This page lists what is sent and how the owner sets an alert on it.

## What is reported

Each report is a Sentry issue titled `Handled failure: <kind>`, at warning level. Its tags:

| `failure` | Sent when | `failure.step` | `failure.code` | `failure.status` |
| --- | --- | --- | --- | --- |
| `search_unavailable` | The search or quotes function answered with an error, or search's answer was unreadable. **An OpenAI outage or an empty OpenAI balance shows up here.** | `search` or `quotes` | The function's error code (`unavailable`), or `bad_response` | e.g. `503`, `404` |
| `search_over_quota` | Search or quotes refused because its rate limit is used up: one caller's 20 per 5 minutes, or everyone's 300 searches or 30 quotes an hour. | `search` or `quotes` | `rate_limited` | `429` |
| `catalogue_sync` | The sermon library's server answered with an error, or with no sermons. | | `http` or `empty` | e.g. `500` |
| `sign_in` | Signing in failed for a reason that isn't the person's to fix: a provider Supabase won't accept, Supabase's email or request limits, or an error the app doesn't recognise. | `apple`, `google`, `send` (email code or reset), `verify`, `resend`, `submit` (password), `confirm`, `link` (email link) | `provider_unavailable`, `rate_limited`, `unknown`, `not_configured` | |
| `progress_save` | The server refused to save a watch position, or to read the account's positions. The position is kept on the phone and retried. | `send` or `read` | | e.g. `401`, `403`, `500` |

These are **not** reported:

- **A phone that is offline, or a request that runs out of time.** On a weak connection these are common, and they say nothing about the service.
- **Mistakes the person can fix**, like a wrong code, a wrong password or an address already in use.
- **Player failures.** The player rebuild handles its own.

The search function answers `503 unavailable` for every kind of failure, so an empty OpenAI balance looks the same as any other outage. The function's logs say which (Supabase → Edge Functions → `search` → Logs, look for `insufficient_quota`). To tell quota apart in Sentry, the function would have to return its own code, for example `{ "error": "quota" }`. The app already passes the function's code through as `failure.code`.

## What a report contains

The tags above plus the device, OS and app version. A report never includes a message, an email address, a name, a search or a page address. The app keeps only codes made of letters, digits and `_ . -`, and only real HTTP statuses. It removes breadcrumbs, request data, extra data and the user before sending (`src/lib/failureReports.ts`, tested in `tests/failure-reports.spec.ts`). This keeps the privacy policy's promise that reports carry no personal data or searches.

## How many are sent

Each phone sends at most **2 reports of each kind an hour**, and at most **10 in a session**. An hour-long search outage sends about 2 reports from each phone that searched, not one per failed search. Sentry groups them into **one issue per kind and code**, so the issue's event count shows roughly how many phones were affected.

To cap the total across all phones, set a rate limit on the project's key: Sentry → **Project Settings → Client Keys (DSN)** → the key → **Rate Limiting**, for example 300 events per hour. The cap covers crash reports too, so leave headroom above the usual weekly crash count.

## Setting up the alerts (owner)

Reports are sent only from **release builds** that have `EXPO_PUBLIC_SENTRY_DSN` set: the EAS `preview` and `production` environments. Development builds log them to the console instead, as `[failure report] {...}`.

1. Open the Sentry project and go to **Alerts → Create Alert**, then choose an **issue alert**.
2. **When:** *An event is captured* (sometimes labelled *A new event is captured*).
3. **If** (all of these):
   - *The event's tags match* `failure` **is in** `search_unavailable, search_over_quota, catalogue_sync, sign_in, progress_save`. Use *is set* instead if your Sentry doesn't offer *is in*.
   - *The issue is seen more than* `3` *times in* `1 hour`. This means several phones, or one phone over more than an hour, so a single blip doesn't page anyone.
4. **Then:** *Send a notification to* your email, or Slack if it's connected.
5. **Action interval:** *at most once every* `60 minutes`.
6. Name the rule `AAO: a service is failing` and save it. Use **Send Test Notification** in the rule editor to check that the email arrives.

If you want sooner warning for the parts that matter most, add a second rule for `search_unavailable` and `sign_in` alone, with *seen more than 1 time in 10 minutes*.

When an alert arrives, open the issue. The `failure.step`, `failure.code` and `failure.status` tags in the issue's tag summary show which request failed and how. Then check that service's own logs: Supabase → Edge Functions for search, Supabase → Logs for sign-in and the tables.

Sentry renames its menus from time to time, and this guide wasn't checked against the live site (its docs can't be reached from the build environment). The parts to look for are an issue alert, a tag filter on `failure` and a frequency filter.
