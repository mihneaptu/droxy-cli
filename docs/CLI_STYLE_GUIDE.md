# CLI Style Guide

## One Style Only

Droxy uses one style system. There are no user-selectable voice profiles.

- Tone: Anthropic-inspired writing voice.
- Accent color: Droid orange (`#F27B2F`).
- UX shape: calm guidance with concrete next commands.

This is inspiration, not trademark imitation. Do not copy proprietary Anthropic copy.

## Why This Voice Works

The style should feel likable because it is:

1. Clear: says exactly what happened.
2. Calm: avoids panic, blame, and hype.
3. Useful: always gives immediate next steps.
4. Honest: states uncertainty when we do not know.

## Error Shape (Required)

Every actionable error should include:

1. What happened
2. Why it happened
3. Next command(s)

Use `printGuidedError` from `src/ui/output.js`.

## Output Rules

- Route user-facing output through `src/ui/output.js`.
- Keep messages short and direct.
- Use icon + text + color (not color only).
- Keep lines readable around 80 columns.

## Color Rules

- Droid orange is the primary accent.
- Use semantic colors only for state:
  - info
  - success
  - warning
  - error
- Respect no-color mode (`NO_COLOR=1` or `DROXY_NO_COLOR=1`).

## Motion Rules

- Motion should communicate progress, not decoration.
- Prefer one spinner per command path.
- Avoid stacking multiple animations at once.

## Token Sources

- `src/ui/designTokens.js` for spacing/motion/colors.
- `src/ui/microcopyCatalog.js` for reusable copy and voice principles.
- `src/ui/colors.js` for terminal ANSI color palette.

## Quality Gates

Before merge:

1. `npm test` passes.
2. `node droxy.js --help` remains accurate.
3. At least one manual error path is verified.
4. No direct output from non-UI modules.
