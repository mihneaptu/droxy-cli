"use strict";

const SHARED_COLORS = {
  primary: "#FF5C00",
  secondary: "#9D4EDD",
  background: "#0F0F1A",
  text: "#E0E0E0",
  dim: "#5A5A6E",
  success: "#4ADE80",
  warning: "#FFB86C",
  error: "#F87171",
};

const SHARED_MOTION = {
  fastMs: 90,
  normalMs: 180,
  slowMs: 320,
  spinnerIntervalMs: 80,
};

const SHARED_SPACING = {
  xs: 0,
  sm: 1,
  md: 2,
  lg: 3,
  sectionGap: 1,
};

const DESIGN_TOKENS = {
  premium: {
    colors: SHARED_COLORS,
    motion: SHARED_MOTION,
    spacing: SHARED_SPACING,
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
      statusDurationMs: 1100,
      transitionDelayMs: 70,
    },
    voice: {
      style: "anthropic-inspired",
      priorities: [
        "clarity",
        "calm",
        "actionable-next-step",
      ],
    },
  },
  classic: {
    colors: SHARED_COLORS,
    motion: SHARED_MOTION,
    spacing: SHARED_SPACING,
    box: {
      style: "rounded",
      pad: 1,
    },
    header: {
      subtitleSeparator: " • ",
    },
    menu: {
      footerSeparator: "  |  ",
      selectedProgressFormat: "{{selected}}/{{total}} {{label}}",
      statusPrefix: "-> ",
      statusDurationMs: 900,
      transitionDelayMs: 40,
    },
    voice: {
      style: "droid-first",
      priorities: [
        "brevity",
        "predictability",
      ],
    },
  },
};

module.exports = {
  DESIGN_TOKENS,
};
