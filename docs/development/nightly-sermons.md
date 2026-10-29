# Nightly sermon discovery

`scripts/nightly-sermons.mts` discovers public uploads from the approved Apostle Arome Osayi channel, `UCh6Sn6v_mdhwWTEpNvo5A4A`, and inserts eligible videos absent from the AAO catalogue. It uses YouTube Data API v3 and Supabase REST, with Node 24 from `.nvmrc` and no installed dependencies. It never reads a local manifest, captions, transcripts, the private Sermons archive, or `.env`.

This is **metadata-only ingestion**. New rows reach catalogue browsing and title search through the existing app sync. It does not populate semantic-search passages or embeddings, approved moments, blessings, path days, or curated teaching series. A parsed catalogue `series_key` groups titles; it does not create a teaching series in `paths`. Public metadata does not verify a speaker, teaching segment, quote, or timestamp.

## Protected setup

The workflow must reach **`main`, the default branch**, before activation. A PR into `claude/frontend-ux-pass` alone does not activate it. The job rejects every ref except `refs/heads/main`, including tags and manual dispatches of other branches. Scheduled imports additionally require the repository variable `NIGHTLY_SERMON_IMPORT_ENABLED` to equal `true`; leave it absent or `false` during setup. Manual dry runs and manual applies remain available while the schedule is off.

In repository **Settings → Environments**, use the `catalogue-import` Environment. Under **Deployment branches and tags**, choose **Selected branches and tags**, with exactly one rule: **branch** named `main`. Add no tag rules and no wildcard rules. Do not choose “Protected branches only”: the intended policy is this one named branch, regardless of other protected branches. These restrictions are separate from the workflow's ref guard and protect the Environment secrets from workflows on other refs. At the 16 October 2026 setup checkpoint, this empty Environment and its main-branch-only policy were configured; credentials had not been added and no import had run. Verify that policy again before adding keys.

Configure the following values. The schedule flag belongs at **repository** scope because the job's `if` condition is evaluated before Environment variables become available.

| Scope and kind | Name | Value |
| --- | --- | --- |
| Repository Actions variable | `NIGHTLY_SERMON_IMPORT_ENABLED` | Absent or `false` until the owner completes activation below; `true` permits scheduled applies. |
| `catalogue-import` Environment secret | `YOUTUBE_API_KEY` | Key for a Google Cloud project with YouTube Data API v3 enabled; restrict API access to YouTube Data API v3. |
| `catalogue-import` Environment variable | `YOUTUBE_CHANNEL_ID` | `UCh6Sn6v_mdhwWTEpNvo5A4A`, the approved channel ID. |
| `catalogue-import` Environment variable | `SUPABASE_URL` | Canonical `https://<project-ref>.supabase.co` URL; custom domains are rejected. |
| `catalogue-import` Environment secret | `SUPABASE_SECRET_KEY` | Dedicated server-only `sb_secret_…` key created for this importer, independently revocable. Legacy `service_role` JWTs and public/anon keys are rejected. |

Store these two secrets **only in this Environment**, not as repository or organization secrets. Remove any broader copies before use. The privileged Supabase key bypasses row-level security; the dedicated key limits rotation impact, not database privileges. Existing `public.sermons` and `public.series` migrations/grants must already be deployed; this job needs no new schema. Secrets are exposed only to the import step, never checkout/setup or ordinary PR/push CI. Never put them in `EXPO_PUBLIC_` variables, app configuration, committed files, CLI arguments, or logs.

## First activation and routine use

