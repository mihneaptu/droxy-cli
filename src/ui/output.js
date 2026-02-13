"use strict";

const { COLORS, colorize } = require("./colors");
const { ICONS } = require("./animations");

/**
 * Basic log to stdout
 */
function log(msg = "") {
    process.stdout.write(String(msg) + "\n");
}

/**
 * Log centered text
 */
function logCentered(line, width = 56) {
    const text = String(line).replace(/\x1b\[[0-9;]*m/g, "");
    const padding = Math.max(0, Math.floor((width - text.length) / 2));
    log(" ".repeat(padding) + line);
}

/**
 * Print success message
 */
function printSuccess(message) {
    log(`${colorize(ICONS.success, COLORS.success)} ${message}`);
}

/**
 * Print error message with optional hint and try command
 */
function printError(message, hint = "", tryCmd = "") {
    log(`${colorize(ICONS.error, COLORS.error)} ${message}`);
    if (hint) log(colorize(`  ${hint}`, COLORS.dim));
    if (tryCmd) log(colorize(`  Try: ${tryCmd}`, COLORS.dim));
}

/**
 * Claude-style teaching-moment error
 * Explains what happened, why, and what to do next
 */
function printTeachingError({ what, why = "", context = "", suggestions = [] }) {
    log("");
    log(`${colorize(ICONS.error, COLORS.error)} ${what}`);
    log("");
    if (why) {
        log(colorize(`  ${why}`, COLORS.dim));
    }
    if (context) {
        log(colorize(`  ${context}`, COLORS.dim));
    }
    if (suggestions.length > 0) {
        log("");
        for (const suggestion of suggestions) {
            log(`  ${colorize("→", COLORS.orange)} ${suggestion}`);
        }
    }
    log("");
}

/**
 * Print warning message
 */
function printWarning(message) {
    log(`${colorize(ICONS.warning, COLORS.warning)} ${message}`);
}

/**
 * Print info message
 */
function printInfo(message) {
    log(`${colorize(ICONS.info, COLORS.info)} ${message}`);
}

/**
 * Print next step suggestion
 */
function printNextStep(message) {
    log(colorize(`  Next: ${message}`, COLORS.dim));
}

/**
 * Print smart suggestion based on state
 */
function printSmartSuggestion(state) {
    if (!state) return;

    let suggestion = null;

    if (!state.proxyRunning) {
        suggestion = "droxy start";
    } else if (state.providersCount === 0) {
        suggestion = "droxy login to connect accounts";
    } else if (state.modelsCount === 0) {
        suggestion = "Select models in the menu";
    }

    if (suggestion) {
        log("");
        log(colorize(`  Suggestion: ${suggestion}`, COLORS.dim));
    }
}

/**
 * Print a horizontal divider
 */
function printDivider(width = 56, char = "─") {
    log(colorize(char.repeat(width), COLORS.dim));
}

/**
 * Print preflight info (what will happen)
 */
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

/**
 * Accent text (primary color)
 */
function accent(text) {
    return colorize(text, COLORS.orange);
}

/**
 * Dim text
 */
function dim(text) {
    return colorize(text, COLORS.dim);
}

module.exports = {
    log,
    logCentered,
    printSuccess,
    printError,
    printTeachingError,
    printWarning,
    printInfo,
    printNextStep,
    printSmartSuggestion,
    printDivider,
    printPreflight,
    accent,
    dim,
};
