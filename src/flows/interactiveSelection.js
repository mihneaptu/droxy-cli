"use strict";

const fs = require("fs");
const helpers = require("../helpers");
const { COLORS, colorize } = require("../ui/colors");
const {
  normalizeModelIds,
  normalizeText,
  resolveModelFamilyFromModelId,
  resolveProviderForModelEntry,
} = require("./interactiveHelpers");
const THINKING_MODE_VALUES = helpers.THINKING_MODE_VALUES;
const normalizeThinkingMode = helpers.normalizeThinkingMode;
const normalizeThinkingModelModes = helpers.normalizeThinkingModelModes;
const stripThinkingSuffix = helpers.stripThinkingSuffix;
const THINKING_MODE_HISTORY_LIMIT = 5;

function getProvidersWithStatus(login, configValues) {
  if (login && typeof login.getProvidersWithConnectionStatus === "function") {
    const rows = login.getProvidersWithConnectionStatus(configValues);
    if (Array.isArray(rows) && rows.length) {
      return rows.map((provider) => ({
        ...provider,
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
      }));
    }
  }

  const providers = login && Array.isArray(login.PROVIDERS) ? login.PROVIDERS : [];
  return providers.map((provider) => ({
    ...provider,
    connected: false,
    connectionState: "unknown",
  }));
}

function getConnectedProvidersWithStatus(login, configValues) {
  return getProvidersWithStatus(login, configValues).filter((provider) => (
    provider.connected ||
    provider.connectionState === "unknown"
  ));
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
      if (typeof sync.isDroxyManagedEntry !== "function" || !host || !port) continue;
      const managed = sync.isDroxyManagedEntry(entry, host, port);
      if (!managed) continue;

      const normalizedEntry = normalizeEntryForProviderResolution(entry);
      if (!normalizedEntry) continue;

      const providerId = resolveProviderForModelEntry(normalizedEntry);
      if (!providerId) continue;

      const modelId = stripThinkingSuffix(normalizedEntry.id);
      if (!modelId) continue;
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
  return /(^|[-_.])(thinking|reasoning)([-_.]|$)/.test(value);
}

function resolveThinkingModelModes(thinkingModels, existingThinkingModelModes = {}) {
  const thinkingModelIds = normalizeModelIds(thinkingModels);
  const existingModeLookup = normalizeThinkingModelModes(existingThinkingModelModes);
  const output = {};
  for (const modelId of thinkingModelIds) {
    const existingMode = existingModeLookup[modelId.toLowerCase()];
    output[modelId] = existingMode || "medium";
  }
  return output;
}

function normalizeThinkingModelModeHistory(thinkingModelModeHistory = {}, options = {}) {
  const maxEntriesRaw =
    options && typeof options === "object" && Number.isFinite(options.maxEntries)
      ? Number(options.maxEntries)
      : THINKING_MODE_HISTORY_LIMIT;
  const maxEntries = Math.max(1, Math.floor(maxEntriesRaw));
  const output = {};
  if (!thinkingModelModeHistory || typeof thinkingModelModeHistory !== "object") return output;
  for (const [modelId, modes] of Object.entries(thinkingModelModeHistory)) {
    const normalizedModelId = stripThinkingSuffix(modelId).toLowerCase();
    if (!normalizedModelId) continue;
    const modeList = Array.isArray(modes) ? modes : [modes];
    const dedupedModes = [];
    const seenModes = new Set();
    for (const mode of modeList) {
      const normalizedMode = normalizeThinkingMode(mode);
      if (!normalizedMode || normalizedMode === "none" || seenModes.has(normalizedMode)) continue;
      dedupedModes.push(normalizedMode);
      seenModes.add(normalizedMode);
      if (dedupedModes.length >= maxEntries) break;
    }
    if (!dedupedModes.length) continue;
    output[normalizedModelId] = dedupedModes;
  }
  return output;
}

function resolveThinkingModeFromHistory(thinkingModelModeHistory = {}, modelId = "") {
  const normalizedModelId = stripThinkingSuffix(modelId).toLowerCase();
  if (!normalizedModelId) return "";
  const historyLookup = normalizeThinkingModelModeHistory(thinkingModelModeHistory);
  const modes = Array.isArray(historyLookup[normalizedModelId]) ? historyLookup[normalizedModelId] : [];
  return modes.length ? modes[0] : "";
}

function updateThinkingModelModeHistory(thinkingModelModeHistory = {}, modelId, mode, options = {}) {
  const normalizedModelId = stripThinkingSuffix(modelId).toLowerCase();
  const normalizedMode = normalizeThinkingMode(mode);
  const normalizedHistory = normalizeThinkingModelModeHistory(thinkingModelModeHistory, options);
  if (!normalizedModelId || !normalizedMode || normalizedMode === "none") return normalizedHistory;
  const maxEntriesRaw =
    options && typeof options === "object" && Number.isFinite(options.maxEntries)
      ? Number(options.maxEntries)
      : THINKING_MODE_HISTORY_LIMIT;
  const maxEntries = Math.max(1, Math.floor(maxEntriesRaw));
  const existingModes = Array.isArray(normalizedHistory[normalizedModelId])
    ? normalizedHistory[normalizedModelId]
    : [];
  const nextModes = [normalizedMode].concat(existingModes.filter((value) => value !== normalizedMode));
  normalizedHistory[normalizedModelId] = nextModes.slice(0, maxEntries);
  return normalizedHistory;
}

