"use strict";

const fs = require("fs");
const { COLORS, colorize } = require("../ui/colors");
const {
  normalizeModelIds,
  normalizeText,
  resolveProviderForModelEntry,
} = require("./interactiveHelpers");

function getProvidersWithStatus(login, configValues) {
  if (login && typeof login.getProvidersWithConnectionStatus === "function") {
    const rows = login.getProvidersWithConnectionStatus(configValues);
    if (Array.isArray(rows) && rows.length) {
      return rows.map((provider) => ({
        ...provider,
        connected: provider.connected === true,
      }));
    }
  }

  const providers = login && Array.isArray(login.PROVIDERS) ? login.PROVIDERS : [];
  return providers.map((provider) => ({
    ...provider,
    connected: false,
  }));
}

function getConnectedProvidersWithStatus(login, configValues) {
  return getProvidersWithStatus(login, configValues).filter((provider) => provider.connected);
}

function formatProviderMenuItem(provider) {
  return `${provider.label} (${provider.id})`;
}

function formatProviderModelsItem(group, syncedByProvider) {
  const syncedCount = Number((syncedByProvider || {})[group.id]) || 0;
  return `${group.label} (${group.id})  ${colorize("·", COLORS.dim)} ${syncedCount} synced`;
}

async function promptProviderSelection(menu, providers) {
  if (!providers.length) return null;

  const selection = await menu.selectSingle({
    title: "Choose provider",
    items: providers.map(formatProviderMenuItem),
    hint: "Use ↑/↓ and Enter. Press q to cancel.",
  });

  if (!selection || selection.cancelled) return null;
  return providers[selection.index] || null;
}

async function promptProviderModelsSelection(menu, providerGroups, options = {}) {
  const syncedByProvider = options && typeof options === "object"
    ? options.syncedByProvider || {}
    : {};
  const selection = await menu.selectSingle({
    title: "Choose provider for model selection",
    items: providerGroups.map((group) => formatProviderModelsItem(group, syncedByProvider)),
    hint: "Use ↑/↓ and Enter. Press q to cancel.",
  });
  if (!selection || selection.cancelled) return null;
  return providerGroups[selection.index] || null;
}

