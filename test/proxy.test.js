"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const test = require("node:test");

const config = require("../src/config");
const proxy = require("../src/proxy");

function withTempAppDir() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "droxy-proxy-"));
  const previous = process.env.DROXY_APP_DIR;
  process.env.DROXY_APP_DIR = tempDir;
  return () => {
    if (previous === undefined) delete process.env.DROXY_APP_DIR;
    else process.env.DROXY_APP_DIR = previous;
    fs.rmSync(tempDir, { recursive: true, force: true });
  };
}

test("getBinaryPath prefers DROXY_PROXY_BIN override", () => {
  const cleanup = withTempAppDir();
  const previous = process.env.DROXY_PROXY_BIN;
  process.env.DROXY_PROXY_BIN = "C:/tmp/custom-proxy.exe";
  try {
    assert.equal(proxy.getBinaryPath(), "C:/tmp/custom-proxy.exe");
  } finally {
    if (previous === undefined) delete process.env.DROXY_PROXY_BIN;
    else process.env.DROXY_PROXY_BIN = previous;
    cleanup();
  }
});

test("statusProxy check mode sets exitCode when proxy is not running", async () => {
  const cleanup = withTempAppDir();
  const previousExitCode = process.exitCode;
  try {
    config.writeConfig({ host: "127.0.0.1", port: 65530, apiKey: "k" });
    process.exitCode = 0;
    const result = await proxy.statusProxy({ check: true, quiet: true });
    assert.equal(result.running, false);
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previousExitCode;
    cleanup();
  }
});

test("statusProxy check mode skips provider verification probe", async () => {
  const previousExitCode = process.exitCode;
  let providerProbeCalls = 0;
  const api = proxy.createProxyApi({
    config: {
      configExists: () => true,
      getConfigPath: () => "C:/tmp/config.yaml",
      readConfigValues: () => ({
        host: "127.0.0.1",
        port: 65530,
        tlsEnabled: false,
        authDir: "~/.cli-proxy-api",
      }),
      readState: () => ({ thinkingState: "verified" }),
      resolveAuthDir: (value) => value,
    },
    helpers: {
      checkPort: async () => false,
      isWindows: () => false,
      formatErrorSummary: (value) => String(value || ""),
    },
    output: {
      log: () => {},
      printWarning: () => {},
    },
    sync: {
      fetchProviderConnectionStatusSafe: async () => {
        providerProbeCalls += 1;
        return {
          providersState: "verified",
          providersConnected: 1,
          byProvider: {},
        };
      },
    },
  });

  try {
    process.exitCode = 0;
    const result = await api.statusProxy({ check: true, quiet: true });
    assert.equal(result.running, false);
    assert.equal(process.exitCode, 1);
    assert.equal(providerProbeCalls, 0);
  } finally {
    process.exitCode = previousExitCode;
  }
});

test("statusProxy check mode fails strict readiness when provider verification is unknown", async () => {
  const previousExitCode = process.exitCode;
  let providerProbeCalls = 0;
  const api = proxy.createProxyApi({
    config: {
      configExists: () => true,
      getConfigPath: () => "C:/tmp/config.yaml",
      readConfigValues: () => ({
        host: "127.0.0.1",
        port: 65530,
        tlsEnabled: false,
        authDir: "~/.cli-proxy-api",
      }),
      readState: () => ({}),
      resolveAuthDir: (value) => value,
    },
    helpers: {
      checkPort: async () => true,
      isWindows: () => false,
      formatErrorSummary: (value) => String(value || ""),
    },
    output: {
      log: () => {},
      printWarning: () => {},
    },
    sync: {
      fetchProviderConnectionStatusSafe: async () => {
        providerProbeCalls += 1;
        return {
          providersState: "unknown",
          providersConnected: 0,
          byProvider: {},
        };
      },
    },
  });

  try {
    process.exitCode = 0;
    const result = await api.statusProxy({ check: true, quiet: true });
    assert.equal(result.running, true);
    assert.equal(result.providersState, "unknown");
    assert.equal(result.strictReady, false);
    assert.equal(process.exitCode, 1);
    assert.equal(providerProbeCalls, 1);
  } finally {
    process.exitCode = previousExitCode;
  }
});

