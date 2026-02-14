"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("events");
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

function createRequestMock(payload, statusCode = 200) {
  return {
    request: (_url, _options, callback) => {
      const req = new EventEmitter();
      req.setTimeout = () => {};
      req.destroy = (err) => {
        if (err) {
          process.nextTick(() => req.emit("error", err));
        }
      };
      req.end = () => {
        process.nextTick(() => {
          const res = new EventEmitter();
          res.statusCode = statusCode;
          callback(res);
          const body = typeof payload === "string" ? payload : JSON.stringify(payload);
          res.emit("data", body);
          res.emit("end");
        });
      };
      return req;
    },
  };
}

function createRouteRequestMock(routes = {}, defaultStatusCode = 404) {
  return {
    request: (url, options, callback) => {
      const req = new EventEmitter();
      req.setTimeout = () => {};
      req.destroy = (err) => {
        if (err) {
          process.nextTick(() => req.emit("error", err));
        }
      };
      req.end = () => {
        process.nextTick(() => {
          const pathname = new URL(url).pathname;
          const routeDef = Object.prototype.hasOwnProperty.call(routes, pathname)
            ? routes[pathname]
            : null;
          const route =
            typeof routeDef === "function"
              ? routeDef({ url, options, pathname })
              : routeDef;
          const response = route || { statusCode: defaultStatusCode, body: { error: "not found" } };
          const res = new EventEmitter();
          res.statusCode = Number(response.statusCode) || 200;
          callback(res);
          const body =
            typeof response.body === "string" ? response.body : JSON.stringify(response.body);
          res.emit("data", body);
          res.emit("end");
        });
      };
      return req;
    },
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
          sessionDefaultSettings: {
            model: "custom:old-droxy",
          },
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
    assert.equal(root.sessionDefaultSettings.model, "custom:gpt-5-codex");
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

test("isDroxyManagedEntry requires base_url match and ignores Droxy name prefix alone", () => {
  assert.equal(
    sync.isDroxyManagedEntry(
      {
        displayName: "Droxy • gpt-5",
        baseUrl: "https://example.com",
      },
      "127.0.0.1",
      8317
    ),
    false
  );
  assert.equal(
    sync.isDroxyManagedEntry(
      {
        model_display_name: "Droxy • gpt-5",
      },
      "127.0.0.1",
      8317
    ),
    false
  );
  assert.equal(
    sync.isDroxyManagedEntry(
      {
        base_url: "http://127.0.0.1:8317/v1",
      },
      "127.0.0.1",
      8317
    ),
    true
  );
});

test("splitModelsForFactoryEntries classifies providers", () => {
  const split = sync.splitModelsForFactoryEntries([
    { id: "gpt-5", provider: "openai" },
    { id: "claude-opus", provider: "anthropic" },
    { id: "claude-sonnet", provider: "claude" },
  ]);

  assert.deepEqual(split.openai, ["gpt-5"]);
  assert.deepEqual(split.anthropic, ["claude-opus", "claude-sonnet"]);
  assert.deepEqual(split.byProvider, {
    codex: ["gpt-5"],
    claude: ["claude-opus", "claude-sonnet"],
  });
});

test("splitModelsForFactoryEntries keeps antigravity ownership for gpt-oss while preserving factory compatibility", () => {
  const split = sync.splitModelsForFactoryEntries([
    { id: "gpt-oss-120b-medium", owned_by: "antigravity" },
    { id: "gemini-3-flash", owned_by: "antigravity" },
  ]);

  assert.deepEqual(split.openai, ["gpt-oss-120b-medium", "gemini-3-flash"]);
  assert.deepEqual(split.anthropic, []);
  assert.deepEqual(split.byProvider, {
    antigravity: ["gemini-3-flash", "gpt-oss-120b-medium"],
  });
});

test("splitModelsForFactoryEntries prefers explicit owner metadata for duplicate ids", () => {
  const split = sync.splitModelsForFactoryEntries([
    { id: "gpt-oss-120b-medium" },
    { id: "gpt-oss-120b-medium", owned_by: "antigravity" },
  ]);

  assert.deepEqual(split.openai, ["gpt-oss-120b-medium"]);
  assert.deepEqual(split.anthropic, []);
  assert.deepEqual(split.byProvider, {
    antigravity: ["gpt-oss-120b-medium"],
  });
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

test("filterDetectedEntriesBySelection treats explicit empty selection as clear", () => {
  const entries = [{ id: "gpt-5" }, { id: "claude-opus" }];
  const result = sync.filterDetectedEntriesBySelection(entries, [], {
    explicitSelection: true,
  });
  assert.deepEqual(result.entries, []);
  assert.deepEqual(result.selectedIds, []);
  assert.equal(result.skippedCount, 0);
});

test("fetchAvailableModelEntries filters explicitly unavailable models from API metadata", async () => {
  const api = sync.createSyncApi({
    http: createRequestMock({
      data: [
        { id: "gpt-5", provider: "openai", available: true },
        { id: "gpt-5.3-codex-spark", provider: "openai", available: false },
      ],
    }),
  });

  const entries = await api.fetchAvailableModelEntries(
    { host: "127.0.0.1", port: 8317, tlsEnabled: false, apiKey: "" },
    { protocolResolution: { reachable: true, protocol: "http" }, state: {} }
  );

  assert.deepEqual(entries.map((entry) => entry.id), ["gpt-5"]);
  assert.equal(entries[0].entitlement.allow, true);
});

test("fetchAvailableModelEntries allows models with unknown entitlement metadata", async () => {
  const api = sync.createSyncApi({
    http: createRequestMock({
      data: [{ id: "gpt-5-mini", provider: "openai" }],
    }),
  });

  const entries = await api.fetchAvailableModelEntries(
    { host: "127.0.0.1", port: 8317, tlsEnabled: false, apiKey: "" },
    { protocolResolution: { reachable: true, protocol: "http" }, state: {} }
  );

  assert.deepEqual(entries.map((entry) => entry.id), ["gpt-5-mini"]);
});

test("fetchAvailableModelEntries filters models with restricted status hints", async () => {
  const api = sync.createSyncApi({
    http: createRequestMock({
      data: [
        { id: "gpt-5", provider: "openai", status: "available" },
        { id: "gpt-5.3-codex-spark", provider: "openai", meta: { availability: "restricted" } },
      ],
    }),
  });

  const entries = await api.fetchAvailableModelEntries(
    { host: "127.0.0.1", port: 8317, tlsEnabled: false, apiKey: "" },
    { protocolResolution: { reachable: true, protocol: "http" }, state: {} }
  );

  assert.deepEqual(entries.map((entry) => entry.id), ["gpt-5"]);
});

test("fetchAvailableModelEntries continues entitlement fallback when earlier hints are null", async () => {
  const api = sync.createSyncApi({
    http: createRequestMock({
      data: [
        { id: "gpt-5", provider: "openai", available: true },
        {
          id: "gpt-5.3-codex-spark",
          provider: "openai",
          restricted: null,
          meta: { restricted: true },
        },
      ],
    }),
  });

  const entries = await api.fetchAvailableModelEntries(
    { host: "127.0.0.1", port: 8317, tlsEnabled: false, apiKey: "" },
    { protocolResolution: { reachable: true, protocol: "http" }, state: {} }
  );

  assert.deepEqual(entries.map((entry) => entry.id), ["gpt-5"]);
});

test("fetchAvailableModelEntries excludes models from oauth-excluded-models management endpoint", async () => {
  const api = sync.createSyncApi({
    http: createRouteRequestMock({
      "/v1/models": {
        statusCode: 200,
        body: {
          data: [
            { id: "gpt-5", provider: "openai" },
            { id: "gpt-5.3-codex-spark", provider: "openai" },
          ],
        },
      },
      "/v0/management/oauth-excluded-models": {
        statusCode: 200,
        body: {
          "oauth-excluded-models": {
            openai: ["gpt-5.3-codex-spark"],
          },
        },
      },
    }),
  });

  const entries = await api.fetchAvailableModelEntries(
    { host: "127.0.0.1", port: 8317, tlsEnabled: false, apiKey: "" },
    {
      protocolResolution: { reachable: true, protocol: "http" },
      state: { managementKey: "mgmt-secret" },
    }
  );

  assert.deepEqual(entries.map((entry) => entry.id), ["gpt-5"]);
});

test("fetchAvailableModelEntries excludes slash-delimited model IDs from oauth-excluded-models endpoint", async () => {
  const api = sync.createSyncApi({
    http: createRouteRequestMock({
      "/v1/models": {
        statusCode: 200,
        body: {
          data: [
            { id: "openai/gpt-5", provider: "openai" },
            { id: "gpt-5.3-codex-spark", provider: "openai" },
          ],
        },
      },
      "/v0/management/oauth-excluded-models": {
        statusCode: 200,
        body: {
          "oauth-excluded-models": {
            openai: ["openai/gpt-5"],
          },
        },
      },
    }),
  });

  const entries = await api.fetchAvailableModelEntries(
    { host: "127.0.0.1", port: 8317, tlsEnabled: false, apiKey: "" },
    {
      protocolResolution: { reachable: true, protocol: "http" },
      state: { managementKey: "mgmt-secret" },
    }
  );

  assert.deepEqual(entries.map((entry) => entry.id), ["gpt-5.3-codex-spark"]);
});

test("fetchAvailableModelEntries falls back to auth-files exclusion when oauth-excluded-models is empty", async () => {
  const api = sync.createSyncApi({
    http: createRouteRequestMock({
      "/v1/models": {
        statusCode: 200,
        body: {
          data: [
            { id: "gpt-5", provider: "openai" },
            { id: "gpt-5.3-codex-spark", provider: "openai" },
          ],
        },
      },
      "/v0/management/oauth-excluded-models": {
        statusCode: 200,
        body: { "oauth-excluded-models": null },
      },
      "/v0/management/auth-files": {
        statusCode: 200,
        body: {
          files: [
            {
              provider: "codex",
              status_message:
                "{\"detail\":\"The 'gpt-5.3-codex-spark' model is not supported when using Codex with a ChatGPT account.\"}",
            },
          ],
        },
      },
    }),
  });

  const entries = await api.fetchAvailableModelEntries(
    { host: "127.0.0.1", port: 8317, tlsEnabled: false, apiKey: "" },
    {
      protocolResolution: { reachable: true, protocol: "http" },
      state: { managementKey: "mgmt-secret" },
    }
  );

  assert.deepEqual(entries.map((entry) => entry.id), ["gpt-5"]);
});

test("fetchAvailableModelEntries falls back to auth-files exclusion when oauth-excluded-models errors", async () => {
  const api = sync.createSyncApi({
    http: createRouteRequestMock({
      "/v1/models": {
        statusCode: 200,
        body: {
          data: [
            { id: "gpt-5", provider: "openai" },
            { id: "gpt-5.3-codex-spark", provider: "openai" },
          ],
        },
      },
      "/v0/management/oauth-excluded-models": {
        statusCode: 500,
        body: { error: "proxy unavailable" },
      },
      "/v0/management/auth-files": {
        statusCode: 200,
        body: {
          files: [
            {
              provider: "openai",
              status_message:
                "{\"detail\":\"The 'gpt-5.3-codex-spark' model is not supported when using Codex with a ChatGPT account.\"}",
            },
          ],
        },
      },
    }),
    output: {
      printWarning: () => {},
    },
  });

  const entries = await api.fetchAvailableModelEntries(
    { host: "127.0.0.1", port: 8317, tlsEnabled: false, apiKey: "" },
    {
      protocolResolution: { reachable: true, protocol: "http" },
      state: { managementKey: "mgmt-secret" },
    }
  );

  assert.deepEqual(entries.map((entry) => entry.id), ["gpt-5"]);
});

test("fetchAvailableModelEntries warns when oauth exclusions fail before auth-files fallback", async () => {
  const warnings = [];
  const api = sync.createSyncApi({
    http: createRouteRequestMock({
      "/v1/models": {
        statusCode: 200,
        body: {
          data: [
            { id: "gpt-5", provider: "openai" },
            { id: "gpt-5.3-codex-spark", provider: "openai" },
          ],
        },
      },
      "/v0/management/oauth-excluded-models": {
        statusCode: 500,
        body: { error: "proxy unavailable" },
      },
      "/v0/management/auth-files": {
        statusCode: 200,
        body: {
          files: [
            {
              provider: "openai",
              status_message:
                "{\"detail\":\"The 'gpt-5.3-codex-spark' model is not supported when using Codex with a ChatGPT account.\"}",
            },
          ],
        },
      },
    }),
    output: {
      printWarning: (message) => warnings.push(String(message)),
    },
  });

  const entries = await api.fetchAvailableModelEntries(
    { host: "127.0.0.1", port: 8317, tlsEnabled: false, apiKey: "" },
    {
      protocolResolution: { reachable: true, protocol: "http" },
      state: { managementKey: "mgmt-secret" },
    }
  );

  assert.deepEqual(entries.map((entry) => entry.id), ["gpt-5"]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /oauth-excluded-models/i);
  assert.match(warnings[0], /auth-files/i);
});

test("fetchAvailableModelEntries warns and continues when management exclusion endpoints fail", async () => {
  const warnings = [];
  const api = sync.createSyncApi({
    http: createRouteRequestMock({
      "/v1/models": {
        statusCode: 200,
        body: {
          data: [
            { id: "gpt-5", provider: "openai" },
            { id: "gpt-5.3-codex-spark", provider: "openai" },
          ],
        },
      },
      "/v0/management/oauth-excluded-models": {
        statusCode: 500,
        body: { error: "proxy unavailable" },
      },
      "/v0/management/auth-files": {
        statusCode: 500,
        body: { error: "proxy unavailable" },
      },
    }),
    output: {
      printWarning: (message) => warnings.push(String(message)),
    },
  });

  const entries = await api.fetchAvailableModelEntries(
    { host: "127.0.0.1", port: 8317, tlsEnabled: false, apiKey: "" },
    {
      protocolResolution: { reachable: true, protocol: "http" },
      state: { managementKey: "mgmt-secret" },
    }
  );

  assert.deepEqual(entries.map((entry) => entry.id), ["gpt-5", "gpt-5.3-codex-spark"]);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /oauth-excluded-models/i);
  assert.match(warnings[1], /continuing without management exclusions/i);
});

test("fetchAvailableModelEntries excludes auth-files model IDs when status payload splits hint and model", async () => {
  const api = sync.createSyncApi({
    http: createRouteRequestMock({
      "/v1/models": {
        statusCode: 200,
        body: {
          data: [
            { id: "gpt-5", provider: "openai" },
            { id: "gpt-5.3-codex-spark", provider: "openai" },
          ],
        },
      },
      "/v0/management/oauth-excluded-models": {
        statusCode: 500,
        body: { error: "proxy unavailable" },
      },
      "/v0/management/auth-files": {
        statusCode: 200,
        body: {
          files: [
            {
              provider: "openai",
              status_message: {
                detail: "This model is not supported when using Codex with a ChatGPT account.",
                model: "gpt-5.3-codex-spark",
              },
            },
          ],
        },
      },
    }),
    output: {
      printWarning: () => {},
    },
  });

  const entries = await api.fetchAvailableModelEntries(
    { host: "127.0.0.1", port: 8317, tlsEnabled: false, apiKey: "" },
    {
      protocolResolution: { reachable: true, protocol: "http" },
      state: { managementKey: "mgmt-secret" },
    }
  );

  assert.deepEqual(entries.map((entry) => entry.id), ["gpt-5"]);
});

test("fetchAvailableModelEntries excludes slash-delimited auth-files model IDs when oauth-excluded-models errors", async () => {
  const api = sync.createSyncApi({
    http: createRouteRequestMock({
      "/v1/models": {
        statusCode: 200,
        body: {
          data: [
            { id: "openai/gpt-5", provider: "openai" },
            { id: "gpt-5", provider: "openai" },
          ],
        },
      },
      "/v0/management/oauth-excluded-models": {
        statusCode: 500,
        body: { error: "proxy unavailable" },
      },
      "/v0/management/auth-files": {
        statusCode: 200,
        body: {
          files: [
            {
              provider: "openai",
              status_message:
                "{\"detail\":\"The 'openai/gpt-5' model is not supported when using Codex with a ChatGPT account.\"}",
            },
          ],
        },
      },
    }),
    output: {
      printWarning: () => {},
    },
  });

  const entries = await api.fetchAvailableModelEntries(
    { host: "127.0.0.1", port: 8317, tlsEnabled: false, apiKey: "" },
    {
      protocolResolution: { reachable: true, protocol: "http" },
      state: { managementKey: "mgmt-secret" },
    }
  );

  assert.deepEqual(entries.map((entry) => entry.id), ["gpt-5"]);
});

test("fetchAvailableModelEntries uses plaintext management key from state when config key is hashed", async () => {
  const api = sync.createSyncApi({
    http: createRouteRequestMock({
      "/v1/models": {
        statusCode: 200,
        body: {
          data: [
            { id: "gpt-5", provider: "openai" },
            { id: "gpt-5.3-codex-spark", provider: "openai" },
          ],
        },
      },
      "/v0/management/oauth-excluded-models": ({ options }) => {
        const authHeader = String((options && options.headers && options.headers.Authorization) || "");
        if (authHeader !== "Bearer mgmt-live-key") {
          return { statusCode: 401, body: { error: "invalid management key" } };
        }
        return {
          statusCode: 200,
          body: {
            "oauth-excluded-models": {
              openai: ["gpt-5.3-codex-spark"],
            },
          },
        };
      },
    }),
  });

  const entries = await api.fetchAvailableModelEntries(
    {
      host: "127.0.0.1",
      port: 8317,
      tlsEnabled: false,
      apiKey: "",
      managementKey: "$2a$10$6HhG4ck7YQeJRXv.L4sROec3r0WvN3hc4YrRE1aD4ogTXxPKX2zoW",
    },
    {
      protocolResolution: { reachable: true, protocol: "http" },
      state: { managementKey: "mgmt-live-key" },
    }
  );

  assert.deepEqual(entries.map((entry) => entry.id), ["gpt-5"]);
});

test("fetchProviderConnectionStatus reads verified provider connection states from auth-files endpoint", async () => {
  const api = sync.createSyncApi({
    http: createRouteRequestMock({
      "/v0/management/auth-files": {
        statusCode: 200,
        body: {
          files: [
            { provider: "openai", status: "active" },
            { provider: "anthropic", authenticated: false },
            { provider: "qwen", status: "connected" },
            { provider: "iflow", status: "error" },
            { provider: "gemini-cli", status: "active" },
          ],
        },
      },
    }),
  });

  const status = await api.fetchProviderConnectionStatus(
    {
      host: "127.0.0.1",
      port: 8317,
      tlsEnabled: false,
      managementKey: "mgmt",
    },
    { protocol: "http" }
  );

  assert.equal(status.providersState, "verified");
  assert.equal(status.providersConnected, 3);
  assert.deepEqual(status.byProvider, {
    codex: { connected: true, connectionState: "connected", verified: true },
    claude: { connected: false, connectionState: "disconnected", verified: true },
    qwen: { connected: true, connectionState: "connected", verified: true },
    iflow: { connected: false, connectionState: "disconnected", verified: true },
    gemini: { connected: true, connectionState: "connected", verified: true },
  });
});

test("fetchProviderConnectionStatusSafe returns unknown when management key is unavailable", async () => {
  const api = sync.createSyncApi({
    config: {
      readState: () => ({}),
    },
    http: createRouteRequestMock({
      "/v0/management/auth-files": {
        statusCode: 200,
        body: { files: [{ provider: "openai", connected: true }] },
      },
    }),
  });
  const status = await api.fetchProviderConnectionStatusSafe({
    host: "127.0.0.1",
    port: 8317,
    tlsEnabled: false,
    managementKey: "",
  });
  assert.deepEqual(status, {
    providersState: "unknown",
    providersConnected: 0,
    byProvider: {},
  });
});

test("syncDroidSettings writes files from provided detected entries without network probe", async () => {
  const cleanup = withTempFactoryDir();
  try {
    let updatedState = null;
    const failRequest = () => {
      throw new Error("network should not be used");
    };

    const api = sync.createSyncApi({
      config: {
        DEFAULT_PORT: 8317,
        configExists: () => true,
        ensureDir: (dirPath) => fs.mkdirSync(dirPath, { recursive: true }),
        readConfigValues: () => ({
          host: "127.0.0.1",
          port: 8317,
          tlsEnabled: false,
          apiKey: "k",
        }),
        readState: () => ({ apiKey: "k" }),
        updateState: (patch) => {
          updatedState = patch;
          return patch;
        },
      },
      http: { request: failRequest },
      https: { request: failRequest },
      output: {
        printGuidedError: () => {},
        printSuccess: () => {},
      },
    });

    const result = await api.syncDroidSettings({
      quiet: true,
      selectedModels: ["gpt-5"],
      detectedEntries: [{ id: "gpt-5", provider: "openai" }],
      protocol: "http",
    });

    assert.equal(result.success, true);
    assert.equal(result.result && result.result.status, "synced");
    const configPath = path.join(process.env.DROXY_FACTORY_DIR, "config.json");
    const settingsPath = path.join(process.env.DROXY_FACTORY_DIR, "settings.json");
    const configRoot = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const settingsRoot = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.deepEqual((configRoot.custom_models || []).map((entry) => entry.model), ["gpt-5"]);
    assert.deepEqual((settingsRoot.customModels || []).map((entry) => entry.model), ["gpt-5"]);
    assert.equal(Boolean(updatedState && updatedState.factory), true);
    assert.deepEqual(updatedState && updatedState.factory && updatedState.factory.modelsByProvider, {
      codex: ["gpt-5"],
    });
  } finally {
    cleanup();
  }
});

test("syncDroidSettings writes thinking suffix variants for selected thinking models", async () => {
  const cleanup = withTempFactoryDir();
  try {
    let updatedState = null;
    const failRequest = () => {
      throw new Error("network should not be used");
    };

    const api = sync.createSyncApi({
      config: {
        DEFAULT_PORT: 8317,
        configExists: () => true,
        ensureDir: (dirPath) => fs.mkdirSync(dirPath, { recursive: true }),
        readConfigValues: () => ({
          host: "127.0.0.1",
          port: 8317,
          tlsEnabled: false,
          apiKey: "k",
        }),
        readState: () => ({ apiKey: "k", thinkingModels: ["gpt-5"] }),
        updateState: (patch) => {
          updatedState = patch;
          return patch;
        },
      },
      http: { request: failRequest },
      https: { request: failRequest },
      output: {
        printGuidedError: () => {},
        printSuccess: () => {},
      },
    });

    const result = await api.syncDroidSettings({
      quiet: true,
      selectedModels: ["gpt-5", "claude-opus"],
      detectedEntries: [
        { id: "gpt-5", provider: "openai" },
        { id: "claude-opus", provider: "anthropic" },
      ],
      protocol: "http",
    });

    assert.equal(result.success, true);
    assert.equal(result.result && result.result.status, "synced");

    const configPath = path.join(process.env.DROXY_FACTORY_DIR, "config.json");
    const settingsPath = path.join(process.env.DROXY_FACTORY_DIR, "settings.json");
    const configRoot = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const settingsRoot = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const configModels = (configRoot.custom_models || []).map((entry) => entry.model);
    const settingsModels = (settingsRoot.customModels || []).map((entry) => entry.model);

    assert.deepEqual(configModels, [
      "claude-opus",
      "gpt-5",
      "gpt-5(medium)",
    ]);
    assert.deepEqual(settingsModels, [
      "claude-opus",
      "gpt-5",
      "gpt-5(medium)",
    ]);
    assert.deepEqual(updatedState && updatedState.thinkingModels, ["gpt-5"]);
    assert.deepEqual(updatedState && updatedState.thinkingModelModes, { "gpt-5": "medium" });
  } finally {
    cleanup();
  }
});

test("syncDroidSettings uses explicit thinking mode per selected model", async () => {
  const cleanup = withTempFactoryDir();
  try {
    let updatedState = null;
    const failRequest = () => {
      throw new Error("network should not be used");
    };

    const api = sync.createSyncApi({
      config: {
        DEFAULT_PORT: 8317,
        configExists: () => true,
        ensureDir: (dirPath) => fs.mkdirSync(dirPath, { recursive: true }),
        readConfigValues: () => ({
          host: "127.0.0.1",
          port: 8317,
          tlsEnabled: false,
          apiKey: "k",
        }),
        readState: () => ({
          apiKey: "k",
          thinkingModels: ["gpt-5"],
          thinkingModelModes: { "gpt-5": "high" },
        }),
        updateState: (patch) => {
          updatedState = patch;
          return patch;
        },
      },
      http: { request: failRequest },
      https: { request: failRequest },
      output: {
        printGuidedError: () => {},
        printSuccess: () => {},
      },
    });

    const result = await api.syncDroidSettings({
      quiet: true,
      selectedModels: ["gpt-5"],
      detectedEntries: [{ id: "gpt-5", provider: "openai" }],
      protocol: "http",
    });

    assert.equal(result.success, true);
    const configPath = path.join(process.env.DROXY_FACTORY_DIR, "config.json");
    const settingsPath = path.join(process.env.DROXY_FACTORY_DIR, "settings.json");
    const configRoot = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const settingsRoot = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.deepEqual((configRoot.custom_models || []).map((entry) => entry.model), [
      "gpt-5",
      "gpt-5(high)",
    ]);
    assert.deepEqual((settingsRoot.customModels || []).map((entry) => entry.model), [
      "gpt-5",
      "gpt-5(high)",
    ]);
    assert.deepEqual(updatedState && updatedState.thinkingModelModes, { "gpt-5": "high" });
  } finally {
    cleanup();
  }
});

test("syncDroidSettings keeps explicit advanced thinking mode for namespaced gpt-5 models", async () => {
  const cleanup = withTempFactoryDir();
  try {
    let updatedState = null;
    const failRequest = () => {
      throw new Error("network should not be used");
    };

    const api = sync.createSyncApi({
      config: {
        DEFAULT_PORT: 8317,
        configExists: () => true,
        ensureDir: (dirPath) => fs.mkdirSync(dirPath, { recursive: true }),
        readConfigValues: () => ({
          host: "127.0.0.1",
          port: 8317,
          tlsEnabled: false,
          apiKey: "k",
        }),
        readState: () => ({
          apiKey: "k",
          thinkingModels: ["openai/gpt-5"],
          thinkingModelModes: { "openai/gpt-5": "high" },
        }),
        updateState: (patch) => {
          updatedState = patch;
          return patch;
        },
      },
      http: { request: failRequest },
      https: { request: failRequest },
      output: {
        printGuidedError: () => {},
        printSuccess: () => {},
      },
    });

    const result = await api.syncDroidSettings({
      quiet: true,
      selectedModels: ["openai/gpt-5"],
      detectedEntries: [{ id: "openai/gpt-5", provider: "openai" }],
      protocol: "http",
    });

    assert.equal(result.success, true);
    const configPath = path.join(process.env.DROXY_FACTORY_DIR, "config.json");
    const settingsPath = path.join(process.env.DROXY_FACTORY_DIR, "settings.json");
    const configRoot = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const settingsRoot = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.deepEqual((configRoot.custom_models || []).map((entry) => entry.model), [
      "openai/gpt-5",
      "openai/gpt-5(high)",
    ]);
    assert.deepEqual((settingsRoot.customModels || []).map((entry) => entry.model), [
      "openai/gpt-5",
      "openai/gpt-5(high)",
    ]);
    assert.deepEqual(updatedState && updatedState.thinkingModelModes, {
      "openai/gpt-5": "high",
    });
  } finally {
    cleanup();
  }
});

test("syncDroidSettings falls back unsupported advanced thinking modes to auto", async () => {
  const cleanup = withTempFactoryDir();
  try {
    let updatedState = null;
    const failRequest = () => {
      throw new Error("network should not be used");
    };

    const api = sync.createSyncApi({
      config: {
        DEFAULT_PORT: 8317,
        configExists: () => true,
        ensureDir: (dirPath) => fs.mkdirSync(dirPath, { recursive: true }),
        readConfigValues: () => ({
          host: "127.0.0.1",
          port: 8317,
          tlsEnabled: false,
          apiKey: "k",
        }),
        readState: () => ({
          apiKey: "k",
          thinkingModels: ["claude-opus"],
          thinkingModelModes: { "claude-opus": "xhigh" },
        }),
        updateState: (patch) => {
          updatedState = patch;
          return patch;
        },
      },
      http: { request: failRequest },
      https: { request: failRequest },
      output: {
        printGuidedError: () => {},
        printSuccess: () => {},
      },
    });

    const result = await api.syncDroidSettings({
      quiet: true,
      selectedModels: ["claude-opus"],
      detectedEntries: [{ id: "claude-opus", provider: "anthropic" }],
      protocol: "http",
    });

    assert.equal(result.success, true);
    const configPath = path.join(process.env.DROXY_FACTORY_DIR, "config.json");
    const settingsPath = path.join(process.env.DROXY_FACTORY_DIR, "settings.json");
    const configRoot = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const settingsRoot = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.deepEqual((configRoot.custom_models || []).map((entry) => entry.model), [
      "claude-opus",
      "claude-opus(auto)",
    ]);
    assert.deepEqual((settingsRoot.customModels || []).map((entry) => entry.model), [
      "claude-opus",
      "claude-opus(auto)",
    ]);
    assert.deepEqual(updatedState && updatedState.thinkingModels, ["claude-opus"]);
    assert.deepEqual(updatedState && updatedState.thinkingModelModes, { "claude-opus": "auto" });
  } finally {
    cleanup();
  }
});

test("syncDroidSettings prunes stale selected IDs when only partial matches are detected", async () => {
  const cleanup = withTempFactoryDir();
  try {
    let updatedState = null;
    const failRequest = () => {
      throw new Error("network should not be used");
    };

    const api = sync.createSyncApi({
      config: {
        DEFAULT_PORT: 8317,
        configExists: () => true,
        ensureDir: (dirPath) => fs.mkdirSync(dirPath, { recursive: true }),
        readConfigValues: () => ({
          host: "127.0.0.1",
          port: 8317,
          tlsEnabled: false,
          apiKey: "k",
        }),
        readState: () => ({ apiKey: "k" }),
        updateState: (patch) => {
          updatedState = patch;
          return patch;
        },
      },
      http: { request: failRequest },
      https: { request: failRequest },
      output: {
        printGuidedError: () => {},
        printSuccess: () => {},
      },
    });

    const result = await api.syncDroidSettings({
      quiet: true,
      selectedModels: ["gpt-5", "missing-model"],
      detectedEntries: [{ id: "gpt-5", provider: "openai" }],
      protocol: "http",
    });

    assert.equal(result.success, true);
    assert.equal(result.result && result.result.status, "synced");
    assert.deepEqual(result.result && result.result.selectedModels, ["gpt-5"]);
    assert.equal(result.result && result.result.selectedModelsSkipped, 1);
    assert.deepEqual(updatedState && updatedState.selectedModels, ["gpt-5"]);
  } finally {
    cleanup();
  }
});

test("syncDroidSettings clears stale selection when none of the selected models are available", async () => {
  const cleanup = withTempFactoryDir();
  try {
    let updatedState = null;
    const failRequest = () => {
      throw new Error("network should not be used");
    };

    const api = sync.createSyncApi({
      config: {
        DEFAULT_PORT: 8317,
        configExists: () => true,
        ensureDir: (dirPath) => fs.mkdirSync(dirPath, { recursive: true }),
        readConfigValues: () => ({
          host: "127.0.0.1",
          port: 8317,
          tlsEnabled: false,
          apiKey: "k",
        }),
        readState: () => ({ apiKey: "k" }),
        updateState: (patch) => {
          updatedState = patch;
          return patch;
        },
      },
      http: { request: failRequest },
      https: { request: failRequest },
      output: {
        printGuidedError: () => {},
        printSuccess: () => {},
        printWarning: () => {},
      },
    });

    const result = await api.syncDroidSettings({
      quiet: true,
      selectedModels: ["gpt-5.3-codex-spark"],
      detectedEntries: [{ id: "gpt-5", provider: "openai" }],
      protocol: "http",
    });

    assert.equal(result.success, true);
    assert.equal(result.result && result.result.status, "cleared");
    assert.equal(result.result && result.result.reason, "selected_models_pruned");
    assert.deepEqual(result.result && result.result.selectedModels, []);
    assert.equal(result.result && result.result.selectedModelsSkipped, 1);
    assert.deepEqual(updatedState && updatedState.selectedModels, []);
    assert.deepEqual(updatedState && updatedState.thinkingModels, []);
    assert.deepEqual(updatedState && updatedState.thinkingModelModes, {});
    assert.deepEqual(updatedState && updatedState.factory && updatedState.factory.modelsByProvider, {});
  } finally {
    cleanup();
  }
});

test("syncDroidSettings clears Droid models when selection is explicitly empty", async () => {
  const cleanup = withTempFactoryDir();
  try {
    let updatedState = null;
    const failRequest = () => {
      throw new Error("network should not be used");
    };

    const api = sync.createSyncApi({
      config: {
        DEFAULT_PORT: 8317,
        configExists: () => true,
        ensureDir: (dirPath) => fs.mkdirSync(dirPath, { recursive: true }),
        readConfigValues: () => ({
          host: "127.0.0.1",
          port: 8317,
          tlsEnabled: false,
          apiKey: "k",
        }),
        readState: () => ({ apiKey: "k" }),
        updateState: (patch) => {
          updatedState = patch;
          return patch;
        },
      },
      http: { request: failRequest },
      https: { request: failRequest },
      output: {
        printGuidedError: () => {},
        printSuccess: () => {},
      },
    });

    const settingsPath = path.join(process.env.DROXY_FACTORY_DIR, "settings.json");
    fs.mkdirSync(process.env.DROXY_FACTORY_DIR, { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          sessionDefaultSettings: {
            model: "custom:gpt-5.3-codex-spark",
          },
          customModels: [
            {
              model: "gpt-5.3-codex-spark",
              displayName: "Droxy • gpt-5.3-codex-spark",
              baseUrl: "http://127.0.0.1:8317/v1",
              apiKey: "k",
              provider: "openai",
              id: "custom:gpt-5.3-codex-spark",
            },
          ],
        },
        null,
        2
      ),
      "utf8"
    );

    const result = await api.syncDroidSettings({
      quiet: true,
      selectedModels: [],
      detectedEntries: [{ id: "gpt-5", provider: "openai" }],
      protocol: "http",
    });

    assert.equal(result.success, true);
    assert.equal(result.result && result.result.status, "cleared");
    assert.deepEqual(result.result && result.result.selectedModels, []);
    const configPath = path.join(process.env.DROXY_FACTORY_DIR, "config.json");
    const configRoot = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const settingsRoot = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.deepEqual((configRoot.custom_models || []).map((entry) => entry.model), []);
    assert.deepEqual((settingsRoot.customModels || []).map((entry) => entry.model), []);
    assert.deepEqual(updatedState && updatedState.selectedModels, []);
    assert.deepEqual(updatedState && updatedState.thinkingModelModes, {});
    assert.deepEqual(updatedState && updatedState.factory && updatedState.factory.modelsByProvider, {});
    assert.equal(
      Boolean(
        settingsRoot.sessionDefaultSettings &&
        Object.prototype.hasOwnProperty.call(settingsRoot.sessionDefaultSettings, "model")
      ),
      false
    );
  } finally {
    cleanup();
  }
});
