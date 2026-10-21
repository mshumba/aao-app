# CI, builds and releases

## Current state

The source repository is [mshumba/aao-app](https://github.com/mshumba/aao-app), published with the owner’s authorization. Check [Actions](https://github.com/mshumba/aao-app/actions/workflows/ci.yml) for the exact commit status. Private planning files are excluded from the public source snapshot.

The app is linked to the Expo project `@mshumba/aao-app` (`extra.eas.projectId` in `app.json`) on Expo's free plan. Team testing uses an unlisted web preview on Cloudflare Pages (the public web addresses show a holding page) and Android APKs from the `preview` profile (see [getting started](getting-started.md#team-testing-expo-free-plan)). iPhone builds go to TestFlight from this configuration (see [TestFlight](#testflight)); build 3 and later include native Google sign-in ([accounts](accounts.md#sign-in-methods)). JavaScript-only fixes reach them as EAS Updates on the `production` channel ([over-the-air updates](#over-the-air-updates-eas-update)). The Apple Developer Program has been joined; the bundle ID is `com.mshumba.aao` and the App Store Connect name "AAO App" (the home-screen name stays "AAO").

## GitHub CI

`.github/workflows/ci.yml` runs on push and pull request in the public source repository. It has read-only contents permission, no persisted checkout credentials, SHA-pinned official actions, a 20-minute timeout and cancellation of superseded runs. It installs the lockfile, typechecks, lints, runs pinned Expo Doctor, exports all platforms, installs Playwright Chromium and runs the deterministic suite against the on-device account stand-in. Only failed-test evidence is retained for seven days. It has no release job, secrets or account setup. A green CI run verifies these checks, not phone playback or real sign-in.

## Build profiles

`eas.json` defines four profiles. Each names the EAS environment whose variables it builds with and the EAS Update channel its builds follow.

| Profile | Makes | Distribution | Environment and channel |
| --- | --- | --- | --- |
| `development` | A development build (`expo-dev-client`) for registered devices | Internal | `development` |
| `simulator` | The same, for the iOS Simulator: `npm run ios:simulator` | Internal | `development` |
| `preview` | A release build for the team; an APK on Android | Internal | `preview` |
| `production` | A store build | App Store / Play | `production` |

`appVersionSource` is `remote`: EAS keeps the build numbers (iOS `buildNumber`, Android `versionCode`) and each production build increments them. The first build after this switch asks where to start the remote numbers. The version people see is `expo.version` in `app.json` (now `0.2.0`, with `version` in `package.json` kept the same); change it by hand for each release.

## TestFlight

### Before the first build

These need a person with the accounts; they can't be done from the repository.

1. **Join the Apple Developer Program** ($99 a year) with an Apple Account that has two-factor authentication. Done. (An individual membership shows your legal name as the seller; an organization membership needs a legal entity and a D-U-N-S number.)
2. **Choose the production bundle ID and store name.** Done: `com.mshumba.aao` in `ios.bundleIdentifier` and `android.package` in `app.json`, replacing `com.aao.prototype`, and the App Store Connect name "AAO App". The App Store Connect record was created on the website, because EAS can't create it with an API key; its Apple ID is `ascAppId` in `eas.json`. The bundle ID can't be changed now that the record exists.
3. **Set up Supabase** following [`supabase/README.md`](../../supabase/README.md): run the migrations, enable the providers (Apple with `com.mshumba.aao` in **Client IDs**, Google, email with the code templates) and set up custom SMTP before inviting testers. Before App Review, set up [Apple token revocation](apple-token-revocation.md): a Sign in with Apple key, four Edge Function secrets and the `apple-tokens` function (guideline 5.1.1(v)).
4. **Publish a privacy policy at a public URL**, and a support URL. App Store Connect asks for both.
5. **Create a review account** (email and password) for TestFlight's Beta App Review and App Review.
6. **Decide the guest gate for review**: see [accounts](accounts.md#app-store-notes).

### Build and upload

```sh
npm install -g eas-cli
eas login

# Public Supabase values for production builds (repeat with --environment preview
# and development for those profiles).
eas env:create --scope project --environment production --visibility plaintext \
  --name EXPO_PUBLIC_SUPABASE_URL --value https://<project-ref>.supabase.co
eas env:create --scope project --environment production --visibility plaintext \
  --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value sb_publishable_…

npm run build:testflight
```

Only `EXPO_PUBLIC_*` values belong in EAS environment variables for the app, and they end up in the bundle. `EXPO_PUBLIC_AUTH_METHODS` and `EXPO_PUBLIC_WEB_URL` are optional ([accounts](accounts.md#which-account-service-runs)). `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` turn on Google's own sheet on iPhone; set `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` only once the Android OAuth client with the build's SHA-1 exists. Without them Google uses the web flow. Nothing secret goes in `eas.json`.

`npm run build:testflight` runs `eas build -p ios --profile production --auto-submit`. The first time, EAS asks you to sign in to your Apple account (with a 2FA code). It creates the distribution certificate and provisioning profile, turns on Sign in with Apple for the App ID, and offers to set up remote build numbers.

The upload to the App Store Connect app named by `ascAppId` needs an App Store Connect API key, and EAS can't generate one for this account: Apple refuses with "The API key in use does not allow this request". When EAS offers to generate a key, answer no. Until a key is stored in the project's EAS credentials, the build finishes and its submit step fails, so upload the finished build with a key made by hand:

1. App Store Connect → Users and Access → Integrations: create a team key with the App Manager role and download its `.p8` file (Apple offers it once). Keep it outside the repository.
2. For this run only, add `ascApiKeyPath`, `ascApiKeyId` and `ascApiKeyIssuerId` beside `ascAppId` in `eas.json`. Never commit them: the repository is public.
3. `eas submit -p ios --id <build id> --profile production --non-interactive`, with the build's ID from its page on expo.dev or `eas build:list`.
4. Take the three fields out of `eas.json` again.

`eas.json` names the app, so submits don't ask for it (`ascAppId` is the numeric Apple ID from App Store Connect → App Information). `appleTeamId`, the 10-character team ID, isn't set; it can go beside it:

```json
"submit": {
  "production": {
    "ios": {
      "appName": "AAO App",
      "language": "en-US",
      "ascAppId": "6823010745"
    }
  }
}
```

`ios.config.usesNonExemptEncryption` is `false` (the app only uses HTTPS and the system's cryptography), so uploads don't ask the export-compliance question each time. `ios.supportsTablet` is `false`: the app is phone-first, and an iPad build would need iPad screenshots and an iPad-quality layout for review.

### Testers

- **Internal testers:** up to 100 people with App Store Connect access. Builds reach them after processing, without review.
- **External testers:** up to 10,000 by email or public link. The first build of a version needs Beta App Review, with a beta description, a feedback email, the review account and the review notes below.
- TestFlight builds expire after 90 days.

### Review notes

From `0.2.0` (build 5, the first build of that version, so it goes through Beta App Review) the app declares background audio and picture in picture for the whole app (the expo-video plugin in `app.json`), but only sermons on R2 use them: one still playing from YouTube pauses when the app goes to the background. A reviewer who tries one of those and hears it stop may reject the build under guideline 2.5.4, so point them at a sermon that is on R2. Every guided path's sermons are. Put this in TestFlight → Test Information (Beta App Review) and, for the App Store, in App Review Information, with the review account:

> Background audio and picture in picture: sign in with the review account, open the Paths tab, choose any path and tap Start Day 1 (any day works), then lock the phone or go to the Home Screen. The sermon keeps playing, shows on the lock screen and goes into picture in picture. Sermons not yet on our own storage play through YouTube and pause when you leave the app.

### Before the App Store (later)

App Privacy answers ([accounts](accounts.md#app-store-notes)), the age rating questionnaire, the Content Rights answer, 6.9-inch iPhone screenshots, and the [review notes](#review-notes) with the review account. For Content Rights: on iPhone and Android the app streams copies of the sermons kept on the ministry's own storage (R2), and plays the rest through YouTube, so keep written authorization from the content owner to host and stream them.

### Local device builds without the paid program

A free Personal Team can't sign the Sign in with Apple entitlement. Build with `AAO_PERSONAL_TEAM=1` (see [getting started](getting-started.md#ios-device-free-personal-team)); `app.config.ts` then leaves the entitlement out and the Apple button reports that option isn't available.

## Over-the-air updates (EAS Update)

`expo-updates` is installed. `app.json` sets `updates.url` and `runtimeVersion: { "policy": "appVersion" }`, and each build profile has a channel. A build checks for an update when it launches, downloads it in the background, and uses it from the next launch.

```sh
npm run update:preview          # eas update --channel preview --environment preview
eas update --channel production --environment production --message "Fix sermon titles"
```

Only JavaScript and assets ship this way. Anything native needs a new build: a new native module, a change to `app.json` or `app.config.ts`, the icon or splash, permissions. With the `appVersion` policy a build only takes updates made for the same `expo.version`, so **bump the version for every native change**. Otherwise old builds can be sent JavaScript that expects native code they don't have.

`0.2.0` (iOS build 5 onwards) added native code: expo-video (the R2 player, with background playback and picture in picture) and view-controller-based status bar appearance for iOS 27, and it dropped expo-status-bar. So builds 3 and 4 (`0.1.0`) never receive updates made from `0.2.0` code: they keep the YouTube player and their own JavaScript until testers install build 5, and a JavaScript fix for them would have to be published from a `0.1.0` checkout.

The daily path reminder ([architecture](architecture.md#daily-path-reminder)) adds native code too: expo-notifications and its config plugin in `app.json`. It reaches phones only in a new native build, never as an update, and by the rule above that build needs a new `expo.version` (this change leaves `0.2.0`; the version is chosen when the build is made). A `0.2.0` build without the module that got this JavaScript as an update would show no reminders rather than fail (`src/reminders/device.ts` only loads the library when its native module is there), but its viewers couldn't turn them on either. The reminders are local notifications scheduled on the phone: no push server and no APNs key. `app.config.ts` removes the push entitlement (`aps-environment`) the plugin adds regardless, so the App ID needs no Push Notifications capability. Android 13 and later ask for notification permission (`POST_NOTIFICATIONS`, from the module's manifest) only when the viewer turns the reminder on. Android draws a notification's small icon from the app icon until a white-on-transparent one is set as the plugin's `icon` (with the owner's logo); `color` is the navy accent.

Android APKs built before October 2026 don't include `expo-updates` and won't receive updates; install a new `preview` build.

Expo's free plan (October 2026; check [expo.dev/pricing](https://expo.dev/pricing)) includes a limited number of iOS and Android builds a month on a low-priority queue that can take over an hour, and EAS Update for up to 1,000 monthly active users.

## Recovery and rollback

- **A bad update:** `eas update:rollback` either republishes an earlier update or returns the channel to the JavaScript embedded in the build (`eas update:republish` and `eas update:roll-back-to-embedded` do each directly). Then check on a device. See [Expo's rollback guide](https://docs.expo.dev/eas-update/rollbacks/). Reverting a Git commit by itself doesn't change installed apps.
- **A bad TestFlight build:** expire it in App Store Connect (TestFlight → the build → Expire), so testers go back to an earlier build that hasn't expired, then upload a fixed build. A native defect can't be fixed with an update for a different runtime.
- **Web:** `scripts/deploy-web.sh` builds and publishes the checked-out commit to an unlisted preview branch, so to roll a preview back, check out a tested commit and run it again. The public addresses only get the holding page (`scripts/deploy-holding.sh`). Check caches and navigation after rolling back.
- **Local regression:** stop the new Metro process, check out a known-good reviewed commit on a clean branch (keep uncommitted work), run `npm ci`, then restart and retest. Avoid destructive resets.

## Release gates

Branch protection isn't configured. Before a store release: require CI and review on `main`, test the exact commit on devices (iPhone and Android, signed in and as a guest), confirm content rights, and record the tested commit and runtime version. Keep secrets in EAS or GitHub's secret store with least privilege, never in source or public logs. Prefer a manual, approved release step to automatic production updates on every commit.
