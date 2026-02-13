"use strict";

const PROFILE_ALIASES = {
  companion: "premium",
  classic: "classic",
  premium: "premium",
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
  if (!normalized) return "premium";
  return PROFILE_ALIASES[normalized] || "premium";
}

module.exports = {
  PROFILE_ALIASES,
  isKnownProfileName,
  normalizeProfileName,
  resolveUiProfile,
};
