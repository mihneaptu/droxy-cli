# Droxy CLI

Connect browser-authenticated AI subscriptions to Droid through a local OpenAI-compatible proxy.

Droxy CLI is an MVP focused on one job: get your providers connected, keep a local proxy running, and sync selected models into Droid with minimal friction.

## What You Can Do Today

- Connect supported providers through browser-based login.
- Start, stop, and inspect a local proxy endpoint.
- Auto-sync selected models into Droid settings.
- Use machine-readable status output for scripts and automation.
- Use interactive mode (`droxy`) for guided setup and management.

## Requirements

- Node.js `>=18`
- A `cli-proxy-api-plus` binary available in one of these locations:
  - `DROXY_PROXY_BIN` (explicit override)
  - Droxy app vendor directory (`DROXY_APP_DIR/vendor` or default app dir)
  - Repository `vendor/` directory (local development)

## Install

### Option A: Install from a pinned GitHub snapshot

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/mihneaptu/droxy-cli/7f31fb11f5f021833995bef0506d603916fec9a1/install.ps1 | iex
```

macOS/Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/mihneaptu/droxy-cli/7f31fb11f5f021833995bef0506d603916fec9a1/install.sh | sh
```

### Option B: Install from source (developer-friendly)

```bash
git clone https://github.com/mihneaptu/droxy-cli.git
cd droxy-cli
npm install
npm link
```

Verify:

```bash
droxy --help
```

### Option C: Run locally without global install

```bash
npm install
node droxy.js --help
```

## 5-Minute Quickstart

1. Open interactive setup:

```bash
droxy
```

2. Or connect directly via command:

```bash
droxy login claude
```

3. Start the proxy:

```bash
droxy start
```

4. Check machine-readable status:

```bash
droxy status --json
```

`droxy connect` is a compatibility alias for `droxy login`.

## Command Reference

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

Notes:

- `droxy` with no args opens interactive home in TTY.
- `droxy ui` was removed. Use `droxy`.
- `--with-models` is kept as a legacy alias; model auto-sync is already the default.
- `--skip-models` performs login only and skips auto-sync.

## Supported Providers

- `gemini` (Google AI)
- `codex` (OpenAI / Codex)
- `claude` (Anthropic)
- `qwen`
- `kimi` (Moonshot)
- `iflow`
- `antigravity`

## Status Output for Automation

Use:

```bash
droxy status --json
```

Typical fields:

- `status` (`running`, `stopped`, `blocked`, `config_missing`)
- `host`
- `port`
- `config`
- `pid`
- `uptime`
- `providers` (legacy compatibility field; same value as `providersConnected`)
- `providersConnected` (verified connected provider count)
- `providersState` (`verified` or `unknown`)

## Environment Variables

- `DROXY_PROXY_BIN`: override proxy binary path.
- `DROXY_APP_DIR`: override Droxy app/config/state directory.
- `DROXY_FACTORY_DIR`: override Droid/Factory settings directory.
- `DROXY_LOGIN_NO_BROWSER=1`: disable browser auto-open in login flow.
- `NO_COLOR=1` or `DROXY_NO_COLOR=1`: disable colored output.

Installer-specific overrides:

- `DROXY_GITHUB_REPO`: alternate GitHub repo for install scripts.
- `DROXY_VERSION`: specific version/tag for install scripts.

## Troubleshooting

Config missing:

```bash
droxy login
```

Port in use:

```bash
droxy status --verbose
droxy stop --force
```

Only use `--force` when you own the process on that port.

Binary missing:

- Place `cli-proxy-api-plus` in `vendor/`, or
- set `DROXY_PROXY_BIN` to the executable path.

## Contributing

For contribution workflow, code of conduct, and security policy details, see `CONTRIBUTING.md`.

## Support and Security

- Issues and support: https://github.com/mihneaptu/droxy-cli/issues
- Private security reports: https://github.com/mihneaptu/droxy-cli/security/advisories/new

## License

MIT
