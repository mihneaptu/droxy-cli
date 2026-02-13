"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8317;
const DEFAULT_AUTH_DIR = "~/.cli-proxy-api";
const DEFAULT_PANEL_REPO =
  "https://github.com/router-for-me/Cli-Proxy-API-Management-Center";

function getAppDir() {
  if (process.env.DROXY_APP_DIR) return process.env.DROXY_APP_DIR;
  if (process.env.APPDATA) return path.join(process.env.APPDATA, "Droxy CLI");
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, "droxy-cli");
  }
  return path.join(os.homedir(), ".config", "droxy-cli");
}

function getConfigPath() {
  return path.join(getAppDir(), "config.yaml");
}

function getStatePath() {
  return path.join(getAppDir(), "droxy-state.json");
}

function getBinaryInstallDir() {
  return path.join(getAppDir(), "vendor");
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function yamlString(value) {
  const text = String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\"/g, "\\\"");
  return `"${text}"`;
}

function stripYamlString(value) {
  return String(value || "")
    .trim()
    .replace(/^["']/, "")
    .replace(/["']$/, "")
    .replace(/\\\\/g, "\\");
}

function readFirstApiKey(text) {
  const lines = String(text || "").split(/\r?\n/);
  let inBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("api-keys:")) {
      inBlock = true;
      continue;
    }
    if (!inBlock) continue;
    if (trimmed.startsWith("-")) {
      return stripYamlString(trimmed.replace(/^-/, "").trim());
    }
    if (trimmed && !trimmed.startsWith("-")) {
      break;
    }
  }
  return "";
}

function readTlsEnabledFromConfigText(text) {
  const source = String(text || "");
  const tlsBlockMatch = source.match(
    /^\s*tls:\s*(?:\r?\n)((?:[ \t].*(?:\r?\n|$))*)/m
  );
  if (!tlsBlockMatch) return false;
  const enableMatch = tlsBlockMatch[1].match(/^\s*enable:\s*(true|false)\s*$/m);
  return enableMatch ? enableMatch[1] === "true" : false;
}

function configExists() {
  return fs.existsSync(getConfigPath());
}

function readConfigText() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return "";
  return fs.readFileSync(configPath, "utf8");
}

function normalizeConfigValues(settings = {}) {
  return {
    host: String(settings.host || DEFAULT_HOST),
    port: Number(settings.port) || DEFAULT_PORT,
    tlsEnabled: settings.tlsEnabled === true,
    authDir: settings.authDir || DEFAULT_AUTH_DIR,
    apiKey: settings.apiKey || "",
    managementKey: settings.managementKey || "",
    tlsCert: settings.tlsCert || "",
    tlsKey: settings.tlsKey || "",
    allowRemote: settings.allowRemote === true,
  };
}

function renderConfig(settings = {}) {
  const next = normalizeConfigValues(settings);
  const authDir = resolveAuthDir(next.authDir || DEFAULT_AUTH_DIR);
  const lines = [];
  lines.push("# Droxy CLI configuration");
  lines.push(`host: ${yamlString(next.host)}`);
  lines.push(`port: ${next.port}`);
  lines.push(`auth-dir: ${yamlString(authDir)}`);
  lines.push("");
  lines.push("tls:");
  lines.push(`  enable: ${next.tlsEnabled ? "true" : "false"}`);
  lines.push(`  cert: ${yamlString(next.tlsCert || "")}`);
  lines.push(`  key: ${yamlString(next.tlsKey || "")}`);
  lines.push("");
  lines.push("remote-management:");
  lines.push(`  allow-remote: ${next.allowRemote ? "true" : "false"}`);
  lines.push(`  secret-key: ${yamlString(next.managementKey || "")}`);
  lines.push("  disable-control-panel: false");
  lines.push(`  panel-github-repository: ${yamlString(DEFAULT_PANEL_REPO)}`);
  lines.push("");
  lines.push("request-retry: 3");
  lines.push("max-retry-interval: 30");
  lines.push("quota-exceeded:");
  lines.push("  switch-project: true");
  lines.push("  switch-preview-model: true");
  lines.push("");
  lines.push("routing:");
  lines.push("  strategy: round-robin");
  lines.push("");
  lines.push("api-keys:");
  lines.push(`  - ${yamlString(next.apiKey || "")}`);
  lines.push("");
  return lines.join("\n");
}

function writeConfig(settings = {}) {
  ensureDir(getAppDir());
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, renderConfig(settings), "utf8");
  return configPath;
}

