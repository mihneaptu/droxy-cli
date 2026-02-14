"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const login = require("../src/login");

test("getProvidersWithConnectionStatus defaults providers to unknown when unverified", () => {
  const rows = login.getProvidersWithConnectionStatus({});
  const byId = new Map(rows.map((provider) => [provider.id, provider]));
  assert.equal(byId.get("claude").connected, false);
  assert.equal(byId.get("claude").connectionState, "unknown");
  assert.equal(byId.get("claude").connectionCount, 0);
  assert.equal(byId.get("codex").connected, false);
  assert.equal(byId.get("codex").connectionState, "unknown");
  assert.equal(byId.get("codex").connectionCount, 0);
});

test("getProvidersWithConnectionStatus respects explicit providerStatusById overrides", () => {
  const rows = login.getProvidersWithConnectionStatus({
    providerStatusById: {
      claude: { connectionState: "connected", connectionCount: 2, verified: true },
      codex: false,
      gemini: "unknown",
    },
  });
  const byId = new Map(rows.map((provider) => [provider.id, provider]));
  assert.equal(byId.get("claude").connected, true);
  assert.equal(byId.get("claude").connectionState, "connected");
  assert.equal(byId.get("claude").connectionCount, 2);
  assert.equal(byId.get("codex").connected, false);
  assert.equal(byId.get("codex").connectionState, "disconnected");
  assert.equal(byId.get("codex").connectionCount, 0);
  assert.equal(byId.get("gemini").connected, false);
  assert.equal(byId.get("gemini").connectionState, "unknown");
});
