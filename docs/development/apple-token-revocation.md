# Sign in with Apple token revocation

Apple asks apps that offer Sign in with Apple to revoke the person's Apple tokens when they delete their account (App Store Review Guideline 5.1.1(v); Apple's technote [TN3194](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple)). Revoking ends AAO's authorization for that Apple ID: AAO leaves the person's list of apps using Sign in with Apple, and their next Sign in with Apple starts afresh.

Supabase Auth doesn't do this. Deleting a Supabase user leaves the Apple authorization in place, and native sign-in (`signInWithIdToken`) never gives Supabase a refresh token to revoke. So AAO does it: a Supabase Edge Function, `apple-tokens`, keeps a refresh token for each account and revokes it with [Apple's REST API](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens) before the account is deleted. This was checked against Supabase's and Apple's documentation in October 2026. If Supabase starts revoking Apple tokens itself, switch to that and remove this function.

## How it works

**Signing in (iPhone).** Apple's sheet returns an ID token and a one-time authorization code. The app signs in with the ID token as before. It then sends the code once to `apple-tokens` (`sendAppleCode` in `src/auth/appleTokens.ts`) without waiting for an answer, so sign-in never waits on it. The function:

1. checks the viewer's session;
2. swaps the code for Apple's tokens at `https://appleid.apple.com/auth/token` (`grant_type=authorization_code`, with a client secret it signs itself, see below);
3. checks that the ID token in Apple's answer belongs to an Apple ID linked to this account;
4. keeps the refresh token in `public.apple_tokens`, one row per account, replacing any earlier token.

