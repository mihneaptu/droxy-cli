"use strict";

const DEFAULT_UI_PROFILE = "claude";

const PROFILE_ALIASES = {
  anthropic: DEFAULT_UI_PROFILE,
  claude: DEFAULT_UI_PROFILE,
  classic: DEFAULT_UI_PROFILE,
  companion: DEFAULT_UI_PROFILE,
  default: DEFAULT_UI_PROFILE,
  premium: DEFAULT_UI_PROFILE,
};

function normalizeProfileName(profile) {
  return String(profile || "").trim().toLowerCase();
}

function isKnownProfileName(profile) {
  const normalized = normalizeProfileName(profile);
  if (!normalized) return false;
  return Object.prototype.hasOwnProperty.call(PROFILE_ALIASES, normalized);
}

function resolveUiProfile(profile) {
  const normalized = normalizeProfileName(profile);
  if (!normalized) return DEFAULT_UI_PROFILE;
  return PROFILE_ALIASES[normalized] || DEFAULT_UI_PROFILE;
}

module.exports = {
  DEFAULT_UI_PROFILE,
  PROFILE_ALIASES,
  isKnownProfileName,
  normalizeProfileName,
  resolveUiProfile,
};
