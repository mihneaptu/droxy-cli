#!/usr/bin/env node
"use strict";

const pkg = require("./package.json");
const configModule = require("./src/config");
const interactiveModule = require("./src/flows/interactive");
const helpersModule = require("./src/helpers");
const loginModule = require("./src/login");
const proxyModule = require("./src/proxy");
const syncModule = require("./src/sync");
const outputModule = require("./src/ui/output");

const HELP_ALIASES = new Set(["help", "-h", "--help"]);
const VERSION_ALIASES = new Set(["version", "-v", "--version", "-V"]);

const KNOWN_COMMANDS = [
  "start",
  "stop",
  "status",
  "login",
  "connect",
  "help",
  "version",
];

function normalizeToken(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function normalizeFlagName(flagName) {
  const normalized = String(flagName || "").trim().toLowerCase();
  if (!normalized) return "";
  const equalsIdx = normalized.indexOf("=");
  return equalsIdx >= 0 ? normalized.slice(0, equalsIdx) : normalized;
}

function isFalseyFlagValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return (
    normalized === "false" ||
    normalized === "0" ||
    normalized === "no" ||
    normalized === "off"
  );
}

function collectFlags(tokens) {
  const flags = [];
  const flagValues = new Map();
  const positionals = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (typeof token !== "string" || !token.startsWith("--") || token.length < 3) {
      positionals.push(token);
      continue;
    }

    const equalsIdx = token.indexOf("=");
    const flagName = normalizeFlagName(equalsIdx >= 0 ? token.slice(0, equalsIdx) : token);
    if (!flagName) continue;

    flags.push(flagName);

    if (equalsIdx >= 0) {
      flagValues.set(flagName, token.slice(equalsIdx + 1));
      continue;
    }

    const next = tokens[i + 1];
    const hasValueToken =
      typeof next === "string" && next.length > 0 && !next.startsWith("--");
    if (hasValueToken) {
      flagValues.set(flagName, String(next));
      i += 1;
      continue;
    }

    flagValues.set(flagName, true);
  }

  return { flags, flagValues, positionals };
}

function parseArgs(argv = []) {
  const raw = Array.isArray(argv) ? argv.slice() : [];
  const commandToken = normalizeToken(raw[0], "help");
  const { flags, flagValues, positionals } = collectFlags(raw.slice(1));
  const subcommandToken = normalizeToken(positionals[0], "");
  const flagSet = new Set(flags);

  return {
    raw,
    commandToken,
    command: commandToken.toLowerCase(),
    subcommandToken,
    subcommand: subcommandToken.toLowerCase(),
    positionals,
    flags,
    flagValues: Object.fromEntries(flagValues.entries()),
    hasFlag(flagName) {
      const normalized = normalizeFlagName(flagName);
      if (!normalized || !flagSet.has(normalized)) return false;
      const value = flagValues.get(normalized);
      if (value === undefined || value === true) return true;
      return !isFalseyFlagValue(value);
    },
    getFlagValue(flagName, fallback = "") {
      const normalized = normalizeFlagName(flagName);
      const value = normalized ? flagValues.get(normalized) : undefined;
      if (value === undefined || value === true) return fallback;
      return String(value);
    },
  };
}

function levenshteinDistance(source, target) {
  const a = String(source || "");
  const b = String(target || "");
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = new Array(b.length + 1);
  const current = new Array(b.length + 1);

  for (let j = 0; j <= b.length; j += 1) {
    previous[j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }
    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

function hasSingleAdjacentSwap(source, target) {
  const a = String(source || "");
  const b = String(target || "");
  if (a.length !== b.length || a.length < 2) return false;

  const mismatches = [];
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      mismatches.push(i);
      if (mismatches.length > 2) return false;
    }
  }

  if (mismatches.length !== 2) return false;
  const [first, second] = mismatches;
  if (second !== first + 1) return false;
  return a[first] === b[second] && a[second] === b[first];
}

