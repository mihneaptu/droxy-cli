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

  function normalizeProviderTag(raw) {
    const value = String(raw || "").toLowerCase();
    if (!value) return "";
    if (value.includes("anthropic") || value.includes("claude")) return "anthropic";
    if (value.includes("openai") || value.includes("codex") || value.includes("gpt")) {
      return "openai";
    }
    return "";
  }

  function resolveProviderForEntry(entry) {
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

    const normalized = normalizeProviderTag(raw);
    if (normalized) return normalized;
    return classifyProviderForFactory(entry.id);
  }

  function splitModelsForFactoryEntries(entries) {
    const byId = new Map();
    for (const entry of entries || []) {
      const id = entry && entry.id ? String(entry.id) : "";
      if (!id) continue;
      const provider = resolveProviderForEntry(entry);
      if (!byId.has(id)) {
        byId.set(id, provider);
        continue;
      }
      if (provider === "anthropic") {
        byId.set(id, provider);
      }
    }

    const openai = [];
    const anthropic = [];
    for (const [id, provider] of byId.entries()) {
      if (provider === "anthropic") anthropic.push(id);
      else openai.push(id);
    }

    return { openai, anthropic };
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
  }) {
    const scheme = protocol || (tlsEnabled ? "https" : "http");
    const resolvedHost = normalizedHost(host);
    const base = `${scheme}://${resolvedHost}:${port}`;
    const entries = [];

    for (const model of openAiModels || []) {
      if (!model) continue;
      entries.push({
        model,
        model_display_name: ensureDroxyPrefix(model),
        base_url: `${base}/v1`,
        api_key: apiKey,
        provider: "openai",
      });
    }

    for (const model of anthropicModels || []) {
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

  function normalizeModelEntry(item) {
    if (!item) return null;
    if (typeof item === "string") return { id: item, provider: "", created: 0 };

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
          return data.map(normalizeModelEntry).filter(Boolean);
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

  async function syncDroidSettings({ quiet = false } = {}) {
    if (!config.configExists()) {
      if (!quiet) {
        output.printWarning(`Config missing at ${config.getConfigPath()}`);
      }
      return { success: false, reason: "config_missing" };
    }

    const configValues = config.readConfigValues();
    const state = config.readState() || {};
    const apiKey = configValues.apiKey || state.apiKey || "";

    const protocolResolution = await resolveReachableProtocol(configValues, {
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
        output.printWarning(describeSyncResult(result));
      }
      return { success: false, reason: "proxy_unreachable", result };
    }

    let detectedEntries;
    try {
      detectedEntries = await fetchAvailableModelEntries(
        { ...configValues, apiKey },
        { protocolResolution }
      );
    } catch (err) {
      const result = { status: "skipped", reason: "detect_failed", error: String(err.message || err) };
      if (!quiet) {
        output.printWarning("Model detection failed during Droid sync.");
      }
      return { success: false, reason: "detect_failed", result };
    }

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
        }),
      };
    }

    config.updateState({
      lastFactorySyncAt: new Date().toISOString(),
      factory: {
        enabled: true,
        autoDetect: true,
        openAiModels: split.openai,
        anthropicModels: split.anthropic,
        modelReasoning: {},
        lastSyncAt: new Date().toISOString(),
      },
    });

    if (!quiet) {
      output.printSuccess(describeSyncResult(result));
    }

    return { success: true, result };
  }

  return {
    DROXY_FACTORY_PREFIX,
    buildFactoryEntries,
    buildProtocolUnavailableError,
    clearFactoryModels,
    describeSyncResult,
    fetchAvailableModelEntries,
    fetchAvailableModelEntriesSafe,
    getDroidManagedPaths,
    isDroxyManagedEntry,
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
