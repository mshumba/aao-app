# Setup and local development

## Prerequisites

The locked project uses Expo **57.0.26**, React Native **0.86.3**, React **19.2.3** and WebView **13.16.1**. Node **24.20.0** is the tested version. Use an existing Node version manager with `nvm use` if available; `.nvmrc` does not install one. Run `node --version` and `npm --version`, then `npm ci`. Keep the lockfile and avoid ad-hoc dependency upgrades. [Expo’s SDK table](https://docs.expo.dev/versions/latest/) is the compatibility reference.

Media thumbnails and the player need internet access. The catalog and category search are local.

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
| `npm run test:catalog` | Catalog integrity and metadata-search assertions |
| `npm test` | Catalog plus deterministic browser regressions |
| `npm run export:all` | Web assets and iOS/Android JavaScript/Hermes bundles in `dist/` |
| `npm run icons` | Redraws the app icon, adaptive icon, splash mark and favicon in `assets/` from `assets/icon-source/render.mjs` |
| `npm run ios:simulator` | EAS build of the development client for the iOS Simulator |
| `npm run build:testflight` | EAS production build for iPhone, uploaded to TestFlight ([releasing](releasing.md#testflight)) |
| `npm run update:preview` | Publishes an EAS Update to `preview` builds |

The `eas` scripts need EAS CLI (`npm install -g eas-cli`, then `eas login`) and change things on the Expo account; see [releasing](releasing.md) before running them.

`npm test` uses Playwright Chromium (`npx playwright install chromium`) and starts localhost Metro when none exists. Use `EXPO_BASE_URL=http://localhost:PORT npm test` for a server on another port; this opts out of automatic startup. `PLAYWRIGHT_CHANNEL=chrome npm test` selects installed Chrome. CI uses bundled Chromium. Tests run at a phone-sized browser viewport; that does not emulate native WebView or accessibility services.

## Try the app

1. The first visit (or a private browser window) opens the welcome. **Explore first** browses as a guest; **Get started** picks topics, offers a free account and asks your name.
2. Browse as a guest. Open a topic tile on Home, or the **Topics** tab → Prayer.
3. **Search** tab: type `devotion`, pick a topic chip, open a result, then Back. Switch tabs and return: the query and filter are as you left them.
4. Try Christian Living to see an empty topic and recover to the topic library.
5. As a guest, tap **Watch sermon** on a sermon: a sheet asks for a free account, with Apple and Google first. Tap **Use email instead**, enter any address, then the code `123456` (or tap Apple or Google, which sign in at once with the stand-in). The sheet closes and the sermon starts. **Save** works the same way.
6. Watching: the app's controls sit under the video. Press Back: the video docks above the tabs and keeps playing across tabs. Tap the dock to reopen Now Playing; close it with ✕. Backgrounding the app pauses it. Native behavior needs the device checks below.
7. **Account** tab: change your name or topics, open **Saved sermons**, sign out, and sign back in. **Delete account** asks once, then deletes the account.
8. Signed out, open a shared link, `/s/<sermon id>` (for example `http://localhost:8081/s/H9sRbSUt0YE`): that sermon plays without an account; others still ask.

## Phone launch and remaining checks

Use a **development build**, not Expo Go. `expo-dev-client` is installed, so `npm start` serves a development build by default (`--go` switches to Expo Go). Expo Go can't play the sermons (YouTube error 153), and in Expo Go Sign in with Apple signs in as Expo Go's own app (`host.exp.Exponent`), which Supabase only accepts if that ID is added to the Apple provider's **Client IDs**.

Use the fresh QR/LAN URL printed by Metro, not a saved machine IP. A local native build needs full Xcode for iOS or an Android SDK/JDK/emulator for Android. No TestFlight build or store submission has been made.

### iOS Simulator (development build)

Expo Go gets YouTube error 153 because it isn't this app's identity, so in-app playback needs a development build (verified 30 September 2026 with Xcode 27, iOS 27 simulator, iPhone 18 Pro Max).

1. Install Xcode, open it once to add the iOS platform, then `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`. Install CocoaPods (`brew install cocoapods`).
2. Build from a path without spaces. An Expo build script (EXConstants, "Generate app.config") fails on the space in "AAO App". A copy-on-write clone costs no disk: `cp -cR "AAO App" /some/path/aao-native`, then build there.
3. In the clone: `npx expo run:ios --device <simulator> --no-bundler`. Serve JavaScript from the real project with `npx expo start --port 8081`, so edits there reach the simulator. Add `--configuration Release` to judge smoothness.
4. `plugins/with-ios-scene-lifecycle.js` is required: iOS 27 won't launch an app built with its SDK unless it adopts the scene life cycle, and Expo's SDK 57 template (57.0.28) doesn't yet. Remove the plugin once the template does.

`npm run ios:simulator` builds the same development client on EAS instead, without Xcode.

### iOS device (free Personal Team)

Without a paid Apple Developer Program team, a phone can run a build signed with Xcode's free Personal Team; it expires after 7 days. A Personal Team can't sign the Sign in with Apple entitlement, so build with it left out:

```sh
AAO_PERSONAL_TEAM=1 npx expo run:ios --device
```

Run it in the clone without spaces, as above. `app.config.ts` then removes the entitlement, and the Apple button reports that option isn't available; email and Google sign-in still work. Builds for TestFlight never set the flag. If `ios/` was generated without the flag, regenerate it with the flag (`AAO_PERSONAL_TEAM=1 npx expo prebuild -p ios --clean`).

Prebuild rewrites the `ios`/`android` scripts in `package.json` and creates `ios/` (git-ignored); don't commit either.

Before calling native playback ready, test iOS and Android: provider identity/error 153, Watch → playing without a second tap, the app's transport and scrubber, the docked player staying visible and playing over the native screens and tab bar, backgrounding pausing, fullscreen exit/back, external provider links, network interruption/retry, rotation, hardware Back, keyboard inset handling (the dock over forms), VoiceOver/TalkBack and large text. Record OS, app container/build, video ID and observed behavior.

## Team testing (Expo, free plan)

The project is linked to the Expo account `mshumba` as `@mshumba/aao-app` (`extra.eas.projectId` in `app.json`). Teammates follow the shared team testing guide.

- **Web:** https://aao-app.expo.app (EAS Hosting). Redeploy after changes: `npx expo export --platform web && npx eas-cli@latest deploy --prod`.
- **Android:** internal-distribution APK from the `preview` profile in `eas.json`: `npx eas-cli@latest build --platform android --profile preview`. Each build gets a new install link on expo.dev. Expo generated and stores the Android signing key. The package changed from `com.aao.prototype` to `com.mshumba.aao` in October 2026: the next APK installs as a separate app (remove the old one), and EAS keeps signing keys per package, so that build sets up a new key. Preview builds take EAS Updates from the `preview` channel (`npm run update:preview`).
- **iPhone:** TestFlight, bundle ID `com.mshumba.aao`. The Apple Developer Program is joined and the repository is ready ([releasing](releasing.md#testflight)); no TestFlight build has been uploaded yet. Personal-team installs from Xcode expire after 7 days.
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
