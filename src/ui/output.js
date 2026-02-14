"use strict";

const { COLORS, colorize } = require("./colors");
const { ICONS } = require("./animations");
const { getMessage } = require("./voiceCatalog");

function log(msg = "") {
  process.stdout.write(`${String(msg)}\n`);
}

function logCentered(line, width = 56) {
  const text = String(line).replace(/\x1b\[[0-9;]*m/g, "");
  const padding = Math.max(0, Math.floor((width - text.length) / 2));
  log(`${" ".repeat(padding)}${line}`);
}

function printSuccess(message) {
  const safeMessage = String(message || "").trim();
  if (!safeMessage) return;
  log(`${colorize(ICONS.success, COLORS.success)} ${safeMessage}`);
}

function normalizeNextSteps(next) {
  if (!Array.isArray(next)) return [];
  return next
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function printGuidedError({ what, why = "", next = [] } = {}) {
  const defaultWhat = String(getMessage("errors.guidedDefaultWhat") || "That step did not complete yet.").trim();
  const safeWhat = String(what || defaultWhat).trim();
  const safeWhy = String(why || "").trim();
  const steps = normalizeNextSteps(next);

  log("");
  log(`${colorize(ICONS.error, COLORS.error)} ${safeWhat}`);
  if (safeWhy) {
    log("");
    log(colorize(`  Why: ${safeWhy}`, COLORS.dim));
  }
  if (steps.length) {
    log("");
    log(colorize("  Next:", COLORS.dim));
    for (const step of steps) {
      log(colorize(`  ${ICONS.arrow} ${step}`, COLORS.dim));
    }
  }
  log("");
}

function printError(message, hint = "", tryCmd = "") {
  const fallbackHint = String(getMessage("errors.guidedFallbackHint") || "Droxy could not complete this step yet.").trim();
  const fallbackTry = String(getMessage("errors.guidedFallbackTry") || "Run: droxy help").trim();
  const safeHint = String(hint || "").trim() || fallbackHint;
  const safeTryCmd = String(tryCmd || "").trim();
  const next = [];
  if (safeTryCmd) next.push(`Run: ${safeTryCmd}`);
  else next.push(fallbackTry);
  printGuidedError({
    what: message,
    why: safeHint,
    next,
  });
}

function printTeachingError({ what, why = "", context = "", suggestions = [] }) {
  const next = [];
  if (context) next.push(context);
  next.push(...normalizeNextSteps(suggestions));
  printGuidedError({ what, why, next });
}

function printWarning(message) {
  const safeMessage = String(message || "").trim();
  if (!safeMessage) return;
  log(`${colorize(ICONS.warning, COLORS.warning)} ${safeMessage}`);
}

function printInfo(message) {
  const safeMessage = String(message || "").trim();
  if (!safeMessage) return;
  log(`${colorize(ICONS.info, COLORS.info)} ${safeMessage}`);
}

function printThinkingModeDowngrade({
  modelId = "",
  requestedMode = "",
  fallbackMode = "auto",
  reason = "",
} = {}) {
  const safeModelId = String(modelId || "").trim();
  const safeRequestedMode = String(requestedMode || "").trim().toLowerCase();
  const safeFallbackMode = String(fallbackMode || "").trim().toLowerCase() || "auto";
  if (!safeModelId || !safeRequestedMode) return;

  let detail = "because backend thinking capability could not be verified";
  if (reason === "backend_unsupported") {
    detail = "because backend reports this model does not support advanced thinking modes";
  } else if (reason === "mode_not_allowed") {
    detail = "because backend does not allow this mode for the model";
  }
  printWarning(
    `Thinking mode '${safeRequestedMode}' for ${safeModelId} was downgraded to '${safeFallbackMode}' ${detail}.`
  );
}

function printNextStep(message) {
  const safeMessage = String(message || "").trim();
  if (!safeMessage) return;
  log(colorize(`  Next: ${safeMessage}`, COLORS.dim));
}

function printSmartSuggestion(state) {
  if (!state) return;

  let suggestion = null;
  if (!state.proxyRunning) {
    suggestion = "droxy start";
  } else if (state.providersCount === 0) {
    suggestion = "droxy login";
  } else if (state.modelsCount === 0) {
    suggestion = "droxy (Choose Models auto-syncs Droid)";
  }

  if (!suggestion) return;
  log("");
  log(colorize(`  Next: ${suggestion}`, COLORS.dim));
}

function printDivider(width = 56, char = "─") {
  log(colorize(char.repeat(width), COLORS.dim));
}

function printPreflight({ action, details = [], undoCmd = "" }) {
  log("");
  log(colorize("  About to:", COLORS.dim));
  log(`  ${colorize(ICONS.arrow, COLORS.orange)} ${action}`);
  if (details.length > 0) {
    log("");
    for (const detail of details) {
      log(colorize(`  • ${detail}`, COLORS.dim));
    }
  }
  if (undoCmd) {
    log("");
    log(colorize(`  ↩ Undo: ${undoCmd}`, COLORS.dim));
  }
  log("");
}

function accent(text) {
  return colorize(text, COLORS.orange);
}

function dim(text) {
  return colorize(text, COLORS.dim);
}

module.exports = {
  log,
  logCentered,
  printSuccess,
  printError,
  printGuidedError,
  printTeachingError,
  printWarning,
  printInfo,
  printThinkingModeDowngrade,
  printNextStep,
  printSmartSuggestion,
  printDivider,
  printPreflight,
  accent,
  dim,
};
