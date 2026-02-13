# CLI Style Guide

Last updated: 2026-02-13

## Purpose and Scope

This guide defines how Droxy sounds in terminal UX.
It is a product-facing implementation contract for:
- user-facing microcopy in runtime flows
- output rendering rules in `src/ui/output.js`
- style consistency tests in `test/*.test.js`

## One Style Only

Droxy uses one style system and one canonical voice profile (`claude`).

- Personality direction: closest possible to Claude brand psychology.
- Accent color: Droid orange (`#F27B2F`).
- Product stance: calm, useful, user-interest-first.

This is style alignment, not copy-paste imitation.

## Claude Brand Psychology Model

These rules define the target emotional experience:

1. Thinking Space: interactions should feel like a clean workspace for thought.
2. User Interest First: guidance should feel unambiguously aligned with the user.
3. Calm Competence: language stays low-drama under failure.
4. Trust Through Honesty: uncertainty is admitted plainly.
5. Forward Motion: every recoverable issue offers a next action.

## Emotional Jobs of CLI Copy

Every major message should do at least one of these jobs:
- Reduce anxiety in ambiguous moments.
- Increase user control with concrete options.
- Preserve cognitive momentum toward completion.
- Reinforce trust by avoiding manipulation and hype.

## Message Ladder (State -> Meaning -> Action)

Default structure for operational messages:

1. State: what happened, in one line.
2. Meaning: why it matters now.
3. Action: what to run next.

For errors, this maps directly to:
- `what`
- `why`
- `next`

## Output API Mapping

Use the helper matching intent:
- `printInfo(message)`: neutral context and progress.
- `printSuccess(message)`: clear completion.
- `printWarning(message)`: risk or degraded path, still recoverable.
- `printGuidedError({ what, why, next })`: structured recoverable failure.
- `printNextStep(message)`: lightweight forward action.

Rule: one strong message beats many weak lines.

## Trust Language Rules

- Prefer explicit facts over optimistic filler.
- Do not imply certainty when state is unknown.
- Avoid pressure language ("urgent", "must now", "don't miss out").
- For safety-sensitive operations, include ownership boundaries.
  Example: "only if you own it".

## Cognitive Load Rules

- Keep sentences short and concrete.
- Avoid stacked clauses and internal jargon.
- Keep command suggestions copy-paste friendly.
- If multiple steps are needed, list in execution order.

## Recovery Copy Framework

Every actionable error should include:
1. What happened.
2. Why it happened.
3. Next command(s).

Implementation:
- Prefer `printGuidedError` from `src/ui/output.js`.
- Keep `next` steps concrete (`Run: droxy ...`).
- Use one immediate command first, then optional follow-up commands.

Example:
- What: `Model detection failed during Droid sync.`
- Why: `Droxy could not query /v1/models on configured host/port.`
- Next:
  - `Run: droxy start`
  - `Run: droxy status --verbose`
  - `Retry via interactive flow: droxy`

## Conversion Without Pressure

When nudging toward the next step:
- prioritize clarity over persuasion
- show practical value in one sentence
- avoid fear-based framing

Good:
- `Next: Run: droxy login to connect a provider.`

Bad:
- `You should really do this now or things may break.`

## Prohibited Patterns

- Panic tone or blame.
- Vague recovery lines ("try again later") without commands.
- Engagement bait or manipulative urgency.
- Over-promising certainty on partial diagnostics.
- Color-only meaning without textual state.

## Command Reference Style

When writing commands in docs/help/suggestions:
- Use real commands from current CLI help.
- Prefer imperative shape: `Run: droxy status --json`.
- Keep examples minimal and directly executable.

Formatting:
- In markdown docs: use backticks (`droxy status --json`).
- In terminal output: plain command text after `Run:`.

## Color and Accessibility Rules

- Droid orange is the primary accent.
- Use semantic colors only for:
  - info
  - success
  - warning
  - error
- Respect no-color mode:
  - `NO_COLOR=1`
  - `DROXY_NO_COLOR=1`
- Output must remain understandable when color is disabled.

## Motion Rules

- Motion communicates progress, not decoration.
- Prefer one spinner per command path.
- Avoid stacked concurrent animations.
- Respect non-interactive and CI contexts.

## Do and Don't

Do:
- `✓ Synced 4 models to Droid.`
- `⚠ Port is in use by another process.`
- `Next: Run: droxy stop --force (only if you own it).`

Don't:
- `Something failed lol`
- `An error occurred.`
- `Try stuff and see what happens`
- color-only status signals without text

## Token and Source Files

- `src/ui/designTokens.js`: voice priorities and UI tokens.
- `src/ui/voiceCatalog.js`: canonical voice profile definitions.
- `src/ui/uiProfile.js`: resolved UI profile used by style-aware output.
- `src/ui/microcopyCatalog.js`: reusable tone and principle copy.
- `src/ui/colors.js`: ANSI palette + no-color behavior.
- `src/ui/animations.js`: spinner/motion behavior.
- `src/ui/output.js`: canonical output APIs.

## Quality Gates

Before merge:

1. `npm test` passes.
2. `node droxy.js --help` remains accurate.
3. At least one actionable error path is verified.
4. No direct output from non-UI modules.
5. Required style-guide sections remain present.

## Research Basis

Primary brand/psychology sources:
- Claude is a space to think (Anthropic, Feb 4, 2026):
  https://www.anthropic.com/news/claude-is-a-space-to-think
- Claude product overview ("thinking partner" framing):
  https://claude.com/product/overview
- Claude's Constitution (character and priorities):
  https://www.anthropic.com/constitution
- Anthropic company values ("be helpful, honest, and harmless"):
  https://www.anthropic.com/company

Supplementary CLI UX standards:
- CLIG: https://clig.dev/
- GNU CLI interface standards:
  https://www.gnu.org/prep/standards/html_node/Command_002dLine-Interfaces.html
- POSIX utility conventions:
  https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap12.html
- No Color:
  https://no-color.org/en/
