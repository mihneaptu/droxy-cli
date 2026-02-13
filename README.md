# Droxy CLI

Minimal Droxy CLI MVP focused on proxy lifecycle, login, and Droid sync.

## Requirements

- Node.js 18+
- `cli-proxy-api-plus` binary available in `vendor/` or via `DROXY_PROXY_BIN`

## Usage

```bash
droxy
droxy ui
droxy start [--quiet]
droxy stop [--force] [--quiet]
droxy status [--check] [--json] [--verbose] [--quiet]
droxy login [provider] [--with-models|--skip-models]
droxy connect [provider] [--with-models|--skip-models]
droxy droid sync [--quiet]
droxy help
droxy version
```

`droxy` (no args) opens interactive manual setup mode:

1. Connect provider
2. Choose models
3. Sync selected models to Droid

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
