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

1. Browse as a guest. Open Menu → Browse by topic → Prayer → Search this topic.
2. Search `devotion`; open a result, then Back. Search input and scope remain available.
3. Clear the scope to search across all messages. Try Christian Living to see an empty topic and recover to the library.
4. Open a sermon and tap Play. The official player appears; press its own Play control. Menu, Back or backgrounding stops the embed. Native behavior needs the device checks below.
5. Menu → Account (demo) → Sign in/Sign up/Reset. Choose **Use demo values**, then simulated Success or Rejected. Reset states that no email was sent. Close the form and reopen it to verify cleared fields.

## Phone launch and remaining checks

Use the fresh QR/LAN URL printed by Metro, not a saved machine IP. Physical iOS Expo Go currently requires matching Expo sign-ins on the CLI and phone; see [official instructions](https://docs.expo.dev/get-started/start-developing/). SDK support on the target phone must be checked. No sign-in or account setup was performed here.

A local native build needs full Xcode for iOS or an Android SDK/JDK/emulator for Android, then a chosen native build workflow. Neither a signed build nor a physical-device session has been verified. Apple Command Line Tools alone do not provide the full iOS Simulator environment. No EAS build or store credentials were configured.

Before calling native playback ready, test iOS and Android: provider identity/error 153, ready→playing→advancing time, fullscreen exit/back, route changes/background audio stop, external provider links, network interruption/retry, rotation, hardware Back, keyboard inset handling, VoiceOver/TalkBack and large text. Record OS, app container/build, video ID and observed behavior.

## Troubleshooting

- **Phone cannot connect:** verify same Wi-Fi, LAN access permission/firewall, open laptop lid and a running Metro process. Re-scan the fresh QR after reconnecting. Temporary `caffeinate -i -t 7200` can prevent idle system sleep on macOS; it does not prevent lid sleep or change lock settings.
- **SDK mismatch:** install a compatible Go build or choose a development build; do not randomly downgrade React Native. Check Expo’s current compatibility guidance first.
- **Stale bundle:** stop Metro, then `npm start -- --clear`. Keep dependency changes and lockfile consistent.
- **Port busy:** reuse the existing app server, or select another port and set `EXPO_BASE_URL` for tests. Do not kill unrelated processes.
- **Player unavailable:** retry or use Open on YouTube. Availability, region/age restrictions and embed permission belong to the provider. Go’s host identity may trigger error 153. A native app identity must be validated in an actual build; it is never fabricated to bypass the provider.
- **Offline images:** source thumbnails fall back to a plain sermon placeholder. This does not imply the video is available offline.
- **Browser missing:** install Playwright Chromium, or explicitly select installed Chrome. A successful export alone does not run the app.
