"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createInteractiveApi } = require("../src/flows/interactive");

function createSpinnerStub() {
  return {
    fail() {
      return this;
    },
    start() {
      return this;
    },
    succeed() {
      return this;
    },
  };
}

function createOutputStub() {
  return {
    accent: (text) => String(text),
    dim: (text) => String(text),
    log: () => {},
    printDivider: () => {},
    printGuidedError: () => {},
    printInfo: () => {},
    printNextStep: () => {},
    printSuccess: () => {},
    printWarning: () => {},
  };
}

test("interactive mode chooses models and syncs only selected entries", async () => {
  const answers = ["2", "a", "c", "3", "7"];
  const syncCalls = [];
  let state = {
    apiKey: "k",
  };

  const interactive = createInteractiveApi({
    ask: async () => answers.shift() || "7",
    config: {
      ensureConfig: () => {},
      readConfigValues: () => ({
        apiKey: "k",
        authDir: "~/.cli-proxy-api",
        host: "127.0.0.1",
        port: 8317,
        tlsEnabled: false,
      }),
      readState: () => state,
      updateState: (partial) => {
        state = { ...state, ...partial };
        return state;
      },
    },
    createSpinner: createSpinnerStub,
    isInteractiveSession: () => true,
    login: {
      PROVIDERS: [],
      loginFlow: async () => ({ success: true }),
      resolveProvider: () => null,
    },
    output: createOutputStub(),
    proxy: {
      getProxyStatus: async () => ({ blocked: false, running: true }),
      startProxy: async () => ({ running: true }),
      statusProxy: async () => ({ status: "running" }),
      stopProxy: async () => true,
    },
    sync: {
      buildProtocolUnavailableError: () => new Error("unreachable"),
      fetchAvailableModelEntries: async () => [{ id: "gpt-5" }, { id: "claude-opus" }],
      resolveReachableProtocol: async () => ({ protocol: "http", reachable: true }),
      syncDroidSettings: async (opts) => {
        syncCalls.push(opts);
        return {
          success: true,
          result: { modelsAdded: Array.isArray(opts.selectedModels) ? opts.selectedModels.length : 0 },
        };
      },
    },
  });

  await interactive.runInteractiveHome();

  assert.deepEqual(state.selectedModels, ["claude-opus", "gpt-5"]);
  assert.equal(syncCalls.length, 1);
  assert.deepEqual(syncCalls[0].selectedModels, ["claude-opus", "gpt-5"]);
});

test("interactive mode reports non-interactive sessions", async () => {
  const outputCalls = [];
  const interactive = createInteractiveApi({
    isInteractiveSession: () => false,
    output: {
      ...createOutputStub(),
      printGuidedError: (payload) => outputCalls.push(payload),
    },
  });

  const result = await interactive.runInteractiveHome();
  assert.equal(result.success, false);
  assert.equal(result.reason, "non_interactive");
  assert.equal(outputCalls.length, 1);
  assert.match(String(outputCalls[0].what), /TTY/);
});