function readConfigValues() {
  const text = readConfigText();
  const hostMatch = text.match(/^\s*host:\s*"?([^"\n]+)"?/m);
  const portMatch = text.match(/^\s*port:\s*(\d+)/m);
  const authMatch = text.match(/^\s*auth-dir:\s*"?([^"\n]+)"?/m);
  const secretMatch = text.match(/^\s*secret-key:\s*"?([^"\n]*)"?/m);

  const hostRaw = hostMatch ? hostMatch[1].trim() : "";
  const host = hostRaw && hostRaw !== "0.0.0.0" ? hostRaw : DEFAULT_HOST;
  const port = portMatch ? Number(portMatch[1]) : DEFAULT_PORT;
  const tlsEnabled = readTlsEnabledFromConfigText(text);
  const authDir = authMatch ? stripYamlString(authMatch[1]) : DEFAULT_AUTH_DIR;
  const apiKey = readFirstApiKey(text);
  const managementKey = secretMatch ? stripYamlString(secretMatch[1]) : "";

  return { host, port, tlsEnabled, authDir, apiKey, managementKey };
}

function readHostPortFromConfig() {
  const values = readConfigValues();
  return {
    host: values.host,
    port: values.port,
    tlsEnabled: values.tlsEnabled,
  };
}

function resolveAuthDir(authDir) {
  if (!authDir) return path.join(os.homedir(), ".cli-proxy-api");
  if (authDir === "~") return os.homedir();
  if (authDir.startsWith("~/") || authDir.startsWith("~\\")) {
    return path.join(os.homedir(), authDir.slice(2));
  }
  return authDir;
}

function writeState(state) {
  ensureDir(getAppDir());
  fs.writeFileSync(getStatePath(), JSON.stringify(state, null, 2), "utf8");
}

function readState() {
  const statePath = getStatePath();
  if (!fs.existsSync(statePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return null;
  }
}

function updateState(partial = {}) {
  const current = readState() || {};
  const next = { ...current, ...partial };
  writeState(next);
  return next;
}

function clearProxyState() {
  const current = readState();
  if (!current) return;
  delete current.pid;
  delete current.startedAt;
  delete current.attached;
  delete current.lastDetectedAt;
  delete current.lastStoppedAt;
  writeState(current);
}

function generateKey(prefix) {
  return `${prefix}${crypto.randomBytes(16).toString("hex")}`;
}

function ensureConfig(settings = {}) {
  if (configExists()) return getConfigPath();
  const state = readState() || {};
  const next = normalizeConfigValues({
    ...settings,
    host: settings.host || DEFAULT_HOST,
    port: settings.port || DEFAULT_PORT,
    authDir: settings.authDir || DEFAULT_AUTH_DIR,
    tlsEnabled: settings.tlsEnabled === true,
    apiKey: settings.apiKey || state.apiKey || generateKey("droxy_"),
    managementKey: settings.managementKey || state.managementKey || generateKey("rm_"),
  });
  writeConfig(next);
  updateState({
    apiKey: next.apiKey,
    managementKey: next.managementKey,
  });
  return getConfigPath();
}

module.exports = {
  DEFAULT_AUTH_DIR,
  DEFAULT_HOST,
  DEFAULT_PORT,
  clearProxyState,
  configExists,
  ensureConfig,
  ensureDir,
  getAppDir,
  getBinaryInstallDir,
  getConfigPath,
  getStatePath,
  readConfigText,
  readConfigValues,
  readHostPortFromConfig,
  readState,
  readTlsEnabledFromConfigText,
  renderConfig,
  resolveAuthDir,
  updateState,
  writeConfig,
  writeState,
};