function thinkingModeTitleCase(mode) {
  const normalized = normalizeThinkingMode(mode);
  if (!normalized) return "Medium";
  return `${normalized[0].toUpperCase()}${normalized.slice(1)}`;
}

function thinkingModeLabelForModel(modelId, thinkingModelModes = {}, thinkingModelModeHistory = {}) {
  const modeLookup = normalizeThinkingModelModes(thinkingModelModes);
  const normalizedModelId = stripThinkingSuffix(modelId).toLowerCase();
  const activeMode = modeLookup[normalizedModelId];
  if (activeMode && activeMode !== "none") {
    return thinkingModeTitleCase(activeMode);
  }
  const fallback = resolveThinkingModeFromHistory(thinkingModelModeHistory, normalizedModelId);
  if (fallback) return `Off (last: ${thinkingModeTitleCase(fallback)})`;
  return "Off";
}

async function promptThinkingModeForModel(menu, modelId, initialMode = "medium") {
  const modeOptions = THINKING_MODE_VALUES.slice();
  const modeItems = modeOptions.map(thinkingModeTitleCase);
  const normalizedInitialMode = normalizeThinkingMode(initialMode) || "medium";
  const initialIndex = Math.max(0, modeOptions.indexOf(normalizedInitialMode));
  const selection = await menu.selectSingle({
    title: `Thinking mode • ${modelId}`,
    items: modeItems,
    initialIndex,
    hint: "Use ↑/↓ and Enter. Press q to keep current mode.",
  });
  if (!selection || selection.cancelled) return normalizedInitialMode;
  return modeOptions[selection.index] || normalizedInitialMode;
}

async function promptThinkingModelModes(menu, thinkingModels, initialModes = {}) {
  const thinkingModelIds = normalizeModelIds(thinkingModels);
  if (!thinkingModelIds.length) return {};
  const modeLookup = normalizeThinkingModelModes(initialModes);
  const output = {};
  for (const modelId of thinkingModelIds) {
    const nextMode = await promptThinkingModeForModel(
      menu,
      modelId,
      modeLookup[modelId.toLowerCase()] || "medium"
    );
    output[modelId] = normalizeThinkingMode(nextMode) || "medium";
  }
  return output;
}

async function promptThinkingManagementAction(
  menu,
  { selectedModelsCount = 0, thinkingModelsCount = 0 } = {}
) {
  const selection = await menu.selectSingle({
    title: [
      "Thinking settings",
      "",
      `Selected models: ${selectedModelsCount}`,
      `Thinking enabled: ${thinkingModelsCount}`,
    ].join("\n"),
    items: ["Manage Thinking Modes", "Save & Sync"],
    initialIndex: 1,
    hint: "Use ↑/↓ and Enter. Press q to save and continue.",
  });
  if (!selection || selection.cancelled) return "save_and_sync";
  return selection.index === 0 ? "manage_thinking_modes" : "save_and_sync";
}

async function promptThinkingModelForManagement(
  menu,
  selectedModels,
  thinkingModelModes = {},
  thinkingModelModeHistory = {}
) {
  const modelIds = normalizeModelIds(selectedModels);
  if (!modelIds.length) return null;
  const selection = await menu.selectSingle({
    title: "Choose model for thinking mode",
    items: modelIds.map(
      (modelId) =>
        `${modelId}  ${colorize("·", COLORS.dim)} current: ${thinkingModeLabelForModel(
          modelId,
          thinkingModelModes,
          thinkingModelModeHistory
        )}`
    ),
    hint: "Use ↑/↓ and Enter. Press q to return.",
  });
  if (!selection || selection.cancelled) return null;
  return modelIds[selection.index] || null;
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
    { protocolResolution, state }
  );

  return {
    entries: dedupeModelEntries(entries),
    protocol: protocolResolution.protocol || null,
  };
}

async function promptModelSelection(menu, models, initialSelected, providerLabel) {
  const items = normalizeModelIds(models).map((modelId) => {
    const family = resolveModelFamilyFromModelId(modelId);
    const label = family ? `${modelId}  ${colorize("·", COLORS.dim)} family: ${family}` : modelId;
    return { value: modelId, label };
  });
  return menu.selectMultiple({
    title: `Choose models • ${providerLabel}`,
    items,
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

function resolveThinkingModels(models, existingThinkingModels = [], options = {}) {
  const selected = normalizeModelIds(models);
  const explicitThinkingCandidates = normalizeModelIds(
    selected.filter((modelId) => isLikelyThinkingModelId(modelId))
  );

  const hasSavedThinkingSelection =
    options && typeof options === "object" && options.hasSavedThinkingSelection === true;
  if (!hasSavedThinkingSelection) {
    return explicitThinkingCandidates;
  }

  const selectedSet = new Set(selected);
  return normalizeModelIds(
    normalizeModelIds(existingThinkingModels).filter((modelId) => selectedSet.has(modelId))
  );
}

module.exports = {
  fetchModelEntriesForSelection,
  getConnectedProvidersWithStatus,
  getProvidersWithStatus,
  normalizeThinkingModelModeHistory,
  promptModelSelection,
  promptThinkingManagementAction,
  promptThinkingModelForManagement,
  promptThinkingModelModes,
  promptThinkingModelSelection,
  promptProviderModelsSelection,
  promptProviderSelection,
  readDroidSyncedModelIdsByProvider,
  readDroidSyncedModelsByProvider,
  resolveThinkingModeFromHistory,
  resolveThinkingModelModes,
  resolveThinkingModels,
  THINKING_MODE_HISTORY_LIMIT,
  updateThinkingModelModeHistory,
};
