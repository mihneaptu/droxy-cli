"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const login = require("../src/login");

test("getProvidersWithConnectionStatus marks providers from auth artifacts", () => {
  const authDir = fs.mkdtempSync(path.join(os.tmpdir(), "droxy-login-auth-"));
  try {
    fs.writeFileSync(path.join(authDir, "anthropic-session.json"), "{}", "utf8");
    fs.writeFileSync(path.join(authDir, "openai-token.json"), "{}", "utf8");
    fs.writeFileSync(path.join(authDir, "openai-token-backup.json"), "{}", "utf8");

    const rows = login.getProvidersWithConnectionStatus({ authDir });
    const byId = new Map(rows.map((provider) => [provider.id, provider]));

    assert.equal(byId.get("claude").connected, true);
    assert.equal(byId.get("claude").connectionCount, 1);
    assert.equal(byId.get("codex").connected, true);
    assert.equal(byId.get("codex").connectionCount, 2);
    assert.equal(byId.get("gemini").connected, false);
    assert.equal(byId.get("gemini").connectionCount, 0);
  } finally {
    fs.rmSync(authDir, { recursive: true, force: true });
  }
});
