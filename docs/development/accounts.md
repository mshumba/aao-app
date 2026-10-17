# Accounts, onboarding and the guest gate

Accounts are real Supabase accounts (user decision, 14 October 2026). Guests can open every screen. Watching a sermon (unless it came from a shared link) and saving one ask for a free account, then carry on with what was tapped. Setting up the Supabase project is covered in [`supabase/README.md`](../../supabase/README.md). The tables, row level security and `delete_account()` are in [`supabase/migrations/`](../../supabase/migrations/).

## Layout

Screens talk to `useAccount()` and `useGate()`. They never import supabase-js.

| File | Role |
| --- | --- |
| `src/auth/types.ts` | `AuthBackend`, the interface every account service implements, plus `AuthResult` and `AuthError` codes |
| `src/auth/config.ts` | Picks the service and the sign-in methods from `EXPO_PUBLIC_*` variables |
| `src/auth/supabaseBackend.ts` | Supabase Auth and the `profiles`, `saved_sermons`, `watch_progress` and `app_settings` tables |
| `src/auth/appleTokens.ts` | Sign in with Apple token revocation, the app's half: sends Apple's authorization code after signing in, revokes before deleting ([Apple token revocation](apple-token-revocation.md)) |
| `src/auth/localBackend.ts` | An on-device stand-in for development and the automated tests |
| `src/auth/AccountProvider.tsx` | `useAccount()`: session, profile, saved sermons, watch progress, onboarding state, shared-link passes, `guestWatch` |
| `src/auth/gate.tsx` | `useGate()`, `useFinishFlow()`, `useCloseAuthRoutes()` and `IntentRunner` (mounted in the root layout) |
| `src/auth/intent.ts` | The pending intent: what a guest tapped before signing up |
| `src/auth/ui.tsx` | Shared kit for the sign-in and onboarding screens (`FlowScreen`, `AuthField`, `CodeInput`, `ProviderButtons`, …) |
| `src/auth/messages.ts` | One user-facing message per `AuthError` code |
| `src/auth/supabaseSession.ts` | The Supabase parts that run in Node tests: errors in the app's terms, the session to launch with, sign-out, links back with a code |
| `src/auth/watchQueue.ts` | Watch positions not yet on the server: kept on the device, sent latest-first per sermon, retried |
| `src/auth/sessionStorage.ts` | Keychain/Keystore storage for the native session |
| `src/lib/storage.ts` | JSON helpers over AsyncStorage and the app's storage keys |

## Which account service runs

The service is chosen once, at launch (`authMode` in `src/auth/config.ts`):

| Condition | Mode | Behaviour |
| --- | --- | --- |
| `EXPO_PUBLIC_AUTH_MODE=local` | `local` | The stand-in, in any build. The Playwright config sets this. |
| Supabase URL and key set | `supabase` | Real accounts |
| Neither, development build | `local` | The stand-in, so the app works without a `.env` |
| Neither, release build | `unavailable` | Sign-up screens say accounts aren't available yet. Watching stays open to everyone and Save is hidden. |

Configuration (copy `.env.example` to `.env`; for EAS builds use EAS environment variables, see [releasing](releasing.md)):

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Project URL, `https://<ref>.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (`sb_publishable_…`). The legacy `EXPO_PUBLIC_SUPABASE_ANON_KEY` is read as a fallback. |
| `EXPO_PUBLIC_AUTH_METHODS` | Buttons to show, comma-separated: `apple`, `google`, `email`, and `apple-web` for Apple on the web and Android. Default `apple,google,email`. Leave a method out until its provider is enabled in Supabase. |
| `EXPO_PUBLIC_WEB_URL` | Public web address used in share links. Default `https://aao-app.expo.app` |
| `EXPO_PUBLIC_AUTH_MODE` | `local` forces the stand-in |
| `EXPO_PUBLIC_GUEST_WATCH` | Stand-in only: `shared`, `all` or `none` in place of the remote setting |

`EXPO_PUBLIC_*` values are compiled into the JavaScript bundle and are public by design. Row level security limits what the publishable key can do. Never put the `service_role` or secret key in the app, `.env` or `eas.json`. Restart Metro after changing `.env`.

## Sign-in methods

