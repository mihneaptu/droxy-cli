"use strict";

const helpers = require("./helpers");

const THINKING_MODE_VALUES = Array.isArray(helpers.THINKING_MODE_VALUES) && helpers.THINKING_MODE_VALUES.length
  ? helpers.THINKING_MODE_VALUES
  : ["auto", "minimal", "low", "medium", "high", "xhigh", "none"];
const DEFAULT_THINKING_ALLOWED_MODES = Object.freeze(["auto", "none"]);

function resolveThinkingHelpers(options = {}) {
  const normalizeThinkingMode =
    typeof options.normalizeThinkingMode === "function"
      ? options.normalizeThinkingMode
      : helpers.normalizeThinkingMode;
  const stripThinkingSuffix =
    typeof options.stripThinkingSuffix === "function"
      ? options.stripThinkingSuffix
      : helpers.stripThinkingSuffix;
  const thinkingModeValues =
    Array.isArray(options.thinkingModeValues) && options.thinkingModeValues.length
      ? options.thinkingModeValues
      : THINKING_MODE_VALUES;
  const defaultAllowedModes =
    Array.isArray(options.defaultAllowedModes) && options.defaultAllowedModes.length
      ? options.defaultAllowedModes
      : DEFAULT_THINKING_ALLOWED_MODES;

  return {
    normalizeThinkingMode,
    stripThinkingSuffix,
    thinkingModeValues,
    defaultAllowedModes,
  };
}

function parseModeAllowFlag(value) {
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

function orderThinkingModes(modes = [], options = {}) {
  const thinking = resolveThinkingHelpers(options);
  const modeSet = new Set();
  for (const mode of Array.isArray(modes) ? modes : []) {
    const normalizedMode = thinking.normalizeThinkingMode(mode);
    if (!normalizedMode) continue;
    modeSet.add(normalizedMode);
  }

  const ordered = [];
  for (const mode of thinking.thinkingModeValues) {
    if (!modeSet.has(mode)) continue;
    ordered.push(mode);
    modeSet.delete(mode);
  }
  return ordered.concat(Array.from(modeSet).sort((left, right) => left.localeCompare(right)));
}

function collectThinkingModesFromHintInternal(value, outputModes, thinking, depth = 0) {
  if (depth > 6 || value === undefined || value === null) return;
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectThinkingModesFromHintInternal(entry, outputModes, thinking, depth + 1);
    }
    return;
  }
  if (typeof value === "string") {
    const directMode = thinking.normalizeThinkingMode(value);
    if (directMode) {
      outputModes.add(directMode);
      return;
    }
    const splitTokens = value.split(/[\s,;|]+/g);
    for (const token of splitTokens) {
      const tokenMode = thinking.normalizeThinkingMode(token);
      if (!tokenMode) continue;
      outputModes.add(tokenMode);
    }
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const key of [
    "modes",
    "mode",
    "allowed_modes",
    "allowedModes",
    "supported_modes",
    "supportedModes",
    "values",
    "options",
    "available_modes",
    "availableModes",
  ]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    collectThinkingModesFromHintInternal(value[key], outputModes, thinking, depth + 1);
  }

  let sawModeKeys = false;
  for (const [key, flag] of Object.entries(value)) {
    const modeFromKey = thinking.normalizeThinkingMode(key);
    if (!modeFromKey) continue;
    sawModeKeys = true;
    const allowed = parseModeAllowFlag(flag);
    if (allowed === false) continue;
    outputModes.add(modeFromKey);
  }
  if (sawModeKeys) return;

  for (const nested of Object.values(value)) {
    if (!nested || (typeof nested !== "object" && typeof nested !== "string")) continue;
    collectThinkingModesFromHintInternal(nested, outputModes, thinking, depth + 1);
  }
}

function collectThinkingModesFromHint(value, outputModes, options = {}, depth = 0) {
  const thinking = resolveThinkingHelpers(options);
  collectThinkingModesFromHintInternal(value, outputModes, thinking, depth);
}

function normalizeAllowedThinkingModes(value, options = {}) {
  const includeAuto = options.includeAuto !== false;
  const includeNone = options.includeNone !== false;
  const thinking = resolveThinkingHelpers(options);
  const modes = new Set();
  collectThinkingModesFromHintInternal(value, modes, thinking, 0);
  if (includeAuto) modes.add("auto");
  if (includeNone) modes.add("none");
  return orderThinkingModes(Array.from(modes), thinking);
}

function normalizeThinkingCapability(capability, options = {}) {
  const thinking = resolveThinkingHelpers(options);
  const fallbackAllowedModes = orderThinkingModes(thinking.defaultAllowedModes, thinking);
  const value = capability && typeof capability === "object" ? capability : {};
  const verified = value.verified === true;
  const supported = verified && value.supported === true;
  if (!verified) {
    return {
      supported: false,
      verified: false,
      allowedModes: fallbackAllowedModes.slice(),
    };
  }
  if (!supported) {
    return {
      supported: false,
      verified: true,
      allowedModes: fallbackAllowedModes.slice(),
    };
  }

  if (Object.prototype.hasOwnProperty.call(value, "allowedModes")) {
    const allowedModes = normalizeAllowedThinkingModes(value.allowedModes, thinking);
    return {
      supported: true,
      verified: true,
      allowedModes: allowedModes.length ? allowedModes : fallbackAllowedModes.slice(),
    };
  }

  const fullAllowedModes = orderThinkingModes(thinking.thinkingModeValues, thinking);
  return {
    supported: true,
    verified: true,
    allowedModes: fullAllowedModes.length ? fullAllowedModes : fallbackAllowedModes.slice(),
  };
}

function buildThinkingCapabilityByModelId(entries = [], options = {}) {
  const thinking = resolveThinkingHelpers(options);
  const outputByModelId = {};
  for (const entry of Array.isArray(entries) ? entries : []) {
    const modelId = thinking.stripThinkingSuffix(entry && entry.id ? entry.id : "").toLowerCase();
    if (!modelId) continue;
    outputByModelId[modelId] = normalizeThinkingCapability(entry && entry.thinking, thinking);
  }
  return outputByModelId;
}

function resolveThinkingCapabilityForModel(modelId, thinkingCapabilityByModelId = {}, options = {}) {
  const thinking = resolveThinkingHelpers(options);
  const normalizedId = thinking.stripThinkingSuffix(modelId).toLowerCase();
  if (
    normalizedId &&
    Object.prototype.hasOwnProperty.call(thinkingCapabilityByModelId, normalizedId)
  ) {
    return normalizeThinkingCapability(thinkingCapabilityByModelId[normalizedId], thinking);
  }
  return normalizeThinkingCapability(null, thinking);
}

module.exports = {
  DEFAULT_THINKING_ALLOWED_MODES,
  THINKING_MODE_VALUES,
  buildThinkingCapabilityByModelId,
  collectThinkingModesFromHint,
  normalizeAllowedThinkingModes,
  normalizeThinkingCapability,
  orderThinkingModes,
  parseModeAllowFlag,
  resolveThinkingCapabilityForModel,
};
