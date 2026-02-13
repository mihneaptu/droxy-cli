"use strict";

const fs = require("fs");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");

const configModule = require("./config");
const helpersModule = require("./helpers");
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
const MANAGEMENT_OAUTH_EXCLUDED_MODELS_PATH = "/v0/management/oauth-excluded-models";
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

  function resolveProviderOwnerForEntry(entry) {
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

    const normalized = normalizeProviderOwnerTag(raw);
    if (normalized) return normalized;
    return classifyProviderOwnerFromModelId(entry.id);
  }

  function splitModelsForFactoryEntries(entries) {
    const byId = new Map();
    for (const entry of entries || []) {
      const id = entry && entry.id ? String(entry.id) : "";
      if (!id) continue;
      const ownerProvider = resolveProviderOwnerForEntry(entry);
      const factoryProvider = mapOwnerToFactoryProvider(ownerProvider, id);
      const next = { ownerProvider, factoryProvider };
      if (!byId.has(id)) {
        byId.set(id, next);
        continue;
      }
      const existing = byId.get(id) || {};
      const shouldReplaceOwner = !existing.ownerProvider && ownerProvider;
      const shouldReplaceFactory =
        existing.factoryProvider !== "anthropic" && factoryProvider === "anthropic";
      if (shouldReplaceOwner || shouldReplaceFactory) {
        byId.set(id, {
          ownerProvider: shouldReplaceOwner ? ownerProvider : existing.ownerProvider,
          factoryProvider: shouldReplaceFactory ? factoryProvider : existing.factoryProvider,
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
  const supportsAdvancedThinkingModes =
    typeof helpers.supportsAdvancedThinkingModes === "function"
      ? helpers.supportsAdvancedThinkingModes
      : helpersModule.supportsAdvancedThinkingModes;

  function normalizeThinkingModelIds(thinkingModels) {
    return normalizeSelectedModelIds(thinkingModels)
      .map((modelId) => stripThinkingSuffix(modelId))
      .filter(Boolean);
  }

  function normalizeThinkingModeForModel(modelId, mode) {
    const normalizedMode = normalizeThinkingMode(mode);
    if (!normalizedMode) return "";
    if (normalizedMode === "none") return "none";
    if (normalizedMode === "auto") return "auto";
    if (!isAdvancedThinkingMode(normalizedMode)) return "auto";
    if (!supportsAdvancedThinkingModes(modelId)) return "auto";
    return normalizedMode;
  }

  function appendThinkingVariant(baseModelId, mode, outputModels) {
    const normalizedMode = normalizeThinkingModeForModel(baseModelId, mode);
    if (!normalizedMode) return;
    if (normalizedMode === "none") return;
    outputModels.push(`${baseModelId}(${normalizedMode})`);
  }

  function expandProviderModelsWithThinkingVariants(providerModels, thinkingModelModes) {
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
      appendThinkingVariant(modelId, mode, variants);
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
    const displayName = entry.displayName || entry.model_display_name || "";
    if (String(displayName).startsWith(DROXY_FACTORY_PREFIX)) return true;
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
    thinkingModelModes,
  }) {
    const scheme = protocol || (tlsEnabled ? "https" : "http");
    const resolvedHost = normalizedHost(host);
    const base = `${scheme}://${resolvedHost}:${port}`;
    const entries = [];
    const openAiExpandedModels = expandProviderModelsWithThinkingVariants(
      openAiModels,
      thinkingModelModes
    );
    const anthropicExpandedModels = expandProviderModelsWithThinkingVariants(
      anthropicModels,
      thinkingModelModes
    );

    for (const model of openAiExpandedModels) {
      if (!model) continue;
      entries.push({
        model,
        model_display_name: ensureDroxyPrefix(model),
        base_url: `${base}/v1`,
        api_key: apiKey,
        provider: "openai",
      });
    }

    for (const model of anthropicExpandedModels) {
      if (!model) continue;
      entries.push({
        model,
        model_display_name: ensureDroxyPrefix(model),
        base_url: base,
        api_key: apiKey,
        provider: "anthropic",
      });
    }

    return entries;
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
    return normalized.includes("openai") || normalized.includes("codex");
  }

  function isLikelyModelId(value) {
    const normalized = normalizeModelId(value);
    if (!normalized) return false;
    if (normalized.length > 200) return false;
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(normalized)) return false;
    return /[A-Za-z]/.test(normalized);
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

  async function requestManagementJson({
    configValues,
    protocol,
    suffix,
    managementKey,
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
        return await requestJson(url, { Accept: "application/json", ...headers });
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
      if (!isOpenAiFamilyProvider(provider)) continue;
      const statusMessage = file.status_message || file.statusMessage || file.detail;
      for (const modelId of parseUnsupportedModelIdsFromStatusMessage(statusMessage)) {
        excluded.add(modelId);
      }
    }
    return Array.from(excluded);
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

    try {
      const oauthExcluded = await fetchOAuthExcludedModels({
        configValues,
        protocol,
        managementKey,
      });
      if (oauthExcluded.length) return oauthExcluded;
    } catch {
      // Ignore oauth exclusion endpoint errors and continue to auth-files fallback.
    }

    try {
      return await fetchAuthFilesModelExclusions({
        configValues,
        protocol,
        managementKey,
      });
    } catch {
      return [];
    }
  }

  function requestJson(url, headers) {
    const client = url.startsWith("https") ? httpsApi : httpApi;
    return new Promise((resolve, reject) => {
      const req = client.request(url, { method: "GET", headers }, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error("Invalid JSON response"));
          }
        });
      });
      req.setTimeout(8000, () => {
        req.destroy(new Error("Request timed out"));
      });
      req.on("error", reject);
      req.end();
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
          const excludedModelIds = await fetchManagementModelExclusions(configValues, {
            protocol,
            state: options.state,
            managementKey: options.managementKey,
          });
          return filterExcludedModelEntries(eligibleEntries, excludedModelIds);
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

    let protocolResolution;
    let detectedEntries;
    if (Array.isArray(detectedModelEntries)) {
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

      try {
        detectedEntries = await fetchAvailableModelEntries(
          { ...configValues, apiKey },
          { protocolResolution, state }
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
      config.updateState({
        lastFactorySyncAt: new Date().toISOString(),
        selectedModels: [],
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
    const syncedModelIds = normalizeSelectedModelIds(
      detectedEntries.map((entry) => (entry && entry.id ? entry.id : ""))
    );
    const explicitThinkingModelModes = normalizeThinkingModelModes(state.thinkingModelModes || {});
    const fallbackThinkingModelSet = new Set(
      normalizeThinkingModelIds(state.thinkingModels || []).map((modelId) =>
        String(modelId).toLowerCase()
      )
    );
    const thinkingModelModes = {};
    for (const modelId of syncedModelIds) {
      const normalizedId = String(modelId).toLowerCase();
      const explicitMode = normalizeThinkingModeForModel(
        modelId,
        explicitThinkingModelModes[normalizedId]
      );
      if (explicitMode) {
        if (explicitMode === "none") continue;
        thinkingModelModes[modelId] = explicitMode;
        continue;
      }
      if (fallbackThinkingModelSet.has(normalizedId)) {
        const fallbackMode = normalizeThinkingModeForModel(modelId, "medium");
        if (fallbackMode && fallbackMode !== "none") {
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
          thinkingModelModes,
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
    fetchManagementModelExclusions,
    filterEligibleModelEntries,
    filterExcludedModelEntries,
    filterDetectedEntriesBySelection,
    getDroidManagedPaths,
    isDroxyManagedEntry,
    isModelEligible,
    parseAuthFilesModelExclusions,
    parseUnsupportedModelIdsFromStatusMessage,
    normalizeSelectedModelIds,
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