function parseJsonFileSafe(fsApi, filePath) {
  try {
    if (!fsApi.existsSync(filePath)) return null;
    const raw = fsApi.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getCustomModelEntries(root) {
  if (!root || typeof root !== "object") return [];
  const entries = [];
  if (Array.isArray(root.customModels)) entries.push(...root.customModels);
  if (Array.isArray(root.custom_models)) entries.push(...root.custom_models);
  return entries;
}

function fallbackDroxyManagedCheck(entry) {
  const label = String(
    (entry && (entry.displayName || entry.model_display_name || "")) || ""
  );
  return label.startsWith("Droxy • ");
}

function normalizeEntryForProviderResolution(entry) {
  const modelId = normalizeText(
    entry &&
      (
        entry.model ||
        entry.model_id ||
        entry.modelId ||
        entry.id ||
        entry.name ||
        entry.slug
      )
  );
  if (!modelId) return null;

  return {
    id: modelId,
    provider:
      entry.provider ||
      entry.provider_id ||
      entry.providerId ||
      entry.vendor ||
      entry.source ||
      entry.owner ||
      entry.owned_by ||
      entry.organization ||
      entry.org,
    meta: entry.meta,
  };
}

function readDroidSyncedModelIdsByProvider({ config, sync, fsApi = fs } = {}) {
  if (!config || typeof config.readConfigValues !== "function") return {};
  if (!sync || typeof sync.getDroidManagedPaths !== "function") return {};

  const configValues = config.readConfigValues() || {};
  const host = configValues.host;
  const port = configValues.port;
  const paths = (sync.getDroidManagedPaths() || []).filter((filePath) =>
    /(?:^|[\\/])(?:settings|config)\.json$/i.test(String(filePath || ""))
  );

  const byProvider = new Map();
  const seen = new Set();

  for (const filePath of paths) {
    const root = parseJsonFileSafe(fsApi, filePath);
    for (const entry of getCustomModelEntries(root)) {
      let managed = false;
      if (typeof sync.isDroxyManagedEntry === "function" && host && port) {
        managed = sync.isDroxyManagedEntry(entry, host, port);
      } else {
        managed = fallbackDroxyManagedCheck(entry);
      }
      if (!managed) continue;

      const normalizedEntry = normalizeEntryForProviderResolution(entry);
      if (!normalizedEntry) continue;

      const providerId = resolveProviderForModelEntry(normalizedEntry);
      if (!providerId) continue;

      const modelId = normalizedEntry.id;
      const key = `${providerId}:${modelId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (!byProvider.has(providerId)) {
        byProvider.set(providerId, []);
      }
      byProvider.get(providerId).push(modelId);
    }
  }

  const output = {};
  for (const [providerId, ids] of byProvider.entries()) {
    output[providerId] = normalizeModelIds(ids);
  }
  return output;
}

function readDroidSyncedModelsByProvider(options = {}) {
  const idsByProvider = readDroidSyncedModelIdsByProvider(options);
  const output = {};
  for (const [providerId, ids] of Object.entries(idsByProvider)) {
    output[providerId] = normalizeModelIds(ids).length;
  }
  return output;
}

function isLikelyThinkingModelId(modelId) {
  const value = normalizeText(modelId).toLowerCase();
  if (!value) return false;
  return (
    value.includes("thinking") ||
    value.includes("reasoning") ||
    value.startsWith("o1") ||
    value.startsWith("o3") ||
    value.startsWith("o4") ||
    /(^|[-_])r1([-.]|$)/.test(value)
  );
}

function dedupeModelEntries(entries) {
  const byId = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const id = normalizeText(entry && entry.id ? entry.id : "");
    if (!id || byId.has(id)) continue;
    byId.set(id, entry);
  }
  return Array.from(byId.values());
}

async function fetchModelEntriesForSelection({ config, proxy, sync }) {
  config.ensureConfig();
  const values = config.readConfigValues();
  const status = await proxy.getProxyStatus(values.host, values.port);
  if (status.blocked) {
    throw new Error("Configured proxy port is blocked by a non-Droxy process.");
  }
  if (!status.running) {
    throw new Error("Droxy proxy is not running.");
  }

  const state = config.readState() || {};
  const apiKey = values.apiKey || state.apiKey || "";
  const protocolResolution = await sync.resolveReachableProtocol(values, {
    probePath: "/v1/models",
  });

  if (!protocolResolution.reachable) {
    throw sync.buildProtocolUnavailableError(protocolResolution);
  }

  const entries = await sync.fetchAvailableModelEntries(
    { ...values, apiKey },
    { protocolResolution }
  );

  return {
    entries: dedupeModelEntries(entries),
    protocol: protocolResolution.protocol || null,
  };
}

async function promptModelSelection(menu, models, initialSelected, providerLabel) {
  return menu.selectMultiple({
    title: `Choose models • ${providerLabel}`,
    items: models,
    initialSelected: normalizeModelIds(initialSelected),
    hint: "↑/↓ move  space toggle  a all  n none (this provider)  enter confirm  q cancel",
  });
}

async function promptThinkingModelSelection(menu, models, initialSelected) {
  return menu.selectMultiple({
    title: "Choose thinking models",
    items: normalizeModelIds(models),
    initialSelected: normalizeModelIds(initialSelected),
    hint: "↑/↓ move  space toggle  a all  n none  enter confirm  q keep previous",
  });
}

function resolveThinkingModels(models, existingThinkingModels = []) {
  const selected = normalizeModelIds(models);
  const currentSet = new Set(
    normalizeModelIds(existingThinkingModels).filter((modelId) => selected.includes(modelId))
  );
  return normalizeModelIds(
    selected.filter((modelId) => currentSet.has(modelId) || isLikelyThinkingModelId(modelId))
  );
}

module.exports = {
  fetchModelEntriesForSelection,
  getConnectedProvidersWithStatus,
  getProvidersWithStatus,
  promptModelSelection,
  promptThinkingModelSelection,
  promptProviderModelsSelection,
  promptProviderSelection,
  readDroidSyncedModelIdsByProvider,
  readDroidSyncedModelsByProvider,
  resolveThinkingModels,
};
