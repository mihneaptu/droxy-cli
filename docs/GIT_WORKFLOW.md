# Git Workflow Guide

Last updated: 2026-02-13

## Goal

Keep Droxy CLI development fast, predictable, and easy to clean up for a solo or small-team workflow.

## Branch Strategy

- Stable branch: `main`
- Work branches:
  - `feature/<short-topic>`
  - `fix/<short-topic>`
  - `chore/<short-topic>`

Rules:
- One branch should map to one outcome.
- Keep pull requests small to medium.
- Prefer squash merge into `main`.

## Commit Convention

Use short, explicit prefixes:

- `feat: ...`
- `fix: ...`
- `docs: ...`
- `test: ...`
- `chore: ...`

Examples:

- `feat: add provider badge in interactive accounts view`
- `fix: avoid false warning when status check times out`
- `docs: add git workflow cleanup routine`

## GitHub Repository Settings (Remote)

Recommended settings for `main`:

1. Branch protection:
   - require pull request before merging
   - require status checks to pass
   - disable force-pushes and branch deletion
   - note: private repositories may require GitHub Pro/Team for branch protection
2. Status check to require:
   - `test-and-smoke` (from `.github/workflows/ci.yml`)
3. Merge strategy:
   - enable squash merge
   - optionally disable merge commit for cleaner history
4. Pull request hygiene:
   - enable auto-delete head branches after merge

Recommended labels:

- `bug`
- `feature`
- `enhancement`
- `chore`
- `docs`
- `blocked`

## Local Daily Flow

```bash
git checkout main
git pull --ff-only
git checkout -b feature/my-change
```

Before pushing:

```bash
npm test
node droxy.js --help
node droxy.js status --json
```

## Local Cleanup Routine

After your PR is merged:

```bash
git checkout main
git pull --ff-only
git fetch --prune
```

Delete merged branches locally:

```bash
git branch --merged main
```

Then remove branches you no longer need (except `main` and current branch):

```bash
git branch -d <branch-name>
```

## Optional Git Config

Recommended global settings:

```bash
git config --global fetch.prune true
git config --global pull.ff only
git config --global alias.st "status --short --branch"
git config --global alias.lg "log --graph --decorate --oneline --abbrev-commit"
```

## Weekly 15-Minute Maintenance

1. Review open PRs and close stale ones.
2. Review stale branches and clean them up.
3. Review issues with no owner.
4. Confirm `main` is green in Actions.

## Quick Release Readiness Pass

Before tagging a release:

1. Ensure `main` passes `test-and-smoke`.
2. Re-check command help and status JSON output locally.
3. Confirm docs and install instructions reflect current behavior.
