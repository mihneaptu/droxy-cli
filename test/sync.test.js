"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const sync = require("../src/sync");

function withTempFactoryDir() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "droxy-factory-"));
  const previous = process.env.DROXY_FACTORY_DIR;
  process.env.DROXY_FACTORY_DIR = tempDir;
  return () => {
    if (previous === undefined) delete process.env.DROXY_FACTORY_DIR;
    else process.env.DROXY_FACTORY_DIR = previous;
    fs.rmSync(tempDir, { recursive: true, force: true });
  };
}

test("updateFactorySettingsCustomModels preserves non-Droxy entries", () => {
  const cleanup = withTempFactoryDir();
  try {
    const settingsPath = path.join(process.env.DROXY_FACTORY_DIR, "settings.json");
    fs.mkdirSync(process.env.DROXY_FACTORY_DIR, { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          customModels: [
            {
              model: "local-model",
              displayName: "My Local Model",
              baseUrl: "https://example.com",
              apiKey: "abc",
              provider: "openai",
            },
            {
              model: "old-droxy",
              displayName: "Droxy • old-droxy",
              baseUrl: "http://127.0.0.1:8317/v1",
              apiKey: "old",
              provider: "openai",
            },
          ],
        },
        null,
        2
      ),
      "utf8"
    );

    sync.updateFactorySettingsCustomModels({
      host: "127.0.0.1",
      port: 8317,
      entries: [
        {
          model: "gpt-5-codex",
          model_display_name: "Droxy • gpt-5-codex",
          base_url: "http://127.0.0.1:8317/v1",
          api_key: "new",
          provider: "openai",
        },
      ],
    });

    const root = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const models = (root.customModels || []).map((entry) => entry.model);
    assert.equal(models.includes("local-model"), true);
    assert.equal(models.includes("old-droxy"), false);
    assert.equal(models.includes("gpt-5-codex"), true);
  } finally {
    cleanup();
  }
});

test("updateFactoryConfigCustomModels preserves non-Droxy entries and creates backup", () => {
  const cleanup = withTempFactoryDir();
  try {
    const configPath = path.join(process.env.DROXY_FACTORY_DIR, "config.json");
    const backupPath = path.join(process.env.DROXY_FACTORY_DIR, "config.json.bak");

    fs.mkdirSync(process.env.DROXY_FACTORY_DIR, { recursive: true });
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          custom_models: [
            {
              model: "non-droxy",
              model_display_name: "Custom Existing",
              base_url: "https://example.com",
              api_key: "x",
              provider: "openai",
            },
            {
              model: "old-droxy",
              model_display_name: "Droxy • old-droxy",
              base_url: "http://127.0.0.1:8317",
              api_key: "old",
              provider: "anthropic",
            },
          ],
        },
        null,
        2
      ),
      "utf8"
    );

    sync.updateFactoryConfigCustomModels({
      host: "127.0.0.1",
      port: 8317,
      entries: [
        {
          model: "claude-opus",
          model_display_name: "Droxy • claude-opus",
          base_url: "http://127.0.0.1:8317",
          api_key: "new",
          provider: "anthropic",
        },
      ],
    });

    const root = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const models = (root.custom_models || []).map((entry) => entry.model);
    assert.equal(models.includes("non-droxy"), true);
    assert.equal(models.includes("old-droxy"), false);
    assert.equal(models.includes("claude-opus"), true);
    assert.equal(fs.existsSync(backupPath), true);
  } finally {
    cleanup();
  }
});

test("getDroidManagedPaths uses DROXY_FACTORY_DIR override", () => {
  const cleanup = withTempFactoryDir();
  try {
    const paths = sync.getDroidManagedPaths();
    assert.deepEqual(paths, [
      path.join(process.env.DROXY_FACTORY_DIR, "settings.json"),
      path.join(process.env.DROXY_FACTORY_DIR, "config.json"),
      path.join(process.env.DROXY_FACTORY_DIR, "config.json.bak"),
    ]);
  } finally {
    cleanup();
  }
});

test("splitModelsForFactoryEntries classifies providers", () => {
  const split = sync.splitModelsForFactoryEntries([
    { id: "gpt-5", provider: "openai" },
    { id: "claude-opus", provider: "anthropic" },
    { id: "claude-sonnet", provider: "claude" },
  ]);

  assert.deepEqual(split.openai, ["gpt-5"]);
  assert.deepEqual(split.anthropic, ["claude-opus", "claude-sonnet"]);
});

test("filterDetectedEntriesBySelection keeps only explicitly selected models", () => {
  const result = sync.filterDetectedEntriesBySelection(
    [
      { id: "gpt-5", provider: "openai" },
      { id: "claude-opus", provider: "anthropic" },
      { id: "claude-sonnet", provider: "anthropic" },
    ],
    ["claude-opus", "missing-model"]
  );

  assert.deepEqual(result.selectedIds, ["claude-opus", "missing-model"]);
  assert.equal(result.skippedCount, 1);
  assert.deepEqual(result.entries.map((entry) => entry.id), ["claude-opus"]);
});

test("filterDetectedEntriesBySelection is a no-op when no selection is provided", () => {
  const entries = [{ id: "gpt-5" }, { id: "claude-opus" }];
  const result = sync.filterDetectedEntriesBySelection(entries, []);
  assert.deepEqual(result.entries, entries);
  assert.deepEqual(result.selectedIds, []);
  assert.equal(result.skippedCount, 0);
});
