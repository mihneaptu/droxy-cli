"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const {
  readDroidSyncedModelsByProvider,
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
