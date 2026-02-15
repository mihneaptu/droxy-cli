# Droxy CLI

> Connect browser-authenticated AI subscriptions to Droid through a local OpenAI-compatible proxy endpoint.

![Node.js >=18](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)
![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)

## Table of Contents

- [Features](#features)
- [Terminal Demo](#terminal-demo)
- [Installation](#installation)
- [Quickstart](#quickstart)
- [Usage](#usage)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [License](#license)

## Features

- Connect provider accounts from your browser with `droxy login` or `droxy connect`.
- Start and stop a local OpenAI-compatible proxy endpoint for Droid.
- Sync detected provider models to Droid automatically after login.
- Use interactive mode (`droxy`) for guided provider/model setup in a TTY.
- Automate health checks with stable machine-readable output from `droxy status --json`.
- Track connection state with provider and thinking status fields.

Supported providers: `gemini`, `codex`, `claude`, `qwen`, `kimi`, `iflow`, `antigravity`.

## Terminal Demo

```text
$ droxy status --json
{
  "status": "running",
  "host": "127.0.0.1",
  "port": 8317,
  "config": "C:\\Users\\Home\\AppData\\Roaming\\Droxy CLI\\config.yaml",
  "pid": 31940,
  "uptime": "1h 52m",
  "providers": 1,
  "providersConnected": 1,
  "providersState": "verified",
  "providerStatusById": {
    "codex": {
      "connected": true,
      "connectionState": "connected",
      "connectionCount": 2,
      "verified": true
    }
  },
  "strictReady": true,
  "authFilesCount": 7,
  "thinkingState": "unknown",
  "thinkingReason": "backend_reported_partial_capabilities",
  "thinkingModelsTotal": 5,
  "thinkingModelsVerified": 3,
  "thinkingModelsSupported": 2,
  "thinkingModelsUnsupported": 1,
  "thinkingModelsUnverified": 2
}
```

## Installation

Requirements:

- Node.js `>=18`
- `cli-proxy-api-plus` binary available in `vendor/` or via `DROXY_PROXY_BIN`

Install with the bootstrap script:

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/mihneaptu/droxy-cli/main/install.sh | sh

# Windows (PowerShell)
irm https://raw.githubusercontent.com/mihneaptu/droxy-cli/main/install.ps1 | iex
```

Install from source:

```bash
git clone https://github.com/mihneaptu/droxy-cli.git
cd droxy-cli
npm install
npm link
```

## Quickstart

```bash
droxy login claude
droxy start
droxy status --json
```

When running, Droxy listens on `http://127.0.0.1:8317`.

Run `droxy` at any time to open the interactive home flow.

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

Scripting tips:

- Use `droxy status --json` for automation and monitoring.
- Use `droxy status --check` for strict health checks (fails when provider state is not backend-verified).
- `--with-models` is a legacy alias; model sync is already the default.
- Use `--skip-models` when you want login without immediate model sync.

## Configuration

Environment variables:

| Variable | Purpose |
|----------|---------|
| `DROXY_PROXY_BIN` | Explicit proxy binary path override |
| `DROXY_APP_DIR` | Droxy app/config/state directory override |
| `DROXY_FACTORY_DIR` | Droid settings directory override |
| `DROXY_LOGIN_NO_BROWSER` | Disable browser auto-open in login flow |
| `NO_COLOR` | Disable color output |
| `DROXY_NO_COLOR` | Disable color output (Droxy-specific alias) |

## Troubleshooting

Config missing:

- Run `droxy login` to create initial configuration.

Port in use:

```bash
droxy status --verbose
droxy stop --force
```

Binary missing:

- Place `cli-proxy-api-plus` in `vendor/`.
- Or set `DROXY_PROXY_BIN` to the binary path.

Models not syncing:

- Confirm proxy health with `droxy status`.
- Re-run guided setup with `droxy`.

## Architecture

Key modules:

- `droxy.js`: CLI entry, argument parsing, command routing.
- `src/proxy.js`: proxy lifecycle (`start`, `stop`, `status`).
- `src/login.js`: provider login orchestration.
- `src/sync.js`: model discovery and Droid sync.
- `src/flows/interactive.js`: interactive home and guided actions.
- `src/ui/output.js`: centralized user-facing terminal output helpers.

## Contributing

- Read `CONTRIBUTING.md` for workflow and contribution rules.
- Run tests before opening a PR:

```bash
npm test
```

Helpful references:

- `docs/GIT_WORKFLOW.md`
- `docs/DROXY_STYLE_GUIDE.md`
- [Issue tracker](https://github.com/mihneaptu/droxy-cli/issues)
- [Security advisories](https://github.com/mihneaptu/droxy-cli/security/advisories/new)

## License

This project is licensed under the MIT License. See `LICENSE`.