function suggestCommand(command) {
  const value = String(command || "").trim().toLowerCase();
  if (!value) return null;

  let best = null;
  let bestScore = Infinity;

  for (const candidate of KNOWN_COMMANDS) {
    const startsMatch =
      (value.length >= 3 && candidate.startsWith(value)) ||
      (candidate.length >= 3 && value.startsWith(candidate));
    const swapMatch = hasSingleAdjacentSwap(value, candidate);
    const distance = levenshteinDistance(value, candidate);
    const score = distance - (startsMatch ? 1 : 0) - (swapMatch ? 1 : 0);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (!best) return null;
  if (best.startsWith(value) && value.length >= 3) return best;
  if (bestScore <= 2) return best;
  return null;
}

function printHelp(output = outputModule) {
  const lines = [
    "Droxy CLI v0.1.0",
    "",
    "Usage:",
    "  droxy",
    "  droxy start [--quiet]",
    "  droxy stop [--force] [--quiet]",
    "  droxy status [--check] [--json] [--verbose] [--quiet]",
    "  droxy login [provider] [--with-models|--skip-models] [--quiet]",
    "  droxy connect [provider] [--with-models|--skip-models] [--quiet]",
    "  droxy help",
    "  droxy version",
    "",
    "Migration:",
    "  `droxy ui` was removed. Use: droxy",
    "",
    "Flags:",
    "  --with-models   Legacy alias; model auto-sync is already the default",
    "  --skip-models   Login only, skip automatic model sync",
    "  --quiet         Suppress non-essential info lines",
    "  --json          Stable machine-readable output for scripts (status)",
    "",
    "Providers:",
    "  gemini, codex, claude, qwen, kimi, iflow, antigravity",
    "",
    "Scripting notes:",
    "  - Use `droxy status --json` for automation",
    "  - Disable color with NO_COLOR=1 or DROXY_NO_COLOR=1",
    "",
    "Docs:",
    "  docs/GIT_WORKFLOW.md",
    "  docs/DROXY_STYLE_GUIDE.md",
  ];

  for (const line of lines) {
    output.log(line);
  }
}

function printGuided(output, payload) {
  if (output && typeof output.printGuidedError === "function") {
    output.printGuidedError(payload);
    return;
  }
  if (output && typeof output.log === "function") {
    output.log(payload.what || "Error.");
    if (payload.why) output.log(`Why: ${payload.why}`);
    if (Array.isArray(payload.next)) {
      for (const step of payload.next) {
        output.log(`Next: ${step}`);
      }
    }
  }
}

function isInteractiveSession(options = {}) {
  if (typeof options.isInteractiveSession === "function") {
    return options.isInteractiveSession();
  }
  return Boolean(process.stdin && process.stdin.isTTY && process.stdout && process.stdout.isTTY);
}

async function syncPersistedModelSelection({ quiet, config, helpers, sync, output }) {
  const state =
    config && typeof config.readState === "function" ? config.readState() || {} : {};
  const hasPersistedSelection = Array.isArray(state.selectedModels);
  if (!hasPersistedSelection) {
    if (!quiet && output && typeof output.printInfo === "function") {
      output.printInfo("No saved model selection yet. Skipping auto-sync. Use `droxy` to choose models.");
    }
    return {
      skipped: true,
      reason: "no_saved_selection",
      syncResult: null,
    };
  }

  const selectedModels =
    helpers && typeof helpers.normalizeIdList === "function"
      ? helpers.normalizeIdList(state.selectedModels)
      : [];
  if (!quiet && output && typeof output.printInfo === "function") {
    output.printInfo("Auto-syncing selected models to Droid...");
  }
  const syncResult = await sync.syncDroidSettings({ quiet, selectedModels });
  return {
    skipped: false,
    reason: "",
    syncResult,
  };
}

async function runCli(argv = process.argv.slice(2), options = {}) {
  const config = options.config || configModule;
  const interactive = options.interactive || interactiveModule;
  const helpers = options.helpers || helpersModule;
  const proxy = options.proxy || proxyModule;
  const login = options.login || loginModule;
  const sync = options.sync || syncModule;
  const output = options.output || outputModule;
  const version = options.version || pkg.version || "0.1.0";
  const rawArgs = Array.isArray(argv) ? argv.slice() : [];

  if (rawArgs.length === 0) {
    if (isInteractiveSession(options)) {
      return interactive.runInteractiveHome();
    }
    printHelp(output);
    return undefined;
  }

  const parsed = parseArgs(rawArgs);

  if (HELP_ALIASES.has(parsed.command)) {
    printHelp(output);
    return undefined;
  }

  if (VERSION_ALIASES.has(parsed.command)) {
    output.log(version);
    return undefined;
  }

  if (parsed.command === "start") {
    const quiet = parsed.hasFlag("--quiet");
    const startResult = await proxy.startProxy({ quiet, allowAttach: true });
    const running = Boolean(startResult && startResult.running);
    if (!running) {
      return startResult;
    }
    const { skipped, syncResult } = await syncPersistedModelSelection({
      quiet,
      config,
      helpers,
      sync,
      output,
    });
    if (skipped) {
      return startResult;
    }
    return { ...startResult, syncResult };
  }

  if (parsed.command === "stop") {
    return proxy.stopProxy({
      force: parsed.hasFlag("--force"),
      quiet: parsed.hasFlag("--quiet"),
    });
  }

  if (parsed.command === "status") {
    return proxy.statusProxy({
      check: parsed.hasFlag("--check"),
      json: parsed.hasFlag("--json"),
      verbose: parsed.hasFlag("--verbose"),
      quiet: parsed.hasFlag("--quiet"),
    });
  }

  if (parsed.command === "login" || parsed.command === "connect") {
    const skipModels = parsed.hasFlag("--skip-models");
    const selectModels = skipModels ? false : true;
    const quiet = parsed.hasFlag("--quiet");
    const loginResult = await login.loginFlow({
      providerId: parsed.subcommand,
      selectModels,
      quiet,
    });
    if (loginResult && loginResult.success === false) {
      return loginResult;
    }
    if (skipModels) {
      return loginResult;
    }
    const { skipped, syncResult } = await syncPersistedModelSelection({
      quiet,
      config,
      helpers,
      sync,
      output,
    });
    if (skipped) {
      return loginResult;
    }
    if (loginResult && typeof loginResult === "object") {
      return { ...loginResult, syncResult };
    }
    return syncResult;
  }

  if (parsed.command === "ui") {
    printGuided(output, {
      what: "`droxy ui` was removed.",
      why: "`droxy` now opens interactive setup directly.",
      next: ["Use: droxy", "Run: droxy help"],
    });
    process.exitCode = 1;
    return undefined;
  }

  const suggestion = suggestCommand(parsed.command);
  if (suggestion) {
    printGuided(output, {
      what: `Unknown command "${parsed.commandToken}".`,
      why: "The command is not part of the current MVP command set.",
      next: [
        `Did you mean: droxy ${suggestion}`,
        "Run: droxy help",
      ],
    });
  } else {
    printGuided(output, {
      what: `Unknown command "${parsed.commandToken}".`,
      why: "The command is not part of the current MVP command set.",
      next: ["Run: droxy help"],
    });
  }
  process.exitCode = 1;
  printHelp(output);
  return undefined;
}

function classifyErrorGuidance(message) {
  const text = String(message || "");
  if (text.includes("Proxy binary not found")) {
    return {
      why: "Droxy could not find the proxy engine binary needed for start/login.",
      next: [
        "Place cli-proxy-api-plus in vendor/",
        "or set DROXY_PROXY_BIN to your binary path",
        "then run: droxy start",
      ],
    };
  }
  if (text.includes("No provider selected")) {
    return {
      why: "Login requires a provider id in non-interactive contexts.",
      next: [
        "Run: droxy login claude",
        "or run without provider in a TTY session to get a prompt",
      ],
    };
  }
  return {
    why: "A runtime error interrupted the command.",
    next: ["Run: droxy help", "Run: droxy status --verbose"],
  };
}

function handleCliError(err, { exitOnError = true } = {}) {
  const message = err && err.message ? err.message : String(err || "Unknown error");
  const guidance = classifyErrorGuidance(message);
  outputModule.printGuidedError({
    what: message,
    why: guidance.why,
    next: guidance.next,
  });
  if (exitOnError) {
    process.exit(1);
  }
}

module.exports = {
  handleCliError,
  isInteractiveSession,
  parseArgs,
  printHelp,
  runCli,
  suggestCommand,
};

if (require.main === module) {
  runCli(process.argv.slice(2)).catch((err) => {
    handleCliError(err);
  });
}
