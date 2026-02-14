# AGENTS.md

## Mission and Snapshot
Droxy CLI helps users connect browser-authenticated AI subscriptions to Droid through a local OpenAI-compatible proxy.

Working style for this repo:
- Prefer small, shippable changes over broad rewrites.
- Keep behavior explicit and easy to debug for a solo developer workflow.
- Treat repo reality as source of truth when docs and code disagree.

Primary commands supported today:
- `droxy` (interactive home in TTY)
- `droxy start`
- `droxy stop`
- `droxy status`
- `droxy login`
- `droxy connect` (alias for `login`)
- `droxy help`
- `droxy version`

## Real Repo Map
Root entrypoints and metadata:
- `droxy.js`: CLI entry, arg parsing, command routing, top-level error handling.
- `package.json`: scripts, package metadata, Node requirement (`>=18`).
- `README.md`: user-facing quickstart and command guide.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`: contributor and policy docs.

Workflow and style docs:
- `docs/DROXY_STYLE_GUIDE.md`: canonical CLI copy/style system contract.
- `docs/GIT_WORKFLOW.md`: repository workflow for branch naming, PRs, and cleanup.

Core runtime modules:
- `src/config.js`: app dir, config/state read-write, key generation, config rendering.
- `src/helpers.js`: process/network helpers, model-id normalization, thinking-mode utilities.
- `src/proxy.js`: proxy binary discovery, start/stop/status lifecycle, port ownership checks.
- `src/login.js`: provider selection and login flow orchestration.
- `src/sync.js`: model discovery, eligibility filtering, Droid settings/config sync.

Interactive flows:
- `src/flows/interactive.js`: interactive home loop and action orchestration.
- `src/flows/interactiveSelection.js`: provider/model/thinking selection flows.
- `src/flows/interactiveProviderActions.js`: interactive connect/start/stop/status actions plus accounts refresh/remove flows.
- `src/flows/interactiveHome.js`, `src/flows/interactiveAccounts.js`, `src/flows/interactiveAutoSync.js`, `src/flows/interactiveHelpers.js`: menu context, accounts, drift auto-sync, helper logic.

UI layer:
- `src/ui/output.js`: canonical user-facing output helpers.
- `src/ui/menu.js`: interactive menu primitives.
- `src/ui/colors.js`, `src/ui/designTokens.js`, `src/ui/animations.js`, `src/ui/microcopyCatalog.js`, `src/ui/voiceCatalog.js`, `src/ui/uiProfile.js`, `src/ui/spinner.js`: style and rendering primitives.

Tests:
- `test/*.test.js`: Node built-in test runner suite.
- High-signal suites include `test/cli-routing.test.js`, `test/proxy.test.js`, `test/interactive-flow.test.js`, `test/sync.test.js`.

## Golden Commands
Use these first. Do not reference commands that are not defined in `package.json`.

- `npm install`
  - Install dependencies.
- `npm start`
  - Run CLI locally (`node droxy.js`).
- `node droxy.js --help`
  - Validate user-facing command help text.
- `node droxy.js status --json`
  - Validate stable machine-readable status output.
- `npm test`
  - Run all tests (`node --test test/*.test.js`).

## Architecture Reality and Dependency Rules
Current architecture is modular, but not split into `cli/commands/core/platform` directories. Follow the existing structure above.

Dependency and design rules:
- Keep `droxy.js` as the only top-level command router.
- Keep user-facing terminal output centralized in `src/ui/output.js`.
- Prefer composition/injection patterns already used (`createProxyApi`, `createSyncApi`, `createInteractiveApi`) for testability.
- Avoid circular dependencies across `src/*`.
- Treat `src/sync.js` as a high-risk hotspot:
  - Make narrow, surgical edits.
  - Pair behavior changes with targeted tests in `test/sync.test.js`.
  - Avoid mixing feature work and major refactors in one change.

## Coding Conventions
- CommonJS modules only (`require`, `module.exports`).
- Start JS files with `"use strict";`.
- 2-space indentation, semicolons, double quotes.
- Match surrounding file style before introducing new patterns.
- Keep functions focused and readable; extract helpers when complexity grows.
- Prefer explicit names over compact clever logic.

## UX and Output Contract
- Route user-visible messages through `src/ui/output.js` helpers.
- Do not add direct `console.log` or `process.stdout.write` in non-UI modules.
- For actionable errors, use guided shape:
  - what happened
  - why
  - next command(s)
- Keep copy calm, concrete, and command-oriented.
- Respect no-color environments (`NO_COLOR=1` or `DROXY_NO_COLOR=1`).

## Testing and Verification Gates
Balanced gate for this repo:
- Always run `npm test` for behavior changes.
- Run targeted smoke checks for touched command surfaces.

Recommended smoke checks:
1. `node droxy.js --help`
2. `node droxy.js status --json`
3. If proxy lifecycle changed: `node droxy.js start`, `node droxy.js status`, `node droxy.js stop` (when binary/config are available).
4. If interactive flow changed: run `node droxy.js` in a TTY and validate the touched path.

If an expected check cannot run (missing binary, non-TTY environment, auth constraints), explicitly document:
- what was skipped
- why it was skipped
- what should be verified manually later

## Safe Change Policy
- Never run destructive git commands unless explicitly requested.
- Never revert unrelated local changes you did not make.
- Keep commits and diffs focused on one outcome.
- Prefer minimal-risk edits in sensitive files (`src/sync.js`, `src/proxy.js`, `droxy.js`).
- For non-trivial behavior changes, add or update tests in the same change.

## Documentation Drift Policy
- Keep `AGENTS.md` aligned with real repo state.
- If you add/remove commands, scripts, paths, or major flows, update this file in the same change.
- If code and docs conflict, trust code first, then patch docs quickly.
- Mark future ideas explicitly as `Future Target` and do not present them as current behavior.

## Environment and Configuration Notes
Common environment overrides used by this codebase:
- `DROXY_PROXY_BIN`: explicit proxy binary path override.
- `DROXY_APP_DIR`: override Droxy app/config/state directory.
- `DROXY_FACTORY_DIR`: override Droid/Factory settings directory.
- `DROXY_LOGIN_NO_BROWSER=1`: disables browser auto-open in login flow.
- `NO_COLOR=1` or `DROXY_NO_COLOR=1`: disable colored output.

## Definition of Done
A change is done when all are true:
- Behavior is implemented and matches request scope.
- Relevant tests pass (`npm test`) or skips are clearly justified.
- User-facing output remains consistent with the output contract.
- Any doc/help text affected by behavior changes is updated.
- Handoff notes include what changed and how it was verified.
