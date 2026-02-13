"use strict";

const { DESIGN_TOKENS } = require("./designTokens");
const { CLASSIC_MICROCOPY, PREMIUM_MICROCOPY } = require("./microcopyCatalog");
const { resolveUiProfile } = require("./uiProfile");

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, override) {
  const left = isObject(base) ? base : {};
  const right = isObject(override) ? override : {};
  const out = { ...left };
  for (const key of Object.keys(right)) {
    const nextBase = left[key];
    const nextOverride = right[key];
    out[key] = isObject(nextBase) && isObject(nextOverride)
      ? deepMerge(nextBase, nextOverride)
      : nextOverride;
  }
  return out;
}

const VOICE_PROFILES = {
  premium: PREMIUM_MICROCOPY,
  classic: deepMerge(PREMIUM_MICROCOPY, CLASSIC_MICROCOPY),
};

function resolveVoiceProfile(profile) {
  return resolveUiProfile(profile);
}

function readPath(source, key) {
  if (!source || !key) return undefined;
  return String(key)
    .split(".")
    .reduce((cursor, part) => {
      if (!cursor || typeof cursor !== "object") return undefined;
      return cursor[part];
    }, source);
}

function renderTemplate(value, params = {}) {
  return String(value).replace(/\{\{(\w+)\}\}/g, (_m, key) => {
    const raw = params[key];
    return raw === undefined || raw === null ? "" : String(raw);
  });
}

function getMessage(key, params = {}, profile = "premium") {
  const profileName = resolveVoiceProfile(profile);
  const direct = readPath(VOICE_PROFILES[profileName], key);
  const fallback = readPath(VOICE_PROFILES.premium, key);
  const value = direct === undefined ? fallback : direct;
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return value;
  return renderTemplate(value, params);
}

function getDesignToken(key, params = {}, profile = "premium") {
  const profileName = resolveVoiceProfile(profile);
  const direct = readPath(DESIGN_TOKENS[profileName], key);
  const fallback = readPath(DESIGN_TOKENS.premium, key);
  const value = direct === undefined ? fallback : direct;
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return value;
  return renderTemplate(value, params);
}

module.exports = {
  VOICE_PROFILES,
  getDesignToken,
  getMessage,
  resolveVoiceProfile,
};
