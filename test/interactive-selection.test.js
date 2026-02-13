"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const {
  promptThinkingModelModes,
  readDroidSyncedModelsByProvider,
  resolveThinkingModelModes,
  resolveThinkingModels,
} = require("../src/flows/interactiveSelection");

test("readDroidSyncedModelsByProvider reads Droxy-managed models from Droid files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "droxy-interactive-selection-"));
  try {
    const settingsPath = path.join(tempDir, "settings.json");
    const configPath = path.join(tempDir, "config.json");

    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          customModels: [
            {
              model: "gpt-5",
              provider: "openai",
              displayName: "Droxy • gpt-5",
              baseUrl: "http://127.0.0.1:8317/v1",
            },
            {
              model: "claude-opus",
              provider: "anthropic",
              displayName: "Droxy • claude-opus",
              baseUrl: "http://127.0.0.1:8317",
            },
          ],
        },
        null,
        2
      ),
      "utf8"
    );

    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          custom_models: [
            {
              model: "gpt-5",
              provider: "openai",
              model_display_name: "Droxy • gpt-5",
              base_url: "http://127.0.0.1:8317/v1",
            },
          ],
        },
        null,
        2
      ),
      "utf8"
    );

    const counts = readDroidSyncedModelsByProvider({
      config: {
        readConfigValues: () => ({ host: "127.0.0.1", port: 8317 }),
      },
      sync: {
        getDroidManagedPaths: () => [settingsPath, configPath, path.join(tempDir, "config.json.bak")],
        isDroxyManagedEntry: () => true,
      },
    });

    assert.equal(counts.codex, 1);
    assert.equal(counts.claude, 1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("readDroidSyncedModelsByProvider falls back to model id when provider tag is generic", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "droxy-interactive-selection-"));
  try {
    const settingsPath = path.join(tempDir, "settings.json");

    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          customModels: [
            {
              model: "gemini-2.5-flash",
              provider: "openai",
              displayName: "Droxy • gemini-2.5-flash",
              baseUrl: "http://127.0.0.1:8317/v1",
            },
          ],
        },
        null,
        2
      ),
      "utf8"
    );

    const counts = readDroidSyncedModelsByProvider({
      config: {
        readConfigValues: () => ({ host: "127.0.0.1", port: 8317 }),
      },
      sync: {
        getDroidManagedPaths: () => [settingsPath],
        isDroxyManagedEntry: () => true,
      },
    });

    assert.equal(counts.gemini, 1);
    assert.equal(counts.codex || 0, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("readDroidSyncedModelsByProvider collapses thinking suffix variants to base model ids", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "droxy-interactive-selection-"));
  try {
    const settingsPath = path.join(tempDir, "settings.json");

    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          customModels: [
            {
              model: "gpt-5(low)",
              provider: "openai",
              displayName: "Droxy • gpt-5(low)",
              baseUrl: "http://127.0.0.1:8317/v1",
            },
            {
              model: "gpt-5(high)",
              provider: "openai",
              displayName: "Droxy • gpt-5(high)",
              baseUrl: "http://127.0.0.1:8317/v1",
            },
            {
              model: "gpt-5",
              provider: "openai",
              displayName: "Droxy • gpt-5",
              baseUrl: "http://127.0.0.1:8317/v1",
            },
          ],
        },
        null,
        2
      ),
      "utf8"
    );

    const counts = readDroidSyncedModelsByProvider({
      config: {
        readConfigValues: () => ({ host: "127.0.0.1", port: 8317 }),
      },
      sync: {
        getDroidManagedPaths: () => [settingsPath],
        isDroxyManagedEntry: () => true,
      },
    });

    assert.equal(counts.codex, 1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("resolveThinkingModels defaults to explicit thinking/reasoning markers only", () => {
  const models = resolveThinkingModels(
    ["o3", "deepseek-r1", "claude-opus-4-6-thinking", "model-reasoning", "gpt-5"],
    [],
    { hasSavedThinkingSelection: false }
  );

  assert.deepEqual(models, ["claude-opus-4-6-thinking", "model-reasoning"]);
});

test("resolveThinkingModels preserves saved thinking selection when present", () => {
  const models = resolveThinkingModels(
    ["claude-opus-4-6-thinking", "model-reasoning", "gpt-5"],
    ["model-reasoning", "gpt-5"],
    { hasSavedThinkingSelection: true }
  );

  assert.deepEqual(models, ["gpt-5", "model-reasoning"]);
});

test("resolveThinkingModelModes keeps saved mode and defaults missing mode to medium", () => {
  const modes = resolveThinkingModelModes(
    ["gpt-5", "claude-opus"],
    { "gpt-5": "high", "claude-opus": "invalid" }
  );

  assert.deepEqual(modes, {
    "gpt-5": "high",
    "claude-opus": "medium",
  });
});

test("promptThinkingModelModes keeps current mode when selection is cancelled", async () => {
  const calls = [];
  const modes = await promptThinkingModelModes(
    {
      selectSingle: async (payload) => {
        calls.push(payload.title);
        return { cancelled: true, index: -1, value: "" };
      },
    },
    ["gpt-5"],
    { "gpt-5": "low" }
  );

  assert.deepEqual(calls, ["Thinking mode • gpt-5"]);
  assert.deepEqual(modes, { "gpt-5": "low" });
});

test("promptThinkingModelModes exposes full thinking mode menu", async () => {
  const menuPayloads = [];
  await promptThinkingModelModes(
    {
      selectSingle: async (payload) => {
        menuPayloads.push(payload);
        return { cancelled: true, index: -1, value: "" };
      },
    },
    ["gpt-5"],
    { "gpt-5": "medium" }
  );

  assert.equal(menuPayloads.length, 1);
  assert.deepEqual(menuPayloads[0].items, [
    "Auto",
    "Minimal",
    "Low",
    "Medium",
    "High",
    "Xhigh",
    "None",
  ]);
});
