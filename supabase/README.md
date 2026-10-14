# Supabase setup

AAO uses [Supabase Auth](https://supabase.com/docs/guides/auth) for accounts and small tables for profiles, saved sermons and watch progress. The free plan is enough. Until a project is configured, development builds and the automated tests use an on-device stand-in (see `src/auth/localBackend.ts`), and release builds say accounts aren't available and leave watching open.

## 1. Create the project

1. Sign in at [supabase.com](https://supabase.com) and create a project (any region close to most viewers). Keep the database password somewhere safe; the app never needs it. Under **Security**, keep **Enable Data API** on, turn **Automatically expose new tables** off (the migration grants exactly what the app needs), and turn **Enable automatic RLS** on as a safety net.
2. **Project Settings → API**: copy the **Project URL** and the **publishable key** (`sb_publishable_…`, or the legacy `anon` key).
3. In the app folder, copy `.env.example` to `.env` and fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. For EAS builds, add the same two values as EAS environment variables (`npx eas-cli env:create --scope project --environment production --visibility plaintext --name EXPO_PUBLIC_SUPABASE_URL --value …`, and the same for `preview`).

Never put the `service_role` / secret key in the app or in `.env`.

## 2. Create the tables

Open **SQL Editor** and run each file in `migrations/` once, in order of their names. Together they create:

- `profiles`: display name, chosen topics, onboarding time; one row per account, made automatically on sign-up.
- `saved_sermons`: the viewer's saved sermon IDs.
- `watch_progress` (`20261014000200_watch_progress.sql`): where the viewer stopped in each sermon, for resuming and Home's Continue watching.
- `delete_account()`: lets a signed-in viewer delete their own account (required by App Store guideline 5.1.1(v)); profile, saved and watch-progress rows are removed with it.

Row level security is on for every table: each viewer can only read and change their own rows. The sermon catalogue has its own migration; see [step 7](#7-load-the-sermon-catalogue).

(With the Supabase CLI instead: `supabase link --project-ref <ref>` then `supabase db push`.)

## 3. Authentication settings

**Authentication → URL Configuration**

- **Site URL**: `https://aao-app.expo.app`
- **Redirect URLs** (add each):
  - `aao://auth/callback` (the installed app)
  - `https://aao-app.expo.app/auth/callback` (the web preview)
  - `http://localhost:8081/auth/callback` (local web development)
  - `exp://**` (Expo Go during development, optional)

**Authentication → Providers → Email**: keep **Email** enabled and **Confirm email** on. Minimum password length 8. Keep **Email OTP Length** at **6**: the code screen has six boxes and checks a code at six digits.

**Authentication → Rate Limits**: Supabase sends one email per address a minute. The code screen's **Resend code** waits 60 seconds to match (`RESEND_SECONDS` in `src/app/auth/code.tsx`); change both together.

**Authentication → Email Templates**: the app asks for a 6-digit code rather than relying on links, so each template must include `{{ .Token }}`. Replace the bodies of these three templates:

*Confirm signup* — subject `Your AAO code: {{ .Token }}`

```html
<h2>Confirm your email</h2>
<p>Enter this code in the AAO app to finish creating your account:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
<p>The code expires in an hour. If you didn't ask for it, ignore this email.</p>
```

*Magic Link* — subject `Your AAO sign-in code: {{ .Token }}`

```html
<h2>Your sign-in code</h2>
<p>Enter this code in the AAO app to sign in:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
<p>The code expires in an hour. If you didn't ask for it, ignore this email.</p>
```

*Reset Password* — subject `Your AAO reset code: {{ .Token }}`

```html
<h2>Reset your password</h2>
<p>Enter this code in the AAO app, then choose a new password:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
<p>If you didn't ask to reset your password, ignore this email; nothing changes.</p>
```

Supabase's built-in email sender is limited to a few messages an hour and is meant for testing. Before inviting testers beyond a handful, set up custom SMTP (**Project Settings → Authentication → SMTP**) with a provider such as Resend or Postmark and a sending domain you own.

## 4. Sign in with Apple

Needs the paid Apple Developer Program.

1. Apple Developer → **Identifiers**: open the app ID (`com.mshumba.aao`; see `app.json`) and enable **Sign in with Apple**. EAS adds the capability automatically when it builds, because `ios.usesAppleSignIn` is set.
2. Supabase → **Authentication → Providers → Apple**: enable it and add the bundle ID `com.mshumba.aao` to **Client IDs**. Native iOS sign-in uses the ID token directly; no secret key is needed for it. Then make sure `apple` is in `EXPO_PUBLIC_AUTH_METHODS` (in `.env` and every EAS environment) and restart Metro.

Expo Go signs in with Apple as its own app (`host.exp.Exponent`), which isn't in **Client IDs**, so the app hides the Apple button in Expo Go (`src/auth/config.ts`); testers there use Google or email. Development, TestFlight and App Store builds show it.
3. Apple on the **web** preview is optional and off by default. To offer it, create a Services ID with return URL `https://<project-ref>.supabase.co/auth/v1/callback` and a Sign in with Apple key, enter the Services ID and generated secret in the same Supabase screen (Apple requires a new secret every 6 months), then add `apple-web` to `EXPO_PUBLIC_AUTH_METHODS`.

## 5. Google

Free. About 10 minutes.

1. [Google Cloud Console](https://console.cloud.google.com): project picker → **New project**, name it `AAO`, create, and select it.
2. **Google Auth Platform** (search "OAuth consent screen") → **Get started**: app name `AAO`, your support email, audience **External**, your contact email, agree, **Create**.
3. **Branding**: home page `https://aao-app.expo.app`, privacy policy `https://aao-app.expo.app/privacy`, terms `https://aao-app.expo.app/terms`. Under **Authorized domains** add `<project-ref>.supabase.co`. Save. (Skip the logo for now; adding one triggers Google's brand review.)
4. **Data Access** → **Add or remove scopes**: tick `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`. Save.
5. **Audience**: while the app is in **Testing**, only listed test users can sign in. Add your own and testers' Google accounts, or click **Publish app** (no review is needed for these basic scopes).
6. **Clients** → **Create client** → **Web application**, name `Supabase`. Under **Authorized redirect URIs** add `https://<project-ref>.supabase.co/auth/v1/callback` (Supabase shows this exact URL in its Google provider panel). **Create**, then copy the **Client ID** and **Client secret**.
7. Supabase → **Authentication → Sign In / Providers → Google**: enable it, paste the client ID into **Client IDs** and the secret into **Client Secret**, leave **Skip nonce checks** off, **Save**.
8. Make sure `aao://auth/callback` is in Supabase's redirect URLs (step 3 above), then add `google` to `EXPO_PUBLIC_AUTH_METHODS`.

The app opens Google in a secure in-app browser sheet (`expo-web-browser`) on iPhone and a normal redirect on the web, so no native Google SDK or iOS client ID is required. Google's screen will say "continue to <project-ref>.supabase.co"; a Supabase custom domain (paid add-on) or native Google sign-in can change that later.

## 6. Check it

```sh
npm run web
```

Create an account with an email code, sign out, sign back in with a password, save a sermon, and delete the account from **Account → Delete account**. The row should disappear from **Authentication → Users**.

For App Review, create a dedicated review account (email + password) and put its details in App Store Connect → App Review Information.

## 7. Load the sermon catalogue

`migrations/20261014200000_sermon_catalogue.sql` creates the library the app reads: `sermons` (one row per long-form video on the Apostle Arome Osayi channel, keyed by `youtube_id`) and `series` (multi-part teachings and multi-day gatherings). Everyone, guests included, can read both; nobody can write them through the API. Run it like the accounts migration.

Rows come from the channel manifest made by the transcript pipeline (`videos` keyed by YouTube ID with title, upload time, duration and, for some, description, thumbnail and tags; transcripts aren't read). Each title is read by `src/catalogue/parseTitle.ts` for the short headline, event, series, part or day, guest ministers, venue and preaching date. To load or refresh:

1. Create a personal access token at [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) and add it to `.env` as `SUPABASE_ACCESS_TOKEN` (never an `EXPO_PUBLIC_` variable). `EXPO_PUBLIC_SUPABASE_URL` names the project.
2. Check how the titles read: `npm run catalogue:import -- <path/to/_manifest.json> --dry-run`.
3. Load: `npm run catalogue:import -- <path/to/_manifest.json>`.

The import is safe to repeat as the channel grows: it upserts on `youtube_id`, only touches a row when something about it changed (so the app's "changed since" sync stays small), never clears a description, thumbnail or tags the manifest doesn't have, and never deletes a sermon; series no sermon belongs to any more are removed. Parsed fields are rewritten on every run, so hand edits to them in the dashboard don't last; put hand-written headlines in `src/catalogue/editorial.ts` instead. Installed apps pick up new and changed sermons the next time they open, or after 30 minutes away.
