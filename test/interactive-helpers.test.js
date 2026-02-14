"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildProviderModelGroups,
  mergeProviderModelSelection,
} = require("../src/flows/interactiveHelpers");

test("buildProviderModelGroups groups known providers and sends unknown metadata to unknown bucket", () => {
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

  assert.deepEqual(groups.map((group) => group.id), ["claude", "codex", "qwen", "unknown"]);
  assert.deepEqual(groups[0].models, ["claude-opus"]);
  assert.deepEqual(groups[1].models, ["gpt-5"]);
  assert.deepEqual(groups[3].models, ["mystery-model"]);
});

test("buildProviderModelGroups prefers explicit provider metadata over model-id family", () => {
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
  assert.deepEqual(byId.get("antigravity"), [
    "claude-opus-4-5-thinking",
    "gemini-2.5-flash",
    "gpt-5",
  ]);
  assert.equal(Array.isArray(byId.get("claude")) ? byId.get("claude").length : 0, 0);
  assert.equal(Array.isArray(byId.get("gemini")) ? byId.get("gemini").length : 0, 0);
  assert.equal(Array.isArray(byId.get("codex")) ? byId.get("codex").length : 0, 0);
});

test("buildProviderModelGroups routes metadata-missing models to unknown bucket", () => {
  const groups = buildProviderModelGroups(
    [
      { id: "gpt-5.1-codex" },
      { model: "claude-opus-4-5-thinking" },
    ],
    [
      { id: "codex", label: "OpenAI / Codex", connected: true },
      { id: "claude", label: "Claude (Anthropic)", connected: true },
    ]
  );

  const byId = new Map(groups.map((group) => [group.id, group.models]));
  assert.deepEqual(byId.get("unknown"), ["claude-opus-4-5-thinking", "gpt-5.1-codex"]);
  assert.equal(Array.isArray(byId.get("claude")) ? byId.get("claude").length : 0, 0);
  assert.equal(Array.isArray(byId.get("codex")) ? byId.get("codex").length : 0, 0);
});

test("buildProviderModelGroups keeps gpt-oss antigravity models in antigravity group", () => {
  const groups = buildProviderModelGroups(
    [{ id: "gpt-oss-120b-medium", owned_by: "antigravity" }],
    [{ id: "antigravity", label: "Antigravity", connected: true }]
  );

  assert.deepEqual(groups.map((group) => group.id), ["antigravity"]);
  assert.deepEqual(groups[0].models, ["gpt-oss-120b-medium"]);
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

test("mergeProviderModelSelection keeps unclassified stale ids when clearing a provider", () => {
  const merged = mergeProviderModelSelection(
    ["claude-opus-legacy", "gpt-5"],
    ["claude-opus-4-5"],
    [],
    "claude"
  );
  assert.deepEqual(merged, ["claude-opus-legacy", "gpt-5"]);
});

test("mergeProviderModelSelection drops persisted provider models even when hints mismatch provider id", () => {
  const merged = mergeProviderModelSelection(
    ["gemini-3-flash", "gpt-oss-120b-medium", "gpt-5"],
    ["gemini-3-pro-high"],
    [],
    "antigravity",
    ["gemini-3-flash", "gpt-oss-120b-medium"]
  );
  assert.deepEqual(merged, ["gpt-5"]);
});
