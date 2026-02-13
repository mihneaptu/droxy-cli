"use strict";

const DESIGN_TOKENS = {
  premium: {
    colors: {
      primary: "#FF5C00",
      secondary: "#9D4EDD",
      background: "#0F0F1A",
      text: "#E0E0E0",
      dim: "#5A5A6E",
      success: "#4ADE80",
      warning: "#FFB86C",
      error: "#F87171",
    },
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
    spacing: {
      sectionGap: 1,
    },
  },
  classic: {
    colors: {
      primary: "#FF5C00",
      secondary: "#9D4EDD",
      background: "#0F0F1A",
      text: "#E0E0E0",
      dim: "#5A5A6E",
      success: "#4ADE80",
      warning: "#FFB86C",
      error: "#F87171",
    },
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
    spacing: {
      sectionGap: 1,
    },
  },
};

module.exports = {
  DESIGN_TOKENS,
};
