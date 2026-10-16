# Nightly sermon discovery

`scripts/nightly-sermons.mts` discovers uploads from a configured public YouTube channel and inserts videos that the AAO catalogue does not already contain. It uses YouTube Data API v3 and Supabase's REST API, with Node 24 from `.nvmrc` and no installed dependencies. It never reads a local manifest, captions, transcripts, the private Sermons archive, or `.env`.

New rows become available through the app's existing catalogue sync and title search. This job does **not** create semantic-search passages or embeddings, reviewed moments, blessings, path days, or teaching series. A parsed catalogue `series_key` groups titles; it does not create a curated teaching series in `paths`. Public metadata does not establish that a video is teaching or that its speaker/timestamps were reviewed.

## Setup and activation

After review, merge `.github/workflows/nightly-sermons.yml` to the repository's **default branch**. A PR into `claude/frontend-ux-pass` alone does not activate the nightly schedule. Nothing in this change configures secrets or starts a remote run.

Configure these in the repository's GitHub Actions settings:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `YOUTUBE_API_KEY` | API key for a Google Cloud project with YouTube Data API v3 enabled; restrict its API access to YouTube Data API v3. |
| Variable | `YOUTUBE_CHANNEL_ID` | The verified intended channel's `UC…` ID, not its handle or a playlist ID. No channel ID is guessed or supplied by the script. |
| Variable | `SUPABASE_URL` | Canonical `https://<project-ref>.supabase.co` project URL. Custom domains are intentionally rejected. |
| Secret | `SUPABASE_SECRET_KEY` | Server-only `sb_secret_…` key, or the project's legacy `service_role` JWT. A public/anon key is rejected. |

The privileged key stays in the workflow's import step. Never put it in an `EXPO_PUBLIC_` variable, app configuration, committed file, command-line argument, or log. Existing `public.sermons` and `public.series` migrations/grants must already be deployed. No new database schema is required.

The schedule is **08:37 UTC daily**: **4:37 a.m. Eastern during daylight saving time**, **3:37 a.m. Eastern during standard time**. `workflow_dispatch` allows an authorized maintainer to run it manually once the workflow is available. Scheduled GitHub Actions can be delayed, and GitHub may disable inactive public-repository schedules; monitor the Actions page. The workflow has read-only repository permissions, no checkout credentials, a single importer concurrency group, and a 10-minute job timeout. It does not run on pull requests or pushes.

## What gets imported

1. `channels.list(part=contentDetails,id=<configured channel>)` supplies the uploads playlist.
2. `playlistItems.list(part=contentDetails,maxResults=50)` follows every page, deduplicating video IDs. It does not stop at an existing sermon or use a date watermark.
3. In groups of 50, read only existing `youtube_id` values from Supabase. Fetch `videos.list(part=snippet,contentDetails,status)` only for missing IDs.
4. Accept videos belonging to the configured channel with `privacyStatus=public`, `embeddable=true`, `uploadStatus=processed`, `liveBroadcastContent=none`, a valid positive duration, and valid required metadata. Missing/deleted, private/unlisted, upcoming/live, not-yet-processed, and malformed entries are skipped. A finished livestream can be imported on a later night when eligible. There is no invented minimum duration or 3-hour catalogue limit; the separate path-day duration rule does not restrict the catalogue.
5. Parse titles with the app's existing `parseTitle` and `editorialHeadlines`, then insert missing catalogue series and sermons. `on_conflict` plus `Prefer: resolution=ignore-duplicates` makes the database ignore existing primary keys, including rows inserted concurrently after the existence check. Existing titles, hand-edited headlines, series names, thumbnails, and other metadata are never overwritten. Nothing is deleted.

“New” means absent from the catalogue: the first run can discover older eligible uploads the catalogue lacks. Every later run reconsiders skipped IDs, including delayed recordings and videos made public later. The job does not update existing videos' availability or metadata; that remains a separate editorial/maintenance process. YouTube's public/embeddable metadata also cannot guarantee playback in every viewer's region or account context.

## Bounds, errors, and recovery

All discovery and validation finish before inserts begin. The hard limit is **100 playlist pages / at most 5,000 IDs**. A remaining page token at the limit fails the run before any write; increase the reviewed constant and quota/time budget when the channel outgrows it. A repeated page token or malformed API response fails clearly. It does not silently import only the first pages forever.

Each YouTube list method used costs 1 quota unit. With 2,850 playlist entries, a typical unchanged run is approximately **58 units** (1 channel + 57 playlist pages); missing IDs add up to one video-details call per 50-entry batch. At the 100-page bound, at most **201 YouTube calls before retries**, or **603 attempts** including retries, are possible. This is a request-count ceiling, not a promise about an account's available daily quota. No expensive `search.list` calls are made. The scan performs at most 100 existing-ID REST reads before retries; writes occur in batches of 50 only when candidates exist.

Every request has a 15-second deadline covering its JSON body; the whole import has an 8-minute deadline. Network errors/timeouts and HTTP 429/500/502/503/504 get at most three attempts, with 0.5/1-second backoff or numeric Retry-After capped at 5 seconds. Other HTTP errors, including API-key/quota HTTP 403 failures, stop without retrying. Exhausted retries exit nonzero. Redirects are rejected so credentials cannot be forwarded to another host.

Logs contain aggregate counts and sanitized service/status errors, never credentials, request URLs, raw API errors, titles, descriptions, or full data payloads. `skipped` includes invalid playlist entries and ineligible video records; `unavailable` counts requested video IDs omitted from `videos.list`. Confirmed insert counts come from returned rows. If a write commits but its response is lost, a retry safely ignores the duplicate, so the confirmed count can understate what that run inserted.

Insert batches are separate transactions. A failure after writes start may leave valid partial progress or an unused new series row. No rollback deletes data: rerun after fixing the failure. Duplicate protection makes reruns safe and existing editorial rows stay untouched. Do not run the older manifest importer as a recovery shortcut; it has update/delete behavior this job deliberately does not use.

## Local checks without services

Tests inject mock fetch responses and exercise real importer code. They never require credentials or contact YouTube/Supabase. From a checkout with development dependencies installed:

```sh
EXPO_BASE_URL=http://127.0.0.1:1 npx playwright test tests/nightly-sermons.spec.ts
```

Importing the module is side-effect-free; only direct execution starts the CLI. Running `node scripts/nightly-sermons.mts` with the four required environment values **does write** new rows; this is an operational command, not a dry run. No live import was performed while developing this change.

## API references

- [YouTube channels.list](https://developers.google.com/youtube/v3/docs/channels/list): uploads-playlist lookup and 1-unit cost.
- [YouTube playlistItems.list](https://developers.google.com/youtube/v3/docs/playlistItems/list): page tokens, 50-item pages, 1-unit cost.
- [YouTube videos.list](https://developers.google.com/youtube/v3/docs/videos/list) and [video resource](https://developers.google.com/youtube/v3/docs/videos): metadata/status fields, duration, privacy, embedding, and live-state checks.
- [PostgREST upsert](https://docs.postgrest.org/en/v14/references/api/tables_views.html#upsert): primary-key conflict handling and `resolution=ignore-duplicates`.
- [Supabase API keys](https://supabase.com/docs/guides/api/api-keys): server-only secret keys and legacy service-role keys.
- [GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule): default-branch execution, UTC schedules, and delay/inactivity behavior.
