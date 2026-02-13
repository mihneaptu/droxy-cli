# Repository Guidelines

## Project Structure & Module Organization
Core code lives in `src/` with layered boundaries documented in `docs/architecture.md`:
- `src/cli/`: argument parsing and command routing.
- `src/commands/`: command-level orchestration.
- `src/flows/`: multi-step user flows (onboarding/login/menu).
- `src/core/`: business logic and state/config services.
- `src/platform/`: filesystem/process/network primitives.
- `src/ui/`: terminal rendering helpers.
- `src/legacy/runtime.js`: migration compatibility facade.

Tests are in `test/*.test.js`. Release/build helpers live in `scripts/`. User-facing docs are in `README.md`, `commands/`, and `docs/`.

## Build, Test, and Development Commands
- `npm install`: install dependencies (Node.js `>=18`).
- `npm start` or `node droxy.js`: run the CLI locally.
- `npm test`: run all tests with Node’s built-in test runner.
- `npm run test:services`: run command-routing regression tests.
- `npm run check:size`: enforce file/function size limits.
- `npm run check:boundaries`: enforce import-layer boundaries.
- `npm run check:architecture`: run both architecture guard checks.
- `npm run build:artifact -- --platform windows --arch x64 --out-dir dist`: build a release artifact.

## Coding Style & Naming Conventions
Use CommonJS (`require`/`module.exports`) with `"use strict";`, 2-space indentation, semicolons, and double quotes (match existing files). Keep modules focused: non-legacy files should stay under 350 lines and functions under 70 lines (`scripts/check_file_limits.js`). Follow dependency direction `cli -> commands -> flows/core -> platform`; `commands` and `flows` must not import `platform` directly.

## Testing Guidelines
Write tests with `node:test` and `node:assert/strict`. Add test files as `*.test.js` under `test/`, and describe behavior in test names (for example, flag parsing and command routing cases). Before opening a PR, run:
1. `npm test`
2. `npm run check:architecture`

## Commit & Pull Request Guidelines
Prefer conventional prefixes seen in history and `CONTRIBUTING.md`: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`. Keep commits focused and imperative. PRs should include a concise summary, linked issue (if any), verification notes, and docs updates for user-facing changes. Confirm `node droxy.js --help` works; for packaging changes, include `npm pack --dry-run` results.

## Security & Configuration Tips
Do not commit secrets, tokens, or local auth artifacts. Review `SECURITY.md` for reporting. Use environment overrides (for example `DROXY_PROXY_BIN`, `DROXY_AUTOSTART=0`) for local debugging instead of hardcoding paths or behavior.
