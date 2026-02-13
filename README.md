# Droxy CLI

Minimal Droxy CLI MVP focused on proxy lifecycle, login, and Droid sync.

## Requirements

- Node.js 18+
- `cli-proxy-api-plus` binary available in `vendor/` or via `DROXY_PROXY_BIN`

## Usage

```bash
droxy
droxy start [--quiet]
droxy stop [--force] [--quiet]
droxy status [--check] [--json] [--verbose] [--quiet]
droxy login [provider] [--with-models|--skip-models] [--quiet]
droxy connect [provider] [--with-models|--skip-models] [--quiet]
droxy help
droxy version
```

`droxy` (no args) opens interactive manual setup mode.
`droxy ui` was removed; use `droxy`.

## Command guide

- `droxy`: interactive setup (recommended for first run)
- `droxy login`: primary non-interactive login flow
- `droxy connect`: compatibility alias for `droxy login`

Interactive flow:

1. Open Accounts
   - Shows connected/not connected status for each provider
   - Supports listing account status and connecting a provider
2. Choose provider, then choose models
   - Model picker shows connected providers only and selected counts per provider
   - Includes a separate thinking-models menu for selected models
   - Auto-syncs selected models to Droid (including clearing stale Droid models when selection is empty)
3. Droxy continuously self-checks selected-model drift and auto-syncs Droid whenever proxy is running

Providers:

- `gemini`
- `codex`
- `claude`
- `qwen`
- `kimi`
- `iflow`
- `antigravity`

## Solo Dev Notes

- CLI style + voice system: `docs/DROXY_STYLE_GUIDE.md`
- Git workflow (local + GitHub): `docs/GIT_WORKFLOW.md`
- Style baseline: one Anthropic-inspired voice with Droid orange primary accent

## Contributing Workflow

Use a small-PR workflow:

1. Start from updated `main`.
2. Create one focused branch (`feature/*`, `fix/*`, `chore/*`).
3. Open a PR with validation notes and merge using squash.

See `docs/GIT_WORKFLOW.md` for branch naming, commit conventions, cleanup commands, and recommended GitHub repository settings.

For contributor onboarding and project policies:

- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `SUPPORT.md`
