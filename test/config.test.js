"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const config = require("../src/config");

function withTempAppDir() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "droxy-config-"));
  const previous = process.env.DROXY_APP_DIR;
  process.env.DROXY_APP_DIR = tempDir;
  return () => {
    if (previous === undefined) delete process.env.DROXY_APP_DIR;
    else process.env.DROXY_APP_DIR = previous;
    fs.rmSync(tempDir, { recursive: true, force: true });
  };
}

test("readConfigValues returns defaults when config is missing", () => {
  const cleanup = withTempAppDir();
  try {
    const values = config.readConfigValues();
    assert.equal(values.host, config.DEFAULT_HOST);
    assert.equal(values.port, config.DEFAULT_PORT);
    assert.equal(values.tlsEnabled, false);
    assert.equal(values.authDir, config.DEFAULT_AUTH_DIR);
  } finally {
    cleanup();
  }
});

test("writeConfig persists values and readConfigValues parses them", () => {
  const cleanup = withTempAppDir();
  try {
    config.writeConfig({
      host: "127.0.0.1",
      port: 9001,
      tlsEnabled: true,
      authDir: "~/.auth-test",
      apiKey: "abc123",
      managementKey: "secret-1",
      tlsCert: "cert.pem",
      tlsKey: "key.pem",
      allowRemote: true,
    });

    const values = config.readConfigValues();
    assert.equal(values.host, "127.0.0.1");
    assert.equal(values.port, 9001);
    assert.equal(values.tlsEnabled, true);
    assert.equal(values.authDir, path.join(os.homedir(), ".auth-test"));
    assert.equal(values.apiKey, "abc123");
    assert.equal(values.managementKey, "secret-1");
  } finally {
    cleanup();
  }
});

test("ensureConfig creates config and updates state keys", () => {
  const cleanup = withTempAppDir();
  try {
    assert.equal(config.configExists(), false);
    const configPath = config.ensureConfig();
    assert.equal(fs.existsSync(configPath), true);

    const state = config.readState() || {};
    assert.equal(typeof state.apiKey, "string");
    assert.equal(state.apiKey.length > 0, true);
    assert.equal(typeof state.managementKey, "string");
    assert.equal(state.managementKey.length > 0, true);
  } finally {
    cleanup();
  }
});
