"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildProviderModelGroups,
  mergeProviderModelSelection,
} = require("../src/flows/interactiveHelpers");

test("buildProviderModelGroups groups known providers and drops unknown models", () => {
  const groups = buildProviderModelGroups(
    [
      { id: "claude-opus", provider: "anthropic" },
      { id: "gpt-5", provider: "openai" },
      { id: "qwen-max", provider: "qwen" },
      { id: "mystery-model" },
    ],
    [
      { id: "claude", label: "Claude (Anthropic)", connected: true },
      { id: "codex", label: "OpenAI / Codex", connected: false },
      { id: "qwen", label: "Qwen", connected: false },
    ]
  );

  assert.deepEqual(groups.map((group) => group.id), ["claude", "codex", "qwen"]);
  assert.deepEqual(groups[0].models, ["claude-opus"]);
  assert.deepEqual(groups[1].models, ["gpt-5"]);
  assert.equal(groups.some((group) => group.models.includes("mystery-model")), false);
});

test("buildProviderModelGroups prefers model-id family over raw provider tag", () => {
  const groups = buildProviderModelGroups(
    [
      { id: "claude-opus-4-5-thinking", provider: "antigravity" },
      { id: "gemini-2.5-flash", provider: "antigravity" },
      { id: "gpt-5", provider: "antigravity" },
    ],
    [
      { id: "claude", label: "Claude (Anthropic)", connected: true },
      { id: "gemini", label: "Gemini (Google AI)", connected: true },
      { id: "codex", label: "OpenAI / Codex", connected: true },
      { id: "antigravity", label: "Antigravity", connected: true },
    ]
  );

  const byId = new Map(groups.map((group) => [group.id, group.models]));
  assert.deepEqual(byId.get("claude"), ["claude-opus-4-5-thinking"]);
  assert.deepEqual(byId.get("gemini"), ["gemini-2.5-flash"]);
  assert.deepEqual(byId.get("codex"), ["gpt-5"]);
  assert.equal(Array.isArray(byId.get("antigravity")) ? byId.get("antigravity").length : 0, 0);
});

test("buildProviderModelGroups falls back to explicit provider when family provider is not connected", () => {
  const groups = buildProviderModelGroups(
    [
      { model: "gpt-5", provider: "antigravity" },
      { id: "claude-opus-4-5-thinking", provider: "antigravity" },
    ],
    [
      { id: "antigravity", label: "Antigravity", connected: true },
    ]
  );

  assert.deepEqual(groups.map((group) => group.id), ["antigravity"]);
  assert.deepEqual(groups[0].models, ["claude-opus-4-5-thinking", "gpt-5"]);
});

test("mergeProviderModelSelection replaces only selected provider segment", () => {
  const merged = mergeProviderModelSelection(
    ["claude-opus", "claude-sonnet", "gpt-5"],
    ["claude-opus", "claude-sonnet"],
    ["claude-sonnet"]
  );
  assert.deepEqual(merged, ["claude-sonnet", "gpt-5"]);
});

test("mergeProviderModelSelection drops stale provider ids when clearing a provider", () => {
  const merged = mergeProviderModelSelection(
    ["claude-opus-legacy", "gpt-5"],
    ["claude-opus-4-5"],
    [],
    "claude"
  );
  assert.deepEqual(merged, ["gpt-5"]);
});
