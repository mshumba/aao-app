# Edge Functions: need-based search and quotes

Two Supabase Edge Functions (Deno) behind "What are you going through?". The app calls them from
`src/learning/client.ts`.

| Function | Does                                                                                   | Calls OpenAI                                                               |
| -------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `search` | Finds sermon moments by meaning for a question of 1–200 characters.                    | A small chat model reads the question; `text-embedding-3-large` embeds it. |
| `quotes` | Picks a clean verbatim quote for each moment `search` returned without one (up to 14). | One batched chat call for the passages not yet cached.                     |

A third function, `apple-tokens`, keeps Sign in with Apple refresh tokens and revokes them when an account is
deleted. It doesn't call OpenAI; its secrets, deployment and requests are in
[Apple token revocation](../../docs/development/apple-token-revocation.md).

Both functions need the tables and SQL functions from `migrations/20261015000000_need_search.sql` and the index from
`migrations/20261015000300_passages_hnsw.sql`. `search` also needs `migrations/20261015000600_search_polish.sql`
(`needs.query`/`related`, hidden passages, `search_start()`, the clean-up job) and reads `paths`/`path_days`
(`20261015000100_paths.sql`, with `kind` from `20261015001000_teaching_series.sql`).

## Files

- `search/index.ts`, `quotes/index.ts`: the two entry points.
- `quotes/pick.ts`: the quote model task (a quote and a backup per passage).
- `_shared/http.ts`: CORS, the publishable-key check, JSON responses.
- `_shared/auth.ts`: who is calling, for rate limits (user id from a valid session token, else a keyed hash of the IP).
- `_shared/db.ts`: the service-role client, the `search_rate_ok()` wrapper (used by `quotes`) and `withRetry()`, which
  retries a database call once after a connection error or timeout.
- `_shared/openai.ts`: embeddings and JSON-schema chat calls, with hard timeouts; a chat answer can be streamed, and
  `embedHedged()` sends a second embedding request when the first is slow.
- `_shared/prompts.ts`: the search model task and how its answer is cleaned, the distress (`CARE`) pattern and the fixed
  comfort phrasing used with it, and `normalise()`, how a search is compared and keyed.
- `_shared/verbatim.ts` (+ `verbatim_test.ts`): the clean-verbatim quote rule, building a quote from the model's pick,
  and caption timing. `verbatim_cases.json` holds the cases shared with the transcript pipeline's Python port and
  `public.is_clean_verbatim()` in SQL.
- `deno.json`: local tooling only (no lock file, no `node_modules`, lint and format settings). It isn't needed to
  deploy.

## The OpenAI key

The key lives only in Supabase as the Edge Function secret `OPENAI_API_KEY`. Never put it in the app, in an
`EXPO_PUBLIC_` variable, or in source.

To set or rotate it, use **Dashboard → Edge Functions → Secrets** (or
`supabase secrets set OPENAI_API_KEY=… --project-ref tkyzinjphxjwhfagoypm`). Functions pick up a new value without
redeploying.

Optional secrets:

- `SEARCH_MODEL`: the model that reads the question. Default `gpt-5.4-nano`.
- `QUOTES_MODEL`: the model that picks quotes. Default `gpt-5.4-mini`, which is more faithful to the captions than nano.
- `SEARCH_GLOBAL_PER_HOUR`: uncached searches allowed per hour across all callers. Default 300.
- `QUOTES_GLOBAL_PER_HOUR`: `quotes` calls that need the model, per hour across all callers. Default 30 (not set as a
  secret).

Supabase provides `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS` (or the legacy `SUPABASE_ANON_KEY`
/ `SUPABASE_SERVICE_ROLE_KEY`) and `SUPABASE_JWKS` automatically.

## Deploy

The project uses `sb_publishable_…` keys, which aren't JWTs, so the platform's JWT check must be off. Each function
checks instead that the `apikey` header is one of the project's publishable keys (or the legacy anon key), and answers
401 otherwise.

With the Supabase CLI, from the app folder:

```sh
npx supabase functions deploy search --project-ref tkyzinjphxjwhfagoypm --no-verify-jwt
npx supabase functions deploy quotes --project-ref tkyzinjphxjwhfagoypm --no-verify-jwt
```

The CLI bundles `_shared/` automatically. Without the CLI, the Management API endpoint
`POST /v1/projects/{ref}/functions/deploy?slug=<name>` takes the same files as multipart form data. Send them with paths
such as `supabase/functions/search/index.ts` and `supabase/functions/_shared/http.ts`, plus `metadata` set to
`{"name":"search","entrypoint_path":"supabase/functions/search/index.ts","verify_jwt":false}`. Authenticate with a
personal access token.