1. Keep the schedule flag absent or `false`. After the workflow reaches `main` and the protected Environment has its settings, open **Actions → Nightly sermon discovery → Run workflow**, select `main`, and keep **dry_run=true** and **allow_backlog=false** (the workflow's defaults).
2. Review candidate public YouTube IDs, durations, excluded/clips/unavailable counts, and any errors. A dry run writes no series or sermons and reports the complete candidate list even when more than 25 are eligible. Resolve unexpected candidates through the exclusion list below.
3. Run manually on `main` with **dry_run=false** to apply the reviewed import. More than 25 candidates fails before writes unless **allow_backlog=true** is explicitly selected for a reviewed backlog. Each run scans again, so inspect its final output too. A backlog exception does not bypass filters, exclusions, scan limits, or deadlines.
4. After that explicit manual apply succeeds, the owner may set the **repository** variable `NIGHTLY_SERMON_IMPORT_ENABLED=true`. Scheduled runs then apply with the 25-candidate cap; they never enable `allow_backlog`. Set the flag back to `false` to stop future scheduled imports. It does not cancel a job already running.

The schedule is **08:37 UTC daily**: **4:37 a.m. Eastern during daylight saving time**, **3:37 a.m. Eastern during standard time**. GitHub may delay or drop scheduled runs under load and may disable schedules in inactive public repositories; check the Actions page. The job uses read-only repository permissions, pinned checkout/setup actions, no checkout credentials, one importer concurrency group, and a 10-minute timeout. It installs no dependencies and does not run on PRs or pushes. The Node command suppresses only `MODULE_TYPELESS_PACKAGE_JSON`, preserving other warnings.

## What gets imported

1. `channels.list(part=contentDetails,id=<configured channel>)` supplies the uploads playlist.
2. `playlistItems.list(part=contentDetails,maxResults=50)` follows every page and deduplicates IDs. It does not stop at an existing sermon or use a date watermark.
3. Check `src/catalogue/importExclusions.ts`, an ID-to-reason map, before importing. It starts empty until exclusions are approved. To keep an editorially removed video out, add its public YouTube ID and reason through review before the next apply. Deleting a database row alone does not prevent rediscovery; adding an exclusion does not itself delete an existing row.
4. In groups of 50, read existing `youtube_id` values from Supabase, then request `videos.list(part=snippet,contentDetails,status)` only for missing IDs.
5. Accept only the configured channel's public, embeddable, processed, non-live videos, with valid required metadata, no YouTube age restriction, and a duration of **at least 20 minutes** (`MIN_SERMON_SECONDS`, 1,200 seconds). Every sermon in the library runs at least that long (the shortest was 20 minutes 3 seconds when the rule was set, 29 October 2026); the channel's shorter uploads are clips, prayer snippets and mission reports (238 of them on that day's dry run). The rule doesn't claim every accepted upload is a sermon: review the dry run and exclude any that aren't. There is **no three-hour catalogue cap**. The separate path-day rule does not restrict catalogue ingestion. Missing/deleted, private/unlisted, upcoming/live, unprocessed, age-restricted and malformed entries are skipped. A finished livestream can qualify later.
6. Build rows through `scripts/catalogue-rows.ts`, shared with the manifest importer: trim titles and descriptions (empty descriptions become `null`), use `parseTitle` and `editorialHeadlines`, and select the most common candidate wording for each new series, with newest-date tie-breaking. Insert missing series and sermons using `on_conflict` and `Prefer: resolution=ignore-duplicates`. Concurrent inserts are ignored at the primary key. Existing titles, editorial headlines, series names, thumbnails and other metadata are never overwritten; nothing is deleted.

“New” means absent from the catalogue, so a first run may find older uploads. Each later run reconsiders skipped IDs, including recordings made public later, unless excluded. The job does not maintain existing rows' availability or metadata. Public/embeddable status cannot guarantee playback for every viewer's region or account.

## Bounds, failures, and recovery

Discovery and candidate validation finish before writes. The default **25-candidate apply cap** fails before any insert unless the operator explicitly supplies `--allow-backlog`. Dry runs report candidates above the cap without writing. The full playlist scan has a separate hard limit of **100 pages / at most 5,000 IDs**. If another page remains, or a page token repeats, the run fails before writes. This finite bound may need review for the real channel; the existing catalogue's roughly 2,850 rows are **not a measured upload count**, and no live channel-size claim is made here.

Each YouTube list method used costs one quota unit. For a completed scan of `P` playlist pages and `M` missing-ID detail batches, the base cost is **1 + P + M units**, before retries. As a hypothetical example only, 2,850 playlist entries would take 57 pages and cost about 58 units with nothing missing, plus one unit per detail batch. At the 100-page bound, at most **201 YouTube requests before retries / 603 attempts with retries** are possible. This is a request-count ceiling, not a guarantee of available quota. No `search.list` calls are made. There are at most 100 existing-ID REST reads before retries; writes normally use batches of 50, with extra individual requests if a batch receives HTTP 400.

Every request has a 15-second deadline covering its JSON body, and the import has an 8-minute deadline. Network failures/timeouts and HTTP 429/500/502/503/504 receive at most three attempts with 0.5/1-second backoff, or numeric `Retry-After` capped at five seconds. Other HTTP failures, including YouTube quota/key HTTP 403 errors, are not retried. Redirects are rejected so credentials cannot be forwarded to another host.

If an insert batch receives HTTP 400, the importer isolates its rows, logs rejected public IDs, continues with valid rows, and still exits nonzero so the failure is visible. Other exhausted errors stop the run. Batches are separate transactions: an error after writes begin may leave valid partial progress or an unused series row. No rollback deletes data. Correct the cause and rerun; duplicate protection preserves existing rows. Do not use the older full manifest importer as a recovery shortcut: it has update/delete behavior this job does not use.

Logs contain counts, public candidate IDs with durations, attempted/confirmed inserted/rejected IDs and series keys, and sanitized service/status errors. They do not contain credentials, request URLs, raw API errors, titles, descriptions, or full payloads. Confirmed insert counts come from returned rows. If a write commits but its response is lost, a safe retry ignores the duplicate; confirmed counts/IDs can therefore understate that run's actual inserts.

## Local checks without services

The importer tests inject mock fetch responses; workflow tests parse the real YAML and execute its argument-building shell with a mock Node command. They need no credentials and contact no live services. From a checkout with development dependencies already installed:

```sh
EXPO_BASE_URL=http://127.0.0.1:1 npx playwright test tests/nightly-sermons.spec.ts tests/nightly-workflow.spec.ts
```

Importing the module is side-effect-free. Direct execution defaults to dry-run; `--apply` is required to write, and `--dry-run` makes the read-only choice explicit. `--allow-backlog` only overrides the candidate cap. The CLI requires the four service configuration values even for a dry run, because it reads current YouTube metadata and existing database IDs. Do not use real credentials for automated tests. No live import or dry-run service call was performed while developing these changes.

## References

- [YouTube channels.list](https://developers.google.com/youtube/v3/docs/channels/list), [playlistItems.list](https://developers.google.com/youtube/v3/docs/playlistItems/list), [videos.list](https://developers.google.com/youtube/v3/docs/videos/list), and [video resource](https://developers.google.com/youtube/v3/docs/videos): pagination, costs, metadata and eligibility fields.
- [PostgREST upsert](https://docs.postgrest.org/en/v14/references/api/tables_views.html#upsert) and [Supabase API keys](https://supabase.com/docs/guides/api/api-keys): conflict-ignore inserts and dedicated server-only keys.
- [GitHub Environment setup](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), and [scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule): deployment branch/tag rules, Boolean inputs, and default-branch scheduling.
- [Node warning selection](https://nodejs.org/api/cli.html#--disable-warningcode-or-type): suppress a single warning code.
