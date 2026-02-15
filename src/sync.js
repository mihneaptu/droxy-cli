"use strict";

const fs = require("fs");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");

const configModule = require("./config");
const helpersModule = require("./helpers");
const thinkingCapabilities = require("./thinkingCapabilities");
const outputModule = require("./ui/output");

const DROXY_FACTORY_PREFIX = "Droxy • ";
const MODEL_ALLOW_HINT_PATHS = Object.freeze([
  ["available"],
  ["is_available"],
  ["available_for_account"],
  ["availableForAccount"],
  ["available_for_user"],
  ["availableForUser"],
  ["enabled"],
  ["is_enabled"],
  ["eligible"],
  ["is_eligible"],
  ["can_use"],
  ["canUse"],
  ["access", "allowed"],
  ["access", "granted"],
  ["entitlement", "allowed"],
  ["entitlement", "eligible"],
  ["entitlements", "allowed"],
  ["entitlements", "eligible"],
  ["meta", "available"],
  ["meta", "is_available"],
  ["meta", "enabled"],
  ["meta", "eligible"],
  ["meta", "access", "allowed"],
  ["meta", "access", "granted"],
  ["meta", "entitlement", "allowed"],
  ["meta", "entitlement", "eligible"],
]);
const MODEL_DENY_HINT_PATHS = Object.freeze([
  ["restricted"],
  ["is_restricted"],
  ["denied"],
  ["is_denied"],
  ["forbidden"],
  ["is_forbidden"],
  ["blocked"],
  ["is_blocked"],
  ["disabled"],
  ["is_disabled"],
  ["unavailable"],
  ["is_unavailable"],
  ["access", "denied"],
  ["access", "forbidden"],
  ["access", "blocked"],
  ["access", "restricted"],
  ["entitlement", "restricted"],
  ["entitlements", "restricted"],
  ["meta", "restricted"],
  ["meta", "denied"],
  ["meta", "forbidden"],
  ["meta", "blocked"],
  ["meta", "disabled"],
  ["meta", "unavailable"],
  ["meta", "access", "restricted"],
  ["meta", "access", "denied"],
  ["meta", "access", "forbidden"],
  ["meta", "access", "blocked"],
  ["meta", "entitlement", "restricted"],
]);
const MODEL_STATUS_HINT_PATHS = Object.freeze([
  ["status"],
  ["availability"],
  ["state"],
  ["access", "status"],
  ["entitlement", "status"],
  ["entitlements", "status"],
  ["meta", "status"],
  ["meta", "availability"],
  ["meta", "state"],
  ["meta", "access", "status"],
  ["meta", "entitlement", "status"],
]);
const THINKING_SUPPORT_HINT_PATHS = Object.freeze([
  ["thinking"],
  ["thinking", "enabled"],
  ["thinking", "supported"],
  ["thinking", "available"],
  ["thinking", "allowed"],
  ["reasoning"],
  ["reasoning", "enabled"],
  ["reasoning", "supported"],
  ["reasoning", "available"],
  ["reasoning", "allowed"],
  ["capabilities", "thinking"],
  ["capabilities", "reasoning"],
  ["features", "thinking"],
  ["features", "reasoning"],
  ["meta", "thinking"],
  ["meta", "reasoning"],
  ["meta", "capabilities", "thinking"],
  ["meta", "capabilities", "reasoning"],
]);
const THINKING_ALLOWED_MODES_HINT_PATHS = Object.freeze([
  ["thinking_modes"],
  ["thinkingModes"],
  ["reasoning_modes"],
  ["reasoningModes"],
  ["thinking", "modes"],
  ["thinking", "allowed_modes"],
  ["thinking", "allowedModes"],
  ["thinking", "supported_modes"],
  ["thinking", "supportedModes"],
  ["reasoning", "modes"],
  ["reasoning", "allowed_modes"],
  ["reasoning", "allowedModes"],
  ["reasoning", "supported_modes"],
  ["reasoning", "supportedModes"],
  ["capabilities", "thinking_modes"],
  ["capabilities", "thinkingModes"],
  ["capabilities", "reasoning_modes"],
  ["capabilities", "reasoningModes"],
  ["meta", "thinking_modes"],
  ["meta", "thinkingModes"],
  ["meta", "reasoning_modes"],
  ["meta", "reasoningModes"],
  ["meta", "thinking", "modes"],
  ["meta", "reasoning", "modes"],
]);
const THINKING_STATUS_HINT_PATHS = Object.freeze([
  ["thinking_status"],
  ["thinkingStatus"],
  ["reasoning_status"],
  ["reasoningStatus"],
  ["thinking", "status"],
  ["thinking", "state"],
  ["thinking", "availability"],
  ["reasoning", "status"],
  ["reasoning", "state"],
  ["reasoning", "availability"],
  ["meta", "thinking_status"],
  ["meta", "thinkingStatus"],
  ["meta", "reasoning_status"],
  ["meta", "reasoningStatus"],
  ["meta", "thinking", "status"],
  ["meta", "reasoning", "status"],
]);
const RESTRICTED_STATUS_VALUES = new Set([
  "blocked",
  "denied",
  "disabled",
  "forbidden",
  "ineligible",
  "not_available",
  "pro_only",
  "restricted",
  "requires_pro",
  "subscription_required",
  "unavailable",
]);
const MANAGEMENT_AUTH_FILES_PATH = "/v0/management/auth-files";
const MANAGEMENT_AUTH_FILES_DOWNLOAD_PATH = "/v0/management/auth-files/download";
const MANAGEMENT_OAUTH_EXCLUDED_MODELS_PATH = "/v0/management/oauth-excluded-models";
const MANAGEMENT_MODEL_DEFINITIONS_PATH_PREFIX = "/v0/management/model-definitions";
const UNSUPPORTED_MODEL_HINTS = Object.freeze([
  "is not supported",
  "not supported",
  "unsupported",
  "not available",
  "unavailable",
  "requires",
  "subscription",
  "not allowed",
  "denied",
]);
const AUTH_METADATA_EXCLUDED_MODEL_KEYS = Object.freeze([
  "excluded_models",
  "excluded-models",
  "excludedModels",
]);
const PROVIDER_ID_ALIASES = Object.freeze({
  antigravity: ["antigravity"],
  claude: ["claude", "anthropic"],
  codex: ["codex", "openai"],
  gemini: ["gemini", "google", "aistudio", "gemini-cli"],
  iflow: ["iflow"],
  kimi: ["kimi", "moonshot"],
  qwen: ["qwen"],
});
const MODEL_DEFINITION_CHANNEL_BY_PROVIDER = Object.freeze({
  antigravity: "antigravity",
  claude: "claude",
  codex: "codex",
  gemini: "gemini",
  iflow: "iflow",
  qwen: "qwen",
});