Check locally before deploying:

```sh
cd supabase/functions
deno check search/index.ts quotes/index.ts
deno lint
deno test --allow-env --allow-read _shared/
```

## Requests

Send `apikey: <publishable key>` and `Authorization: Bearer <user access token, or the publishable key for guests>`.

**search.** `POST /functions/v1/search` with body `{"q": "I keep going back to the same sin"}`. The response:

```
{
  "query": "...",
  "understood": { "theme": "breaking a habit of sin", "related": ["Temptation", "Shame after falling", "Self-control"] },
  "path": { "id": "breaking-free-from-habitual-sin", "name": "...", "italic": "habitual sin", "days": 6, "status": "draft" } | null,
  "care": false,
  "moments": [ { "id": "1882", "youtubeId": "...", "at": 3834.38, "end": 3889.45, "quote": null | "...", "excerpt": "...", "score": 0.474, "sermon": { ... } } ],
  "sermons": [ { ...sermon, "moments": 3 } ],
  "total": { "moments": 79, "sermons": 58 },
  "cached": false,
  "tookMs": 1356
}
```

It returns at most 14 moments, at most 2 per sermon, and at most 10 sermons.

Added on 15 October 2026 (older app builds can ignore both):

- `care`: `true` when the person says they want to die, don't want to live, or are thinking of suicide or self-harm (the
  model's flag or the `CARE` pattern in `_shared/prompts.ts`); otherwise `false`. The app should show crisis help (a
  person to talk to now) above the moments, and no path is offered. A `care` search answers `200` even when nothing
  could be searched, with `moments: []`, so the help still shows.
- `path.status`: `"draft"` or `"published"`, from `paths.status`. The app labels drafts.

Errors:

- `400 {"error":"bad_query"}`: the question is empty or longer than 200 characters.
- `401 {"error":"unauthorized"}`: no publishable key on `apikey`.
- `403 {"error":"origin_not_allowed"}`: the request came from a browser origin that isn't allowed.
- `429 {"error":"rate_limited","retryAfter":N}`: the caller is over the limit. A `Retry-After` header is sent too.
- `503 {"error":"unavailable"}`: search can't run right now (after one retry of the database call that failed).

How it works:

1. One database call, `search_start()`, reads the cache and, on a miss, checks the rate limits. The published needs and
   the guided paths (`kind = 'path'`; teaching series aren't offered) load at the same time.
   - The cache holds answers for 24 hours, keyed on a SHA-256 hash of the question in lower case without punctuation
     (`search:v4:<hash>`); the stored answer leaves out the question. A cache hit doesn't count towards the rate limit,
     and quotes found after the answer was cached are added on the way out.
   - Each caller gets 20 uncached searches per 5 minutes: per user id when the session token verifies against the
     project's signing keys, otherwise per IP. `search_hits` stores only an HMAC of the IP. All callers together get 300
     uncached searches an hour (`SEARCH_GLOBAL_PER_HOUR`); that shared ceiling is checked only after the caller's own
     limit, so one caller's refused calls can't use it up.
2. **Need chips.** When the question is a published need's label or short name ("I'm struggling with fear", "Fear"),
   compared after `normalise()`, and the need has a `needs.query`, no chat model is used. The fixed teaching phrase and
   the need's label are embedded in one call (started as soon as the needs load) and both are searched. The theme is
   `needs.theme`, `related` is the short names of `needs.related` (3 need ids, in order), and `path` is the first guided
   path whose `paths.needs` holds the need. The same chip always gets the same answer.
3. **Anything else.** Two steps run in parallel, each with a hard timeout:
   - The chat model (4.5 s, streamed) returns `{theme, teaching_query, related, path_id, care}`. `path_id` must be the
     id of a guided path. `related` must be 3 `short` names from the published `needs` (each shown to the model with its
     label); the need whose label or short name is the search itself is left out, so a chip never repeats the search.
   - The question as typed is embedded (`text-embedding-3-large`, 768 dimensions, 4 s) and searched with
     `match_passages`.
   - As soon as `teaching_query` has streamed in (it comes second, before the related needs and path), it is embedded
     and searched too. The lists are fused by reciprocal rank (k = 60). A row found only by the question as typed with a
     score under 0.47 ranks after every row the teaching phrasing found (these were mostly passages that share the
     question's words without teaching on it).
4. `care`: when the `CARE` pattern matches what was typed, the question as typed is never searched; the fixed comfort
   phrasing `CARE_QUERY` is searched instead, alongside the model's teaching phrasing (which the model words about God's
   comfort and hope, avoiding depression, suicide, die and death). When only the model sees distress, the question's
   list is dropped, and if the model's phrasing failed, `CARE_QUERY` is searched. If the model is unavailable, the theme
   is "finding hope and comfort in God" and the related needs are Discouragement, God's presence and Rejection. No path
   is offered. The question as typed found sermons that speak of depression harshly ("a believer cannot be depressed").
5. `match_passages` skips passages with `passages.hidden_from_search` and returns each row's twins, sermon and cached
   quote. Twins are collapsed, and a sermon gets at most 2 moments, which can't overlap.
6. `at` is the cached quote's start when there is one. Otherwise it is 3 s before the excerpt, never before the passage
   start.
7. If the chat model fails or times out (and there is no distress), search answers from the question alone. The theme is
   the question, `related` is `[]` and `path` is `null`, and that answer isn't cached. Nor is an answer where any search
   failed.
8. Database calls that fail with a connection error, a timeout, a 502-504 from the gateway, `PGRST000`-`PGRST003` or a
   Postgres start-up/shut-down code are retried once after 0.4-0.7 s (`withRetry` in `_shared/db.ts`), so a brief
   connection drop, or the end of a database restart, doesn't reach the app as a 503. A longer outage still does.
   Retries are named in the log line (`retries`). An embedding request that hasn't answered after 1 s, or fails with a
   timeout or a 5xx, is sent once more (`embedHedged`).

**Privacy.** `search_cache` rows hold the answers (theme, moments) to what people typed, but not the question; they are
deleted after 24 hours. `search_hits` rows (user ids and IP hashes) are deleted after an hour, the longest rate-limit
window. Both by `public.search_cleanup()`, which `pg_cron` runs every 15 minutes (job `search-cleanup`). The question
itself still goes to OpenAI (chat model and embeddings) for every uncached search that isn't a need chip.

**Hiding a passage from search.**
`update public.passages set hidden_from_search = true, hidden_note = '<why>' where id
= <id>;` and `false` to undo. A
trigger empties `search_cache` when the flag changes, so the next search reflects it. Hidden on 15 October 2026 from the
search judge's report: 50685 ("illegal grief", shown to the bereaved) and 139549 (a warning about delaying children,
shown to couples waiting for a child).

**Need phrases.** `needs.query` (the fixed teaching phrase, 20-300 characters) and `needs.related` (up to 3 need ids)
were written in `20261015000600_search_polish.sql` for all 36 needs. Edit them with SQL; a need whose `query` is null
goes to the chat model like any other search. `supabase/seed/needs.sql` doesn't set them, so a database rebuilt from the
seed needs that migration's update run again after seeding.

**quotes.** `POST /functions/v1/quotes` with body `{"ids": ["1882", "18057"]}`. The response is
`{"quotes": {"1882": {"quote": "...", "at": 3777.69}, "18057": null}}`. An optional `"q"` from older app builds is still
accepted (and refused when over 200 characters) but ignored: a passage's quote is cached once and shown for every
search, so it is chosen without the search text and no caller can steer what is stored.

The quote rule (clean verbatim, approved 15 October 2026): a contiguous run of the passage's caption words with capitals
and punctuation added, where only filler sounds (uh, um, er, erm, ah, hmm, mm) and an immediate repeat of 1-3 words may
be left out. No word is changed, added or reordered, and a suspected caption mistake is never corrected (another stretch
is chosen). A quote is 8-45 words and ends a sentence. A repeat said on purpose stays (`isStutter`, migration
`20261015000700_clean_verbatim_fix.sql`): a 2-3 word repeat goes only when it restarts on a small word ("we are we
are"); "very very", "no no", "had had", a word that isn't small said three times ("holy holy holy") and "that that"
before a noun ("that that deliverance") always stay. The model may not leave them out either: such a sentence is not
used.

1. Cached rows in `passage_quotes` are returned first.
2. The rest go to one batched chat call (`quotes/pick.ts`, 20 s timeout). For each passage the model gives a quote and a
   backup from another stretch, and says whether each is clear (every word correct, makes sense on its own); an unclear
   one is not used.
3. Each pick is rebuilt in code (`buildQuote` in `_shared/verbatim.ts`):
   - Its words are aligned with the caption words. The stretch is rebuilt from the caption tokens with the model's
     capitals and punctuation, leaving out fillers and stutters (`isStutter`: a 2-3 word repeat only when it restarts on
     a small word such as "it's a it's a"; "what is passed is passed" stays).
   - A sentence where the model changed, added or left out a real word, or whose opening words don't match, is not used;
     nor is a sentence across a caption pause of more than 3 s between words (music, a long break).
   - The result is the whole pick, or else its longest run of whole sentences that is 8-45 words, ends a sentence, does
     not end on a word like "of", "the" or "I've", and has no broken one- or two-letter word ("li", "St").
   - The first pick that passes is used, and the word rule is checked once more (`matchClean`).
4. The `passage_quotes` trigger checks the words again in the database (`public.is_clean_verbatim()`).
5. `at` is 3 s before the quote's first word, using the caption-line timings (`seg_words`/`seg_times`, the same formula
   as `public.passage_word_time()`). Only 0 limits it: a quote that opens its passage still gets its lead-in from before
   the passage.
