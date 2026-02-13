"use strict";

const helpers = require("../helpers");

const HOME_ACTIONS = Object.freeze({
  chooseModels: { id: "choose_models", label: "Choose Models" },
  connectProvider: { id: "connect_provider", label: "Connect Provider" },
  exit: { id: "exit", label: "Exit" },
  startProxy: { id: "start_proxy", label: "Start Proxy" },
  status: { id: "status", label: "Status" },
  stopProxy: { id: "stop_proxy", label: "Stop Proxy" },
});

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeModelIds(items) {
  return helpers.normalizeIdList(items);
}

function normalizeProviderHint(value) {
  return normalizeText(value).toLowerCase();
}

function resolveProviderFromHint(value) {
  const normalized = normalizeProviderHint(value);
  if (!normalized) return "";
  if (normalized === "anthropic" || normalized.includes("claude")) return "claude";
  if (normalized === "openai" || normalized.includes("codex")) return "codex";
  if (
    normalized === "gpt" ||
    normalized.startsWith("gpt-") ||
    normalized.startsWith("o1") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4")
  ) {
    return "codex";
  }
  if (normalized === "google" || normalized.includes("gemini") || normalized.includes("aistudio")) {
    return "gemini";
  }
  if (normalized.includes("qwen")) return "qwen";
  if (normalized.includes("kimi") || normalized.includes("moonshot")) return "kimi";
  if (normalized.includes("iflow")) return "iflow";
  if (normalized.includes("antigravity")) return "antigravity";
  return "";
}

function resolveProviderForModelEntry(entry) {
  if (!entry || typeof entry !== "object") return "";

  const modelId = entry.id || entry.model || entry.name || entry.slug || "";
  const fromModelId = resolveProviderFromHint(modelId);
  if (fromModelId) return fromModelId;

  let raw =
    entry.provider ||
    entry.provider_id ||
    entry.providerId ||
    entry.vendor ||
    entry.source ||
    entry.owner ||
    entry.owned_by ||
    entry.organization ||
    entry.org;

  if (!raw && entry.meta && typeof entry.meta === "object") {
    raw = entry.meta.provider || entry.meta.owner;
  }

  if (raw && typeof raw === "object") {
    raw = raw.id || raw.name || raw.provider;
  }

  return resolveProviderFromHint(raw);
}

function buildProviderModelGroups(entries, providerStatuses) {
  const providers = Array.isArray(providerStatuses) ? providerStatuses : [];
  const providerMap = new Map();
  for (const provider of providers) {
    const id = normalizeText(provider && provider.id).toLowerCase();
    if (!id) continue;
    providerMap.set(id, {
      id,
      label: normalizeText(provider.label) || id,
      connected: provider.connected === true,
      models: [],
    });
  }

  for (const entry of Array.isArray(entries) ? entries : []) {
    const modelId = normalizeText(entry && entry.id ? entry.id : "");
    if (!modelId) continue;

    const providerId = resolveProviderForModelEntry(entry);
    if (providerId && providerMap.has(providerId)) {
      providerMap.get(providerId).models.push(modelId);
    }
  }

  const connected = [];
  const disconnected = [];
  for (const provider of providerMap.values()) {
    const models = normalizeModelIds(provider.models);
    if (!models.length) continue;
    const item = { ...provider, models };
    if (item.connected) connected.push(item);
    else disconnected.push(item);
  }

  connected.sort((a, b) => a.label.localeCompare(b.label));
  disconnected.sort((a, b) => a.label.localeCompare(b.label));

  return connected.concat(disconnected);
}

function mergeProviderModelSelection(existingSelection, providerModels, selectedWithinProvider) {
  const existing = normalizeModelIds(existingSelection);
  const providerSet = new Set(normalizeModelIds(providerModels));
  const remainder = existing.filter((modelId) => !providerSet.has(modelId));
  return normalizeModelIds(remainder.concat(selectedWithinProvider));
}

function buildVisibleHomeActions(context = {}) {
  const configExists = context.configExists !== false;
  const proxyBlocked = context.proxyBlocked === true;
  const proxyRunning = context.proxyRunning === true;
  const actions = [];

  actions.push(HOME_ACTIONS.connectProvider);

  if (configExists) {
    if (proxyRunning) {
      actions.push(HOME_ACTIONS.chooseModels);
    }
    actions.push(HOME_ACTIONS.status);

    if (proxyRunning) {
      actions.push(HOME_ACTIONS.stopProxy);
    } else if (!proxyBlocked) {
      actions.push(HOME_ACTIONS.startProxy);
    }
  } else {
    actions.push(HOME_ACTIONS.status);
  }

  actions.push(HOME_ACTIONS.exit);
  return actions;
}

module.exports = {
  buildProviderModelGroups,
  buildVisibleHomeActions,
  HOME_ACTIONS,
  mergeProviderModelSelection,
  normalizeModelIds,
  resolveProviderForModelEntry,
  resolveProviderFromHint,
  normalizeText,
};
