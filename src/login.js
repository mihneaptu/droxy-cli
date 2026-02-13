"use strict";

const fs = require("fs");
const readline = require("readline");
const { spawn } = require("child_process");

const config = require("./config");
const proxy = require("./proxy");
const {
  log,
  printGuidedError,
  printInfo,
  printSuccess,
  printWarning,
} = require("./ui/output");

const PROVIDERS = [
  {
    id: "gemini",
    label: "Gemini (Google AI)",
    flag: "--login",
    port: 8085,
  },
  {
    id: "codex",
    label: "OpenAI / Codex",
    flag: "--codex-login",
    port: 1455,
  },
  {
    id: "claude",
    label: "Claude (Anthropic)",
    flag: "--claude-login",
    port: 54545,
  },
  {
    id: "qwen",
    label: "Qwen",
    flag: "--qwen-login",
    port: 26701,
  },
  {
    id: "kimi",
    label: "Kimi (Moonshot)",
    flag: "--kimi-login",
    port: 12011,
  },
  {
    id: "iflow",
    label: "iFlow",
    flag: "--iflow-login",
    port: 11451,
  },
  {
    id: "antigravity",
    label: "Antigravity",
    flag: "--antigravity-login",
    port: 51121,
  },
];

const PROVIDER_ALIASES = {
  openai: "codex",
  anthropic: "claude",
  google: "gemini",
};

const AUTH_HINTS = {
  gemini: ["gemini", "google", "aistudio"],
  codex: ["codex", "openai"],
  claude: ["claude", "anthropic"],
  qwen: ["qwen"],
  kimi: ["kimi", "moonshot"],
  iflow: ["iflow"],
  antigravity: ["antigravity"],
};

function listAuthFiles(authDir) {
  try {
    return fs.readdirSync(authDir).filter((name) => name && !name.startsWith("."));
  } catch {
    return [];
  }
}

function hasProviderAuth(providerId, files) {
  const hints = AUTH_HINTS[providerId] || [providerId];
  return files.some((name) =>
    hints.some((hint) => String(name).toLowerCase().includes(String(hint).toLowerCase()))
  );
}

function resolveProvider(providerId) {
  const normalized = String(providerId || "").trim().toLowerCase();
  if (!normalized) return null;
  const alias = PROVIDER_ALIASES[normalized] || normalized;
  return PROVIDERS.find((provider) => provider.id === alias) || null;
}

function listProvidersText() {
  return PROVIDERS.map((provider, index) => `${index + 1}. ${provider.label} (${provider.id})`);
}

async function promptForProvider() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Provider is required in non-interactive mode. Example: droxy login claude");
  }

  log("Choose a provider:");
  for (const line of listProvidersText()) {
    log(`  ${line}`);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise((resolve) => {
      rl.question("Provider number or id: ", resolve);
    });
    const raw = String(answer || "").trim();
    if (!raw) return null;

    const number = Number.parseInt(raw, 10);
    if (Number.isFinite(number) && number >= 1 && number <= PROVIDERS.length) {
      return PROVIDERS[number - 1];
    }

    return resolveProvider(raw);
  } finally {
    rl.close();
  }
}

async function runLogin(provider, configPath, options = {}) {
  const quiet = options.quiet === true;
  const binary = proxy.getBinaryPath();
  if (!fs.existsSync(binary)) {
    throw new Error(`Proxy binary not found at ${binary}`);
  }

  const args = ["--config", configPath];
  if (process.env.DROXY_LOGIN_NO_BROWSER === "1") {
    args.push("-no-browser");
  }
  args.push(provider.flag);

  if (!quiet) {
    printInfo(`Starting ${provider.label} login flow...`);
    printInfo(`Auth callback port: ${provider.port}`);
  }

  const timeoutMs = 5 * 60 * 1000;
  await new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: "inherit" });

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // Ignore cleanup errors.
      }
      reject(new Error(`${provider.label} login timed out after 5 minutes`));
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        if (!quiet) {
          printSuccess(`${provider.label} connected.`);
        }
        resolve();
        return;
      }
      reject(new Error(`${provider.label} login failed (exit ${code})`));
    });
  });
}

function countConnectedProviders(configValues) {
  const authDir = config.resolveAuthDir(configValues.authDir || config.DEFAULT_AUTH_DIR);
  const files = listAuthFiles(authDir).map((name) => name.toLowerCase());
  return PROVIDERS.filter((provider) => hasProviderAuth(provider.id, files));
}

async function loginFlow({ providerId = "", selectModels, quiet = false } = {}) {
  config.ensureConfig();
  const configValues = config.readConfigValues();

  let provider = resolveProvider(providerId);
  if (!provider) {
    provider = await promptForProvider();
  }
  if (!provider) {
    throw new Error("No provider selected.");
  }

  const ensureResult = await proxy.ensureProxyRunning(configValues, true);
  if (ensureResult && ensureResult.blocked) {
    printGuidedError({
      what: "Login blocked because configured port is in use.",
      why: "A non-Droxy process is listening on the configured proxy port.",
      next: [
        "Run: droxy status --verbose",
        "Run: droxy stop --force (only if you own the process)",
        "or update host/port in config and retry login",
      ],
    });
    return { success: false, reason: "proxy_blocked" };
  }

  await runLogin(provider, config.getConfigPath(), { quiet });

  const state = config.readState() || {};
  const autoLoginProviders = Array.from(
    new Set([...(state.autoLoginProviders || []), provider.id])
  );
  const patch = {
    autoLoginProviders,
    lastLoginAt: new Date().toISOString(),
  };

  if (typeof selectModels === "boolean") {
    patch.modelSelectionComplete = selectModels;
  }

  config.updateState(patch);

  const connectedProviders = countConnectedProviders(configValues).map((item) => item.id);

  if (!quiet && selectModels === true) {
    printInfo("Model selection menu is not part of this MVP. Use `droxy droid sync` for live model sync.");
  }

  return {
    success: true,
    provider: provider.id,
    connectedProviders,
    selectModels,
  };
}

module.exports = {
  AUTH_HINTS,
  PROVIDERS,
  hasProviderAuth,
  listAuthFiles,
  listProvidersText,
  loginFlow,
  resolveProvider,
  runLogin,
};