function createSyncApi(overrides = {}) {
  const fsApi = overrides.fs || fs;
  const httpApi = overrides.http || http;
  const httpsApi = overrides.https || https;
  const osApi = overrides.os || os;
  const pathApi = overrides.path || path;
  const config = overrides.config || configModule;
  const helpers = overrides.helpers || helpersModule;
  const output = overrides.output || outputModule;

  function getFactoryDir() {
    if (process.env.DROXY_FACTORY_DIR) return process.env.DROXY_FACTORY_DIR;
    return pathApi.join(osApi.homedir(), ".factory");
  }

  function ensureDroxyPrefix(displayName) {
    if (!displayName) return DROXY_FACTORY_PREFIX.trim();
    if (displayName.startsWith(DROXY_FACTORY_PREFIX)) return displayName;
    let value = String(displayName);
    while (value.startsWith("Droxy | ")) {
      value = value.slice("Droxy | ".length);
    }
    if (value.startsWith(DROXY_FACTORY_PREFIX)) return value;
    return `${DROXY_FACTORY_PREFIX}${value}`;
  }

  function slugifyCustomModelId(displayName) {
    const value = String(displayName || "");
    let outputValue = "";
    let lastDash = false;
    for (const ch of value) {
      if (/[a-z0-9]/i.test(ch)) {
        outputValue += ch;
        lastDash = false;
      } else if (!lastDash) {
        outputValue += "-";
        lastDash = true;
      }
    }
    while (outputValue.endsWith("-")) {
      outputValue = outputValue.slice(0, -1);
    }
    return outputValue || "custom-model";
  }

  function classifyProviderForFactory(modelId) {
    const lower = String(modelId || "").toLowerCase();
    if (/(^|[\\/])claude-/.test(lower)) {
      return "anthropic";
    }
    return "openai";
  }

  function classifyProviderOwnerFromModelId(modelId) {
    const lower = String(modelId || "").toLowerCase();
    if (!lower) return "";
    if (lower.includes("antigravity") || lower.includes("tab_")) return "antigravity";
    if (lower.includes("claude")) return "claude";
    if (
      lower === "gpt" ||
      lower.startsWith("gpt-") ||
      lower.startsWith("o1") ||
      lower.startsWith("o3") ||
      lower.startsWith("o4")
    ) {
      return "codex";
    }
    if (lower.includes("google") || lower.includes("gemini") || lower.includes("aistudio")) {
      return "gemini";
    }
    if (lower.includes("qwen")) return "qwen";
    if (lower.includes("moonshot") || lower.includes("kimi")) return "kimi";
    if (
      lower.includes("iflow") ||
      lower.includes("deepseek") ||
      lower.includes("glm-") ||
      lower.includes("minimax")
    ) {
      return "iflow";
    }
    return "";
  }

  function normalizeProviderOwnerTag(raw) {
    const value = String(raw || "").toLowerCase();
    if (!value) return "";
    if (value.includes("antigravity")) return "antigravity";
    if (value.includes("anthropic") || value.includes("claude")) return "claude";
    if (value.includes("openai") || value.includes("codex")) return "codex";
    if (value.includes("google") || value.includes("gemini") || value.includes("aistudio")) return "gemini";
    if (value.includes("qwen")) return "qwen";
    if (value.includes("moonshot") || value.includes("kimi")) return "kimi";
    if (value.includes("iflow")) return "iflow";
    return "";
  }

  function mapOwnerToFactoryProvider(ownerProvider, modelId) {
    const owner = String(ownerProvider || "").trim().toLowerCase();
    if (owner === "claude") return "anthropic";
    if (owner) return "openai";
    return classifyProviderForFactory(modelId);
  }

  function resolveProviderOwnerFromEntryMetadata(entry) {
    if (!entry) return "";
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

    return normalizeProviderOwnerTag(raw);
  }

  function resolveProviderOwnerForEntry(entry) {
    const normalized = resolveProviderOwnerFromEntryMetadata(entry);
    if (normalized) return normalized;
    return classifyProviderOwnerFromModelId(entry && entry.id);
  }

  function splitModelsForFactoryEntries(entries) {
    const byId = new Map();
    for (const entry of entries || []) {
      const id = entry && entry.id ? String(entry.id) : "";
      if (!id) continue;
      const metadataOwnerProvider = resolveProviderOwnerFromEntryMetadata(entry);
      const ownerProvider = metadataOwnerProvider || classifyProviderOwnerFromModelId(id);
      const ownerFromMetadata = Boolean(metadataOwnerProvider);
      const factoryProvider = mapOwnerToFactoryProvider(ownerProvider, id);
      const next = { ownerProvider, factoryProvider, ownerFromMetadata };
      if (!byId.has(id)) {
        byId.set(id, next);
        continue;
      }
      const existing = byId.get(id) || {};
      const hasExistingMetadataOwner = existing.ownerFromMetadata === true;
      const shouldReplaceOwner =
        (!existing.ownerProvider && ownerProvider) ||
        (
          ownerFromMetadata &&
          (!hasExistingMetadataOwner || existing.ownerProvider !== ownerProvider)
        );
      const nextOwnerProvider = shouldReplaceOwner ? ownerProvider : existing.ownerProvider;
      const nextOwnerFromMetadata = shouldReplaceOwner
        ? ownerFromMetadata
        : hasExistingMetadataOwner;
      const nextFactoryProvider =
        existing.factoryProvider === "anthropic"
          ? "anthropic"
          : shouldReplaceOwner
            ? mapOwnerToFactoryProvider(nextOwnerProvider, id)
            : existing.factoryProvider;
      const shouldReplaceFactory =
        nextFactoryProvider !== "anthropic" && factoryProvider === "anthropic";
      if (shouldReplaceOwner || shouldReplaceFactory) {
        byId.set(id, {
          ownerProvider: nextOwnerProvider,
          ownerFromMetadata: nextOwnerFromMetadata,
          factoryProvider: shouldReplaceFactory ? factoryProvider : nextFactoryProvider,
        });
      }
    }

    const openai = [];
    const anthropic = [];
    const byProvider = {};
    for (const [id, splitInfo] of byId.entries()) {
      const ownerProvider = splitInfo && splitInfo.ownerProvider ? String(splitInfo.ownerProvider) : "";
      const factoryProvider =
        splitInfo && splitInfo.factoryProvider ? String(splitInfo.factoryProvider) : "openai";

      if (factoryProvider === "anthropic") anthropic.push(id);
      else openai.push(id);

      if (ownerProvider) {
        if (!Array.isArray(byProvider[ownerProvider])) {
          byProvider[ownerProvider] = [];
        }
        byProvider[ownerProvider].push(id);
      }
    }

    return {
      openai,
      anthropic,
      byProvider: Object.fromEntries(
        Object.entries(byProvider).map(([providerId, ids]) => [
          providerId,
          normalizeSelectedModelIds(ids),
        ])
      ),
    };
  }

  function normalizeSelectedModelIds(selectedModels) {
    return helpers.normalizeIdList(selectedModels);
  }

  const stripThinkingSuffix =
    typeof helpers.stripThinkingSuffix === "function"
      ? helpers.stripThinkingSuffix
      : helpersModule.stripThinkingSuffix;
  const normalizeThinkingMode =
    typeof helpers.normalizeThinkingMode === "function"
      ? helpers.normalizeThinkingMode
      : helpersModule.normalizeThinkingMode;
  const normalizeThinkingModelModes =
    typeof helpers.normalizeThinkingModelModes === "function"
      ? helpers.normalizeThinkingModelModes
      : helpersModule.normalizeThinkingModelModes;
  const isAdvancedThinkingMode =
    typeof helpers.isAdvancedThinkingMode === "function"
      ? helpers.isAdvancedThinkingMode
      : helpersModule.isAdvancedThinkingMode;
  const DEFAULT_THINKING_ALLOWED_MODES = thinkingCapabilities.DEFAULT_THINKING_ALLOWED_MODES;
  const THINKING_MODE_VALUES = thinkingCapabilities.THINKING_MODE_VALUES;
  const normalizeAllowedThinkingModesShared = thinkingCapabilities.normalizeAllowedThinkingModes;
  const normalizeThinkingCapabilityShared = thinkingCapabilities.normalizeThinkingCapability;
  const buildThinkingCapabilityByModelIdShared = thinkingCapabilities.buildThinkingCapabilityByModelId;
  const resolveThinkingCapabilityForModelShared =
    thinkingCapabilities.resolveThinkingCapabilityForModel;
  const thinkingCapabilityOptions = {
    normalizeThinkingMode,
    stripThinkingSuffix,
    thinkingModeValues: THINKING_MODE_VALUES,
    defaultAllowedModes: DEFAULT_THINKING_ALLOWED_MODES,
  };

  function normalizeAllowedThinkingModes(value, options = {}) {
    return normalizeAllowedThinkingModesShared(value, {
      ...thinkingCapabilityOptions,
      ...options,
    });
  }

  function normalizeThinkingCapability(value, options = {}) {
    return normalizeThinkingCapabilityShared(value, {
      ...thinkingCapabilityOptions,
      ...options,
    });
  }

  function buildThinkingCapabilityByModelId(entries) {
    return buildThinkingCapabilityByModelIdShared(entries, thinkingCapabilityOptions);
  }

  function resolveThinkingCapabilityForModel(modelId, thinkingCapabilityByModelId = {}) {
    return resolveThinkingCapabilityForModelShared(
      modelId,
      thinkingCapabilityByModelId,
      thinkingCapabilityOptions
    );
  }

  function normalizeThinkingModelIds(thinkingModels) {
    return normalizeSelectedModelIds(thinkingModels)
      .map((modelId) => stripThinkingSuffix(modelId))
      .filter(Boolean);
  }

  function parseThinkingSupportState(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const key of [
        "supported",
        "enabled",
        "available",
        "allowed",
        "value",
        "status",
        "state",
      ]) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        const nested = parseThinkingSupportState(value[key]);
        if (nested !== null) return nested;
      }
      const nestedModes = normalizeAllowedThinkingModes(value, {
        includeAuto: false,
        includeNone: false,
      });
      if (nestedModes.length) return true;
      return null;
    }

    const allowHint = parseAllowHint(value);
    if (allowHint === true) return true;
    if (allowHint === false) return false;

    const denyHint = parseDenyHint(value);
    if (denyHint === true) return false;
    if (denyHint === false) return true;

    if (isRestrictedStatusValue(value)) return false;
    return null;
  }

  function extractThinkingCapability(item) {
    if (!item || typeof item !== "object") {
      return normalizeThinkingCapability(null);
    }

    const supportHint = firstDefinedPathValue(item, THINKING_SUPPORT_HINT_PATHS);
    const modesHint = firstDefinedPathValue(item, THINKING_ALLOWED_MODES_HINT_PATHS);
    const statusHint = firstDefinedPathValue(item, THINKING_STATUS_HINT_PATHS);

    const supportStateDirect = parseThinkingSupportState(supportHint);
    const supportStateFromStatus = parseThinkingSupportState(statusHint);
    const supportState =
      supportStateDirect !== null ? supportStateDirect : supportStateFromStatus;
    const modesFromSupportHint =
      modesHint === undefined &&
      supportHint !== undefined
        ? normalizeAllowedThinkingModes(supportHint, {
            includeAuto: false,
            includeNone: false,
          })
        : [];
    const effectiveModesHint =
      modesHint !== undefined
        ? modesHint
        : modesFromSupportHint.length
          ? supportHint
          : undefined;
    const hasExplicitModesHint = effectiveModesHint !== undefined;

    if (supportState === false) {
      return normalizeThinkingCapability({
        verified: true,
        supported: false,
      });
    }

    if (hasExplicitModesHint) {
      return normalizeThinkingCapability({
        verified: true,
        supported: true,
        allowedModes: effectiveModesHint,
      });
    }

    if (supportState === true) {
      return normalizeThinkingCapability({
        verified: true,
        supported: true,
        allowedModes: DEFAULT_THINKING_ALLOWED_MODES.slice(),
      });
    }

    return normalizeThinkingCapability({
      verified: false,
      supported: false,
      allowedModes: DEFAULT_THINKING_ALLOWED_MODES.slice(),
    });
  }

  function resolveThinkingModeForModel(modelId, mode, thinkingCapabilityByModelId = {}) {
    const normalizedMode = normalizeThinkingMode(mode);
    if (!normalizedMode) {
      return { mode: "", downgraded: false, reason: "" };
    }
    if (normalizedMode === "none" || normalizedMode === "auto") {
      return { mode: normalizedMode, downgraded: false, reason: "" };
    }
    if (!isAdvancedThinkingMode(normalizedMode)) {
      return { mode: "auto", downgraded: true, reason: "invalid_advanced_mode" };
    }

    const capability = resolveThinkingCapabilityForModel(modelId, thinkingCapabilityByModelId);
    if (capability.verified !== true) {
      return { mode: "auto", downgraded: true, reason: "backend_unverified" };
    }
    if (capability.supported !== true) {
      return { mode: "auto", downgraded: true, reason: "backend_unsupported" };
    }
    const allowedModes = new Set(normalizeAllowedThinkingModes(capability.allowedModes));
    if (!allowedModes.has(normalizedMode)) {
      return { mode: "auto", downgraded: true, reason: "mode_not_allowed" };
    }

    return { mode: normalizedMode, downgraded: false, reason: "" };
  }

  function normalizeThinkingModeForModel(modelId, mode, thinkingCapabilityByModelId = {}) {
    return resolveThinkingModeForModel(modelId, mode, thinkingCapabilityByModelId).mode;
  }

  function buildThinkingInterrogationSummary(modelIds, thinkingCapabilityByModelId = {}) {
    const normalizedModelIds = normalizeSelectedModelIds(modelIds);
    const modelsTotal = normalizedModelIds.length;
    let modelsVerified = 0;
    let modelsSupported = 0;
    let modelsUnsupported = 0;
    let modelsUnverified = 0;

    for (const modelId of normalizedModelIds) {
      const capability = resolveThinkingCapabilityForModel(modelId, thinkingCapabilityByModelId);
      if (capability.verified === true) {
        modelsVerified += 1;
        if (capability.supported === true) {
          modelsSupported += 1;
        } else {
          modelsUnsupported += 1;
        }
      } else {
        modelsUnverified += 1;
      }
    }

    const summary = {
      modelsTotal,
      modelsVerified,
      modelsSupported,
      modelsUnsupported,
      modelsUnverified,
    };

    if (modelsTotal === 0) {
      return {
        ...summary,
        state: "unknown",
        reason: "no_models_selected",
      };
    }

    if (modelsVerified === modelsTotal) {
      return {
        ...summary,
        state: "verified",
        reason: "backend_reported_capabilities_for_all_models",
      };
    }

    if (modelsVerified > 0) {
      return {
        ...summary,
        state: "unknown",
        reason: "backend_reported_partial_capabilities",
      };
    }

    return {
      ...summary,
      state: "unknown",
      reason: "backend_did_not_report_capabilities",
    };
  }

  function appendThinkingVariant(baseModelId, mode, outputModels, thinkingCapabilityByModelId = {}) {
    const normalizedMode = normalizeThinkingModeForModel(
      baseModelId,
      mode,
      thinkingCapabilityByModelId
    );
    if (!normalizedMode) return;
    if (normalizedMode === "none") return;
    outputModels.push(`${baseModelId}(${normalizedMode})`);
  }

  function expandProviderModelsWithThinkingVariants(
    providerModels,
    thinkingModelModes,
    thinkingCapabilityByModelId = {}
  ) {
    const expanded = [];
    const seen = new Set();
    const normalizedModes = normalizeThinkingModelModes(thinkingModelModes);

    for (const modelId of normalizeSelectedModelIds(providerModels)) {
      if (!modelId) continue;
      if (!seen.has(modelId)) {
        seen.add(modelId);
        expanded.push(modelId);
      }

      const mode = normalizedModes[stripThinkingSuffix(modelId).toLowerCase()];
      if (!mode) continue;
      const variants = [];
      appendThinkingVariant(modelId, mode, variants, thinkingCapabilityByModelId);
      for (const variant of variants) {
        if (seen.has(variant)) continue;
        seen.add(variant);
        expanded.push(variant);
      }
    }

    return expanded;
  }

  function filterDetectedEntriesBySelection(entries, selectedModels, options = {}) {
    const explicitSelection =
      options &&
      typeof options === "object" &&
      options.explicitSelection === true;
    const selectedIds = normalizeSelectedModelIds(selectedModels);
    if (!selectedIds.length) {
      return {
        entries: explicitSelection ? [] : Array.isArray(entries) ? entries : [],
        selectedIds,
        skippedCount: 0,
      };
    }

    const selectedSet = new Set(selectedIds);
    const nextEntries = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
      const id = entry && entry.id ? String(entry.id) : "";
      if (!id || !selectedSet.has(id)) continue;
      nextEntries.push(entry);
    }

    return {
      entries: nextEntries,
      selectedIds,
      skippedCount: Math.max(0, selectedIds.length - nextEntries.length),
    };
  }

  function normalizeUrl(url) {
    return helpers.normalizeUrl(url);
  }

  function normalizedHost(host) {
    return helpers.normalizedHost(host);
  }

  function isDroxyManagedBaseUrl(baseUrl, host, port) {
    const normalized = normalizeUrl(baseUrl);
    const resolvedHost = normalizedHost(host);
    const schemes = ["http", "https"];
    for (const scheme of schemes) {
      const hostBase = `${scheme}://${resolvedHost}:${port}`;
      const hostV1 = `${hostBase}/v1`;
      const localhost = `${scheme}://localhost:${port}`;
      const localhostV1 = `${localhost}/v1`;
      const loopback = `${scheme}://127.0.0.1:${port}`;
      const loopbackV1 = `${loopback}/v1`;
      const anyHost = `${scheme}://0.0.0.0:${port}`;
      const anyHostV1 = `${anyHost}/v1`;
      if (
        normalized === localhost ||
        normalized === localhostV1 ||
        normalized === loopback ||
        normalized === loopbackV1 ||
        normalized === anyHost ||
        normalized === anyHostV1 ||
        normalized === hostBase ||
        normalized === hostV1
      ) {
        return true;
      }
    }
    return false;
  }

  function isDroxyManagedEntry(entry, host, port) {
    if (!entry) return false;
    const baseUrl = entry.baseUrl || entry.base_url || "";
    if (baseUrl && isDroxyManagedBaseUrl(String(baseUrl), host, port)) return true;
    return false;
  }

  function buildFactoryEntries({
    host,
    port,
    tlsEnabled,
    protocol,
    apiKey,
    openAiModels,
    anthropicModels,
    ownerProviderByModelId = {},
    thinkingModelModes,
    thinkingCapabilityByModelId,
  }) {
    const scheme = protocol || (tlsEnabled ? "https" : "http");
    const resolvedHost = normalizedHost(host);
    const base = `${scheme}://${resolvedHost}:${port}`;
    const entries = [];
    const openAiExpandedModels = expandProviderModelsWithThinkingVariants(
      openAiModels,
      thinkingModelModes,
      thinkingCapabilityByModelId
    );
    const anthropicExpandedModels = expandProviderModelsWithThinkingVariants(
      anthropicModels,
      thinkingModelModes,
      thinkingCapabilityByModelId
    );
    const resolveOwnerProvider = (modelId) => {
      const baseModelId = stripThinkingSuffix(modelId).toLowerCase();
      if (!baseModelId) return "";
      if (!ownerProviderByModelId || typeof ownerProviderByModelId !== "object") return "";
      return String(ownerProviderByModelId[baseModelId] || "");
    };
    const modelGroups = [
      {
        models: openAiExpandedModels,
        provider: "openai",
        baseUrl: `${base}/v1`,
      },
      {
        models: anthropicExpandedModels,
        provider: "anthropic",
        baseUrl: base,
      },
    ];

    for (const group of modelGroups) {
      for (const model of group.models) {
        if (!model) continue;
        const ownerProvider = resolveOwnerProvider(model);
        const nextEntry = {
          model,
          model_display_name: ensureDroxyPrefix(model),
          base_url: group.baseUrl,
          api_key: apiKey,
          provider: group.provider,
        };
        if (ownerProvider) {
          nextEntry.owned_by = ownerProvider;
          nextEntry.meta = { owner: ownerProvider };
        }
        entries.push(nextEntry);
      }
    }

    return entries;
  }

  function buildOwnerProviderByModelId(modelsByProvider = {}) {
    const output = {};
    if (!modelsByProvider || typeof modelsByProvider !== "object") return output;
    for (const [providerId, modelIds] of Object.entries(modelsByProvider)) {
      const normalizedProviderId = String(providerId || "").trim().toLowerCase();
      if (!normalizedProviderId) continue;
      for (const modelId of normalizeSelectedModelIds(modelIds)) {
        const baseModelId = stripThinkingSuffix(modelId).toLowerCase();
        if (!baseModelId) continue;
        output[baseModelId] = normalizedProviderId;
      }
    }
    return output;
  }

  function resolveOwnerProviderHint(entry) {
    if (!entry || typeof entry !== "object") return "";
    const raw =
      entry.owner ||
      entry.owned_by ||
      entry.organization ||
      entry.org ||
      (entry.meta && typeof entry.meta === "object" && (entry.meta.owner || entry.meta.owned_by)) ||
      "";
    const normalized = normalizeProviderOwnerTag(raw);
    if (normalized) return normalized;
    return String(raw || "").trim().toLowerCase();
  }

  function applyOwnerMetadataToFactoryEntry(targetEntry, sourceEntry) {
    if (!targetEntry || typeof targetEntry !== "object") return;
    const ownerProvider = resolveOwnerProviderHint(sourceEntry);
    if (ownerProvider) {
      targetEntry.owner = ownerProvider;
      targetEntry.owned_by = ownerProvider;
      const meta = targetEntry.meta && typeof targetEntry.meta === "object" ? { ...targetEntry.meta } : {};
      meta.owner = ownerProvider;
      targetEntry.meta = meta;
      return;
    }

    delete targetEntry.owner;
    delete targetEntry.owned_by;
    if (targetEntry.meta && typeof targetEntry.meta === "object") {
      const meta = { ...targetEntry.meta };
      delete meta.owner;
      delete meta.owned_by;
      if (Object.keys(meta).length) {
        targetEntry.meta = meta;
      } else {
        delete targetEntry.meta;
      }
    }
  }

  function updateFactorySettingsCustomModels({ host, port, entries }) {
    const factoryDir = getFactoryDir();
    config.ensureDir(factoryDir);
    const settingsPath = pathApi.join(factoryDir, "settings.json");

    let root = {};
    if (fsApi.existsSync(settingsPath)) {
      try {
        root = JSON.parse(fsApi.readFileSync(settingsPath, "utf8"));
      } catch {
        root = {};
      }
    }
    if (!root || typeof root !== "object") root = {};

    const existingCustomModels = Array.isArray(root.customModels) ? root.customModels : [];
    const preserved = [];
    const existingDroxyByModel = new Map();

    for (const entry of existingCustomModels) {
      const managed = isDroxyManagedEntry(entry, host, port);
      if (!managed) {
        preserved.push(entry);
        continue;
      }
      const model = entry && entry.model ? String(entry.model) : "";
      if (model) existingDroxyByModel.set(model, entry);
    }

    const nextDroxy = [];
    const indexBySlug = new Map();

    for (const entry of entries || []) {
      const existing = existingDroxyByModel.get(entry.model) || {};
      const displayName = ensureDroxyPrefix(entry.model_display_name);
      const slug = slugifyCustomModelId(displayName);
      const existingIndex =
        typeof existing.index === "number" ? existing.index : null;
      const index =
        existingIndex !== null
          ? existingIndex
          : (() => {
              const next = indexBySlug.get(slug) || 0;
              indexBySlug.set(slug, next + 1);
              return next;
            })();

      const next = { ...existing };
      next.model = entry.model;
      next.displayName = displayName;
      next.baseUrl = normalizeUrl(entry.base_url);
      next.apiKey = entry.api_key;
      next.provider = entry.provider;
      applyOwnerMetadataToFactoryEntry(next, entry);
      next.index = index;
      next.id = `custom:${entry.model}`;
      if (typeof next.noImageSupport !== "boolean") {
        next.noImageSupport = false;
      }
      nextDroxy.push(next);
    }

    nextDroxy.sort((a, b) =>
      String(a.displayName || "").localeCompare(String(b.displayName || ""))
    );

    root.customModels = preserved.concat(nextDroxy);
    const sessionDefaults =
      root.sessionDefaultSettings && typeof root.sessionDefaultSettings === "object"
        ? root.sessionDefaultSettings
        : null;
    if (sessionDefaults) {
      const currentModel = String(sessionDefaults.model || "").trim();
      if (currentModel.startsWith("custom:")) {
        const validCustomIds = new Set(
          (root.customModels || [])
            .map((entry) => {
              if (!entry || typeof entry !== "object") return "";
              const id = String(entry.id || "").trim();
              if (id.startsWith("custom:")) return id;
              const model = String(entry.model || "").trim();
              return model ? `custom:${model}` : "";
            })
            .filter(Boolean)
        );
        if (!validCustomIds.has(currentModel)) {
          if (nextDroxy.length && nextDroxy[0] && nextDroxy[0].model) {
            sessionDefaults.model = `custom:${nextDroxy[0].model}`;
          } else {
            delete sessionDefaults.model;
          }
        }
      }
    }
    fsApi.writeFileSync(settingsPath, JSON.stringify(root, null, 2), "utf8");
    return { path: settingsPath, modelsAdded: nextDroxy.length };
  }

  function updateFactoryConfigCustomModels({ host, port, entries }) {
    const factoryDir = getFactoryDir();
    config.ensureDir(factoryDir);
    const configPath = pathApi.join(factoryDir, "config.json");
    const backupPath = pathApi.join(factoryDir, "config.json.bak");

    let root = {};
    if (fsApi.existsSync(configPath)) {
      try {
        root = JSON.parse(fsApi.readFileSync(configPath, "utf8"));
      } catch {
        root = {};
      }
    }
    if (!root || typeof root !== "object") root = {};

    if (fsApi.existsSync(configPath) && !fsApi.existsSync(backupPath)) {
      try {
        fsApi.copyFileSync(configPath, backupPath);
      } catch {
        // Ignore backup write failures.
      }
    }

    const existingCustomModels = [
      ...(Array.isArray(root.custom_models) ? root.custom_models : []),
      ...(Array.isArray(root.customModels) ? root.customModels : []),
    ];
    const preserved = [];
    const existingDroxyByModel = new Map();

    for (const entry of existingCustomModels) {
      const managed = isDroxyManagedEntry(entry, host, port);
      if (!managed) {
        preserved.push(entry);
        continue;
      }
      const model = entry && entry.model ? String(entry.model) : "";
      if (model) existingDroxyByModel.set(model, entry);
    }

    const nextDroxy = [];
    for (const entry of entries || []) {
      const existing = existingDroxyByModel.get(entry.model) || {};
      const next = { ...existing };
      next.model = entry.model;
      next.model_display_name = ensureDroxyPrefix(entry.model_display_name);
      next.base_url = normalizeUrl(entry.base_url);
      next.api_key = entry.api_key;
      next.provider = entry.provider;
      applyOwnerMetadataToFactoryEntry(next, entry);
      if (entry.provider === "anthropic" && next.supports_images === undefined) {
        next.supports_images = true;
      }
      nextDroxy.push(next);
    }

    nextDroxy.sort((a, b) =>
      String(a.model_display_name || "").localeCompare(String(b.model_display_name || ""))
    );

    root.custom_models = preserved.concat(nextDroxy);
    delete root.customModels;

    fsApi.writeFileSync(configPath, JSON.stringify(root, null, 2), "utf8");
    return { path: configPath, modelsAdded: nextDroxy.length };
  }

  function writeFactorySettings(payload) {
    const entries = buildFactoryEntries(payload);
    if (!entries.length) return null;

    const configResult = updateFactoryConfigCustomModels({
      host: payload.host,
      port: payload.port,
      entries,
    });
    const settingsResult = updateFactorySettingsCustomModels({
      host: payload.host,
      port: payload.port,
      entries,
    });

    return {
      path: settingsResult ? settingsResult.path : configResult.path,
      modelsAdded:
        (settingsResult ? settingsResult.modelsAdded : 0) ||
        (configResult ? configResult.modelsAdded : 0),
    };
  }

  function clearFactoryModels({ host, port }) {
    const configResult = updateFactoryConfigCustomModels({ host, port, entries: [] });
    const settingsResult = updateFactorySettingsCustomModels({ host, port, entries: [] });
    return {
      path: settingsResult ? settingsResult.path : configResult.path,
      modelsAdded: 0,
    };
  }

  function configuredProtocol(configValues) {
    return configValues && configValues.tlsEnabled ? "https" : "http";
  }

  function buildProxyUrl({ protocol, host, port, suffix = "" }) {
    const scheme = protocol || "http";
    const resolvedHost = normalizedHost(host);
    return `${scheme}://${resolvedHost}:${port}${suffix}`;
  }

  function isLoopbackHost(host) {
    const normalized = normalizedHost(host).toLowerCase();
    return (
      normalized === "localhost" ||
      normalized === "127.0.0.1" ||
      normalized === "::1" ||
      normalized === "[::1]"
    );
  }

  function probeEndpoint(url, timeoutMs = 2500) {
    const client = url.startsWith("https") ? httpsApi : httpApi;
    return new Promise((resolve, reject) => {
      const req = client.request(
        url,
        { method: "GET", headers: { Accept: "application/json" } },
        (res) => {
          res.resume();
          resolve({ statusCode: Number(res.statusCode) || 0 });
        }
      );
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error("Request timed out"));
      });
      req.on("error", reject);
      req.end();
    });
  }

  async function resolveReachableProtocol(configValues, options = {}) {
    const host = normalizedHost(configValues.host);
    const port = Number(configValues.port) || config.DEFAULT_PORT;
    const probePath = String(options.probePath || "/v1/models");
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 2500;

    const preferredProtocol = configuredProtocol(configValues);
    const preferredUrl = buildProxyUrl({
      protocol: preferredProtocol,
      host,
      port,
      suffix: probePath,
    });

    try {
      await probeEndpoint(preferredUrl, timeoutMs);
      return {
        reachable: true,
        protocol: preferredProtocol,
        preferredProtocol,
        fallbackProtocol: null,
        fallbackUsed: false,
        preferredUrl,
        fallbackUrl: null,
        preferredError: null,
        fallbackError: null,
      };
    } catch (preferredError) {
      if (preferredProtocol !== "https" || !isLoopbackHost(host)) {
        return {
          reachable: false,
          protocol: preferredProtocol,
          preferredProtocol,
          fallbackProtocol: null,
          fallbackUsed: false,
          preferredUrl,
          fallbackUrl: null,
          preferredError,
          fallbackError: null,
        };
      }

      const fallbackProtocol = "http";
      const fallbackUrl = buildProxyUrl({
        protocol: fallbackProtocol,
        host,
        port,
        suffix: probePath,
      });

      try {
        await probeEndpoint(fallbackUrl, timeoutMs);
        return {
          reachable: true,
          protocol: fallbackProtocol,
          preferredProtocol,
          fallbackProtocol,
          fallbackUsed: true,
          preferredUrl,
          fallbackUrl,
          preferredError,
          fallbackError: null,
        };
      } catch (fallbackError) {
        return {
          reachable: false,
          protocol: preferredProtocol,
          preferredProtocol,
          fallbackProtocol,
          fallbackUsed: false,
          preferredUrl,
          fallbackUrl,
          preferredError,
          fallbackError,
        };
      }
    }
  }

  function buildProtocolUnavailableError(resolution) {
    const preferredMessage = helpers.formatErrorSummary(resolution && resolution.preferredError);
    const fallbackMessage = helpers.formatErrorSummary(resolution && resolution.fallbackError);
    const details = [preferredMessage, fallbackMessage].filter(Boolean).join(" | ");
    return new Error(
      details
        ? `Droxy endpoint is unreachable (${details})`
        : "Droxy endpoint is unreachable"
    );
  }

  function buildAuthHeaderVariants(apiKey) {
    if (!apiKey) return [{}];
    return [
      { Authorization: `Bearer ${apiKey}` },
      { Authorization: apiKey },
      { "X-Api-Key": apiKey },
    ];
  }

  function isAuthError(err) {
    if (!err) return false;
    const msg = String(err.message || err);
    return msg.includes("HTTP 401") || msg.includes("HTTP 403");
  }

  function looksLikeBcryptHash(value) {
    return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(String(value || ""));
  }

  function normalizeModelId(value) {
    return String(value || "").trim();
  }

  function normalizeModelIdKey(value) {
    return normalizeModelId(value).toLowerCase();
  }

  function isOpenAiFamilyProvider(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return false;
    return (
      normalized.includes("openai") ||
      normalized.includes("codex") ||
      normalized.includes("chatgpt")
    );
  }

  function isLikelyModelId(value) {
    const normalized = normalizeModelId(value);
    if (!normalized) return false;
    if (normalized.length > 200) return false;
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(normalized)) return false;
    return /[A-Za-z]/.test(normalized);
  }

  function isSpecificModelToken(value) {
    const normalized = normalizeModelId(value);
    if (!isLikelyModelId(normalized)) return false;
    return /[0-9._:/-]/.test(normalized);
  }

  function extractModelIdFromEntry(entry) {
    if (!entry || typeof entry !== "object") return "";
    const id = entry.id || entry.model || entry.name || entry.slug;
    return isLikelyModelId(id) ? normalizeModelId(id) : "";
  }

  function collectModelIdsFromUnknown(value, output, depth = 0) {
    if (depth > 6 || value === null || value === undefined) return;
    if (typeof value === "string") {
      if (isLikelyModelId(value)) output.add(normalizeModelId(value));
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        collectModelIdsFromUnknown(item, output, depth + 1);
      }
      return;
    }
    if (typeof value !== "object") return;
    const direct = extractModelIdFromEntry(value);
    if (direct) output.add(direct);
    for (const nestedValue of Object.values(value)) {
      collectModelIdsFromUnknown(nestedValue, output, depth + 1);
    }
  }

  function shouldParseUnsupportedModelText(text) {
    const normalized = String(text || "").trim().toLowerCase();
    if (!normalized) return false;
    return UNSUPPORTED_MODEL_HINTS.some((hint) => normalized.includes(hint));
  }

  function collectStatusMessageTexts(statusMessage) {
    const texts = [];

    function appendTextsFromObject(value) {
      if (!value || typeof value !== "object") return;
      for (const key of ["detail", "message", "error", "reason", "status_message"]) {
        const text = value[key];
        if (typeof text === "string" && text.trim()) {
          texts.push(text.trim());
        }
      }
      const directModel = extractModelIdFromEntry(value);
      if (directModel) {
        texts.push(`model '${directModel}'`);
      }
    }

    if (typeof statusMessage === "string") {
      const trimmed = statusMessage.trim();
      if (trimmed) texts.push(trimmed);
      try {
        appendTextsFromObject(JSON.parse(trimmed));
      } catch {
        // Ignore non-JSON status message bodies.
      }
      return texts;
    }

    appendTextsFromObject(statusMessage);
    return texts;
  }

  function parseUnsupportedModelIdsFromStatusMessage(statusMessage) {
    const ids = new Set();
    const patterns = [
      /['"`]([A-Za-z0-9][A-Za-z0-9._:/-]*)['"`]\s+model\b/gi,
      /\bmodel\s+['"`]([A-Za-z0-9][A-Za-z0-9._:/-]*)['"`]/gi,
      /\bmodel\s+([A-Za-z0-9][A-Za-z0-9._:/-]*)\b/gi,
    ];
    const texts = collectStatusMessageTexts(statusMessage);
    if (!texts.length) return [];
    const hasUnsupportedHint = texts.some((text) => shouldParseUnsupportedModelText(text));
    if (!hasUnsupportedHint) return [];

    for (const text of texts) {
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
          const id = normalizeModelId(match[1]);
          if (!isLikelyModelId(id)) continue;
          if (pattern === patterns[2] && !isSpecificModelToken(id)) continue;
          ids.add(id);
        }
      }
    }

    return Array.from(ids);
  }

  function buildManagementHeaderVariants(managementKey) {
    const normalized = String(managementKey || "").trim();
    if (!normalized) return [];
    return [
      { Authorization: `Bearer ${normalized}` },
      { Authorization: normalized },
    ];
  }

  function resolveManagementKey(configValues, state, options = {}) {
    const explicit = String(options.managementKey || "").trim();
    if (explicit && !looksLikeBcryptHash(explicit)) return explicit;

    const fromState = String((state && state.managementKey) || "").trim();
    if (fromState) return fromState;

    const fromConfig = String((configValues && configValues.managementKey) || "").trim();
    if (!fromConfig || looksLikeBcryptHash(fromConfig)) return "";
    return fromConfig;
  }

  function warnManagementExclusionFetchFailure(message, err, options = {}) {
    if (options.quiet) return;
    if (!output || typeof output.printWarning !== "function") return;

    const details =
      helpers && typeof helpers.formatErrorSummary === "function"
        ? helpers.formatErrorSummary(err)
        : String((err && (err.message || err)) || "").trim();
    if (!details) {
      output.printWarning(message);
      return;
    }
    output.printWarning(`${message} (${details})`);
  }

  async function requestManagementJson({
    configValues,
    protocol,
    suffix,
    managementKey,
    method = "GET",
    body,
    allowEmptySuccessBody = false,
  }) {
    if (!managementKey) return null;
    const url = buildProxyUrl({
      protocol,
      host: configValues.host,
      port: configValues.port,
      suffix,
    });
    const headersList = buildManagementHeaderVariants(managementKey);
    for (const headers of headersList) {
      try {
        return await requestJsonWithOptions(url, {
          method,
          body,
          allowEmptySuccessBody,
          headers: { Accept: "application/json", ...headers },
        });
      } catch (err) {
        if (!isAuthError(err)) {
          throw err;
        }
      }
    }
    return null;
  }

  function parseOAuthExcludedModelIds(payload) {
    if (!payload || typeof payload !== "object") return [];
    let root = null;
    if (Object.prototype.hasOwnProperty.call(payload, "oauth-excluded-models")) {
      root = payload["oauth-excluded-models"];
    } else if (Object.prototype.hasOwnProperty.call(payload, "oauthExcludedModels")) {
      root = payload.oauthExcludedModels;
    } else if (
      Object.prototype.hasOwnProperty.call(payload, "openai") ||
      Object.prototype.hasOwnProperty.call(payload, "codex")
    ) {
      root = payload;
    }
    if (!root) return [];

    const ids = new Set();
    collectModelIdsFromUnknown(root, ids);
    return Array.from(ids);
  }

  async function fetchOAuthExcludedModels({
    configValues,
    protocol,
    managementKey,
  }) {
    const payload = await requestManagementJson({
      configValues,
      protocol,
      suffix: MANAGEMENT_OAUTH_EXCLUDED_MODELS_PATH,
      managementKey,
    });
    return parseOAuthExcludedModelIds(payload);
  }

  function parseAuthFilesModelExclusions(payload) {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.files)) return [];
    const excluded = new Set();
    for (const file of payload.files) {
      if (!file || typeof file !== "object") continue;
      const provider = file.provider || file.type || "";
      const statusMessage = file.status_message || file.statusMessage || file.detail;
      const parsedModelIds = parseUnsupportedModelIdsFromStatusMessage(statusMessage);
      if (!parsedModelIds.length) continue;
      const statusTexts = collectStatusMessageTexts(statusMessage)
        .join(" ")
        .toLowerCase();
      const isOpenAiContext =
        isOpenAiFamilyProvider(provider) ||
        statusTexts.includes("openai") ||
        statusTexts.includes("codex") ||
        statusTexts.includes("chatgpt");
      if (!isOpenAiContext) continue;
      for (const modelId of parsedModelIds) {
        excluded.add(modelId);
      }
    }
    return Array.from(excluded);
  }

  function parseThinkingModeLevelsFromStatusMessage(statusMessage) {
    const texts = collectStatusMessageTexts(statusMessage);
    if (!texts.length) return [];

    const modes = new Set();
    const patterns = [
      /\b(?:valid|supported|allowed)\s+levels?\s*(?:are|is)?\s*:?\s*([a-z0-9_,\s/-]+)/i,
      /\blevels?\s*(?:are|is)\s*:?\s*([a-z0-9_,\s/-]+)/i,
    ];

    for (const text of texts) {
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(text);
        if (!match || !match[1]) continue;
        const rawModes = String(match[1]).replace(/[\/]/g, ",").replace(/\band\b/gi, ",");
        const parsedModes = normalizeAllowedThinkingModes(rawModes, {
          includeAuto: false,
          includeNone: false,
        });
        for (const mode of parsedModes) {
          modes.add(mode);
        }
      }
    }

    if (!modes.size) return [];
    return normalizeAllowedThinkingModes(Array.from(modes), {
      includeAuto: true,
      includeNone: true,
    });
  }

  function mergeThinkingModeSets(existingModes = [], incomingModes = []) {
    const normalizedExisting = normalizeAllowedThinkingModes(existingModes, {
      includeAuto: true,
      includeNone: true,
    });
    const normalizedIncoming = normalizeAllowedThinkingModes(incomingModes, {
      includeAuto: true,
      includeNone: true,
    });
    if (!normalizedExisting.length) return normalizedIncoming;
    if (!normalizedIncoming.length) return normalizedExisting;

    const incomingSet = new Set(normalizedIncoming);
    const intersection = normalizedExisting.filter((mode) => incomingSet.has(mode));
    if (intersection.length > 0) {
      return normalizeAllowedThinkingModes(intersection, {
        includeAuto: true,
        includeNone: true,
      });
    }

    return normalizedExisting;
  }

  function parseAuthFilesThinkingCapabilityHints(payload) {
    const byModelId = {};
    const byProviderId = {};
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.files)) {
      return { byModelId, byProviderId };
    }

    for (const file of payload.files) {
      if (!file || typeof file !== "object") continue;
      const statusMessage = file.status_message || file.statusMessage || file.detail;
      const allowedModes = parseThinkingModeLevelsFromStatusMessage(statusMessage);
      if (!allowedModes.length) continue;

      const capability = normalizeThinkingCapability({
        verified: true,
        supported: true,
        allowedModes,
      });
      const unsupportedModelIds = parseUnsupportedModelIdsFromStatusMessage(statusMessage);
      if (unsupportedModelIds.length) {
        for (const modelId of unsupportedModelIds) {
          const normalizedModelId = stripThinkingSuffix(modelId).toLowerCase();
          if (!normalizedModelId) continue;
          byModelId[normalizedModelId] = capability;
        }
        continue;
      }

      const providerId = normalizeProviderIdStrict(file.provider || file.type || "");
      if (!providerId) continue;
      if (!Object.prototype.hasOwnProperty.call(byProviderId, providerId)) {
        byProviderId[providerId] = capability;
        continue;
      }
      byProviderId[providerId] = normalizeThinkingCapability({
        verified: true,
        supported: true,
        allowedModes: mergeThinkingModeSets(byProviderId[providerId].allowedModes, capability.allowedModes),
      });
    }

    return { byModelId, byProviderId };
  }

  function parseAuthMetadataExcludedModelIds(payload) {
    if (!payload || typeof payload !== "object") return [];
    const ids = new Set();
    for (const key of AUTH_METADATA_EXCLUDED_MODEL_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
      collectModelIdsFromUnknown(payload[key], ids);
    }
    return Array.from(ids);
  }

  function modelDefinitionChannelForProviderId(providerId) {
    const normalizedProviderId = normalizeProviderIdStrict(providerId);
    if (!normalizedProviderId) return "";
    return MODEL_DEFINITION_CHANNEL_BY_PROVIDER[normalizedProviderId] || "";
  }

  function parseModelDefinitionThinkingCapabilityHints(payload) {
    const byModelId = {};
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.models)) {
      return byModelId;
    }
    for (const item of payload.models) {
      const entry = normalizeModelEntry(item);
      if (!entry || !entry.id) continue;
      const normalizedModelId = stripThinkingSuffix(entry.id).toLowerCase();
      if (!normalizedModelId) continue;
      const capability = normalizeThinkingCapability(entry.thinking);
      if (capability.verified !== true) continue;
      byModelId[normalizedModelId] = capability;
    }
    return byModelId;
  }

  function mergeThinkingCapabilityHints(base = {}, additions = {}) {
    const next = {
      byModelId:
        base && base.byModelId && typeof base.byModelId === "object" ? { ...base.byModelId } : {},
      byProviderId:
        base && base.byProviderId && typeof base.byProviderId === "object"
          ? { ...base.byProviderId }
          : {},
    };
    const sourceByModelId =
      additions && additions.byModelId && typeof additions.byModelId === "object"
        ? additions.byModelId
        : {};
    const sourceByProviderId =
      additions && additions.byProviderId && typeof additions.byProviderId === "object"
        ? additions.byProviderId
        : {};

    for (const [modelId, capability] of Object.entries(sourceByModelId)) {
      if (Object.prototype.hasOwnProperty.call(next.byModelId, modelId)) continue;
      next.byModelId[modelId] = normalizeThinkingCapability(capability);
    }
    for (const [providerId, capability] of Object.entries(sourceByProviderId)) {
      if (Object.prototype.hasOwnProperty.call(next.byProviderId, providerId)) continue;
      next.byProviderId[providerId] = normalizeThinkingCapability(capability);
    }
    return next;
  }

  function isCoarseVerifiedThinkingCapability(capability) {
    const normalized = normalizeThinkingCapability(capability);
    if (normalized.verified !== true || normalized.supported !== true) return false;
    const allowedModes = normalizeAllowedThinkingModes(normalized.allowedModes, {
      includeAuto: true,
      includeNone: true,
    });
    const fallbackModes = normalizeAllowedThinkingModes(DEFAULT_THINKING_ALLOWED_MODES, {
      includeAuto: true,
      includeNone: true,
    });
    if (allowedModes.length !== fallbackModes.length) return false;
    const fallbackModeSet = new Set(fallbackModes);
    for (const mode of allowedModes) {
      if (!fallbackModeSet.has(mode)) return false;
    }
    return true;
  }

  function applyThinkingCapabilityHintsToEntries(entries, hints = {}) {
    const byModelId =
      hints && hints.byModelId && typeof hints.byModelId === "object" ? hints.byModelId : {};
    const byProviderId =
      hints && hints.byProviderId && typeof hints.byProviderId === "object" ? hints.byProviderId : {};
    const outputEntries = [];

    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!entry || typeof entry !== "object") continue;
      const currentCapability = normalizeThinkingCapability(entry.thinking);
      const shouldPreferHint = isCoarseVerifiedThinkingCapability(currentCapability);
      if (currentCapability.verified === true && !shouldPreferHint) {
        outputEntries.push(entry);
        continue;
      }

      const normalizedModelId = stripThinkingSuffix(entry.id).toLowerCase();
      const providerId = normalizeProviderIdStrict(entry.provider || "");
      const hint =
        (normalizedModelId && byModelId[normalizedModelId]) || (providerId && byProviderId[providerId]);
      if (!hint) {
        outputEntries.push(entry);
        continue;
      }

      const hintedCapability = normalizeThinkingCapability(hint);
      if (currentCapability.verified === true && shouldPreferHint && hintedCapability.verified !== true) {
        outputEntries.push(entry);
        continue;
      }

      outputEntries.push({
        ...entry,
        thinking: hintedCapability,
      });
    }

    return outputEntries;
  }

  function normalizeProviderIdStrict(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return "";
    for (const [providerId, aliases] of Object.entries(PROVIDER_ID_ALIASES)) {
      if (aliases.includes(normalized)) return providerId;
    }
    return "";
  }

  function parseConnectionBoolean(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
    }
    return null;
  }

  function parseAuthFileConnectionState(file) {
    if (!file || typeof file !== "object") return "unknown";

    for (const key of [
      "connected",
      "is_connected",
      "authenticated",
      "is_authenticated",
      "authorized",
      "is_authorized",
      "logged_in",
      "is_logged_in",
    ]) {
      const parsed = parseConnectionBoolean(file[key]);
      if (parsed === true) return "connected";
      if (parsed === false) return "disconnected";
    }

    const statusToken = normalizeStatusToken(
      file.connection_state || file.connectionState || file.auth_state || file.authState || file.status || file.state
    );
    if (
      statusToken === "connected" ||
      statusToken === "authenticated" ||
      statusToken === "authorized" ||
      statusToken === "active"
    ) {
      return "connected";
    }
    if (
      statusToken === "disconnected" ||
      statusToken === "unauthenticated" ||
      statusToken === "unauthorized" ||
      statusToken === "expired" ||
      statusToken === "invalid" ||
      statusToken === "error" ||
      statusToken === "failed"
    ) {
      return "disconnected";
    }

    return "unknown";
  }

  function normalizeAuthFileName(file) {
    if (!file || typeof file !== "object") return "";
    const directName = String(file.name || file.file || file.filename || file.id || "").trim();
    if (directName) return directName;
    const filePath = String(file.path || "").trim();
    if (!filePath) return "";
    const baseName = String(pathApi.basename(filePath)).trim();
    return baseName;
  }

  function parseIntegerOrNull(value) {
    const parsed = Number.parseInt(String(value ?? "").trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
  }

  function parseOptionalFlag(value) {
    const parsed = parseConnectionBoolean(value);
    if (parsed !== null) return parsed;
    if (typeof value !== "string") return false;
    const normalized = value.trim().toLowerCase();
    if (normalized === "yes" || normalized === "on" || normalized === "enabled") return true;
    return false;
  }

  function parseManagedAuthFiles(payload) {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.files)) return [];
    const rows = [];
    for (const file of payload.files) {
      if (!file || typeof file !== "object") continue;
      const providerRaw = String(
        file.provider || file.type || file.provider_id || file.providerId || ""
      ).trim();
      const providerId = normalizeProviderIdStrict(providerRaw);
      const name = normalizeAuthFileName(file);
      const path = String(file.path || "").trim();
      const authIndex = parseIntegerOrNull(file.auth_index ?? file.authIndex ?? file.index);
      const connectionState = parseAuthFileConnectionState(file);
      const statusMessage = String(
        file.status_message || file.statusMessage || file.detail || ""
      ).trim();
      const account = String(file.account || "").trim();
      const email = String(file.email || "").trim();
      const accountType = String(file.account_type || file.accountType || "").trim();
      const label = String(file.label || file.name || account || email || name || path || "").trim();
      const runtimeOnly = parseOptionalFlag(file.runtime_only || file.runtimeOnly);
      const disabled = parseOptionalFlag(file.disabled);
      const unavailable = parseOptionalFlag(file.unavailable);

      rows.push({
        providerId,
        providerRaw,
        name,
        path,
        authIndex,
        account,
        email,
        accountType,
        label,
        status: String(file.status || file.state || "").trim(),
        statusMessage,
        connectionState,
        connected: connectionState === "connected",
        verified: connectionState !== "unknown",
        runtimeOnly,
        disabled,
        unavailable,
        removable: Boolean(name) && !runtimeOnly,
      });
    }
    return rows;
  }

  function parseAuthFilesProviderConnections(payload) {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.files)) {
      return { providersState: "unknown", providersConnected: 0, byProvider: {} };
    }

    const rows = parseManagedAuthFiles(payload);
    const byProvider = {};
    const scoreByProvider = {};
    const connectedCountByProvider = {};
    for (const row of rows) {
      const providerId = row.providerId;
      if (!providerId) continue;
      const state = row.connectionState;
      if (!scoreByProvider[providerId]) scoreByProvider[providerId] = 0;
      if (!connectedCountByProvider[providerId]) connectedCountByProvider[providerId] = 0;
      if (state === "connected") connectedCountByProvider[providerId] += 1;
      const nextScore = state === "connected" ? 2 : state === "disconnected" ? 1 : 0;
      if (nextScore < scoreByProvider[providerId]) continue;
      scoreByProvider[providerId] = nextScore;
      byProvider[providerId] = {
        connected: state === "connected",
        connectionState: state,
        verified: state !== "unknown",
      };
    }

    for (const [providerId, value] of Object.entries(byProvider)) {
      const connectionCount = Number(connectedCountByProvider[providerId]) || 0;
      value.connectionCount = connectionCount;
      if (value.connected && value.connectionCount < 1) value.connectionCount = 1;
    }

    const providersConnected = Object.values(byProvider).filter((provider) => provider.connected).length;
    return {
      providersState: "verified",
      providersConnected,
      byProvider,
    };
  }

  async function fetchAuthFilesModelExclusions({
    configValues,
    protocol,
    managementKey,
  }) {
    const payload = await requestManagementJson({
      configValues,
      protocol,
      suffix: MANAGEMENT_AUTH_FILES_PATH,
      managementKey,
    });
    return parseAuthFilesModelExclusions(payload);
  }

  async function fetchAuthFilesThinkingCapabilityHints({
    configValues,
    protocol,
    managementKey,
  }) {
    const payload = await requestManagementJson({
      configValues,
      protocol,
      suffix: MANAGEMENT_AUTH_FILES_PATH,
      managementKey,
    });
    return parseAuthFilesThinkingCapabilityHints(payload);
  }

  async function fetchModelDefinitionThinkingCapabilityHints({
    configValues,
    protocol,
    managementKey,
    providerIds = [],
  }) {
    const byModelId = {};
    const uniqueChannels = new Set();
    for (const providerId of Array.isArray(providerIds) ? providerIds : []) {
      const channel = modelDefinitionChannelForProviderId(providerId);
      if (!channel) continue;
      uniqueChannels.add(channel);
    }
    for (const channel of uniqueChannels) {
      let payload = null;
      try {
        payload = await requestManagementJson({
          configValues,
          protocol,
          suffix: `${MANAGEMENT_MODEL_DEFINITIONS_PATH_PREFIX}/${encodeURIComponent(channel)}`,
          managementKey,
        });
      } catch {
        payload = null;
      }
      const parsedByModelId = parseModelDefinitionThinkingCapabilityHints(payload);
      for (const [modelId, capability] of Object.entries(parsedByModelId)) {
        if (Object.prototype.hasOwnProperty.call(byModelId, modelId)) continue;
        byModelId[modelId] = normalizeThinkingCapability(capability);
      }
    }
    return { byModelId, byProviderId: {} };
  }

  async function fetchManagementThinkingCapabilityHints(configValues, options = {}) {
    let state = {};
    if (
      Object.prototype.hasOwnProperty.call(options, "state") &&
      options.state &&
      typeof options.state === "object"
    ) {
      state = options.state;
    } else if (config && typeof config.readState === "function") {
      state = config.readState() || {};
    }

    const managementKey = resolveManagementKey(configValues, state, options);
    if (!managementKey) return { byModelId: {}, byProviderId: {} };

    const protocol =
      (options && typeof options.protocol === "string" && options.protocol) ||
      configuredProtocol(configValues);
    const providerIds = Array.isArray(options.providerIds) ? options.providerIds : [];
    let combinedHints = { byModelId: {}, byProviderId: {} };

    try {
      const authHints = await fetchAuthFilesThinkingCapabilityHints({
        configValues,
        protocol,
        managementKey,
      });
      combinedHints = mergeThinkingCapabilityHints(combinedHints, authHints);
    } catch {
      // Ignore hint fetch failures; fallback logic remains safe.
    }

    try {
      const staticHints = await fetchModelDefinitionThinkingCapabilityHints({
        configValues,
        protocol,
        managementKey,
        providerIds,
      });
      combinedHints = mergeThinkingCapabilityHints(combinedHints, staticHints);
    } catch {
      // Ignore static definition fetch failures; fallback logic remains safe.
    }

    return combinedHints;
  }

  async function fetchAuthFilesMetadataModelExclusions({
    configValues,
    protocol,
    managementKey,
  }) {
    const payload = await requestManagementJson({
      configValues,
      protocol,
      suffix: MANAGEMENT_AUTH_FILES_PATH,
      managementKey,
    });
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.files)) {
      return [];
    }

    const excluded = new Set();
    for (const file of payload.files) {
      if (!file || typeof file !== "object") continue;
      if (parseOptionalFlag(file.runtime_only || file.runtimeOnly)) continue;
      const name = normalizeAuthFileName(file);
      if (!name) continue;
      const authIndex = parseIntegerOrNull(file.auth_index ?? file.authIndex ?? file.index);
      const params = new URLSearchParams();
      params.set("name", name);
      if (authIndex !== null) {
        params.set("auth_index", String(authIndex));
        params.set("index", String(authIndex));
      }
      let metadataPayload = null;
      try {
        metadataPayload = await requestManagementJson({
          configValues,
          protocol,
          suffix: `${MANAGEMENT_AUTH_FILES_DOWNLOAD_PATH}?${params.toString()}`,
          managementKey,
        });
      } catch {
        metadataPayload = null;
      }
      const parsedModelIds = parseAuthMetadataExcludedModelIds(metadataPayload);
      for (const modelId of parsedModelIds) {
        const normalizedModelId = normalizeModelId(modelId);
        if (!normalizedModelId) continue;
        excluded.add(normalizedModelId);
      }
    }

    return Array.from(excluded);
  }

  async function fetchProviderConnectionStatus(configValues, options = {}) {
    let state = {};
    if (
      Object.prototype.hasOwnProperty.call(options, "state") &&
      options.state &&
      typeof options.state === "object"
    ) {
      state = options.state;
    } else if (config && typeof config.readState === "function") {
      state = config.readState() || {};
    }

    const managementKey = resolveManagementKey(configValues, state, options);
    if (!managementKey) {
      return { providersState: "unknown", providersConnected: 0, byProvider: {} };
    }

    const protocol =
      (options && typeof options.protocol === "string" && options.protocol) ||
      configuredProtocol(configValues);

    const payload = await requestManagementJson({
      configValues,
      protocol,
      suffix: MANAGEMENT_AUTH_FILES_PATH,
      managementKey,
    });
    if (!payload) return { providersState: "unknown", providersConnected: 0, byProvider: {} };
    return parseAuthFilesProviderConnections(payload);
  }

  async function fetchProviderConnectionStatusSafe(configValues, options = {}) {
    try {
      return await fetchProviderConnectionStatus(configValues, options);
    } catch {
      return { providersState: "unknown", providersConnected: 0, byProvider: {} };
    }
  }

  async function fetchManagedAuthFiles(configValues, options = {}) {
    let state = {};
    if (
      Object.prototype.hasOwnProperty.call(options, "state") &&
      options.state &&
      typeof options.state === "object"
    ) {
      state = options.state;
    } else if (config && typeof config.readState === "function") {
      state = config.readState() || {};
    }

    const managementKey = resolveManagementKey(configValues, state, options);
    if (!managementKey) return [];

    const protocol =
      (options && typeof options.protocol === "string" && options.protocol) ||
      configuredProtocol(configValues);
    const payload = await requestManagementJson({
      configValues,
      protocol,
      suffix: MANAGEMENT_AUTH_FILES_PATH,
      managementKey,
    });
    if (!payload) return [];
    return parseManagedAuthFiles(payload);
  }

  async function fetchManagedAuthFilesSafe(configValues, options = {}) {
    try {
      return await fetchManagedAuthFiles(configValues, options);
    } catch {
      return [];
    }
  }

  async function removeManagedAuthFile(configValues, fileRef = {}, options = {}) {
    let state = {};
    if (
      Object.prototype.hasOwnProperty.call(options, "state") &&
      options.state &&
      typeof options.state === "object"
    ) {
      state = options.state;
    } else if (config && typeof config.readState === "function") {
      state = config.readState() || {};
    }

    const managementKey = resolveManagementKey(configValues, state, options);
    if (!managementKey) {
      return { success: false, reason: "management_key_missing", message: "Management key is missing." };
    }

    const runtimeOnly = parseOptionalFlag(fileRef.runtimeOnly || fileRef.runtime_only);
    if (runtimeOnly) {
      return { success: false, reason: "runtime_only", message: "Runtime-only auth entries cannot be removed." };
    }

    let name = String(fileRef.name || "").trim();
    if (!name) {
      const filePath = String(fileRef.path || "").trim();
      name = filePath ? String(pathApi.basename(filePath)).trim() : "";
    }
    if (!name) {
      return {
        success: false,
        reason: "name_missing",
        message: "Auth file name is required to remove an account.",
      };
    }

    const index = parseIntegerOrNull(fileRef.authIndex ?? fileRef.auth_index ?? fileRef.index);
    const params = new URLSearchParams();
    params.set("name", name);
    if (index !== null) params.set("index", String(index));

    const protocol =
      (options && typeof options.protocol === "string" && options.protocol) ||
      configuredProtocol(configValues);
    try {
      const payload = await requestManagementJson({
        configValues,
        protocol,
        suffix: `${MANAGEMENT_AUTH_FILES_PATH}?${params.toString()}`,
        managementKey,
        method: "DELETE",
        allowEmptySuccessBody: true,
      });
      if (!payload) {
        return { success: false, reason: "auth_failed", message: "Management authorization failed." };
      }
      return { success: true, removed: true, name, index, payload };
    } catch (err) {
      const details =
        helpers && typeof helpers.formatErrorSummary === "function"
          ? helpers.formatErrorSummary(err)
          : String((err && (err.message || err)) || "").trim();
      return { success: false, reason: "request_failed", message: details || "Could not remove account." };
    }
  }

  async function removeManagedAuthFileSafe(configValues, fileRef = {}, options = {}) {
    try {
      return await removeManagedAuthFile(configValues, fileRef, options);
    } catch {
      return { success: false, reason: "request_failed", message: "Could not remove account." };
    }
  }

  function filterExcludedModelEntries(entries, excludedModelIds) {
    const excludedSet = new Set(
      (Array.isArray(excludedModelIds) ? excludedModelIds : [])
        .map((id) => normalizeModelIdKey(id))
        .filter(Boolean)
    );
    if (!excludedSet.size) return Array.isArray(entries) ? entries : [];

    const outputEntries = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
      const key = normalizeModelIdKey(entry && entry.id ? entry.id : "");
      if (key && excludedSet.has(key)) continue;
      outputEntries.push(entry);
    }
    return outputEntries;
  }

  async function fetchManagementModelExclusions(configValues, options = {}) {
    let state = {};
    if (
      Object.prototype.hasOwnProperty.call(options, "state") &&
      options.state &&
      typeof options.state === "object"
    ) {
      state = options.state;
    } else if (config && typeof config.readState === "function") {
      state = config.readState() || {};
    }

    const managementKey = resolveManagementKey(configValues, state, options);
    if (!managementKey) return [];

    const protocol =
      (options && typeof options.protocol === "string" && options.protocol) ||
      configuredProtocol(configValues);
    let oauthExcludedError = null;
    const combinedExcluded = new Set();

    try {
      const oauthExcluded = await fetchOAuthExcludedModels({
        configValues,
        protocol,
        managementKey,
      });
      for (const modelId of oauthExcluded) {
        const normalized = normalizeModelId(modelId);
        if (!normalized) continue;
        combinedExcluded.add(normalized);
      }
    } catch (err) {
      oauthExcludedError = err;
      warnManagementExclusionFetchFailure(
        `Could not read ${MANAGEMENT_OAUTH_EXCLUDED_MODELS_PATH}; attempting ${MANAGEMENT_AUTH_FILES_PATH} as fallback.`,
        err,
        options
      );
    }

    try {
      const authFilesExcluded = await fetchAuthFilesModelExclusions({
        configValues,
        protocol,
        managementKey,
      });
      for (const modelId of authFilesExcluded) {
        const normalized = normalizeModelId(modelId);
        if (!normalized) continue;
        combinedExcluded.add(normalized);
      }
    } catch (err) {
      if (!combinedExcluded.size) {
        warnManagementExclusionFetchFailure(
          oauthExcludedError
            ? `Could not read ${MANAGEMENT_AUTH_FILES_PATH} after fallback; continuing without management exclusions.`
            : `Could not read ${MANAGEMENT_AUTH_FILES_PATH}; continuing without management exclusions.`,
          err,
          options
        );
      }
    }

    try {
      const authMetadataExcluded = await fetchAuthFilesMetadataModelExclusions({
        configValues,
        protocol,
        managementKey,
      });
      for (const modelId of authMetadataExcluded) {
        const normalized = normalizeModelId(modelId);
        if (!normalized) continue;
        combinedExcluded.add(normalized);
      }
    } catch {}
    return Array.from(combinedExcluded);
  }

  function requestJsonWithOptions(url, requestOptions = {}) {
    const client = url.startsWith("https") ? httpsApi : httpApi;
    const method = String(requestOptions.method || "GET").trim().toUpperCase() || "GET";
    const headers =
      requestOptions.headers && typeof requestOptions.headers === "object"
        ? { ...requestOptions.headers }
        : {};
    let bodyText = "";
    if (requestOptions.body !== undefined && requestOptions.body !== null) {
      bodyText =
        typeof requestOptions.body === "string"
          ? requestOptions.body
          : JSON.stringify(requestOptions.body);
      if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
        headers["Content-Type"] = "application/json";
      }
      headers["Content-Length"] = Buffer.byteLength(bodyText);
    }

    return new Promise((resolve, reject) => {
      const req = client.request(url, { method, headers }, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
            return;
          }
          const trimmed = body.trim();
          if (!trimmed) {
            if (requestOptions.allowEmptySuccessBody === true) {
              resolve({});
              return;
            }
            reject(new Error("Empty response body"));
            return;
          }
          try {
            resolve(JSON.parse(trimmed));
          } catch {
            reject(new Error("Invalid JSON response"));
          }
        });
      });
      req.setTimeout(8000, () => {
        req.destroy(new Error("Request timed out"));
      });
      req.on("error", reject);
      if (bodyText) {
        req.write(bodyText);
      }
      req.end();
    });
  }

  function requestJson(url, headers) {
    return requestJsonWithOptions(url, {
      method: "GET",
      headers,
    });
  }

  function extractModelsPayload(json) {
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.data)) return json.data;
    if (json && Array.isArray(json.models)) return json.models;
    return [];
  }

  function getNestedValue(root, pathParts) {
    let current = root;
    for (const part of pathParts) {
      if (!current || typeof current !== "object") return undefined;
      current = current[part];
    }
    return current;
  }

  function firstDefinedPathValue(root, paths) {
    for (const pathParts of paths) {
      const value = getNestedValue(root, pathParts);
      if (value !== undefined && value !== null) return value;
    }
    return undefined;
  }

  function parseAllowHint(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
      return null;
    }
    if (typeof value !== "string") return null;
    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!normalized) return null;
    if (
      normalized === "1" ||
      normalized === "true" ||
      normalized === "yes" ||
      normalized === "on" ||
      normalized === "allowed" ||
      normalized === "available" ||
      normalized === "eligible" ||
      normalized === "enabled" ||
      normalized === "granted"
    ) {
      return true;
    }
    if (
      normalized === "0" ||
      normalized === "false" ||
      normalized === "no" ||
      normalized === "off" ||
      normalized === "blocked" ||
      normalized === "denied" ||
      normalized === "disabled" ||
      normalized === "forbidden" ||
      normalized === "ineligible" ||
      normalized === "not_available" ||
      normalized === "restricted" ||
      normalized === "unavailable"
    ) {
      return false;
    }
    return null;
  }

  function parseDenyHint(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
      return null;
    }
    if (typeof value !== "string") return null;
    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!normalized) return null;
    if (
      normalized === "1" ||
      normalized === "true" ||
      normalized === "yes" ||
      normalized === "on" ||
      normalized === "blocked" ||
      normalized === "denied" ||
      normalized === "disabled" ||
      normalized === "forbidden" ||
      normalized === "ineligible" ||
      normalized === "not_available" ||
      normalized === "restricted" ||
      normalized === "unavailable"
    ) {
      return true;
    }
    if (
      normalized === "0" ||
      normalized === "false" ||
      normalized === "no" ||
      normalized === "off" ||
      normalized === "allowed" ||
      normalized === "available" ||
      normalized === "eligible" ||
      normalized === "enabled" ||
      normalized === "granted"
    ) {
      return false;
    }
    return null;
  }

  function normalizeStatusToken(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  }

  function readStatusText(value) {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return "";
    return (
      value.status ||
      value.state ||
      value.value ||
      value.reason ||
      value.code ||
      ""
    );
  }

  function isRestrictedStatusValue(value) {
    const token = normalizeStatusToken(readStatusText(value));
    if (!token) return false;
    if (RESTRICTED_STATUS_VALUES.has(token)) return true;
    if (token.startsWith("not_") && token.includes("available")) return true;
    if (token.endsWith("_unavailable")) return true;
    if (token.includes("requires") && token.includes("pro")) return true;
    if (token.includes("subscription") && token.includes("required")) return true;
    return false;
  }

  function extractEntitlementHints(item) {
    if (!item || typeof item !== "object") return {};
    const allow = firstDefinedPathValue(item, MODEL_ALLOW_HINT_PATHS);
    const deny = firstDefinedPathValue(item, MODEL_DENY_HINT_PATHS);
    const status = firstDefinedPathValue(item, MODEL_STATUS_HINT_PATHS);
    const hints = {};
    if (allow !== undefined) hints.allow = allow;
    if (deny !== undefined) hints.deny = deny;
    if (status !== undefined) hints.status = status;
    return hints;
  }

  function isModelEligible(entry) {
    if (!entry || typeof entry !== "object") return true;
    const hints =
      entry.entitlement && typeof entry.entitlement === "object"
        ? entry.entitlement
        : extractEntitlementHints(entry.raw || entry);

    const allowHint = parseAllowHint(hints.allow);
    if (allowHint === false) return false;

    const denyHint = parseDenyHint(hints.deny);
    if (denyHint === true) return false;
    if (isRestrictedStatusValue(hints.deny)) return false;
    if (isRestrictedStatusValue(hints.status)) return false;

    return true;
  }

  function filterEligibleModelEntries(entries) {
    const outputEntries = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!isModelEligible(entry)) continue;
      outputEntries.push(entry);
    }
    return outputEntries;
  }

  function normalizeModelEntry(item) {
    if (!item) return null;
    if (typeof item === "string") {
      return {
        id: item,
        provider: "",
        created: 0,
        entitlement: {},
        thinking: normalizeThinkingCapability(null),
        raw: { id: item },
      };
    }

    const id = item.id || item.model || item.name || item.slug;
    if (!id) return null;

    let provider =
      item.provider ||
      item.provider_id ||
      item.providerId ||
      item.vendor ||
      item.source ||
      item.owner ||
      item.owned_by ||
      item.organization ||
      item.org;

    if (!provider && item.meta && typeof item.meta === "object") {
      provider = item.meta.provider || item.meta.owner;
    }

    if (provider && typeof provider === "object") {
      provider = provider.id || provider.name || provider.provider;
    }

    const created = item.created || item.created_at || item.createdAt || 0;
    return {
      id: String(id),
      provider: provider ? String(provider) : "",
      created: Number(created) || 0,
      entitlement: extractEntitlementHints(item),
      thinking: extractThinkingCapability(item),
      raw: item,
    };
  }

  async function fetchAvailableModelEntries(configValues, options = {}) {
    const protocolResolution =
      options.protocolResolution ||
      (await resolveReachableProtocol(configValues, { probePath: "/v1/models" }));
    if (!protocolResolution.reachable) {
      throw buildProtocolUnavailableError(protocolResolution);
    }

    const protocol = protocolResolution.protocol || configuredProtocol(configValues);
    const url = buildProxyUrl({
      protocol,
      host: configValues.host,
      port: configValues.port,
      suffix: "/v1/models",
    });

    const apiKey = configValues.apiKey;
    const headerVariants = buildAuthHeaderVariants(apiKey);

    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      for (const headers of headerVariants) {
        try {
          const json = await requestJson(url, headers);
          const data = extractModelsPayload(json);
          const normalizedEntries = data.map(normalizeModelEntry).filter(Boolean);
          const eligibleEntries = filterEligibleModelEntries(normalizedEntries);
          const providerIds = Array.from(
            new Set(
              eligibleEntries
                .map((entry) => normalizeProviderIdStrict(entry && entry.provider))
                .filter(Boolean)
            )
          );
          const thinkingHints = await fetchManagementThinkingCapabilityHints(configValues, {
            protocol,
            state: options.state,
            managementKey: options.managementKey,
            quiet: options.quiet === true,
            providerIds,
          });
          const hintedEntries = applyThinkingCapabilityHintsToEntries(eligibleEntries, thinkingHints);
          const excludedModelIds = await fetchManagementModelExclusions(configValues, {
            protocol,
            state: options.state,
            managementKey: options.managementKey,
            quiet: options.quiet === true,
          });
          return filterExcludedModelEntries(hintedEntries, excludedModelIds);
        } catch (err) {
          lastError = err;
          if (isAuthError(err)) continue;
        }
      }
      await helpers.sleep(300);
    }

    if (!apiKey && isAuthError(lastError)) {
      throw new Error("API key required to fetch models.");
    }

    throw lastError || new Error("Failed to fetch models.");
  }

  async function fetchAvailableModelEntriesSafe(configValues, options = {}) {
    try {
      return await fetchAvailableModelEntries(configValues, options);
    } catch {
      return [];
    }
  }

  function getDroidManagedPaths() {
    const factoryDir = getFactoryDir();
    return [
      pathApi.join(factoryDir, "settings.json"),
      pathApi.join(factoryDir, "config.json"),
      pathApi.join(factoryDir, "config.json.bak"),
    ];
  }

  function describeSyncResult(result) {
    if (!result) return "No sync performed.";
    if (result.status === "synced") {
      const count = result.modelsAdded || 0;
      return `Synced ${count} model${count === 1 ? "" : "s"} to Droid.`;
    }
    if (result.status === "cleared") {
      return "Cleared Droxy-managed models from Droid.";
    }
    if (result.status === "skipped") {
      if (result.reason === "proxy_unreachable") {
        return "Droxy endpoint unreachable. Start proxy or fix host/TLS settings.";
      }
      return "Sync skipped.";
    }
    return "Sync finished.";
  }

  async function syncDroidSettings({
    quiet = false,
    selectedModels,
    detectedEntries: detectedModelEntries,
    protocol,
  } = {}) {
    if (!config.configExists()) {
      if (!quiet) {
        output.printGuidedError({
          what: `Config missing at ${config.getConfigPath()}.`,
          why: "Droid sync requires local Droxy config values (host, port, auth).",
          next: [
            "Run: droxy login",
            "Then run: droxy and choose models",
          ],
        });
      }
      return { success: false, reason: "config_missing" };
    }

    const configValues = config.readConfigValues();
    const state = config.readState() || {};
    const apiKey = configValues.apiKey || state.apiKey || "";
    const resolveStrictProviderStatusFailure = (providerStatus) => {
      const normalizedStatus =
        providerStatus && providerStatus.providersState === "verified" ? "verified" : "unknown";
      const providersConnectedRaw = Number(providerStatus && providerStatus.providersConnected);
      const providersConnected =
        Number.isFinite(providersConnectedRaw) && providersConnectedRaw >= 0
          ? Math.floor(providersConnectedRaw)
          : 0;
      return {
        status: "skipped",
        reason: "providers_unverified",
        providersState: normalizedStatus,
        providersConnected,
      };
    };
    const failSyncWhenProvidersUnverified = (providerStatus) => {
      const result = resolveStrictProviderStatusFailure(providerStatus);
      if (!quiet) {
        output.printGuidedError({
          what: "Droid sync blocked.",
          why: "Provider connection state is not backend-verified yet.",
          next: [
            "Run: droxy status --verbose",
            "Ensure management auth is configured and accepted by the proxy backend",
            "Retry provider login: droxy login <provider>",
          ],
        });
      }
      return { success: false, reason: "providers_unverified", result };
    };

    let protocolResolution;
    let detectedEntries;
    const hasDetectedEntries = Array.isArray(detectedModelEntries);
    if (hasDetectedEntries) {
      detectedEntries = detectedModelEntries;
      const resolvedProtocol = protocol || configuredProtocol(configValues);
      protocolResolution = {
        reachable: true,
        protocol: resolvedProtocol,
        preferredProtocol: resolvedProtocol,
        fallbackProtocol: null,
        fallbackUsed: false,
        preferredUrl: null,
        fallbackUrl: null,
        preferredError: null,
        fallbackError: null,
      };
    } else {
      protocolResolution = await resolveReachableProtocol(configValues, {
        probePath: "/v1/models",
      });

      if (!protocolResolution.reachable) {
        const result = {
          status: "skipped",
          reason: "proxy_unreachable",
          preferredProtocol: protocolResolution.preferredProtocol,
          preferredError: helpers.formatErrorSummary(protocolResolution.preferredError),
          fallbackError: helpers.formatErrorSummary(protocolResolution.fallbackError),
        };
        if (!quiet) {
          output.printGuidedError({
            what: "Droid sync skipped.",
            why: describeSyncResult(result),
            next: [
              "Run: droxy start",
              "Run: droxy status --verbose",
              "Then open: droxy",
            ],
          });
        }
        return { success: false, reason: "proxy_unreachable", result };
      }

      const providerStatus = await fetchProviderConnectionStatusSafe(configValues, {
        state,
        quiet: true,
        protocol: protocolResolution.protocol,
      });
      if (!providerStatus || providerStatus.providersState !== "verified") {
        return failSyncWhenProvidersUnverified(providerStatus);
      }

      try {
        detectedEntries = await fetchAvailableModelEntries(
          { ...configValues, apiKey },
          { protocolResolution, state, quiet }
        );
      } catch (err) {
        const result = { status: "skipped", reason: "detect_failed", error: String(err.message || err) };
        if (!quiet) {
          output.printGuidedError({
            what: "Model detection failed during Droid sync.",
            why: String(err && err.message ? err.message : "Unknown detection error."),
            next: [
              "Verify your provider login: droxy login <provider>",
              "Check proxy health: droxy status --verbose",
              "Retry via interactive auto-sync: droxy",
            ],
          });
        }
        return { success: false, reason: "detect_failed", result };
      }
    }

    const hasExplicitSelection = Array.isArray(selectedModels);
    const filtered = filterDetectedEntriesBySelection(detectedEntries, selectedModels, {
      explicitSelection: hasExplicitSelection,
    });
    if (filtered.selectedIds.length && !filtered.entries.length) {
      const result = {
        status: "cleared",
        reason: "selected_models_pruned",
        protocol: protocolResolution.protocol,
        ...clearFactoryModels({ host: configValues.host, port: configValues.port }),
      };
      const thinkingSummary = buildThinkingInterrogationSummary([], {});
      config.updateState({
        lastFactorySyncAt: new Date().toISOString(),
        selectedModels: [],
        thinkingState: thinkingSummary.state,
        thinkingStatus: {
          ...thinkingSummary,
          updatedAt: new Date().toISOString(),
        },
        thinkingModels: [],
        thinkingModelModes: {},
        factory: {
          enabled: true,
          autoDetect: true,
          openAiModels: [],
          anthropicModels: [],
          modelsByProvider: {},
          modelReasoning: {},
          lastSyncAt: new Date().toISOString(),
        },
      });
      if (!quiet) {
        output.printWarning(
          "Saved selected models are no longer available. Cleared stale selection and Droid models."
        );
        output.printSuccess(describeSyncResult(result));
      }
      return {
        success: true,
        result: {
          ...result,
          selectedModels: [],
          selectedModelsSkipped: filtered.selectedIds.length,
        },
      };
    }

    detectedEntries = filtered.entries;
    const thinkingCapabilityByModelId = buildThinkingCapabilityByModelId(detectedEntries);
    const notifyThinkingModeDowngrade = (
      modelId,
      requestedMode,
      reason,
      warningDedupSet
    ) => {
      const safeModelId = String(modelId || "").trim();
      const safeRequestedMode = normalizeThinkingMode(requestedMode);
      if (!safeModelId || !safeRequestedMode) return;
      const warningKey = `${safeModelId.toLowerCase()}:${safeRequestedMode}`;
      if (warningDedupSet && warningDedupSet.has(warningKey)) return;
      if (warningDedupSet) warningDedupSet.add(warningKey);
      if (quiet) return;

      if (output && typeof output.printThinkingModeDowngrade === "function") {
        output.printThinkingModeDowngrade({
          modelId: safeModelId,
          requestedMode: safeRequestedMode,
          fallbackMode: "auto",
          reason,
        });
        return;
      }

      if (output && typeof output.printWarning === "function") {
        output.printWarning(
          `Thinking mode '${safeRequestedMode}' for ${safeModelId} is not backend-verified. Using auto.`
        );
      }
    };
    const syncedModelIds = normalizeSelectedModelIds(
      detectedEntries.map((entry) => (entry && entry.id ? entry.id : ""))
    );
    const thinkingSummary = buildThinkingInterrogationSummary(
      syncedModelIds,
      thinkingCapabilityByModelId
    );
    const thinkingState = thinkingSummary.state;
    const explicitThinkingModelModes = normalizeThinkingModelModes(state.thinkingModelModes || {});
    const fallbackThinkingModelSet = new Set(
      normalizeThinkingModelIds(state.thinkingModels || []).map((modelId) =>
        String(modelId).toLowerCase()
      )
    );
    const thinkingModelModes = {};
    const thinkingModeDowngradeWarnings = new Set();
    for (const modelId of syncedModelIds) {
      const normalizedId = String(modelId).toLowerCase();
      const explicitRequestedMode = explicitThinkingModelModes[normalizedId];
      const explicitModeOutcome = resolveThinkingModeForModel(
        modelId,
        explicitRequestedMode,
        thinkingCapabilityByModelId
      );
      const explicitMode = explicitModeOutcome.mode;
      if (explicitMode) {
        if (explicitMode === "none") continue;
        if (explicitModeOutcome.downgraded) {
          notifyThinkingModeDowngrade(
            modelId,
            explicitRequestedMode,
            explicitModeOutcome.reason,
            thinkingModeDowngradeWarnings
          );
        }
        thinkingModelModes[modelId] = explicitMode;
        continue;
      }
      if (fallbackThinkingModelSet.has(normalizedId)) {
        const fallbackModeOutcome = resolveThinkingModeForModel(
          modelId,
          "medium",
          thinkingCapabilityByModelId
        );
        const fallbackMode = fallbackModeOutcome.mode;
        if (fallbackMode && fallbackMode !== "none") {
          if (fallbackModeOutcome.downgraded) {
            notifyThinkingModeDowngrade(
              modelId,
              "medium",
              fallbackModeOutcome.reason,
              thinkingModeDowngradeWarnings
            );
          }
          thinkingModelModes[modelId] = fallbackMode;
        }
      }
    }
    const thinkingModelIds = Object.keys(thinkingModelModes);
    const split = splitModelsForFactoryEntries(detectedEntries);

    let result;
    if (!split.openai.length && !split.anthropic.length) {
      result = {
        status: "cleared",
        protocol: protocolResolution.protocol,
        ...clearFactoryModels({ host: configValues.host, port: configValues.port }),
      };
    } else {
      result = {
        status: "synced",
        protocol: protocolResolution.protocol,
        ...writeFactorySettings({
          host: configValues.host,
          port: configValues.port,
          tlsEnabled: configValues.tlsEnabled,
          protocol: protocolResolution.protocol,
          apiKey,
          openAiModels: split.openai,
          anthropicModels: split.anthropic,
          ownerProviderByModelId: buildOwnerProviderByModelId(split.byProvider),
          thinkingModelModes,
          thinkingCapabilityByModelId,
        }),
      };
    }

    config.updateState({
      lastFactorySyncAt: new Date().toISOString(),
      ...(hasExplicitSelection
        ? { selectedModels: syncedModelIds }
        : syncedModelIds.length
          ? { selectedModels: syncedModelIds }
          : {}),
      thinkingState,
      thinkingStatus: {
        ...thinkingSummary,
        updatedAt: new Date().toISOString(),
      },
      thinkingModels: thinkingModelIds,
      thinkingModelModes,
      factory: {
        enabled: true,
        autoDetect: true,
        openAiModels: split.openai,
        anthropicModels: split.anthropic,
        modelsByProvider: split.byProvider,
        modelReasoning: {},
        lastSyncAt: new Date().toISOString(),
      },
    });

    if (!quiet) {
      output.printSuccess(describeSyncResult(result));
    }

    return {
      success: true,
      result: {
        ...result,
        ...(hasExplicitSelection
          ? { selectedModels: syncedModelIds, selectedModelsSkipped: filtered.skippedCount }
          : syncedModelIds.length
            ? { selectedModels: syncedModelIds, selectedModelsSkipped: filtered.skippedCount }
            : {}),
      },
    };
  }

  return {
    DROXY_FACTORY_PREFIX,
    buildFactoryEntries,
    buildProtocolUnavailableError,
    clearFactoryModels,
    describeSyncResult,
    fetchAvailableModelEntries,
    fetchAvailableModelEntriesSafe,
    fetchManagedAuthFiles,
    fetchManagedAuthFilesSafe,
    fetchManagementModelExclusions,
    fetchManagementThinkingCapabilityHints,
    fetchProviderConnectionStatus,
    fetchProviderConnectionStatusSafe,
    filterEligibleModelEntries,
    filterExcludedModelEntries,
    filterDetectedEntriesBySelection,
    getDroidManagedPaths,
    isDroxyManagedEntry,
    isModelEligible,
    parseAuthFilesModelExclusions,
    parseAuthFilesThinkingCapabilityHints,
    parseAuthMetadataExcludedModelIds,
    parseManagedAuthFiles,
    parseAuthFilesProviderConnections,
    parseModelDefinitionThinkingCapabilityHints,
    parseThinkingModeLevelsFromStatusMessage,
    parseUnsupportedModelIdsFromStatusMessage,
    normalizeSelectedModelIds,
    removeManagedAuthFile,
    removeManagedAuthFileSafe,
    resolveReachableProtocol,
    splitModelsForFactoryEntries,
    syncDroidSettings,
    updateFactoryConfigCustomModels,
    updateFactorySettingsCustomModels,
    writeFactorySettings,
  };
}

const syncApi = createSyncApi();

module.exports = {
  createSyncApi,
  ...syncApi,
};