Apple and Google are the main ways in (user decision, 14 October 2026): two buttons of equal size and prominence, as App Store guideline 4.8 expects. Email is a quieter fallback, a **Use email instead** link (**Sign in with email instead** when signing in) that opens `/auth/email`; it signs in with a 6-digit code, and **Use a password instead** switches to email and password. There is no phone or text-message (SMS) sign-in.

On the ivory app, Sign in with Apple uses Apple's black style: the native `AppleAuthenticationButton` on iOS, and a matching black button with white text elsewhere. Google is a white button with a hairline border.

| Method | How it works | Needs |
| --- | --- | --- |
| Sign in with Apple (iOS) | Apple's native sheet (`expo-apple-authentication`), then `signInWithIdToken` with a SHA-256 nonce. Apple gives the name only on the first authorization: the sign-in returns it, and `AccountProvider` saves it to the profile once that has loaded, keeping it on the device (`aao.pendingName.v1`) until the write succeeds. Hidden in Expo Go, which signs in as `host.exp.Exponent`. | Paid Apple Developer Program. The Apple provider enabled in Supabase with the bundle ID `com.mshumba.aao` in **Client IDs** (no secret key is needed for native sign-in). The entitlement, which `app.config.ts` adds unless `AAO_PERSONAL_TEAM=1`. To revoke Apple's tokens on deletion: the `apple-tokens` function and its four secrets, from a Sign in with Apple key ([Apple token revocation](apple-token-revocation.md)). |
| Apple on the web and Android | Supabase's web OAuth flow. Off unless `apple-web` is in `EXPO_PUBLIC_AUTH_METHODS`. | A Services ID and a client secret that Apple makes you regenerate every 6 months |
| Google | Supabase OAuth with PKCE: an in-app browser sheet (`expo-web-browser`) on iPhone and Android, a redirect on the web. The code comes back to `/auth/callback`. | A Google OAuth web client entered in Supabase, and the redirect URLs in [`supabase/README.md`](../../supabase/README.md) |
| Email code | `signInWithOtp` (creates the account if needed), then a 6-digit code checked with `verifyOtp` | The Magic Link email template showing `{{ .Token }}` |
| Email and password | `signUp`, then a code confirms the address. `signInWithPassword` signs in; an account whose code was never entered gets **Send a new code**, which emails a fresh confirmation code. A reset emails a code, then `/auth/new-password` sets the new password. | The Confirm signup and Reset password templates showing `{{ .Token }}`. "Confirm email" on. |

Codes, rather than links, mean an email can be opened on any device and no deep link has to survive the mail app. Supabase's built-in email sender is limited to a few messages an hour; set up custom SMTP before inviting testers.

## The guest gate

`useGate().canWatch(id)` is true when accounts are unavailable in this build, when someone is signed in, when `guestWatch` is `all`, or when `guestWatch` is `shared` and the sermon came from a shared link. `require(intent)` returns true when the action can go ahead. Otherwise it stores the intent and opens the sign-up sheet at `/join?reason=watch` or `?reason=save`.

`guestWatch` is a remote setting so the gate can change without a new build: the `guest_watch` row of `public.app_settings`.

| Value | Guests can watch |
| --- | --- |
| `"shared"` (default) | Only sermons opened from a shared link |
| `"all"` | Everything. Saving still needs an account. |
| `"none"` | Nothing, not even shared links |

Change it in the Supabase SQL editor:

```sql
update public.app_settings
set value = '"all"', updated_at = now()
where key = 'guest_watch';
```

The app reads it at launch and keeps the last value (`aao.guestWatch.v1`) for offline launches, so a change applies from the next launch. Signing out stops a sermon that needed an account.

## Pending intents and resuming

An intent is `{ kind: "watch" | "save", sermonId }`. It's held in memory and in AsyncStorage (`aao.pendingIntent.v1`), because a web sign-in with Apple or Google leaves the page and comes back to `/auth/callback`. It expires after 30 minutes and is cleared before it runs, so it runs at most once.

Each intent has an id, passed to the sheet as `/join?intent=<id>`. A sheet opened without it (from Account or Saved) clears any intent left behind, and so does a launch anywhere but `/join` or `/auth/*` (the app or tab was closed part-way), so an abandoned attempt never replays after an unrelated sign-in. A reload part-way, or an email link, keeps it.

