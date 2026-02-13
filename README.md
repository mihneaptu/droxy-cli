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

1. Connect provider
   - Shows which providers are already connected
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

## Solo Dev Workflow

- Weekly shipping workflow: `docs/WORKFLOW.md`
- CLI style + voice system: `docs/CLI_STYLE_GUIDE.md`
- Style baseline: one Anthropic-inspired voice with Droid orange primary accent
