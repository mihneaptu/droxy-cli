"use strict";

/**
 * ANSI Color Codes - Single warm palette with Droid orange as primary accent.
 */
const COLORS = {
  reset: "\x1b[0m",

  // Brand accent
  orange: "\x1b[38;2;242;123;47m",

  // Semantic colors
  success: "\x1b[38;5;108m",
  warning: "\x1b[38;5;215m",
  error: "\x1b[38;5;203m",
  info: "\x1b[38;5;110m",

  // Text colors
  white: "\x1b[38;5;254m",
  dim: "\x1b[38;5;245m",
  subtle: "\x1b[38;5;245m",
  highlight: "\x1b[1m\x1b[38;5;255m",

  // Aliases for compatibility
  green: "\x1b[38;5;108m",
  blue: "\x1b[38;5;110m",
  magenta: "\x1b[38;5;110m",
  cyan: "\x1b[38;5;80m",
  yellow: "\x1b[38;5;215m",
  purple: "\x1b[38;5;110m",
};

const COLOR_ENABLED = (() => {
  if (process.env.NO_COLOR === "1") return false;
  if (process.env.FORCE_COLOR === "1") return true;
  if (process.env.DROXY_NO_COLOR === "1") return false;
  return Boolean(process.stdout && process.stdout.isTTY === true);
})();

function colorize(text, color) {
  if (!COLOR_ENABLED) return String(text);
  return `${color}${text}${COLORS.reset}`;
}

const c = {
  orange: (text) => colorize(text, COLORS.orange),
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
