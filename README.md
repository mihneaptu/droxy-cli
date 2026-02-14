# Droxy CLI

**Your AI subscriptions. One local endpoint.**

Connect browser-authenticated accounts to Droid through an OpenAI-compatible proxy. No API keys to manage.

---

## Install

**Requirements:** Node.js 18+ and a `cli-proxy-api-plus` binary.

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/mihneaptu/droxy-cli/main/install.sh | sh

# Windows (PowerShell)
irm https://raw.githubusercontent.com/mihneaptu/droxy-cli/main/install.ps1 | iex
```

---

## Quick Start

```bash
droxy login claude    # Connect your account
droxy start           # Start the proxy
```

Your endpoint is ready at `http://127.0.0.1:8317`

Run `droxy` for guided setup.

---

## Commands

```
droxy                 Open interactive setup
droxy login PROVIDER  Connect a provider
droxy start           Start the proxy
droxy stop            Stop the proxy
droxy status          Show state
droxy status --json   JSON output for scripts
```

---

## Providers

`gemini` `codex` `claude` `qwen` `kimi` `iflow` `antigravity`

---

## Troubleshooting

**Config missing**

Run `droxy login` to create your configuration.

**Port in use**

```bash
droxy status --verbose    # See what's using the port
droxy stop --force        # Force stop (only if you own it)
```

**Binary missing**

Place `cli-proxy-api-plus` in `vendor/` or set `DROXY_PROXY_BIN`.

**Models not syncing**

Run `droxy status` to check if the proxy is running. Then open `droxy` to select models.

---

## Scripting

```bash
droxy status --json
```

Returns `status`, `host`, `port`, `pid`, `providersConnected`, `providersState`, `thinkingState`.

### Environment

| Variable | Purpose |
|----------|---------|
| `DROXY_PROXY_BIN` | Proxy binary path |
| `DROXY_APP_DIR` | Config directory |
| `DROXY_FACTORY_DIR` | Droid settings directory |
| `DROXY_LOGIN_NO_BROWSER` | Skip browser auto-open |
| `NO_COLOR` | Disable colors |

---

## From Source

```bash
git clone https://github.com/mihneaptu/droxy-cli.git
cd droxy-cli && npm install && npm link
```

---

## Resources

[Issues](https://github.com/mihneaptu/droxy-cli/issues) · [Security](https://github.com/mihneaptu/droxy-cli/security/advisories/new) · [Contributing](CONTRIBUTING.md)

MIT License
