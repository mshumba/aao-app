# AAO · The Viewing Room

A local React Native / Expo prototype for finding and watching public sermons. Direction B uses dark teal surfaces, mint actions and Manrope. Browse as a guest, explore demo edification topics, search within a topic, watch a message, or try the simulated account flows.

## Get started

Use Node **24.20.0** (see `.nvmrc`) and npm. From this project directory:

```sh
npm ci
npm start -- --go --lan
```

Expo prints a QR code and the current LAN address. Keep the computer and phone on the same Wi-Fi with Metro running. Install an Expo Go version supporting **SDK 57** and scan the QR. Physical iPhone Expo Go currently requires the CLI and phone to use the same Expo account; see [Expo’s phone setup](https://docs.expo.dev/get-started/start-developing/). No developer account was created or signed into by this prototype work.

For a local browser preview:

```sh
npm run web
```

Open the local URL printed by Expo, normally `http://localhost:8081`.

**This is an actual Expo project; physical phone behavior is still unverified.** Android/iOS JavaScript exports compile, and browser navigation and playback have been exercised. A native export is not a signed binary or a device test. See [setup and troubleshooting](docs/development/getting-started.md) for the remaining phone checks and native-build prerequisites.

## What is here

- Browse → topic library → category → scoped search → sermon/detail/watch, with back and menu paths.
- Stable local category IDs, one primary topic plus optional secondary topics and tags per sermon. Assignments are explicitly **demo / unreviewed**; source titles, channel, duration and thumbnails are separate.
- Four public-source messages with consistent real titles and source thumbnails. YouTube is provisional; final catalog and rights remain open.
- Official provider playback loaded after Play, provider controls, minimum 200×200 viewport, retry and external fallback. Leaving or backgrounding stops the media; there is no download or background audio.
- Welcome/sign-in/sign-up/reset **simulations only**. Use `viewer@example.com` / `demo-password` through **Use demo values**. No GPT auth, account backend, email, credential logging or persistence. Watching stays open to guests.

## Verify

```sh
npm run typecheck
npm run lint
npm run doctor
npm run export:all
npx playwright install chromium
npm test
```

The suite starts a local web server if needed. Remote thumbnails are stubbed to their fallback in deterministic tests. To use an existing Chrome installation, run `PLAYWRIGHT_CHANNEL=chrome npm test`. The optional `node scripts/verify-playback.mjs` contacts live YouTube and requires local Chrome, Metro on port 8081 and network access.

## Developer guide

- [Setup, commands, troubleshooting and device checklist](docs/development/getting-started.md)
- [Architecture, catalog and future storage](docs/development/architecture.md)
- [Contributing and verification](docs/development/contributing.md)
- [GitHub CI, app refresh and prospective release/rollback](docs/development/releasing.md)
- [UI audit and its verification limits](docs/development/ui-audit.md)

Source: [mshumba/aao-app](https://github.com/mshumba/aao-app). The [GitHub workflow](https://github.com/mshumba/aao-app/actions/workflows/ci.yml) validates code only; inspect the run for the exact commit before treating a change as checked. No app update channel or deployment is configured. The desired app-refresh path still needs a product decision.
