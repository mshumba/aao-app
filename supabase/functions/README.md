# Edge Functions: need-based search and quotes

Two Supabase Edge Functions (Deno) behind "What are you going through?". The app calls them from
`src/learning/client.ts`.

| Function | Does                                                                                      | Calls OpenAI                                                               |
| -------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `search` | Finds sermon moments by meaning for a question of 1–200 characters.                       | A small chat model reads the question; `text-embedding-3-large` embeds it. |
| `quotes` | Picks a verbatim quote for each moment `search` returned without one (up to 14 per call). | One batched chat call for the passages not yet cached.                     |

Both functions need the tables and SQL functions from `migrations/20261015000000_need_search.sql` and the index from
`migrations/20261015000300_passages_hnsw.sql`. `search` also reads `paths`/`path_days` (`20261015000100_paths.sql`).

## Files

- `search/index.ts`, `quotes/index.ts`: the two entry points.
- `_shared/http.ts`: CORS, the publishable-key check, JSON responses.
- `_shared/auth.ts`: who is calling, for rate limits (user id from a valid session token, else a keyed hash of the IP).
- `_shared/db.ts`: the service-role client and the `search_rate_ok()` wrapper.
- `_shared/openai.ts`: embeddings and JSON-schema chat calls, with hard timeouts.
- `_shared/prompts.ts`: the two model tasks and how their answers are cleaned.
- `_shared/verbatim.ts` (+ `verbatim_test.ts`): the verbatim-quote check and caption timing.
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
- `QUOTES_GLOBAL_PER_HOUR`: `quotes` calls that need the model, per hour across all callers. Default 120.

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
deno test _shared/verbatim_test.ts
```

## Requests

Send `apikey: <publishable key>` and `Authorization: Bearer <user access token, or the publishable key for guests>`.

**search.** `POST /functions/v1/search` with body `{"q": "I keep going back to the same sin"}`. The response:

```
{
  "query": "...",
  "understood": { "theme": "breaking free from habitual sin", "related": ["Shame", "Repentance", "Self-Control"] },
  "path": { "id": "breaking-free-from-habitual-sin", "name": "...", "italic": "habitual sin", "days": 6 } | null,
  "moments": [ { "id": "1882", "youtubeId": "...", "at": 3834.38, "end": 3889.45, "quote": null | "...", "excerpt": "...", "score": 0.474, "sermon": { ... } } ],
  "sermons": [ { ...sermon, "moments": 3 } ],
  "total": { "moments": 79, "sermons": 58 },
  "cached": false,
  "tookMs": 2337
}
```

It returns at most 14 moments, at most 2 per sermon, and at most 10 sermons.

Errors:

- `400 {"error":"bad_query"}`: the question is empty or longer than 200 characters.
- `401 {"error":"unauthorized"}`: no publishable key on `apikey`.
- `403 {"error":"origin_not_allowed"}`: the request came from a browser origin that isn't allowed.
- `429 {"error":"rate_limited","retryAfter":N}`: the caller is over the limit. A `Retry-After` header is sent too.
- `503 {"error":"unavailable"}`: search can't run right now.

How it works:

1. Answers come from `search_cache` for 24 hours, keyed on the question in lower case without punctuation. A cache hit
   doesn't count towards the rate limit. Quotes found after the answer was cached are added on the way out.
2. Each caller gets 20 uncached searches per 5 minutes: per user id when the session token verifies against the
   project's signing keys, otherwise per IP. `search_hits` stores only an HMAC of the IP. All callers together get 300
   uncached searches an hour (`SEARCH_GLOBAL_PER_HOUR`); that shared ceiling is checked only after the caller's own
   limit, so one caller's refused calls can't use it up.
3. Two steps run in parallel, each with a hard timeout:
   - The chat model (4.5 s) returns `{theme, teaching_query, related, path_id, care}`. `path_id` must be the id of a row
     in `paths`. `related` must be 3 `short` names from the published `needs` (each shown to the model with its label);
     the need whose label or short name is the search itself is left out, so a chip never repeats the search.
   - The question as typed is embedded (`text-embedding-3-large`, 768 dimensions, 4 s) and searched with
     `match_passages`.
4. When the chat model answers, its `teaching_query` is embedded and searched too. The two lists are fused by reciprocal
   rank (k = 60). A row found only by the question as typed with a score under 0.47 ranks after every row the teaching
   phrasing found (these were mostly passages that share the question's words without teaching on it).
5. `care`: when someone says they want to die or harm themselves (the model's flag, or the `CARE` pattern in
   `_shared/prompts.ts`), the teaching phrasing is about God's comfort and hope and avoids the words depression,
   suicide, die and death; only that list is used and no path is offered. The question as typed found sermons that speak
   of depression harshly ("a believer cannot be depressed"). The app should still show crisis help for these searches.
6. Twins are collapsed using `passages.twins`. A sermon gets at most 2 moments, and they can't overlap.
7. Rows whose sermon has left `public.sermons` are dropped by `match_passages`' join.
8. `at` is the cached quote's start when there is one. Otherwise it is 3 s before the excerpt, never before the passage
   start.
9. If the chat model fails or times out, search answers from the question alone. The theme is the question, `related` is
   `[]` and `path` is `null`, and that answer isn't cached.

**quotes.** `POST /functions/v1/quotes` with body `{"ids": ["1882", "18057"], "q": "optional question"}`. The response
is `{"quotes": {"1882": {"quote": "...", "at": 3777.69}, "18057": null}}`.

1. Cached rows in `passage_quotes` are returned first.
2. The rest go to one batched chat call (20 s timeout). It asks for 1–2 sentences, at most 45 words, from that passage
   only, with only capitals and punctuation added.
3. Each answer is checked in code (`_shared/verbatim.ts`):
   - Lowercase both sides and drop punctuation, the same way as `public.verbatim_words()`. The quote must then be a
     contiguous run of the passage's caption words, 5–45 words long.
   - No ellipses, brackets or symbols are allowed.
   - If the model changed a word (for example, corrected a caption mistake), the same stretch is rebuilt from the
     caption's own words, keeping the model's punctuation. If that doesn't pass, its longest run of whole verbatim
     sentences is used.
   - The result must pass the check again.
4. The `passage_quotes` trigger checks it once more in the database.
5. `at` is 3 s before the quote's first word, using the caption-line timings (`seg_words`/`seg_times`, the same formula
   as `public.passage_word_time()`). It is never before the passage start or below 0.
6. A passage with no passing quote is stored as `null` so it isn't sent to the model again. If the model call itself
   fails, nothing is stored and the next call retries.
7. Each caller gets 20 calls per 5 minutes that need the model, and all callers together get 120 an hour
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

- **An uncached search:** one `gpt-5.4-nano` call (about 1,450 tokens in with the needs list, 60 out) and two short
  embeddings. That's about $0.0004.
- **A `quotes` batch of 14 new passages:** one `gpt-5.4-mini` call (about 5,900 tokens in, 550 out). That's about
  $0.007.
- **Repeats:** each passage is sent to the model at most once, and repeated searches are served from the cache.

## Speed

These were measured from a Mac on 15 October 2026, on Micro compute.

| Request                   | Typical time                                   |
| ------------------------- | ---------------------------------------------- |
| Cached search             | About 0.5 s from the Mac (0.2 s on the server) |
| Uncached search           | About 1.7–3 s when the database is responsive  |
| `quotes`, 14 new passages | About 3.5 s                                    |

Most of an uncached search's time goes to:

- the chat model: about 1–1.5 s;
- the embeddings: about 0.4 s each;
- `match_passages`: about 0.1 s on its own, but on Micro it was often 1–5 s.

On Micro, `match_passages` slows down after bursts of use, and 5 searches at once ran into the database statement
timeout. More compute (Small or larger) is the fix. Each search calls `match_passages` twice; `MATCH_COUNT` in
`search/index.ts` sets the rows per call (16).

## Logs

Each request logs one JSON line: timings per step, token counts, row counts and errors. Question text and IPs are never
logged. View them in **Dashboard → Edge Functions → Logs**.