6. A passage with no passing quote is stored as `null`, so it isn't sent to the model again, and the app shows the
   excerpt. If the model call itself fails, nothing is stored and the next call retries.
7. Each caller gets 20 calls per 5 minutes that need the model, and all callers together get 30 an hour
   (`QUOTES_GLOBAL_PER_HOUR`). Calls answered fully from the cache are free.

## CORS

These origins are allowed:

- `http://localhost:<port>`, `http://127.0.0.1:<port>` and `http://[::1]:<port>`
- `https://aaolearning.com` and `https://www.aaolearning.com`
- `https://aao-app.expo.app` and this project's EAS Hosting previews and aliases,
  `https://aao-app--<id or alias>.expo.app` (other `*.expo.app` sites are other people's projects and are refused)
- Native apps, which send no `Origin` header

Other origins get 403. To add an origin, edit `ALLOWED_ORIGINS` in `_shared/http.ts` and redeploy both functions.

## Cost

These are approximate OpenAI list prices, October 2026.

- **An uncached search:** one `gpt-5.4-nano` call (about 1,480 tokens in with the needs list, 60 out) and two short
  embeddings. That's about $0.0004.
- **An uncached need chip:** two short embeddings and no chat call, about $0.000004.
- **A `quotes` batch of 14 new passages:** one `gpt-5.4-mini` call (about 6,000 tokens in, 800 out with the backups).
  That's about $0.008, or about $0.0006 a passage.
- **Repeats:** each passage is sent to the model at most once, and repeated searches are served from the cache.

## Speed

Measured from a Mac on the US east coast on 15 October 2026, on Medium compute, with the function running in us-east-1
(the database's region). Server time is `tookMs`; the Mac adds about 0.3 s. Before is `search` v8 and after is v14, on
the same 10 new typed questions; need chips are the 72 labels and short names.

| Request                  | Server p50 before | Server p50 after | Range after |
| ------------------------ | ----------------- | ---------------- | ----------- |
| Typed question, uncached | 1.81 s            | 1.27 s           | 1.17–2.05 s |
| Need chip, uncached      | 1.81 s            | 0.6–0.8 s        | 0.55–3.7 s  |
| Cached (typed or chip)   | 0.22–0.42 s       | 0.12 s           | 0.11–0.35 s |

Where an uncached typed search's time goes now:

- `search_start()`, with the needs and paths loading in parallel: about 0.15 s.
- The chat model, until `teaching_query` has streamed in: about 0.65–0.75 s more. The rest of its answer, about 0.2 s,
  overlaps the next step.
- Embedding and searching the teaching phrasing: about 0.25–0.45 s.

A need chip takes 0.15 s, then its embedding (usually 0.2–0.5 s), then two `match_passages` calls in parallel (about
0.25 s). One `match_passages` call takes 40–110 ms in the database; each call through the API gateway adds about 0.1 s.

OpenAI's embedding latency has a long tail. Between 20:08 and 20:16 UTC on 15 October, embeddings took 1–3.5 s, and 6 of
57 chips timed out at 4 s and answered 503. Since then a second embedding request goes out after 1 s (`embedHedged`).

The function runs in the Supabase region nearest the caller. Forced to eu-west-2, a cached search took 0.37–0.46 s on
the server instead of 0.12–0.14 s, because every database call crosses the Atlantic. Callers far from us-east-1, such as
in Nigeria, would be faster if the app sent the `x-region: us-east-1` header with `search` and `quotes`.

## Logs

Each request logs one JSON line: timings per step (`ms_start`, then `steps`: `teaching` is when the teaching phrasing
streamed in), token counts, row counts, the need id for a chip, `care`, retried calls and errors. Question text and IPs
are never logged. View them in **Dashboard → Edge Functions → Logs**.
