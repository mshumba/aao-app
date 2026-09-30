# CI, app refresh and future release

## Current state

The source repository is [mshumba/aao-app](https://github.com/mshumba/aao-app), published with the owner’s authorization. Check [Actions](https://github.com/mshumba/aao-app/actions/workflows/ci.yml) for the exact commit status. No EAS project/update channel, signed build, store submission or deployment is configured. The desired refresh route remains pending. Private planning files are excluded from the public source snapshot.

`.github/workflows/ci.yml` runs on push and pull request in the public source repository. It has read-only contents permission, no persisted checkout credentials, SHA-pinned official actions, a 20-minute timeout and cancellation of superseded runs. It installs the lockfile, typechecks, lints, runs pinned Expo Doctor, exports all platforms, installs Playwright Chromium and runs the deterministic suite. Only failed-test evidence is retained for seven days. It has no release job, secrets or account setup. A green CI run would verify these checks, not phone playback.

## Choose what “refresh from GitHub” should mean

| Path | How changes reach the app | Prerequisites / limits |
| --- | --- | --- |
| Local Expo development | Review and pull a chosen commit, run `npm ci` when the lockfile changes, then restart Metro / reload Go | Same local server and compatible Go; not a distributed production update |
| Hosted web preview | Approved hosting workflow deploys a web export from a reviewed commit | Separate host/URL/access decision; no native binary |
| Installed native app updates | A configured service can send compatible JS/assets to a previously installed build | Developer/EAS project, runtime/channel policy, signing and release authorization first; none configured |
| New native binary | Build and distribute an approved signed binary | Needed for native dependency/config changes; SDK/toolchain and distribution account decisions |

[Expo Update](https://docs.expo.dev/eas-update/introduction/) is a possible future JS/assets delivery mechanism. It is not enabled by committing to GitHub, and native changes require a compatible new build. Account, billing, access, runtime version and channel choices must be settled before adding deployment credentials or an update workflow. [Expo’s build guide](https://docs.expo.dev/deploy/build-project/) describes build/distribution prerequisites.

## Proposed release gates — not configured

The source repository exists; branch protection is not configured. Choose branch/review policy before release and require CI plus review. Pick a staging path, validate actual devices and source rights, record the tested commit/runtime, then approve release separately. Keep future secrets in the chosen platform’s secret store with least privilege; never in source or public logs. Prefer a protected manual release job to automatic production updates from every commit.

## Recovery and rollback

- Local regression: stop the new Metro process, restore a known-good reviewed commit on a clean branch (preserve uncommitted work), run `npm ci`, then restart and retest. Avoid destructive resets.
- Web deployment, if later selected: retain immutable versioned exports and switch the host back to a tested version. Verify caches and navigation after rollback.
- Native JS update, if later configured: use the provider’s supported rollback/republish mechanism for the exact compatible runtime and channel, then verify on device. [Expo rollback guidance](https://docs.expo.dev/eas-update/rollbacks/) explains republishing a prior update or returning to the embedded version. Reverting a Git commit by itself does not update installed apps.
- Native binary defect: stage a corrected binary/distribution release; an incompatible native change cannot be repaired by an arbitrary JS rollback.

These are prospective procedures. There is currently nothing externally deployed to roll back.
