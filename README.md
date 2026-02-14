# Droxy CLI

One local proxy. Your AI subscriptions. No API keys to manage.

Droxy connects your browser-authenticated AI accounts to Droid through a local OpenAI-compatible endpoint. You log in once. Droxy keeps your models synced.

## Get Started

You need Node.js 18 or later and a `cli-proxy-api-plus` binary.

Install:

```bash
# Windows (PowerShell)
irm https://raw.githubusercontent.com/mihneaptu/droxy-cli/main/install.ps1 | iex

# macOS/Linux
curl -fsSL https://raw.githubusercontent.com/mihneaptu/droxy-cli/main/install.sh | sh
```

Connect a provider:

```bash
droxy login claude
```

Start the proxy:

```bash
droxy start
```

Done. Your endpoint is ready at `http://127.0.0.1:8317`.

For guided setup, run `droxy` with no arguments.

## Commands

| Command | What it does |
|---------|--------------|
| `droxy` | Open interactive setup |
| `droxy login [provider]` | Connect a provider account |
| `droxy start` | Start the local proxy |
| `droxy stop` | Stop the proxy |
| `droxy status` | Show proxy state |
| `droxy status --json` | Machine-readable output for scripts |
| `droxy help` | Show all options |

`droxy connect` is an alias for `droxy login`.

## Providers

| Provider | ID |
|----------|-----|
| Gemini (Google AI) | `gemini` |
| OpenAI / Codex | `codex` |
| Claude (Anthropic) | `claude` |
| Qwen | `qwen` |
| Kimi (Moonshot) | `kimi` |
| iFlow | `iflow` |
| Antigravity | `antigravity` |

## When Things Don't Work

### Config missing

State: Droxy cannot find its configuration file.
Why: You haven't run setup or login yet.
Next: `droxy login`

### Port in use

State: Another process is using the configured port.
Why: A previous Droxy instance or another app is blocking the port.
Next:
- `droxy status --verbose` (see what is using the port)
- `droxy stop --force` (only if you own that process)

### Binary missing

State: Droxy cannot find the proxy engine.
Why: The `cli-proxy-api-plus` binary is not installed.
Next:
- Place the binary in `vendor/`, or
- Set `DROXY_PROXY_BIN` to the binary path.

### Models not syncing

State: Droid shows outdated or missing models.
Why: The proxy may not be running, or model detection failed.
Next:
- `droxy status` (check if running)
- `droxy` (open interactive mode and choose models)

## For Scripting

Use `droxy status --json` for automation. Fields include:

- `status`: `running`, `stopped`, `blocked`, or `config_missing`
- `host`, `port`: the endpoint address
- `pid`: process ID when running
- `providersConnected`: number of verified provider connections

### Environment Variables

- `DROXY_PROXY_BIN`: override proxy binary path
- `DROXY_APP_DIR`: override config directory
- `DROXY_FACTORY_DIR`: override Droid settings directory
- `DROXY_LOGIN_NO_BROWSER=1`: skip browser auto-open during login
- `NO_COLOR=1` or `DROXY_NO_COLOR=1`: disable colored output

## Install from Source

```bash
git clone https://github.com/mihneaptu/droxy-cli.git
cd droxy-cli
npm install
npm link
```

Run without installing:

```bash
node droxy.js --help
```

## Contributing

See `CONTRIBUTING.md` for workflow, code of conduct, and security policy.

## Support

- Issues: https://github.com/mihneaptu/droxy-cli/issues
- Security reports: https://github.com/mihneaptu/droxy-cli/security/advisories/new

## License

MIT
