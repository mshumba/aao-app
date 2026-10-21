# Setup and local development

## Prerequisites

The locked project uses Expo **57.0.30** (Expo Router **57.0.28**), React Native **0.86.3**, React **19.2.3** and WebView **13.16.1**. Node **24.20.0** is the tested version. Use an existing Node version manager with `nvm use` if available; `.nvmrc` does not install one. Run `node --version` and `npm --version`, then `npm ci`. Keep the lockfile and avoid ad-hoc dependency upgrades. [Expo’s SDK table](https://docs.expo.dev/versions/latest/) is the compatibility reference.

Media thumbnails and the player need internet access. With a Supabase project in `.env`, the sermon library loads from it (the device keeps a copy); in on-device mode (`EXPO_PUBLIC_AUTH_MODE=local`, or no Supabase project) the app uses four bundled sermons. Search's title matches as you type are local over whichever list is loaded; a submitted search goes to the `search` Edge Function, and needs, paths and moments come from Supabase. In on-device mode those come from the deterministic fixtures in `src/learning/fixtures.ts`, so nothing leaves the device.

## Environment

Accounts use Supabase. To use a real project, copy `.env.example` to `.env` (git-ignored) and fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; [`supabase/README.md`](../../supabase/README.md) covers creating the project. Restart Metro after changing `.env`.

Without them:

- **Development** (`npm start`, `npm run web`) uses an on-device stand-in account service. Nothing leaves the device, and the sign-in screens say so.
- **Release builds** report that accounts aren't available yet, leave watching open and hide Save.
- **The automated tests** always use the stand-in (`EXPO_PUBLIC_AUTH_MODE=local` in `playwright.config.ts`), even when `.env` points at a real project.

Every variable, and how the service is chosen, is in [accounts](accounts.md#which-account-service-runs).

### Test values (stand-in service)

| Input | Result |
| --- | --- |
| Email code `123456` | Accepted |
| Code `000000` | Expired |
| Sign up as `taken@example.com` | Address already used |
| Password `wrong-password` (or under 8 characters) at sign-in | Rejected |
| Apple or Google | Signs in at once as a sample viewer |

## Commands

| Command | Purpose |
| --- | --- |
| `npm start` | Metro for a development build (see below) |
| `npm start -- --go --lan` | Metro and QR for Expo Go on the same network (no sermon playback there) |
| `npm run web` | Browser preview; read the printed port |
| `npm run ios` / `npm run android` | Open an already configured simulator/emulator |
| `npm run typecheck` | Strict source, test and configuration TypeScript checks |
| `npm run lint` | Expo ESLint rules |
| `npm run doctor` | Pinned Expo Doctor compatibility/configuration checks |
| `npm run test:catalog` | Catalog integrity, title parsing, sync and search assertions |
| `npm run catalogue:import -- <manifest.json>` | Load the channel catalogue into Supabase ([details](../../supabase/README.md#7-load-the-sermon-catalogue)) |
| `npm test` | Catalog, Node tests of the account, sync and queue rules, and deterministic browser regressions |
| `npm run export:all` | Web assets and iOS/Android JavaScript/Hermes bundles in `dist/` |
| `npm run icons` | Redraws the app icon, adaptive icon, splash mark and favicon in `assets/` from `assets/icon-source/render.mjs` |
| `npm run ios:simulator` | EAS build of the development client for the iOS Simulator |
| `npm run build:testflight` | EAS production build for iPhone. Its upload to TestFlight needs an App Store Connect API key that EAS can't make for this account ([releasing](releasing.md#build-and-upload)) |
| `npm run update:preview` | Publishes an EAS Update to `preview` builds |

The `eas` scripts need EAS CLI (`npm install -g eas-cli`, then `eas login`) and change things on the Expo account; see [releasing](releasing.md) before running them.

`npm test` uses Playwright Chromium (`npx playwright install chromium`) and starts localhost Metro when none exists. Use `EXPO_BASE_URL=http://localhost:PORT npm test` for a server on another port; this opts out of automatic startup. `PLAYWRIGHT_CHANNEL=chrome npm test` selects installed Chrome. CI uses bundled Chromium. Tests run at a phone-sized browser viewport; that does not emulate native WebView or accessibility services.

## Try the app

These steps use the on-device stand-in and the four bundled sermons (no `.env`, or `EXPO_PUBLIC_AUTH_MODE=local`).

1. The first visit (or a private browser window) opens the welcome. **Explore first** browses as a guest; **Get started** picks topics, offers a free account and asks your name.
2. Browse as a guest. Open the **Search** tab → **Browse by topic** → Purpose & Calling (its sermons, best match first), or the **Paths** tab and a path.
3. **Search** tab: type `shift`, open a result, then Back. Switch tabs and return: the query is as you left it.
4. Try Hearing God under **Browse by topic** to see an empty topic in the bundled sample, then **Browse other topics**.
5. As a guest, tap **Watch sermon** on a sermon: a sheet asks for a free account, with Apple and Google first. Tap **Use email instead**, enter any address, then the code `123456` (or tap Apple or Google, which sign in at once with the stand-in). The sheet closes and the sermon starts. **Save** works the same way.
6. Watching: the app's controls sit under the video. Press Back: the video docks above the tabs and keeps playing across tabs. Tap the dock to reopen Now Playing; close it with ✕. On the web, backgrounding the app pauses it; on a phone, a sermon on R2 keeps playing. Native behavior needs the device checks below.
7. **Account** tab: change your name or topics, open **Saved sermons**, sign out, and sign back in. **Delete account** asks once, then deletes the account.
8. Signed out, open a shared link, `/s/<sermon id>` (for example `http://localhost:8081/s/H9sRbSUt0YE`): that sermon plays without an account; others still ask.

## Phone launch and remaining checks

Use a **development build**, not Expo Go. `expo-dev-client` is installed, so `npm start` serves a development build by default (`--go` switches to Expo Go). Expo Go can't play the sermons (YouTube error 153), and in Expo Go Sign in with Apple signs in as Expo Go's own app (`host.exp.Exponent`), which Supabase only accepts if that ID is added to the Apple provider's **Client IDs**.

Use the fresh QR/LAN URL printed by Metro, not a saved machine IP. A local native build needs full Xcode for iOS or an Android SDK/JDK/emulator for Android.

### iOS Simulator (development build)

Expo Go gets YouTube error 153 because it isn't this app's identity, so in-app playback needs a development build (verified 30 September 2026 with Xcode 27, iOS 27 simulator, iPhone 18 Pro Max).

1. Install Xcode, open it once to add the iOS platform, then `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`. Install CocoaPods (`brew install cocoapods`).
2. Build from a path without spaces. An Expo build script (EXConstants, "Generate app.config") fails on the space in "AAO App". A copy-on-write clone costs no disk: `cp -cR "AAO App" /some/path/aao-native`, then build there.
3. In the clone: `npx expo run:ios --device <simulator> --no-bundler`. Serve JavaScript from the real project with `npx expo start --port 8081`, so edits there reach the simulator. Add `--configuration Release` to judge smoothness.
4. `plugins/with-ios-scene-lifecycle.js` is required: iOS 27 won't launch an app built with its SDK unless it adopts the scene life cycle, and Expo's SDK 57 template (57.0.28) doesn't yet. Remove the plugin once the template does.

`npm run ios:simulator` builds the same development client on EAS instead, without Xcode.

**From `0.2.0`, rebuild.** `0.2.0` added native code: expo-video (the R2 player) and view-controller-based status bar appearance. A development client built from `0.1.0` fails at launch when Metro serves it this JavaScript (it can't find the ExpoVideo module; runtime versions don't protect development clients), so build a new one (`npm run ios:simulator`, or the steps above). A reused clone keeps its old `ios/`, because `npx expo run:ios` only runs prebuild when `ios/` is missing, and with the old `Info.plist` full screen keeps the status bar on iOS 27. Regenerate it first with `npx expo prebuild -p ios --clean` (`AAO_PERSONAL_TEAM=1 npx expo prebuild -p ios --clean` for a Personal Team build, below).

### iOS device (free Personal Team)

Without a paid Apple Developer Program team, a phone can run a build signed with Xcode's free Personal Team; it expires after 7 days. A Personal Team can't sign the Sign in with Apple entitlement, so build with it left out:

```sh
AAO_PERSONAL_TEAM=1 npx expo run:ios --device
```

Run it in the clone without spaces, as above, and regenerate a clone from before `0.2.0` first. `app.config.ts` then removes the entitlement, and the Apple button reports that option isn't available; email and Google sign-in still work. Builds for TestFlight never set the flag. If `ios/` was generated without the flag, regenerate it with the flag (`AAO_PERSONAL_TEAM=1 npx expo prebuild -p ios --clean`).

Prebuild rewrites the `ios`/`android` scripts in `package.json` and creates `ios/` (git-ignored); don't commit either.

Before calling native playback ready, test iOS and Android: provider identity/error 153, Watch → playing without a second tap, the app's transport and scrubber, the docked player staying visible and playing over the native screens and tab bar, leaving the app (a sermon on R2 keeps playing, with the lock screen, Now Playing and picture in picture; a YouTube one pauses), full screen hiding the status bar (on iOS 27 too) and, on Android, the navigation bar, with a swipe bringing them back only for a moment, fullscreen exit/back, external provider links, network interruption/retry, rotation, hardware Back, keyboard inset handling (the dock over forms), VoiceOver/TalkBack and large text. Record OS, app container/build, video ID and observed behavior.

## Team testing (Expo, free plan)

The project is linked to the Expo account `mshumba` as `@mshumba/aao-app` (`extra.eas.projectId` in `app.json`). Teammates follow the shared team testing guide.

- **Web:** while the app is in private testing, the public addresses (https://aao-app.expo.app on EAS Hosting, and the Cloudflare Pages production site) show a branded holding page with the privacy policy and terms (`web/holding`, published by `scripts/deploy-holding.sh`). The app itself goes to an unlisted (not access-controlled) Cloudflare Pages preview branch, `https://<preview branch>.aao-web.pages.dev`: `scripts/deploy-web.sh <empty output folder> <preview branch>`, which reads only the `EXPO_PUBLIC_*` values in `.env` and refuses the production branch. Anyone with the address can open it, sign-in and search included, so use a long random branch name of lowercase letters and digits, and never commit, post or log it. For real privacy, put Cloudflare Access in front of the `aao-web` project's preview deployments. `eas deploy --prod` publishes to aao-app.expo.app, so an app export sent there would replace the holding page.
- **Android:** internal-distribution APK from the `preview` profile in `eas.json`: `npx eas-cli@latest build --platform android --profile preview`. Each build gets a new install link on expo.dev. Expo generated and stores the Android signing key. The package changed from `com.aao.prototype` to `com.mshumba.aao` in October 2026: the next APK installs as a separate app (remove the old one), and EAS keeps signing keys per package, so that build sets up a new key. Preview builds take EAS Updates from the `preview` channel (`npm run update:preview`).
- **iPhone:** TestFlight, bundle ID `com.mshumba.aao`. The Apple Developer Program is joined and builds are on TestFlight ([releasing](releasing.md#testflight)); build 3 and later sign in with Google's own sheet ([accounts](accounts.md#sign-in-methods)). Personal-team installs from Xcode expire after 7 days.
- **Expo Go:** not set up. Since May 2026 it opens shared updates only for members of the owning Expo organization, and it can't play the sermons (error 153).

## Troubleshooting

- **Phone cannot connect:** verify same Wi-Fi, LAN access permission/firewall, open laptop lid and a running Metro process. Re-scan the fresh QR after reconnecting. Temporary `caffeinate -i -t 7200` can prevent idle system sleep on macOS; it does not prevent lid sleep or change lock settings.
- **SDK mismatch:** install a compatible Go build or choose a development build; do not randomly downgrade React Native. Check Expo’s current compatibility guidance first.
- **Stale bundle:** stop Metro, then `npm start -- --clear`. Keep dependency changes and lockfile consistent.
- **Port busy:** reuse the existing app server, or select another port and set `EXPO_BASE_URL` for tests. Do not kill unrelated processes.
- **"Accounts aren't available":** a release build without `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Set them as EAS environment variables for that build's environment and rebuild.
- **Apple button says it isn't available:** the build was made with `AAO_PERSONAL_TEAM=1`, or Apple isn't enabled in Supabase with this build's bundle ID (`com.mshumba.aao`) in **Client IDs**. A native project generated before the bundle ID changed from `com.aao.prototype` still uses the old ID; regenerate it (`npx expo prebuild -p ios --clean`, adding `AAO_PERSONAL_TEAM=1` for a Personal Team build).
- **Emails with codes don't arrive:** Supabase's built-in sender only allows a few emails an hour and is meant for testing. Set up custom SMTP ([`supabase/README.md`](../../supabase/README.md)).
- **Player unavailable:** Try again (offered only for connection or device errors) or Watch on YouTube. Availability, region/age restrictions and embed permission belong to the provider. Expo Go's host identity triggers error 153 (observed on the iOS 27 simulator); a development build plays. A native app identity must be validated in an actual build; it is never fabricated to bypass the provider.
- **Offline images:** source thumbnails fall back to a placeholder showing the event name. This does not imply the video is available offline.
- **Browser missing:** install Playwright Chromium, or explicitly select installed Chrome. A successful export alone does not run the app.
