# Setup and local development

## Prerequisites

The locked project uses Expo **57.0.26**, React Native **0.86.3**, React **19.2.3** and WebView **13.16.1**. Node **24.20.0** is the tested version. Use an existing Node version manager with `nvm use` if available; `.nvmrc` does not install one. Run `node --version` and `npm --version`, then `npm ci`. Keep the lockfile and avoid ad-hoc dependency upgrades. [Expo’s SDK table](https://docs.expo.dev/versions/latest/) is the compatibility reference.

No `.env` file or API credentials are needed. Media thumbnails and the optional player need internet access. The core catalog, category search and demo accounts are local.

## Commands

| Command | Purpose |
| --- | --- |
| `npm start -- --go --lan` | Metro and QR for compatible Expo Go on the same network |
| `npm run web` | Browser preview; read the printed port |
| `npm run ios` / `npm run android` | Open an already configured simulator/emulator |
| `npm run typecheck` | Strict source, test and configuration TypeScript checks |
| `npm run lint` | Expo ESLint rules |
| `npm run doctor` | Pinned Expo Doctor compatibility/configuration checks |
| `npm run test:catalog` | Catalog integrity and metadata-search assertions |
| `npm test` | Catalog plus deterministic browser regressions |
| `npm run export:all` | Web assets and iOS/Android JavaScript/Hermes bundles in `dist/` |

`npm test` uses Playwright Chromium (`npx playwright install chromium`) and starts localhost Metro when none exists. Use `EXPO_BASE_URL=http://localhost:PORT npm test` for a server on another port; this opts out of automatic startup. `PLAYWRIGHT_CHANNEL=chrome npm test` selects installed Chrome. CI uses bundled Chromium. Tests run at a phone-sized browser viewport; that does not emulate native WebView or accessibility services.

## Try the app

1. Browse as a guest. Open a topic tile on Home, or the **Topics** tab → Prayer.
2. **Search** tab: type `devotion`, pick a topic chip, open a result, then Back. Switch tabs and return: the query and filter are as you left them.
3. Try Christian Living to see an empty topic and recover to the topic library.
4. Open a sermon and tap **Watch sermon**: it starts playing with the app's controls under the video. Press Back: the video docks above the tabs and keeps playing across tabs. Tap the dock to reopen Now Playing; close it with ✕. Backgrounding the app pauses it. Native behavior needs the device checks below.
5. **Account** tab → Sign in / Create account / Forgot password. Choose **Fill in sample details**, then a simulated Success or Error. Reset states that no email was sent. Close the form and reopen it to verify cleared fields.

## Phone launch and remaining checks

Use the fresh QR/LAN URL printed by Metro, not a saved machine IP. Physical iOS Expo Go currently requires matching Expo sign-ins on the CLI and phone; see [official instructions](https://docs.expo.dev/get-started/start-developing/). SDK support on the target phone must be checked. No sign-in or account setup was performed here.

A local native build needs full Xcode for iOS or an Android SDK/JDK/emulator for Android. No signed build, physical-device session or EAS build has been done; no store credentials were configured.

### iOS Simulator (development build)

Expo Go gets YouTube error 153 because it isn't this app's identity, so in-app playback needs a development build (verified 30 September 2026 with Xcode 27, iOS 27 simulator, iPhone 18 Pro Max).

1. Install Xcode, open it once to add the iOS platform, then `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`. Install CocoaPods (`brew install cocoapods`).
2. Build from a path without spaces. An Expo build script (EXConstants, "Generate app.config") fails on the space in "AAO App". A copy-on-write clone costs no disk: `cp -cR "AAO App" /some/path/aao-native`, then build there.
3. In the clone: `npx expo run:ios --device <simulator> --no-bundler`. Serve JavaScript from the real project with `npx expo start --port 8081`, so edits there reach the simulator. Add `--configuration Release` to judge smoothness.
4. `plugins/with-ios-scene-lifecycle.js` is required: iOS 27 won't launch an app built with its SDK unless it adopts the scene life cycle, and Expo's SDK 57 template (57.0.28) doesn't yet. Remove the plugin once the template does.

Prebuild rewrites the `ios`/`android` scripts in `package.json` and creates `ios/` (git-ignored); don't commit either.

Before calling native playback ready, test iOS and Android: provider identity/error 153, Watch → playing without a second tap, the app's transport and scrubber, the docked player staying visible and playing over the native screens and tab bar, backgrounding pausing, fullscreen exit/back, external provider links, network interruption/retry, rotation, hardware Back, keyboard inset handling (the dock over forms), VoiceOver/TalkBack and large text. Record OS, app container/build, video ID and observed behavior.

## Team testing (Expo, free plan)

The project is linked to the Expo account `mshumba` as `@mshumba/aao-app` (`extra.eas.projectId` in `app.json`). Teammates follow the shared team testing guide.

- **Web:** https://aao-app.expo.app (EAS Hosting). Redeploy after changes: `npx expo export --platform web && npx eas-cli@latest deploy --prod`.
- **Android:** internal-distribution APK from the `preview` profile in `eas.json`: `npx eas-cli@latest build --platform android --profile preview`. Each build gets a new install link on expo.dev. Expo generated and stores the Android signing key.
- **iPhone:** TestFlight once the Apple Developer Program is joined (not yet). Personal-team installs from Xcode expire after 7 days.
- **Expo Go:** not set up. Since May 2026 it opens shared updates only for members of the owning Expo organization, and it can't play the sermons (error 153).

## Troubleshooting

- **Phone cannot connect:** verify same Wi-Fi, LAN access permission/firewall, open laptop lid and a running Metro process. Re-scan the fresh QR after reconnecting. Temporary `caffeinate -i -t 7200` can prevent idle system sleep on macOS; it does not prevent lid sleep or change lock settings.
- **SDK mismatch:** install a compatible Go build or choose a development build; do not randomly downgrade React Native. Check Expo’s current compatibility guidance first.
- **Stale bundle:** stop Metro, then `npm start -- --clear`. Keep dependency changes and lockfile consistent.
- **Port busy:** reuse the existing app server, or select another port and set `EXPO_BASE_URL` for tests. Do not kill unrelated processes.
- **Player unavailable:** Try again (offered only for connection or device errors) or Watch on YouTube. Availability, region/age restrictions and embed permission belong to the provider. Expo Go's host identity triggers error 153 (observed on the iOS 27 simulator); a development build plays. A native app identity must be validated in an actual build; it is never fabricated to bypass the provider.
- **Offline images:** source thumbnails fall back to a placeholder showing the event name. This does not imply the video is available offline.
- **Browser missing:** install Playwright Chromium, or explicitly select installed Chrome. A successful export alone does not run the app.
