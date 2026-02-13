"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");

function readStyleGuide() {
  const styleGuidePath = path.resolve(__dirname, "..", "docs", "DROXY_STYLE_GUIDE.md");
  return fs.readFileSync(styleGuidePath, "utf8");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("CLI style guide keeps required sections", () => {
  const text = readStyleGuide();
  const requiredHeadings = [
    "## Purpose and Scope",
    "## One Style Only",
    "## Claude Brand Psychology Model",
    "## Emotional Jobs of CLI Copy",
    "## Message Ladder (State -> Meaning -> Action)",
    "## Output API Mapping",
    "## Trust Language Rules",
    "## Cognitive Load Rules",
    "## Recovery Copy Framework",
    "## Conversion Without Pressure",
    "## Prohibited Patterns",
    "## Command Reference Style",
    "## Color and Accessibility Rules",
    "## Motion Rules",
    "## Quality Gates",
    "## Research Basis",
  ];

  for (const heading of requiredHeadings) {
    assert.match(text, new RegExp(`^${escapeRegex(heading)}$`, "m"));
  }
});

test("CLI style guide documents no-color behavior and guided error contract", () => {
  const text = readStyleGuide();

  assert.match(text, /NO_COLOR=1/);
  assert.match(text, /DROXY_NO_COLOR=1/);
  assert.match(text, /printGuidedError/);
  assert.match(text, /What happened\./);
  assert.match(text, /Why it happened\./);
  assert.match(text, /Next command\(s\)\./);
});

test("CLI style guide includes research reference links", () => {
  const text = readStyleGuide();
  const requiredLinks = [
    "https://www.anthropic.com/news/claude-is-a-space-to-think",
    "https://claude.com/product/overview",
    "https://www.anthropic.com/constitution",
    "https://www.anthropic.com/company",
    "https://clig.dev/",
    "https://www.gnu.org/prep/standards/html_node/Command_002dLine-Interfaces.html",
    "https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap12.html",
    "https://no-color.org/en/",
  ];

  for (const link of requiredLinks) {
    assert.match(text, new RegExp(escapeRegex(link)));
  }
});