When an account is ready, `useFinishFlow()` closes every onboarding and sign-in screen on top of the app, then `IntentRunner` carries the intent out: it opens the sermon and starts the player, or (once the account's saved list has loaded) saves the sermon and announces it. Close leaves the guest where they were with nothing playing. If the sheet is closed while Apple or Google is still finishing (iOS blocks the swipe meanwhile; the web's Back can't be blocked), the screens underneath stay put and the sign-in still carries the intent out.

## Shared links

Share produces `${EXPO_PUBLIC_WEB_URL}/s/<id>` (`src/share.ts`). The `/s/[id]` route grants a pass for that sermon and opens `/sermon/<id>`. Passes are kept on the device (`aao.sharedPasses.v1`, the latest 50). A first launch through a shared link skips the welcome.

On iPhone the link opens the web app. Opening it in the installed app needs universal links: `ios.associatedDomains` plus an `apple-app-site-association` file on the web domain, which needs the paid Apple account. Not set up yet. The app's scheme reaches the same route (`aao://s/<id>`).

## Onboarding

A first launch onto a tab, with no account, opens `/welcome` (`FirstRun` in `src/app/_layout.tsx`). Links to a sermon skip it. The flow runs `/welcome` → `/onboarding/topics` → `/onboarding/account` → `/onboarding/name` → `/onboarding/done`. The account step uses the same sign-in screens as the gate, with `next=onboarding`. The name step is skipped when Apple or Google supplied a name. A guest can leave at the welcome or the account step and browse.

Onboarding state lives on the device in `aao.onboarding.v1` as `{ welcomed, interests }`. `interests` holds only a guest's topics: while signed in, topic changes go to the profile alone. When an account's profile loads, the guest's topics move into it if it has none (or give way to its own) and leave the device, the profile's `onboarded_at` is set, and the device is marked as welcomed, so signing out later doesn't bring the welcome back and one account's topics never reach the next.

## Opening the app on a weak connection

An access token lasts an hour. Opened offline after that, Supabase tries to renew the token for about 30 seconds, then reports no session but keeps the saved one. It also retries the renewal every 30 seconds while the app is open. The launch doesn't wait for that (`restore()` in `supabaseBackend.ts`, `restoreSession` in `supabaseSession.ts`):

- **About 1.5 seconds at most.** The launch waits that long for Supabase's answer, then starts **signed in** from the session saved on the device. The renewal carries on in the background and arrives as an ordinary session change.
- **A renewal that can't reach the server isn't a sign-out.** Supabase's "no session" while it keeps the saved one is ignored (`watchSession`). When the server refuses the session (revoked, or signed out everywhere), Supabase removes it, and the app signs out as before.
- **Account data uses the account's own token only** (`liveSession`). Until the token can be renewed, profile, saved-sermon and progress requests fail as "offline" and are retried later. They are never sent with the public key in its place, which would read the account as empty. Deleting the account checks the same way, so offline it says so.
- **Nothing waits on the renewal for long.** supabase-js holds every call while it retries renewing an expired session. A request then fails as "offline" after about 1.5 seconds rather than half a minute. Signing out removes the saved session at once; Supabase's own sign-out follows once it's free, unless someone has signed in by then, and a renewal that lands afterwards isn't kept.
- **A renewed session reloads what failed.** When Supabase reports the signed-in account again (its session renewed, so the connection is back), a profile or saved list that failed to load is read again and waiting watch positions are sent. Phones have no connection event, and the retries may have run out by then.
- **Every Supabase request has a 15-second deadline, body included** (`fetchWithDeadline`, the same rule as `src/learning/request.ts`). A connection that hangs fails instead of waiting for good. supabase-js retries a failed table read three more times (1, 2 and 4 seconds apart), so a read that hangs takes about a minute to fail. Writes aren't retried.

The browser tests run the stand-in, which has no tokens. These rules are tested in Node against the real supabase-js (`tests/offline-launch.spec.ts`).

A profile read that fails is kept apart from an empty profile (`profileError`): nothing is seeded or written from it, the name step waits (offering Skip) rather than asking, and the read is retried shortly, on returning to the app and when the connection comes back.

## Where data is kept

| Data | Where |
| --- | --- |
| Session, iPhone and Android | Keychain / Keystore through `expo-secure-store`, key `aao.session`, split into 1800-character chunks |
| Session, web | `localStorage` (supabase-js default), key `aao.session` |
| Install marker | `aao.install.v1` in AsyncStorage. The Keychain survives deleting the app but AsyncStorage doesn't, so a missing marker at launch clears any old session: a reinstall starts signed out. |
| Device state | AsyncStorage (localStorage on the web): `aao.onboarding.v1`, `aao.pendingIntent.v1`, `aao.sharedPasses.v1`, `aao.guestWatch.v1` |
| Stand-in accounts | `aao.local.session.v1` and `aao.local.data.v1.<userId>`, on the device only |
| Profile and saved sermons | Supabase `profiles` (display name, topics, onboarding time) and `saved_sermons`, each limited to its owner by row level security |
| Watch progress | Supabase `watch_progress`: one row per account and sermon (position, length, finished, last saved), limited to its owner by row level security. Saved by the player for signed-in viewers only; guests' places aren't kept. See [architecture](architecture.md#watch-progress). |
| Watch progress on the device | AsyncStorage: `aao.watchProgress.v1.<userId>` (the signed-in account's list as last shown, for an offline launch) and `aao.watchQueue.v1.<userId>` (positions not yet saved on the server) |

Sign-out is local (`scope: "local"`), so it works offline. It removes the session, any unsaved Apple name and the account's copy of its watch progress. Any copy left by an account that was signed out another way (deleted elsewhere, session refused) goes too, at launch included: only the signed-in account's copy is kept. Shared-link passes stay on the device. So do positions not yet sent, under the account's user ID like path progress, so they go out when that account signs in here again; no other account sees them. The privacy policy says so. The account's topics were never on the device. Passwords and codes must never be logged or stored by the app (see [contributing](contributing.md)).

## Local test values

With the stand-in (`mode === "local"`), nothing leaves the device, and the sign-up sheet and code screens show "Test mode: accounts stay on this device. The code is always 123456."

| Input | Result |
| --- | --- |
| Code `123456` | Accepted |
| Code `000000` | "That code has expired" |
| Any other code | "That code isn't right" |
| Sign up as `taken@example.com` | "An account already uses this email" |
| Password `wrong-password`, or any password under 8 characters, at sign-in | "That email and password don't match" |
| Password sign-in as `unconfirmed@example.com` | "Confirm your email first", with **Send a new code** |
| Password under 8 characters at sign-up | Asks for a stronger password |
| Apple or Google | Signs in at once as `apple.viewer@example.com` or `google.viewer@example.com` |
| Profile and saved list | Come back about 250 ms after they're asked for (as they were when asked), like a network reply, and fail while `navigator.onLine` is false |

## Account deletion

**Account → Delete account** (`/account/delete`) asks once, then calls `delete_account()`. That database function deletes the caller's own `auth.users` row, the `profiles`, `saved_sermons` and `watch_progress` rows go with it (foreign keys `on delete cascade`), and the app signs out and removes the account's watch-progress copies from the device. Only signed-in users can call it, and only for themselves.

For an account with an Apple ID linked, the app first asks the `apple-tokens` Edge Function to revoke the account's Apple refresh token (Apple's REST revoke endpoint), waiting at most 10 seconds. The function got that token from the authorization code the app sent it after a native Sign in with Apple. If Apple can't be reached, the account is deleted anyway and the function retries the token later. See [Apple token revocation](apple-token-revocation.md), which also has the owner's and coordinator's setup steps.

## App Store notes

- **4.8 Login Services:** the app offers Google, so iOS must also offer Sign in with Apple. It does, with Apple's native button.
- **5.1.1(v) deletion:** account deletion starts in the app and removes the account and its data, after revoking the account's Sign in with Apple tokens ([Apple token revocation](apple-token-revocation.md)). Accounts that last signed in with Apple before that change, or on the web, have no token kept; the delete screen tells any account with an Apple ID linked how to stop using it with AAO by hand.
- **5.1.1(v) registration:** Apple rejects apps that require an account for features that aren't account-based. Saving is account-based. Watching free public sermons may not be, so asking guests to sign up to watch is a review risk. If review raises it, set `guest_watch` to `"all"`: no new build is needed and saving stays behind an account. Whether to submit with `"shared"` or `"all"` is the user's decision.
- **2.1 review access:** give App Review a password account in App Review Information (reviewers can't read emailed codes), and make sure the Supabase project isn't paused during review. Free projects pause after about a week of low activity.
- **Privacy:** App Store Connect needs a public privacy policy URL. The App Privacy answers will cover email address, name, user ID and product interaction (saved sermons and watch progress), all linked to the user for app functionality. There is no tracking.
