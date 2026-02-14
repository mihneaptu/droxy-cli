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

test("statusProxy reports running when configured port is open", async () => {
  const cleanup = withTempAppDir();
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  try {
    config.writeConfig({ host: "127.0.0.1", port: address.port, apiKey: "k" });
    const result = await proxy.statusProxy({ quiet: true });
    if (process.platform === "win32") {
      assert.equal(["running", "blocked"].includes(result.status), true);
    } else {
      assert.equal(result.status, "running");
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
        byProvider: {},
      }),
    },
  });

  const result = await api.statusProxy({ quiet: true });
  assert.equal(result.providers, 3);
  assert.equal(result.providersConnected, 3);
  assert.equal(result.providersState, "verified");
});
