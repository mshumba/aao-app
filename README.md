# AAO App

A React Native / Expo app for finding and watching public sermons, heading to TestFlight. Browse as a guest, explore edification topics, search within a topic and watch a message; a free account saves sermons and keeps your topics. The palette is ivory and navy, chosen by the owner in October 2026: a warm ivory page, white surfaces, one deep navy accent for actions and selection, a little gold for editorial labels, and video kept dark. Type is Manrope, with a Newsreader serif for a few headlines. Other design choices remain open. The app isn't endorsed by the ministry whose sermons it shows.

## Get started

Use Node **24.20.0** (see `.nvmrc`) and npm. From this project directory:

```sh
npm ci
npm run web
```

Open the local URL printed by Expo, normally `http://localhost:8081`.

Accounts use [Supabase](supabase/README.md). Without a project, development uses an on-device stand-in account service: any email works and the code is always `123456`. To use a real project, copy `.env.example` to `.env` and fill in the Supabase URL and publishable key, then restart Metro. [Setup](docs/development/getting-started.md#environment) lists every variable and test value.

On a phone, use a development build: Expo Go can't play the sermons (YouTube error 153). `npm start -- --go --lan` still opens the app in Expo Go for quick layout checks; physical iPhone Expo Go requires the CLI and phone to use the same Expo account ([Expo’s phone setup](https://docs.expo.dev/get-started/start-developing/)). [Setup and troubleshooting](docs/development/getting-started.md) covers simulator and device builds, including free Personal Team builds (`AAO_PERSONAL_TEAM=1`).

**Device status:** the app has run on the iOS Simulator, where playback was checked, and as a locally built install on an iPhone (September 2026, before accounts). Android devices, TestFlight and sign-in against a real Supabase project from a phone are not yet verified. Browser behaviour is covered by the automated tests.

## What is here

- **First-run onboarding:** a welcome, topic choice, a free account and your name, then a sermon to start with. Guests can skip it and browse.
- **Real accounts on Supabase:** Continue with Apple or Google, the two main ways in, side by side. Email is a quieter fallback (**Use email instead**): a 6-digit code, or a password if you prefer. There is no phone or text-message sign-in. Sessions are kept in the iPhone Keychain / Android Keystore. Account deletion is in the app.
- **Guest browsing with a gate:** guests open every screen. Watch (except from a shared link) and Save ask for a free account, then carry on with what was tapped. A remote `guest_watch` setting can open watching to everyone without a new build.
- **Shared links:** `/s/<id>` lets anyone watch that sermon without an account.
- **Saved sermons** and an Account tab for your name, topics, sign-out and Delete account.
- **Resume where you left off:** for signed-in viewers, a sermon picks up where they stopped ("Resuming at 42:10 · Start over"), and Home opens with a **Continue watching** row of unfinished sermons, each with its progress. Progress is kept with the account, so it follows the viewer across devices.
- A floating tab bar (Home, Topics, Search, Account). Topic pages and sermons open over the tabs with Back.
- One app-wide player: **Watch sermon** starts the YouTube player on a Now Playing screen tinted from the sermon's artwork, with play/pause, back 15s, forward 30s, a scrubber and speed. Going back docks the video above the tabs and it keeps playing while you browse; close it from the dock.
- **The full Apostle Arome Osayi channel library** (about 2,800 long-form videos, including sermons by other ministers on the channel), served from Supabase so new sermons appear without an app update. Short headlines, events, series, days and preaching dates are read from each YouTube title; the exact title is always kept and shown. Home has the newest sermon, the latest ones and rails for recent series; Search covers the whole library. The app keeps a copy on the device and syncs only what changed; offline on first launch, four bundled sermons stand in.
- Stable local category IDs, one primary topic plus optional secondary topics and tags per sermon. Assignments are explicitly **demo / unreviewed**, cover only four sermons, and live in their own module (`src/data/edification.ts`), apart from the catalogue.
- Official provider playback with YouTube's own controls visible, minimum 200×200 viewport full or docked, retry where it can help and a Watch on YouTube fallback. Leaving the app pauses the sermon; there is no download or background audio.
- TestFlight-ready configuration: bundle ID `com.mshumba.aao`, an ivory-on-navy app icon, EAS build profiles and EAS Update channels. No TestFlight build has been made yet.

## Verify

```sh
npm run typecheck
npm run lint
npm run doctor
npm run export:all
npx playwright install chromium
npm test
```

The suite starts a local web server if needed and always uses the on-device account stand-in, and with it the four bundled sermons rather than the live library. Remote thumbnails are stubbed to their fallback in deterministic tests. To use an existing Chrome installation, run `PLAYWRIGHT_CHANNEL=chrome npm test`. The optional `node scripts/verify-playback.mjs` contacts live YouTube and requires local Chrome, Metro on port 8081 and network access.

## Developer guide

- [Setup, environment, commands, troubleshooting and device checklist](docs/development/getting-started.md)
- [Architecture, catalog and storage](docs/development/architecture.md)
- [Accounts, onboarding and the guest gate](docs/development/accounts.md)
- [Supabase project setup](supabase/README.md)
- [Contributing and verification](docs/development/contributing.md)
- [CI, EAS builds, TestFlight, updates and rollback](docs/development/releasing.md)
- [Failure alerts: what the app reports to Sentry and how to be told](docs/development/failure-alerts.md)
- [UI audit and its verification limits](docs/development/ui-audit.md)

Source: [mshumba/aao-app](https://github.com/mshumba/aao-app). The [GitHub workflow](https://github.com/mshumba/aao-app/actions/workflows/ci.yml) validates code only; inspect the run for the exact commit before treating a change as checked. The web preview is on EAS Hosting and Android test builds come from EAS; TestFlight and EAS Update are configured but not yet used.
