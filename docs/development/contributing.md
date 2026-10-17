# Contributing

Keep changes focused on the sermon experience. Preserve exact source titles and legal provider controls, and keep topics in Supabase (the app holds only each topic's icon). A working menu item must lead to a built screen with a sensible back path.

## Accounts and copy

- **Gate actions, not screens.** Guests can open every screen. An action that needs an account goes through `useGate().require(intent)`, so the sign-up sheet opens and the action carries on afterwards. Don't add a sign-in wall to a route. [Accounts](accounts.md) explains the gate and the remote `guest_watch` setting.
- **Screens use `useAccount()`, never supabase-js.** Service details stay in `src/auth/`, behind `AuthBackend`. Schema changes go in a new file in `supabase/migrations/`.
- **Honest copy.** The app isn't official or endorsed by the ministry; never imply it is. Accounts are "free", not "free forever". Normal UI has no demo or test language; the stand-in's test-mode notice only shows when `mode === "local"`.
- **Never log or store credentials.** No `console.log` of passwords, codes, tokens or auth responses. Passwords and codes go only to the account service; the session lives only in Supabase's storage adapter (the Keychain on phones). No secret or `service_role` key in the app, `.env`, `eas.json` or tests.
- **Tests use the local service.** Playwright runs with `EXPO_PUBLIC_AUTH_MODE=local`; never point tests at a real Supabase project or a real inbox. Use `example.com` addresses and the [test values](accounts.md#local-test-values).

## Development loop

1. Start from the locked dependencies with `npm ci` and use the documented Node version.
2. Make a focused change using shared controls/tokens. Keep text flexible, touch areas at least 48 logical units, and topic scope visible and removable.
3. Run typecheck, lint, Doctor, all-platform export and relevant tests. The required CI performs the same checks with frozen dependencies and bundled Chromium.
4. Inspect small-phone and wide layouts. Check empty/invalid data, reduced motion and back/dismiss behavior. For player changes, run the optional live browser probe and the native device checklist.
5. Describe the behavior change, evidence and remaining limits. Do not describe compilation or a browser viewport as a native-device pass.

`tests/catalog.spec.ts` checks the bundled sample's exact verified titles, that records carry no topic fields, that the sample matches what the import writes, a topic's order, Home's topic rail, search, event lines and series order. `tests/parseTitle.spec.ts` covers the title parser on one real title per house style. `tests/catalogue.spec.ts` drives the library's sync with a fake Supabase and storage: first launch online and offline (the bundled sample), a saved copy and its "changed since" sync, the weekly full sync, damaged copies and failing storage. `tests/topics.spec.ts` exercises menu/library/scoped-search/detail/empty/recovery, in-place topic filtering, 320px overflow and small targets. `tests/core.spec.ts` covers guest flows, heading levels, the player through a deterministic fake IFrame API (`tests/fixtures.ts`: Watch auto-start, transport commands, docking that keeps the same player across tabs, replacing the docked sermon, pausing when the app is hidden, errors that only offer retry where it can help), double-tap guards on rows, Watch and Back, repeated link parameters, missing artwork, sample screens without console errors, and press feedback under Reduce Motion; `tests/onboarding.spec.ts` covers the first launch (welcome once, topics, account, name, done, and leaving as a guest). `tests/gate.spec.ts` covers guest browsing, Watch and Save asking for an account and then carrying on, closing the sheet, shared links and code errors. `tests/account.spec.ts` covers the signed-in profile, sign-out, saving, deletion, and password sign-in, sign-up and reset. Browser fixtures abort thumbnail requests so required checks remain independent of remote image availability. Live playback is deliberately an opt-in network check, not a CI availability dependency.

Run `npm audit` when changing packages and assess direct impact/compatible updates. The initial toolchain audit reported moderate transitive findings and no high/critical findings; its suggested blanket fix required incompatible downgrades. Do not use `npm audit fix --force` as an automatic remedy. Recheck before an actual release.

## Public-source hygiene

Local historical plans, private context, agent instructions, design references, generated screenshots/logs and machine-specific evidence are preserved but ignored. Never use `git add -f` to sweep them into a public repository. `.gitignore` is a guardrail, not proof that staged files are safe. Inspect `git status`, the staged file list and each diff; search for credentials, local paths, account identifiers and private text before publication.

Intended source allowlist: `src/`, `tests/`, `scripts/`, `assets/`, `plugins/`, `supabase/`, `docs/development/`, `.github/workflows/ci.yml`, README, lock/package files, `app.json`, `app.config.ts`, `eas.json`, TypeScript/ESLint/Playwright config, `.env.example` and `.nvmrc`/`.gitignore`. Review scripts individually; do not stage generated evidence. Only synthetic values belong in examples and tests. `.env` stays untracked; EAS holds build-time values.
