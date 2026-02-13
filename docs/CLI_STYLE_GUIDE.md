# CLI Style Guide

## Design Direction

- Voice: Anthropic-inspired tone.
- UX: Droid-first practical command workflow.
- Scope: terminal-only, no web UI requirements.

This is inspiration, not brand imitation. Do not copy Anthropic trademark visuals or proprietary product wording.

## Voice Rules

- Calm, direct, and useful.
- No hype, no sarcasm, no fluff.
- Prefer short sentences.
- For errors, always include next actions.

### Error Shape (Required)

Every actionable error should include:

1. What happened
2. Why it happened
3. Next commands to run

Use `printGuidedError` from `src/ui/output.js`.

## Output Rules

- All user-visible output should flow through `src/ui/output.js`.
- Avoid direct output in command modules.
- Keep plain text readable at 80 columns.
- Use icon + text + color (not color only).

## Color Rules

- Use tokenized semantic colors:
  - info
  - success
  - warning
  - error
- Respect no-color environments.
- Keep one primary accent color and avoid rainbow overuse.

## Motion Rules

- Motion should communicate progress, not decoration.
- Keep spinner usage for operations longer than ~300ms.
- Avoid stacked animations in one command path.

## Token Sources

- `src/ui/designTokens.js`
  - spacing scale (`xs/sm/md/lg`)
  - motion timing (`fast/normal/slow`)
  - semantic colors
- `src/ui/microcopyCatalog.js`
  - reusable text strings
  - profile overrides

## Command UX Rules

- Command-first: `start`, `stop`, `status`, `login`, `droid sync`.
- Interactive fallback only when needed (for example provider selection).
- Keep machine mode stable:
  - `status --json` must remain predictable.

## Quality Gates

Before merge:

1. `npm test` passes.
2. `droxy --help` remains accurate.
3. At least one manual error path tested for new behavior.
4. No direct `console.log` or unmanaged stdout usage outside `src/ui`.

## References

- Factory CLI docs: https://docs.factory.ai/cli
- Factory CLI reference: https://docs.factory.ai/reference/cli-reference
- Anthropic style reference: https://support.anthropic.com/en/articles/10181068-configuring-and-using-styles