Apple's codes work once and expire after five minutes, so the app sends each code once and never stores it. If the code doesn't arrive (no connection, or the function isn't set up yet), the account works as before, but deleting it can't revoke Apple's token. If the account is deleted while its code is still on the way, the function revokes the new token straight away instead of keeping it. If Apple can't be reached then, the token is kept without an account, like the tokens deleted accounts leave (below), and retried.

**Deleting an account.** **Account › Delete account** (`deleteAccount` in `src/auth/supabaseBackend.ts`, `deleteSignedIn` and `deleteInOrder` in `src/auth/appleTokens.ts`) works in this order:

1. For an account with an Apple ID linked, the app asks `apple-tokens` to revoke (`{"action":"revoke"}`) and waits up to 10 seconds. If it signed in with Apple moments before and the code is still on its way, the app first waits for that, up to another 10 seconds, so there is a token to revoke. The function revokes the stored refresh token at `https://appleid.apple.com/auth/revoke` (`token_type_hint=refresh_token`), then deletes the row. Accounts with no Apple ID linked (Google, email) skip this step. Whether one is linked comes from the account service (`getUser`), since the user saved with the session can predate an Apple ID linked on another device; if that can't be reached within 5 seconds, the saved user decides.
2. The app calls `delete_account()`, which deletes the account and its data as before.
3. The app signs out on the device.

The account deleted is the one signed in when the viewer confirmed. Before steps 1 and 2 the app checks that account is still the one signed in on the device, and sends that account's own session token with each request. If someone else has signed in meanwhile, nothing is revoked or deleted. The delete screen's Back and the iOS swipe are off while this runs; Android's back button and the browser's can still leave it, and the deletion then finishes in the background, still checked against the same account.

Revoking can only delay a deletion, never stop it. If Apple can't be reached, refuses, or the function fails or isn't deployed, the account is still deleted:

- The row stays. When the account goes, its `user_id` becomes null (`on delete set null`), which marks a token still to be revoked. No name, email or account ID stays with it.
- The function retries such rows with a back-off: 2, 4, 8 … minutes after each failure, then at most once a day. Up to 3 retries go along with every `store` and `revoke` call (each Apple sign-in on an iPhone, and each deletion of an account with an Apple ID linked), and a `sweep` call (hourly once the coordinator has scheduled it, step 4 below) retries up to 20. A row is deleted as soon as Apple confirms. Apple also confirms tokens that were already revoked, for example by the person in Settings.
- Each failure is logged, and the row keeps the count (`attempts`), Apple's error code (`last_error`) and the next try (`next_attempt_at`).

An account deleted another way (the Supabase dashboard, or an app build from before this change) leaves its row the same way, and the sweep revokes it.

**Accounts with no stored token** are deleted as before. These are Google and email accounts, Apple accounts that last signed in before this change, and Apple sign-ins through the web flow (below). For any account with an Apple ID linked, however it signed in this time, the delete screen says how to stop using that Apple ID with AAO by hand (Settings › your name › Sign in with Apple). TN3194 accepts that route when the app holds no token.

### The table

`public.apple_tokens` (migration `supabase/migrations/20261017001000_apple_tokens.sql`):

| Column | Holds |
| --- | --- |
| `id` | Row ID |
| `user_id` | The account (unique). Null once the account is deleted: still to be revoked |
| `client_id` | The App ID the token was issued to (`com.mshumba.aao`). Revoking needs the same one |
| `refresh_token` | Apple's refresh token |
| `attempts`, `last_error`, `next_attempt_at` | Failed revocations: how many, Apple's error code, the next try |
| `created_at`, `updated_at` | Times |

Row level security is on with no policies, and `anon` and `authenticated` have no grants, so the app can't read or write the table even with a valid session. Only the service role (the Edge Function) reaches it. `apple_tokens_due(max_rows)` claims rows that are due another try, holding each for ten minutes so two runs never try the same token at once. `apple_tokens_failed(row_id, reason)` records a failure and sets the back-off. Both are for the service role only.

### The client secret

Every call to Apple carries a client secret: a JWT the function signs with ES256 (ECDSA P-256 with SHA-256) using the owner's Sign in with Apple key. Header `{"alg":"ES256","kid":<Key ID>}`; claims `iss` = Team ID `5NCVJZM8RL`, `iat` = now, `exp` = now + 5 minutes, `aud` = `https://appleid.apple.com`, `sub` = the client ID (`com.mshumba.aao`). It's made fresh for each request, so it never needs renewing, unlike the six-monthly secret of the web flow.

### The function's requests

`POST /functions/v1/apple-tokens` with `apikey: <publishable key>`. `store` and `revoke` also need the viewer's session token (`Authorization: Bearer …`); the app's Supabase client sends both.

| Body | Answer |
| --- | --- |
| `{"action":"store","code":"…"}` | `200 {"stored":true}`; `400 {"error":"invalid_code"}` (Apple refused the code: used, expired, or for another app); `403 {"error":"identity_mismatch"}`; `410 {"error":"account_gone"}` (deleted meanwhile; the new token was revoked, or kept for a retry); `502 {"error":"apple_unavailable"}`; `503 {"error":"not_configured"}` |
| `{"action":"revoke"}` | `200 {"revoked":true,"stored":true}`; `200 {"revoked":false,"stored":false}` (nothing stored); `200 {"revoked":false,"stored":true,"retry":true}` (kept for a retry) |
| `{"action":"sweep"}` | `200 {"ok":true}`. Only retries rows that are already due, so it needs nothing more than the publishable key. It's limited to 6 calls an hour per caller and 60 in all, and its answer says nothing about what was pending (the log has the counts) |

Any of them can also answer `400 bad_request`, `401 unauthorized` (no publishable key, or for `store` and `revoke` no valid session), `429 rate_limited` (`store` and `revoke`: 10 calls per account in 10 minutes) or `503 unavailable` (database). Each request logs one JSON line (action, status, Apple's error code, timings). Codes, tokens, secrets and user IDs are never logged.

### Files

| File | Role |
| --- | --- |
| `supabase/functions/apple-tokens/index.ts` | The Edge Function: requests, session check, rate limit, the database |
| `supabase/functions/apple-tokens/apple.ts` | Apple's REST API: secrets, the client secret, `/auth/token`, `/auth/revoke` |
| `supabase/functions/apple-tokens/tokens.ts` | Store, revoke and sweep, in order, with the database and Apple passed in. A row is deleted only if it still holds the token Apple revoked |
| `supabase/migrations/20261017001000_apple_tokens.sql` | The table and its two SQL functions |
| `src/auth/appleTokens.ts` | The app's half: sending the code, asking for revocation, the deletion order and which account it deletes |
| `tests/apple-tokens.spec.ts` | The client secret and its signature, Apple's request bodies and errors, the order of every step, the app's half. Runs in Node with stand-ins; nothing reaches Apple or Supabase |

## Owner: the Sign in with Apple key and the four secrets

About 10 minutes. You need the Apple Developer account (Account Holder or Admin) and the Supabase dashboard.

**1. Create a Sign in with Apple key.** This is a different key from the App Store Connect API key that EAS uses for uploads (App Store Connect › Users and Access › Integrations), and from a push notification (APNs) key. Neither of those works here.

1. Open [developer.apple.com/account/resources/authkeys/list](https://developer.apple.com/account/resources/authkeys/list) (Certificates, Identifiers & Profiles › **Keys**) and click **+**.
2. **Key Name**: `AAO Sign in with Apple`.
3. Tick **Sign in with Apple**, then click **Configure** next to it. For **Primary App ID** choose `com.mshumba.aao` (AAO). **Save**.
4. **Continue**, then **Register**.
5. **Download** the key. The file is `AuthKey_<KEYID>.p8`, and Apple lets you download it **only once**. Keep it in your password manager, not in the repository, iCloud Drive or chat.
6. Copy the **Key ID** shown on the page (10 characters, also in the file name).

If you already made a Sign in with Apple key for AAO (for the web flow's Supabase secret), you can use it instead, provided its primary App ID is `com.mshumba.aao`.

The Team ID is `5NCVJZM8RL` (Membership details). The App ID `com.mshumba.aao` already has Sign in with Apple turned on ([`supabase/README.md`](../../supabase/README.md#4-sign-in-with-apple), step 4).

**2. Set the four Edge Function secrets.** Supabase dashboard › project `tkyzinjphxjwhfagoypm` › **Edge Functions** › **Secrets** › add each:

| Name | Value |
| --- | --- |
| `APPLE_SIGNIN_KEY_P8` | The whole text of the `.p8` file, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines. Open it in TextEdit and copy everything |
| `APPLE_SIGNIN_KEY_ID` | The Key ID, for example `ABC123DEFG` |
| `APPLE_TEAM_ID` | `5NCVJZM8RL` |
| `APPLE_CLIENT_ID` | `com.mshumba.aao` |

Or from a Terminal in the app folder, with your own Key ID and file path:

```sh
npx supabase secrets set --project-ref tkyzinjphxjwhfagoypm \
  APPLE_SIGNIN_KEY_P8="$(cat ~/Downloads/AuthKey_ABC123DEFG.p8)" \
  APPLE_SIGNIN_KEY_ID=ABC123DEFG \
  APPLE_TEAM_ID=5NCVJZM8RL \
  APPLE_CLIENT_ID=com.mshumba.aao
```

Never put these in `.env`, `eas.json`, an `EXPO_PUBLIC_` variable or the repository. The function reads them when it starts; changing one needs no redeploy.

Nothing needs renewing: the key doesn't expire, and the function signs a fresh short-lived client secret for each call. If the key ever leaks, revoke it on the same Keys page, make a new one, and update `APPLE_SIGNIN_KEY_P8` and `APPLE_SIGNIN_KEY_ID`.

## Coordinator: migration, deploy and the hourly retry

Needs the earlier migrations: `20261014000000_accounts.sql` (`delete_account()`, `touch_updated_at()`) and `20261015000000_need_search.sql` (`search_rate_ok()`, used for the rate limit).

1. **Apply the migration** `supabase/migrations/20261017001000_apple_tokens.sql`: the SQL editor, `npx supabase db push`, or the Supabase MCP `apply_migration` with the file's contents. Then check that the app can't reach the table:

   ```sql
   select grantee, privilege_type from information_schema.role_table_grants
   where table_name = 'apple_tokens' order by grantee;
   ```

   `anon` and `authenticated` must not be listed.

2. **Deploy the function**, from the app folder:

   ```sh
   npx supabase functions deploy apple-tokens --project-ref tkyzinjphxjwhfagoypm --no-verify-jwt
   ```

   `--no-verify-jwt` as for `search` and `quotes`: the project's `sb_publishable_…` keys aren't JWTs, so the function checks the publishable key and the session itself. Without the CLI, use the Management API as in [`supabase/functions/README.md`](../../supabase/functions/README.md#deploy) with the files `supabase/functions/apple-tokens/index.ts`, `supabase/functions/apple-tokens/apple.ts`, `supabase/functions/apple-tokens/tokens.ts`, `supabase/functions/_shared/auth.ts`, `supabase/functions/_shared/db.ts` and `supabase/functions/_shared/http.ts`, and `metadata` `{"name":"apple-tokens","entrypoint_path":"supabase/functions/apple-tokens/index.ts","verify_jwt":false}`.

   Check it before deploying: `cd supabase/functions && deno check apple-tokens/index.ts && deno lint apple-tokens/`.

3. **Check it answers**:

   ```sh
   curl -sS -X POST https://tkyzinjphxjwhfagoypm.supabase.co/functions/v1/apple-tokens \
     -H "apikey: <publishable key>" -H "content-type: application/json" \
     -d '{"action":"sweep"}'
   ```

   It should answer `{"ok":true}`, and the log line shows `"tried":0,"revoked":0`. Until the owner has set the four secrets, the function's logs (**Edge Functions › apple-tokens › Logs**) show `not_configured` with the missing names when it starts, and `store` answers `503 not_configured`. Sign-in and deletion work either way.

4. **Schedule the retry** (recommended), so tokens Apple couldn't revoke at the time are retried hourly even when nobody signs in. In the SQL editor, with the publishable key:

   ```sql
   create extension if not exists pg_net with schema extensions;

   select vault.create_secret('<publishable key>', 'apple_tokens_apikey');

   select cron.schedule('apple-tokens-sweep', '23 * * * *', $$
     select net.http_post(
       url := 'https://tkyzinjphxjwhfagoypm.supabase.co/functions/v1/apple-tokens',
       headers := jsonb_build_object(
         'content-type', 'application/json',
         'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'apple_tokens_apikey')
       ),
       body := '{"action":"sweep"}'::jsonb,
       timeout_milliseconds := 30000
     );
   $$);
   ```

   The publishable key is public, but in the Vault it stays out of `cron.job`. To stop the schedule: `select cron.unschedule('apple-tokens-sweep');`.

5. **Check it end to end** on a TestFlight build that includes this change, with a test Apple ID:
   1. Sign in with Apple. A row appears (never select `refresh_token`):

      ```sql
      select id, client_id, user_id is not null as live, attempts, last_error, created_at
      from public.apple_tokens order by id desc limit 5;
      ```

   2. **Account › Delete account**. The row is gone, and the log shows `"action":"revoke"` with `"revoked":true`.
   3. On the iPhone, **Settings › your name › Sign in with Apple** no longer lists AAO (this can take a minute).

## Watching for tokens Apple hasn't revoked

```sql
select id, attempts, last_error, next_attempt_at, updated_at
from public.apple_tokens
where user_id is null
order by next_attempt_at;
```

A few rows with `timeout`, `network` or `http_5xx` are Apple being briefly unreachable; they clear on their own. `invalid_client` means the secrets don't match: the Key ID, Team ID or `.p8` file are from different keys, the key lacks Sign in with Apple, or `APPLE_CLIENT_ID` isn't `com.mshumba.aao`. Fix the secrets and the rows are retried on schedule; the `sweep` call above retries the due ones at once.

## Limits

- **Native iPhone sign-in only.** Apple on the web and Android (`apple-web`, off by default) goes through Supabase's OAuth flow, where Supabase swaps the code itself and the app never sees it, so no token is kept for those sign-ins.
- **Accounts from before this change** have no token until they next sign in with Apple. The app keeps sessions in the Keychain, so for TestFlight testers that may be never. Their deletions fall back to the manual route on the delete screen.
- **After revoking**, signing in with that Apple ID again is a first sign-in: Apple asks again whether to share the name and email, and a new account is made.

## App Review

Guideline 5.1.1(v) and TN3194 ask for revocation when the account is deleted. AAO revokes before deleting the account, waiting at most 10 seconds for Apple before the deletion goes ahead, and retries server-side when Apple can't be reached. If App Review asks, the answer is: "Deleting the account in the app (Account › Delete account) revokes the user's Sign in with Apple tokens through Apple's REST API (`/auth/revoke`) and deletes the account and its data."
