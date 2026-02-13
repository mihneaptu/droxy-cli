"use strict";

const CLAUDE_COLORS = {
  accent: "#F27B2F",
  neutral: "#334155",
  background: "#F8FAFC",
  text: "#0F172A",
  dim: "#64748B",
  success: "#166534",
  warning: "#A16207",
  error: "#B91C1C",
  info: "#1D4ED8",
};

const CLAUDE_MOTION = {
  fastMs: 80,
  normalMs: 160,
  slowMs: 280,
  spinnerIntervalMs: 90,
};

const CLAUDE_SPACING = {
  xs: 0,
  sm: 1,
  md: 2,
  lg: 3,
  sectionGap: 1,
};

const CLAUDE_DESIGN_TOKENS = {
  colors: CLAUDE_COLORS,
  motion: CLAUDE_MOTION,
  spacing: CLAUDE_SPACING,
  box: {
    style: "rounded",
    pad: 1,
  },
  header: {
    subtitleSeparator: " | ",
  },
  menu: {
    footerSeparator: "  ·  ",
    selectedProgressFormat: "{{selected}}/{{total}} {{label}}",
    statusPrefix: "› ",
    statusDurationMs: 1000,
    transitionDelayMs: 60,
  },
  voice: {
    style: "anthropic-inspired",
    priorities: [
      "clear-with-context",
      "calm-under-failure",
      "specific-next-command",
      "honest-uncertainty",
    ],
  },
};

const DESIGN_TOKENS = {
  claude: CLAUDE_DESIGN_TOKENS,
};

module.exports = {
  CLAUDE_DESIGN_TOKENS,
  DESIGN_TOKENS,
};
