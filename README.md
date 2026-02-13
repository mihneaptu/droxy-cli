# Droxy CLI

Minimal Droxy CLI MVP focused on proxy lifecycle, login, and Droid sync.

## Requirements

- Node.js 18+
- `cli-proxy-api-plus` binary available in `vendor/` or via `DROXY_PROXY_BIN`

## Usage

```bash
droxy start [--quiet]
droxy stop [--force] [--quiet]
droxy status [--check] [--json] [--verbose] [--quiet]
droxy login [provider] [--with-models|--skip-models]
droxy connect [provider] [--with-models|--skip-models]
droxy droid sync [--quiet]
droxy help
droxy version
```

Providers:

- `gemini`
- `codex`
- `claude`
- `qwen`
- `kimi`
- `iflow`
- `antigravity`
