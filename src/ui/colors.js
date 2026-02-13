"use strict";

/**
 * ANSI Color Codes - Factory AI Droid Palette
 * Electric Orange, Neon Purple, and supporting colors
 */

const COLORS = {
    reset: "\x1b[0m",

    // Primary palette
    orange: "\x1b[38;5;202m",       // Electric Orange - primary
    purple: "\x1b[38;5;135m",       // Neon Purple - secondary

    // Semantic colors
    success: "\x1b[38;5;114m",      // Muted Sage Green
    warning: "\x1b[38;5;215m",      // Warm Amber
    error: "\x1b[38;5;210m",        // Coral Red
    info: "\x1b[38;5;135m",         // Neon Purple

    // Text colors
    white: "\x1b[38;5;254m",        // Light Grey
    dim: "\x1b[38;5;60m",           // Muted Purple-Grey
    subtle: "\x1b[38;5;60m",        // Same as dim
    highlight: "\x1b[1m\x1b[38;5;255m",

    // Aliases for compatibility
    green: "\x1b[38;5;114m",
    blue: "\x1b[38;5;135m",
    magenta: "\x1b[38;5;135m",
    cyan: "\x1b[38;5;80m",
    yellow: "\x1b[38;5;215m",
};

// Check if colors should be enabled
const COLOR_ENABLED = (() => {
    if (process.env.NO_COLOR === "1") return false;
    if (process.env.FORCE_COLOR === "1") return true;
    if (process.env.DROXY_NO_COLOR === "1") return false;
    return Boolean(process.stdout && process.stdout.isTTY === true);
})();

/**
 * Apply color to text if colors are enabled
 */
function colorize(text, color) {
    if (!COLOR_ENABLED) return String(text);
    return `${color}${text}${COLORS.reset}`;
}

/**
 * Shorthand color functions
 */
const c = {
    orange: (text) => colorize(text, COLORS.orange),
    purple: (text) => colorize(text, COLORS.purple),
    success: (text) => colorize(text, COLORS.success),
    warning: (text) => colorize(text, COLORS.warning),
    error: (text) => colorize(text, COLORS.error),
    info: (text) => colorize(text, COLORS.info),
    dim: (text) => colorize(text, COLORS.dim),
    subtle: (text) => colorize(text, COLORS.subtle),
    highlight: (text) => colorize(text, COLORS.highlight),
};

module.exports = {
    COLORS,
    COLOR_ENABLED,
    colorize,
    c,
};
