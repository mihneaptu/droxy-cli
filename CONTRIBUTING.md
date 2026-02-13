# Contributing to Droxy CLI

Thanks for contributing.
This project is optimized for small, shippable changes and clear CLI behavior.

## Quick Start

1. Fork the repository and clone your fork.
2. Create a focused branch from `main`.
3. Run local checks before opening a pull request.

```bash
npm install
npm test
node droxy.js --help
node droxy.js status --json
```

## Branch and Commit Conventions

Branch names:
- `feature/<short-topic>`
- `fix/<short-topic>`
- `chore/<short-topic>`

Commit prefixes:
- `feat: ...`
- `fix: ...`
- `docs: ...`
- `test: ...`
- `chore: ...`

See `docs/GIT_WORKFLOW.md` for the full workflow.

## Pull Request Expectations

1. Keep each PR focused on one outcome.
2. Fill in `.github/pull_request_template.md`.
3. Ensure GitHub Actions `test-and-smoke` passes.
4. Update docs when behavior changes.
5. Prefer squash merge.

Branch protection is enabled on `main` and requires PR + passing checks.

## Coding Expectations

- CommonJS only (`require`, `module.exports`).
- Start JS files with `"use strict";`.
- 2-space indentation, semicolons, double quotes.
- Route user-facing output through `src/ui/output.js`.
- Avoid direct `console.log` in non-UI modules.

Detailed repository rules are documented in `AGENTS.md`.

## Testing Guidelines

- Always run `npm test` for behavior changes.
- Run smoke checks for touched command surfaces:
  - `node droxy.js --help`
  - `node droxy.js status --json`
- If you cannot run an expected check, document:
  - what was skipped
  - why it was skipped
  - what should be manually verified later

## Reporting Issues and Security

- Bugs/features/questions: use GitHub Issue templates.
- Security vulnerabilities: report privately via:
  - `https://github.com/mihneaptu/droxy-cli/security/advisories/new`
- General support expectations: `SUPPORT.md`.

## Code of Conduct

By participating, you agree to follow `CODE_OF_CONDUCT.md`.
