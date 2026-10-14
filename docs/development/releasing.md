# CI, builds and releases

## Current state

The source repository is [mshumba/aao-app](https://github.com/mshumba/aao-app), published with the owner’s authorization. Check [Actions](https://github.com/mshumba/aao-app/actions/workflows/ci.yml) for the exact commit status. Private planning files are excluded from the public source snapshot.

The app is linked to the Expo project `@mshumba/aao-app` (`extra.eas.projectId` in `app.json`) on Expo's free plan. Team testing uses the web link on EAS Hosting and Android APKs from the `preview` profile (see [getting started](getting-started.md#team-testing-expo-free-plan)). The repository is configured for TestFlight and EAS Update, but no iOS build, store submission or update has been made from this configuration yet. The Apple Developer Program has been joined; the bundle ID is `com.mshumba.aao` and the App Store Connect name "AAO App" (the home-screen name stays "AAO").

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

`appVersionSource` is `remote`: EAS keeps the build numbers (iOS `buildNumber`, Android `versionCode`) and each production build increments them. The first build after this switch asks where to start the remote numbers. The version people see is `expo.version` in `app.json` (now `0.1.0`); change it by hand for each release.

## TestFlight

### Before the first build

These need a person with the accounts; they can't be done from the repository.

1. **Join the Apple Developer Program** ($99 a year) with an Apple Account that has two-factor authentication. Done. (An individual membership shows your legal name as the seller; an organization membership needs a legal entity and a D-U-N-S number.)
2. **Choose the production bundle ID and store name.** Done: `com.mshumba.aao` in `ios.bundleIdentifier` and `android.package` in `app.json`, replacing `com.aao.prototype`, and the App Store Connect name "AAO App" (the record itself is created by the first submit). The bundle ID can't be changed once that record exists.
3. **Set up Supabase** following [`supabase/README.md`](../../supabase/README.md): run the migration, enable the providers (Apple with `com.mshumba.aao` in **Client IDs**, Google, email with the code templates) and set up custom SMTP before inviting testers.
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

Only `EXPO_PUBLIC_*` values belong in EAS environment variables for the app, and they end up in the bundle. `EXPO_PUBLIC_AUTH_METHODS` and `EXPO_PUBLIC_WEB_URL` are optional ([accounts](accounts.md#which-account-service-runs)). Nothing secret goes in `eas.json`.

`npm run build:testflight` runs `eas build -p ios --profile production --auto-submit`. The first time, EAS asks you to sign in to your Apple account (with a 2FA code). It creates the distribution certificate and provisioning profile, turns on Sign in with Apple for the App ID, and offers to set up remote build numbers. The submit step then creates the App Store Connect app record and an App Store Connect API key for later uploads. `npx testflight` does build, submit and internal-group setup in one interactive step instead.

After the first upload, add the IDs to `eas.json` so later submits don't ask:

```json
"submit": {
  "production": {
    "ios": {
      "ascAppId": "<numeric Apple ID from App Store Connect → App Information>",
      "appleTeamId": "<10-character team ID>"
    }
  }
}
```

`ios.config.usesNonExemptEncryption` is `false` (the app only uses HTTPS and the system's cryptography), so uploads don't ask the export-compliance question each time. `ios.supportsTablet` is `false`: the app is phone-first, and an iPad build would need iPad screenshots and an iPad-quality layout for review.

### Testers

- **Internal testers:** up to 100 people with App Store Connect access. Builds reach them after processing, without review.
- **External testers:** up to 10,000 by email or public link. The first build of a version needs Beta App Review, with a beta description, a feedback email and the review account.
- TestFlight builds expire after 90 days.

### Before the App Store (later)

App Privacy answers ([accounts](accounts.md#app-store-notes)), the age rating questionnaire, the Content Rights answer (the app shows third-party YouTube content, so keep written authorization from the content owner), 6.9-inch iPhone screenshots, and review notes with the review account.

### Local device builds without the paid program

A free Personal Team can't sign the Sign in with Apple entitlement. Build with `AAO_PERSONAL_TEAM=1` (see [getting started](getting-started.md#ios-device-free-personal-team)); `app.config.ts` then leaves the entitlement out and the Apple button reports that option isn't available.

## Over-the-air updates (EAS Update)

`expo-updates` is installed. `app.json` sets `updates.url` and `runtimeVersion: { "policy": "appVersion" }`, and each build profile has a channel. A build checks for an update when it launches, downloads it in the background, and uses it from the next launch.

```sh
npm run update:preview          # eas update --channel preview --environment preview
eas update --channel production --environment production --message "Fix sermon titles"
```

Only JavaScript and assets ship this way. Anything native needs a new build: a new native module, a change to `app.json` or `app.config.ts`, the icon or splash, permissions. With the `appVersion` policy a build only takes updates made for the same `expo.version`, so **bump the version for every native change**. Otherwise old builds can be sent JavaScript that expects native code they don't have.

Android APKs built before October 2026 don't include `expo-updates` and won't receive updates; install a new `preview` build.

Expo's free plan (October 2026; check [expo.dev/pricing](https://expo.dev/pricing)) includes a limited number of iOS and Android builds a month on a low-priority queue that can take over an hour, and EAS Update for up to 1,000 monthly active users.

## Recovery and rollback

- **A bad update:** `eas update:rollback` either republishes an earlier update or returns the channel to the JavaScript embedded in the build (`eas update:republish` and `eas update:roll-back-to-embedded` do each directly). Then check on a device. See [Expo's rollback guide](https://docs.expo.dev/eas-update/rollbacks/). Reverting a Git commit by itself doesn't change installed apps.
- **A bad TestFlight build:** expire it in App Store Connect (TestFlight → the build → Expire), so testers go back to an earlier build that hasn't expired, then upload a fixed build. A native defect can't be fixed with an update for a different runtime.
- **Web:** keep versioned exports and redeploy a tested one (`npx eas-cli@latest deploy --prod` from that export). Check caches and navigation after rolling back.
- **Local regression:** stop the new Metro process, check out a known-good reviewed commit on a clean branch (keep uncommitted work), run `npm ci`, then restart and retest. Avoid destructive resets.

## Release gates

Branch protection isn't configured. Before a store release: require CI and review on `main`, test the exact commit on devices (iPhone and Android, signed in and as a guest), confirm content rights, and record the tested commit and runtime version. Keep secrets in EAS or GitHub's secret store with least privilege, never in source or public logs. Prefer a manual, approved release step to automatic production updates on every commit.
