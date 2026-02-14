"use strict";

const helpers = require("../helpers");

const HOME_ACTIONS = Object.freeze({
  accounts: { id: "accounts", label: "Accounts" },
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
  if (normalized === "anthropic" || normalized === "claude") return "claude";
  if (normalized === "openai" || normalized === "codex") return "codex";
  if (normalized === "google" || normalized === "gemini" || normalized === "aistudio") {
    return "gemini";
  }
  if (normalized === "qwen") return "qwen";
  if (normalized === "kimi" || normalized === "moonshot") return "kimi";
  if (normalized === "iflow") return "iflow";
  if (normalized === "antigravity") return "antigravity";
  return "";
}

function extractModelIdFromEntry(entry) {
  if (!entry || typeof entry !== "object") return "";
  return normalizeText(entry.id || entry.model || entry.name || entry.slug);
}

function extractProviderValue(value) {
  if (!value || typeof value !== "object") return value;
  return value.id || value.name || value.provider;
}

function resolveProviderFromEntryOwnerMetadata(entry) {
  if (!entry || typeof entry !== "object") return "";
  let raw =
    entry.owner ||
    entry.owned_by ||
    entry.organization ||
    entry.org;

  if (!raw && entry.meta && typeof entry.meta === "object") {
    raw = entry.meta.owner;
  }

  raw = extractProviderValue(raw);
  return resolveProviderFromHint(raw);
}

function resolveProviderFromEntryProviderMetadata(entry) {
  if (!entry || typeof entry !== "object") return "";
  let raw =
    entry.provider ||
    entry.provider_id ||
    entry.providerId ||
    entry.vendor ||
    entry.source;

  if (!raw && entry.meta && typeof entry.meta === "object") {
    raw = entry.meta.provider;
  }

  raw = extractProviderValue(raw);
  return resolveProviderFromHint(raw);
}

function resolveProviderFromEntryMetadata(entry) {
  const owner = resolveProviderFromEntryOwnerMetadata(entry);
  if (owner) return owner;
  return resolveProviderFromEntryProviderMetadata(entry);
}

function resolveModelFamilyFromModelId(modelId) {
  const normalized = normalizeText(modelId).toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("gemini")) return "gemini";
  if (
    normalized === "gpt" ||
    normalized.startsWith("gpt-") ||
    normalized.startsWith("o1") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4")
  ) {
    return "gpt";
  }
  if (normalized.includes("claude")) return "claude";
  if (normalized.includes("qwen")) return "qwen";
  if (normalized.includes("kimi") || normalized.includes("moonshot")) return "kimi";
  if (
    normalized.includes("iflow") ||
    normalized.includes("deepseek") ||
    normalized.includes("glm-") ||
    normalized.includes("minimax")
  ) {
    return "iflow";
  }
  if (normalized.includes("tab_")) return "tab";
  return "";
}

function resolveProviderForModelEntry(entry) {
  if (!entry || typeof entry !== "object") return "";

  const fromOwnerMetadata = resolveProviderFromEntryOwnerMetadata(entry);
  if (fromOwnerMetadata) return fromOwnerMetadata;

  return resolveProviderFromEntryProviderMetadata(entry);
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
      connectionState:
        provider && provider.connectionState === "connected"
          ? "connected"
          : provider && provider.connectionState === "disconnected"
            ? "disconnected"
            : provider && Object.prototype.hasOwnProperty.call(provider, "connected")
              ? provider.connected === true
                ? "connected"
                : "disconnected"
            : provider && provider.connected === true
              ? "connected"
              : "unknown",
      models: [],
    });
  }

  const unknownModels = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const modelId = extractModelIdFromEntry(entry);
    if (!modelId) continue;

    const explicitProviderId = resolveProviderFromEntryMetadata(entry);
    if (explicitProviderId) {
      if (providerMap.has(explicitProviderId)) {
        providerMap.get(explicitProviderId).models.push(modelId);
      } else {
        unknownModels.push(modelId);
      }
      continue;
    }
    unknownModels.push(modelId);
  }

  const connected = [];
  const disconnected = [];
  const unknown = [];
  for (const provider of providerMap.values()) {
    const models = normalizeModelIds(provider.models);
    if (!models.length) continue;
    const item = { ...provider, models };
    if (item.connected) connected.push(item);
    else disconnected.push(item);
  }

  const normalizedUnknownModels = normalizeModelIds(unknownModels);
  if (normalizedUnknownModels.length) {
    unknown.push({
      id: "unknown",
      label: "Unknown (unverified)",
      connected: false,
      connectionState: "unknown",
      models: normalizedUnknownModels,
    });
  }

  connected.sort((a, b) => a.label.localeCompare(b.label));
  disconnected.sort((a, b) => a.label.localeCompare(b.label));
  unknown.sort((a, b) => a.label.localeCompare(b.label));

  return connected.concat(disconnected, unknown);
}

function mergeProviderModelSelection(
  existingSelection,
  providerModels,
  selectedWithinProvider,
  providerId = "",
  persistedProviderModels = []
) {
  const existing = normalizeModelIds(existingSelection);
  const providerSet = new Set(normalizeModelIds(providerModels));
  const persistedProviderSet = new Set(normalizeModelIds(persistedProviderModels));
  const remainder = existing.filter((modelId) => {
    if (providerSet.has(modelId)) return false;
    if (persistedProviderSet.has(modelId)) return false;
    return true;
  });
  return normalizeModelIds(remainder.concat(selectedWithinProvider));
}

function buildVisibleHomeActions(context = {}) {
  const configExists = context.configExists !== false;
  const proxyBlocked = context.proxyBlocked === true;
  const proxyRunning = context.proxyRunning === true;
  const actions = [];

  actions.push(HOME_ACTIONS.connectProvider);
  actions.push(HOME_ACTIONS.accounts);

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
  resolveModelFamilyFromModelId,
  resolveProviderFromEntryMetadata,
  resolveProviderForModelEntry,
  resolveProviderFromHint,
  normalizeText,
};
