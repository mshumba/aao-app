# Contributing

Keep changes focused on the guest sermon experience and selected visual direction. Preserve exact source titles, legal provider controls and the explicit demo status of account/topic data. A working menu item must lead to a built screen with a sensible back path.

## Development loop

1. Start from the locked dependencies with `npm ci` and use the documented Node version.
2. Make a focused change using shared controls/tokens. Keep text flexible, touch areas at least 48 logical units, and topic scope visible and removable.
3. Run typecheck, lint, Doctor, all-platform export and relevant tests. The required CI performs the same checks with frozen dependencies and bundled Chromium.
4. Inspect small-phone and wide layouts. Check empty/invalid data, reduced motion and back/dismiss behavior. For player changes, run the optional live browser probe and the native device checklist.
5. Describe the behavior change, evidence and remaining limits. Do not describe compilation or a browser viewport as a native-device pass.

`tests/catalog.spec.ts` checks exact verified titles, that verified records carry no topic fields, IDs, category membership and search. `tests/topics.spec.ts` exercises menu/library/scoped-search/detail/empty/recovery, in-place topic filtering, 320px overflow and small targets. `tests/core.spec.ts` covers guest flows, heading levels, the player through a deterministic fake IFrame API (`tests/fixtures.ts`: Watch auto-start, transport commands, docking that keeps the same player across tabs, replacing the docked sermon, pausing when the app is hidden, errors that only offer retry where it can help), double-tap guards on rows, Watch and Back, repeated link parameters, missing artwork, sample screens without console errors, and press feedback under Reduce Motion; `tests/auth.spec.ts` covers demo outcomes, cancellation, field clearing, no requests and no persistent storage. Browser fixtures abort thumbnail requests so required checks remain independent of remote image availability. Live playback is deliberately an opt-in network check, not a CI availability dependency.

Run `npm audit` when changing packages and assess direct impact/compatible updates. The initial toolchain audit reported moderate transitive findings and no high/critical findings; its suggested blanket fix required incompatible downgrades. Do not use `npm audit fix --force` as an automatic remedy. Recheck before an actual release.

## Public-source hygiene

Local historical plans, private context, agent instructions, design references, generated screenshots/logs and machine-specific evidence are preserved but ignored. Never use `git add -f` to sweep them into a public repository. `.gitignore` is a guardrail, not proof that staged files are safe. Inspect `git status`, the staged file list and each diff; search for credentials, local paths, account identifiers and private text before publication.

Intended source allowlist: `src/`, `tests/`, `scripts/`, `docs/development/`, `.github/workflows/ci.yml`, README, lock/package files, app/TypeScript/ESLint/Playwright config and `.nvmrc`/`.gitignore`. Review scripts individually; do not stage generated evidence. Only synthetic values belong in examples/tests. No app credentials are needed now.
