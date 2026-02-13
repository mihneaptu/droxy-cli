# Solo Workflow (Weekly Ship)

This workflow is optimized for a solo developer with limited experience.

## Goals

- Ship one useful improvement every week.
- Keep scope small enough to finish.
- Preserve CLI quality with tests and UX checks.

## Weekly Cadence

### Monday (Plan)

- Pick one outcome for the week.
- Write a small spec:
  - user problem
  - command(s) touched
  - acceptance checks
- Keep a max of 5 implementation tasks.

### Tuesday (Core Logic)

- Implement behavior first.
- Add or update tests for logic before UI polish.

### Wednesday (UI + Voice)

- Route all user-facing output through `src/ui/output.js`.
- Apply tokenized copy and color usage.
- Keep motion minimal and meaningful.

### Thursday (Hardening)

- Run full test suite: `npm test`.
- Run manual smoke checks:
  - `node droxy.js --help`
  - `node droxy.js status --json`
  - `node droxy.js login <provider>`
  - `node droxy.js droid sync --quiet`
- Verify non-TTY behavior and error paths.

### Friday (Ship)

- Update README/docs for user-visible changes.
- Create one clean commit per shipped outcome.
- Publish release notes:
  - what changed
  - why it matters
  - known limitations

## Daily Session (90-120 min)

1. Review yesterday notes (10 min).
2. Build one focused slice (60-90 min).
3. Test + polish + write next-step notes (20 min).

## Definition of Done

- Behavior works for happy path.
- Error path includes:
  - what happened
  - why
  - next step command(s)
- No direct `console.log`/`process.stdout.write` outside `src/ui`.
- Tests added/updated and passing.
- Help text/docs updated when command behavior changes.

## Scope Rules (Anti-Overwhelm)

- One command area per week.
- No new command + major refactor in same week.
- If blocked > 45 minutes, reduce scope and ship smallest useful slice.

## Backlog Method

- Keep only 3 active backlog items:
  - one now
  - one next
  - one later
- Everything else goes to parking lot notes.

## References

- Factory CLI docs: https://docs.factory.ai/cli
- Factory CLI reference: https://docs.factory.ai/reference/cli-reference
- Anthropic style controls reference: https://support.anthropic.com/en/articles/10181068-configuring-and-using-styles
- Ink (React CLI framework): https://github.com/vadimdemedes/ink
- Chalk (terminal colors): https://github.com/chalk/chalk
- Ora (spinner): https://github.com/sindresorhus/ora