test("statusProxy reports running when configured port is open", async () => {
  const cleanup = withTempAppDir();
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  try {
    config.writeConfig({ host: "127.0.0.1", port: address.port, apiKey: "k" });
    const result = await proxy.statusProxy({ quiet: true });
    if (process.platform === "win32") {
      assert.equal(["running", "blocked", "unverified"].includes(result.status), true);
    } else {
      assert.equal(result.status, "unverified");
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    cleanup();
  }
});

test("startProxy returns config_missing when no config exists", async () => {
  const cleanup = withTempAppDir();
  try {
    const result = await proxy.startProxy({ quiet: true });
    assert.equal(result.reason, "config_missing");
  } finally {
    cleanup();
  }
});

test("statusProxy includes provider verification fields", async () => {
  const api = proxy.createProxyApi({
    fs: {
      readdirSync: () => [],
      existsSync: () => false,
    },
    config: {
      configExists: () => true,
      getConfigPath: () => "C:/tmp/config.yaml",
      readConfigValues: () => ({
        host: "127.0.0.1",
        port: 65530,
        tlsEnabled: false,
        authDir: "~/.cli-proxy-api",
      }),
      readState: () => ({
        thinkingState: "verified",
        thinkingStatus: {
          state: "verified",
          reason: "backend_reported_capabilities_for_all_models",
          modelsTotal: 3,
          modelsVerified: 3,
          modelsSupported: 2,
          modelsUnsupported: 1,
          modelsUnverified: 0,
        },
      }),
      resolveAuthDir: (value) => value,
    },
    helpers: {
      checkPort: async () => false,
      isWindows: () => false,
      formatErrorSummary: (value) => String(value || ""),
    },
    output: {
      log: () => {},
      printWarning: () => {},
    },
    sync: {
      fetchProviderConnectionStatusSafe: async () => ({
        providersState: "verified",
        providersConnected: 3,
        byProvider: {
          codex: { connectionState: "connected", connectionCount: 2, verified: true },
          claude: { connected: false, connectionState: "disconnected", verified: true },
        },
      }),
    },
  });

  const result = await api.statusProxy({ quiet: true });
  assert.equal(result.providers, 1);
  assert.equal(result.providersConnected, 1);
  assert.equal(result.providersState, "verified");
  assert.deepEqual(result.providerStatusById, {
    codex: {
      connected: true,
      connectionState: "connected",
      connectionCount: 2,
      verified: true,
    },
    claude: {
      connected: false,
      connectionState: "disconnected",
      connectionCount: 0,
      verified: true,
    },
  });
  assert.equal(result.strictReady, true);
  assert.equal(result.authFilesCount, 0);
  assert.equal(result.thinkingState, "verified");
  assert.equal(result.thinkingReason, "backend_reported_capabilities_for_all_models");
  assert.equal(result.thinkingModelsTotal, 3);
  assert.equal(result.thinkingModelsVerified, 3);
  assert.equal(result.thinkingModelsSupported, 2);
  assert.equal(result.thinkingModelsUnsupported, 1);
  assert.equal(result.thinkingModelsUnverified, 0);
});

test("statusProxy keeps provider status empty when management probe is unavailable", async () => {
  const api = proxy.createProxyApi({
    fs: {
      readdirSync: () => [
        "openai-main-auth.json",
        "anthropic-session.json",
        "aistudio-secondary.json",
      ],
      existsSync: () => false,
    },
    config: {
      configExists: () => true,
      getConfigPath: () => "C:/tmp/config.yaml",
      readConfigValues: () => ({
        host: "127.0.0.1",
        port: 65530,
        tlsEnabled: false,
        authDir: "~/.cli-proxy-api",
      }),
      readState: () => ({}),
      resolveAuthDir: (value) => value,
      getStatePath: () => "C:/tmp/state.json",
    },
    helpers: {
      checkPort: async () => false,
      isWindows: () => false,
      formatErrorSummary: (value) => String(value || ""),
    },
    output: {
      log: () => {},
      printWarning: () => {},
    },
    sync: {
      fetchProviderConnectionStatusSafe: async () => ({
        providersState: "unknown",
        providersConnected: 0,
        byProvider: {},
      }),
    },
  });

  const result = await api.statusProxy({ quiet: true });
  assert.equal(result.providersState, "unknown");
  assert.equal(result.providersConnected, 0);
  assert.equal(result.strictReady, false);
  assert.equal(result.authFilesCount, 3);
  assert.deepEqual(result.providerStatusById, {});
  assert.equal(api.hasProviderAuth("codex", result.providerStatusById), false);
  assert.equal(api.hasProviderAuth("iflow", result.providerStatusById), false);
  assert.equal(api.hasProviderAuth("", result.providerStatusById), false);
  assert.equal(api.countConnectedProviders(result.providerStatusById), 0);
});
