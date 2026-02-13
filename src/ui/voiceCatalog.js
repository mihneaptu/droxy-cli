"use strict";

const { DESIGN_TOKENS } = require("./designTokens");
const { CLAUDE_MICROCOPY } = require("./microcopyCatalog");
const { DEFAULT_UI_PROFILE, resolveUiProfile } = require("./uiProfile");

const VOICE_PROFILES = {
  [DEFAULT_UI_PROFILE]: CLAUDE_MICROCOPY,
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

function getMessage(key, params = {}, profile = DEFAULT_UI_PROFILE) {
  const profileName = resolveVoiceProfile(profile);
  const value = readPath(VOICE_PROFILES[profileName], key);
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return value;
  return renderTemplate(value, params);
}

function getDesignToken(key, params = {}, profile = DEFAULT_UI_PROFILE) {
  const profileName = resolveVoiceProfile(profile);
  const value = readPath(DESIGN_TOKENS[profileName], key);
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
