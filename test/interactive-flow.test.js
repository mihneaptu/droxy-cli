"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createInteractiveApi } = require("../src/flows/interactive");
const { buildVisibleHomeActions } = require("../src/flows/interactiveHelpers");

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

function createOutputStub(calls = []) {
  return {
    accent: (text) => String(text),
    dim: (text) => String(text),
    log: (msg) => calls.push(["log", String(msg)]),
    printDivider: () => {},
    printGuidedError: (payload) => calls.push(["printGuidedError", payload]),
    printInfo: (msg) => calls.push(["printInfo", String(msg)]),
    printNextStep: (msg) => calls.push(["printNextStep", String(msg)]),
    printSuccess: (msg) => calls.push(["printSuccess", String(msg)]),
    printWarning: (msg) => calls.push(["printWarning", String(msg)]),
  };
}

test("interactive mode chooses provider-first models and syncs merged selection", async () => {
  const outputCalls = [];
  const syncCalls = [];
  const selectSingleCalls = [];
  const selectMultipleCalls = [];
  let state = {
    apiKey: "k",
    selectedModels: ["claude-opus"],
  };
  const singleSelections = [{ index: 2 }, { index: 1 }];

  const interactive = createInteractiveApi({
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
      PROVIDERS: [
        { id: "claude", label: "Claude (Anthropic)" },
        { id: "codex", label: "OpenAI / Codex" },
      ],
      getProvidersWithConnectionStatus: () => [
        { id: "claude", label: "Claude (Anthropic)", connected: true },
        { id: "codex", label: "OpenAI / Codex", connected: true },
      ],
      loginFlow: async () => ({ success: true }),
      resolveProvider: () => null,
    },
    menu: {
      selectMultiple: async (payload) => {
        selectMultipleCalls.push(payload);
        return { cancelled: false, selected: payload.items.slice() };
      },
      selectSingle: async (payload) => {
        selectSingleCalls.push(payload);
        const next = singleSelections.shift() || { index: payload.items.length - 1 };
        return { cancelled: false, value: "", ...next };
      },
    },
    output: createOutputStub(outputCalls),
    proxy: {
      getProxyStatus: async () => ({ blocked: false, running: true }),
      startProxy: async () => ({ running: true }),
      statusProxy: async () => ({ status: "running" }),
      stopProxy: async () => true,
    },
    sync: {
      buildProtocolUnavailableError: () => new Error("unreachable"),
      fetchAvailableModelEntries: async () => [
        { id: "gpt-5", provider: "openai" },
        { id: "claude-opus", provider: "anthropic" },
      ],
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

  assert.equal(selectSingleCalls.length >= 2, true);
  assert.match(selectSingleCalls[1].title, /Choose provider for model selection/i);
  assert.equal(selectSingleCalls[1].items.some((item) => /Connected/.test(item)), false);
  assert.equal(selectSingleCalls[1].items.some((item) => /Not connected/.test(item)), false);
  assert.equal(selectSingleCalls[1].items.some((item) => /synced/.test(item)), true);

  assert.equal(selectMultipleCalls.length, 2);
  assert.match(selectMultipleCalls[0].title, /Choose models/i);
  assert.deepEqual(selectMultipleCalls[0].items, ["gpt-5"]);
  assert.match(selectMultipleCalls[1].title, /Choose thinking models/i);

  assert.deepEqual(state.selectedModels, ["claude-opus", "gpt-5"]);
  assert.equal(syncCalls.length, 1);
  assert.deepEqual(syncCalls[0].selectedModels, ["claude-opus", "gpt-5"]);
  assert.equal(Array.isArray(syncCalls[0].detectedEntries), true);
  assert.deepEqual(
    syncCalls[0].detectedEntries.map((entry) => entry.id).sort((left, right) => left.localeCompare(right)),
    ["claude-opus", "gpt-5"]
  );
});

test("choose models auto-sync clears Droid when selection is empty", async () => {
  const outputCalls = [];
  const syncCalls = [];
  let state = {
    apiKey: "k",
    selectedModels: ["gpt-5"],
  };
  const singleSelections = [{ index: 2 }, { index: 0 }];

  const interactive = createInteractiveApi({
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
      configExists: () => true,
    },
    createSpinner: createSpinnerStub,
    isInteractiveSession: () => true,
    login: {
      PROVIDERS: [{ id: "codex", label: "OpenAI / Codex" }],
      getProvidersWithConnectionStatus: () => [
        { id: "codex", label: "OpenAI / Codex", connected: true },
      ],
      loginFlow: async () => ({ success: true }),
      resolveProvider: () => null,
    },
    menu: {
      selectMultiple: async (payload) => {
        if (/Choose models/i.test(payload.title)) {
          return { cancelled: false, selected: [] };
        }
        return { cancelled: true, selected: [] };
      },
      selectSingle: async (payload) => {
        const next = singleSelections.shift() || { index: payload.items.length - 1 };
        return { cancelled: false, value: "", ...next };
      },
    },
    output: createOutputStub(outputCalls),
    proxy: {
      getProxyStatus: async () => ({ blocked: false, running: true }),
      startProxy: async () => ({ running: true }),
      statusProxy: async () => ({ status: "running" }),
      stopProxy: async () => true,
    },
    sync: {
      buildProtocolUnavailableError: () => new Error("unreachable"),
      fetchAvailableModelEntries: async () => [{ id: "gpt-5", provider: "openai" }],
      resolveReachableProtocol: async () => ({ protocol: "http", reachable: true }),
      syncDroidSettings: async (opts) => {
        syncCalls.push(opts);
        return { success: true, result: { status: "cleared", modelsAdded: 0 } };
      },
    },
  });

  await interactive.runInteractiveHome();

  assert.equal(syncCalls.length, 1);
  assert.deepEqual(syncCalls[0].selectedModels, []);
  assert.equal(
    outputCalls.some(
      (entry) =>
        entry[0] === "printInfo" &&
        /No models selected overall\. Clearing Droxy-managed models in Droid\./.test(entry[1])
    ),
    true
  );
  assert.deepEqual(state.selectedModels, []);
});

test("interactive home auto-syncs when selected models drift from Droid state", async () => {
  const syncCalls = [];
  const interactive = createInteractiveApi({
    config: {
      ensureConfig: () => {},
      readConfigValues: () => ({
        apiKey: "k",
        authDir: "~/.cli-proxy-api",
        host: "127.0.0.1",
        port: 8317,
        tlsEnabled: false,
      }),
      readState: () => ({
        selectedModels: ["gpt-5"],
        thinkingModels: [],
      }),
      updateState: () => ({}),
      configExists: () => true,
    },
    createSpinner: createSpinnerStub,
    isInteractiveSession: () => true,
    login: {
      PROVIDERS: [{ id: "codex", label: "OpenAI / Codex" }],
      getProvidersWithConnectionStatus: () => [
        { id: "codex", label: "OpenAI / Codex", connected: true },
      ],
      loginFlow: async () => ({ success: true }),
      resolveProvider: () => null,
    },
    menu: {
      selectMultiple: async () => ({ cancelled: true, selected: [] }),
      selectSingle: async () => ({ cancelled: true, index: -1, value: "" }),
    },
    output: createOutputStub([]),
    proxy: {
      getProxyStatus: async () => ({ blocked: false, running: true }),
      startProxy: async () => ({ running: true }),
      statusProxy: async () => ({ status: "running" }),
      stopProxy: async () => true,
    },
    sync: {
      buildProtocolUnavailableError: () => new Error("unreachable"),
      fetchAvailableModelEntries: async () => [{ id: "gpt-5", provider: "openai" }],
      resolveReachableProtocol: async () => ({ protocol: "http", reachable: true }),
      syncDroidSettings: async (opts) => {
        syncCalls.push(opts);
        return { success: true, result: { status: "synced", modelsAdded: 1 } };
      },
    },
    readDroidSyncedModelIdsByProvider: () => ({ codex: [] }),
  });

  await interactive.runInteractiveHome();

  assert.equal(syncCalls.length, 1);
  assert.deepEqual(syncCalls[0].selectedModels, ["gpt-5"]);
});

test("interactive home skips auto-sync when model selection has not been persisted yet", async () => {
  const syncCalls = [];
  const interactive = createInteractiveApi({
    config: {
      ensureConfig: () => {},
      readConfigValues: () => ({
        apiKey: "k",
        authDir: "~/.cli-proxy-api",
        host: "127.0.0.1",
        port: 8317,
        tlsEnabled: false,
      }),
      readState: () => ({
        thinkingModels: [],
      }),
      updateState: () => ({}),
      configExists: () => true,
    },
    createSpinner: createSpinnerStub,
    isInteractiveSession: () => true,
    login: {
      PROVIDERS: [{ id: "codex", label: "OpenAI / Codex" }],
      getProvidersWithConnectionStatus: () => [
        { id: "codex", label: "OpenAI / Codex", connected: true },
      ],
      loginFlow: async () => ({ success: true }),
      resolveProvider: () => null,
    },
    menu: {
      selectMultiple: async () => ({ cancelled: true, selected: [] }),
      selectSingle: async () => ({ cancelled: true, index: -1, value: "" }),
    },
    output: createOutputStub([]),
    proxy: {
      getProxyStatus: async () => ({ blocked: false, running: true }),
      startProxy: async () => ({ running: true }),
      statusProxy: async () => ({ status: "running" }),
      stopProxy: async () => true,
    },
    sync: {
      buildProtocolUnavailableError: () => new Error("unreachable"),
      fetchAvailableModelEntries: async () => [{ id: "gpt-5", provider: "openai" }],
      resolveReachableProtocol: async () => ({ protocol: "http", reachable: true }),
      syncDroidSettings: async (opts) => {
        syncCalls.push(opts);
        return { success: true, result: { status: "synced", modelsAdded: 1 } };
      },
    },
    readDroidSyncedModelIdsByProvider: () => ({ codex: ["gpt-5"] }),
  });

  await interactive.runInteractiveHome();

  assert.equal(syncCalls.length, 0);
});

test("provider model picker preselects Droid-synced models when no prior selection exists", async () => {
  const selectSingleCalls = [];
  const selectMultipleCalls = [];
  let state = {};
  const singleSelections = [{ index: 2 }, { index: 0 }];

  const interactive = createInteractiveApi({
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
      PROVIDERS: [
        { id: "codex", label: "OpenAI / Codex" },
      ],
      getProvidersWithConnectionStatus: () => [
        { id: "codex", label: "OpenAI / Codex", connected: true },
      ],
      loginFlow: async () => ({ success: true }),
      resolveProvider: () => null,
    },
    menu: {
      selectMultiple: async (payload) => {
        selectMultipleCalls.push(payload);
        return { cancelled: false, selected: payload.initialSelected.slice() };
      },
      selectSingle: async (payload) => {
        selectSingleCalls.push(payload);
        const next = singleSelections.shift() || { index: payload.items.length - 1 };
        return { cancelled: false, value: "", ...next };
      },
    },
    output: createOutputStub([]),
    proxy: {
      getProxyStatus: async () => ({ blocked: false, running: true }),
      startProxy: async () => ({ running: true }),
      statusProxy: async () => ({ status: "running" }),
      stopProxy: async () => true,
    },
    sync: {
      buildProtocolUnavailableError: () => new Error("unreachable"),
      fetchAvailableModelEntries: async () => [
        { id: "gpt-5", provider: "openai" },
      ],
      resolveReachableProtocol: async () => ({ protocol: "http", reachable: true }),
      syncDroidSettings: async () => ({ success: true, result: { modelsAdded: 1 } }),
    },
    readDroidSyncedModelIdsByProvider: () => ({ codex: ["gpt-5"] }),
  });

  await interactive.runInteractiveHome();

  assert.equal(selectMultipleCalls.length, 2);
  assert.equal(selectSingleCalls.length >= 2, true);
  assert.equal(selectSingleCalls[1].items.some((item) => /synced/.test(item)), true);
  assert.deepEqual(selectMultipleCalls[0].initialSelected, ["gpt-5"]);
});

test("provider model picker prefers Droid-synced defaults over stale local selection", async () => {
  const selectSingleCalls = [];
  const selectMultipleCalls = [];
  let state = {
    selectedModels: ["kimi-k2", "kimi-k2-0905", "kimi-k2-thinking", "kimi-k2.5"],
  };
  const singleSelections = [{ index: 2 }, { index: 0 }];

  const interactive = createInteractiveApi({
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
      PROVIDERS: [{ id: "kimi", label: "Kimi (Moonshot)" }],
      getProvidersWithConnectionStatus: () => [
        { id: "kimi", label: "Kimi (Moonshot)", connected: true },
      ],
      loginFlow: async () => ({ success: true }),
      resolveProvider: () => null,
    },
    menu: {
      selectMultiple: async (payload) => {
        selectMultipleCalls.push(payload);
        return { cancelled: false, selected: payload.initialSelected.slice() };
      },
      selectSingle: async (payload) => {
        selectSingleCalls.push(payload);
        const next = singleSelections.shift() || { index: payload.items.length - 1 };
        return { cancelled: false, value: "", ...next };
      },
    },
    output: createOutputStub([]),
    proxy: {
      getProxyStatus: async () => ({ blocked: false, running: true }),
      startProxy: async () => ({ running: true }),
      statusProxy: async () => ({ status: "running" }),
      stopProxy: async () => true,
    },
    sync: {
      buildProtocolUnavailableError: () => new Error("unreachable"),
      fetchAvailableModelEntries: async () => [
        { id: "kimi-k2", provider: "moonshot" },
        { id: "kimi-k2-0905", provider: "moonshot" },
        { id: "kimi-k2-thinking", provider: "moonshot" },
        { id: "kimi-k2.5", provider: "moonshot" },
      ],
      resolveReachableProtocol: async () => ({ protocol: "http", reachable: true }),
      syncDroidSettings: async () => ({ success: true, result: { modelsAdded: 3 } }),
    },
    readDroidSyncedModelIdsByProvider: () => ({
      kimi: ["kimi-k2", "kimi-k2-0905", "kimi-k2-thinking"],
    }),
  });

  await interactive.runInteractiveHome();

  assert.equal(selectSingleCalls.length >= 2, true);
  assert.match(selectSingleCalls[1].items[0], /3 synced/);
  assert.equal(selectMultipleCalls.length, 2);
  assert.deepEqual(
    selectMultipleCalls[0].initialSelected,
    ["kimi-k2", "kimi-k2-0905", "kimi-k2-thinking"]
  );
});

test("model provider picker hides disconnected providers", async () => {
  const selectSingleCalls = [];
  const selectMultipleCalls = [];
  const singleSelections = [{ index: 2 }, { index: 0 }];

  const interactive = createInteractiveApi({
    config: {
      ensureConfig: () => {},
      readConfigValues: () => ({
        apiKey: "k",
        authDir: "~/.cli-proxy-api",
        host: "127.0.0.1",
        port: 8317,
        tlsEnabled: false,
      }),
      readState: () => ({}),
      updateState: () => ({}),
    },
    createSpinner: createSpinnerStub,
    isInteractiveSession: () => true,
    login: {
      PROVIDERS: [
        { id: "claude", label: "Claude (Anthropic)" },
        { id: "codex", label: "OpenAI / Codex" },
      ],
      getProvidersWithConnectionStatus: () => [
        { id: "claude", label: "Claude (Anthropic)", connected: true },
        { id: "codex", label: "OpenAI / Codex", connected: false },
      ],
      loginFlow: async () => ({ success: true }),
      resolveProvider: () => null,
    },
    menu: {
      selectMultiple: async (payload) => {
        selectMultipleCalls.push(payload);
        return { cancelled: false, selected: payload.items.slice() };
      },
      selectSingle: async (payload) => {
        selectSingleCalls.push(payload);
        const next = singleSelections.shift() || { index: payload.items.length - 1 };
        return { cancelled: false, value: "", ...next };
      },
    },
    output: createOutputStub([]),
    proxy: {
      getProxyStatus: async () => ({ blocked: false, running: true }),
      startProxy: async () => ({ running: true }),
      statusProxy: async () => ({ status: "running" }),
      stopProxy: async () => true,
    },
    sync: {
      buildProtocolUnavailableError: () => new Error("unreachable"),
      fetchAvailableModelEntries: async () => [
        { id: "gpt-5", provider: "openai" },
        { id: "claude-opus", provider: "anthropic" },
      ],
      resolveReachableProtocol: async () => ({ protocol: "http", reachable: true }),
      syncDroidSettings: async () => ({ success: true, result: { modelsAdded: 1 } }),
    },
  });

  await interactive.runInteractiveHome();

  assert.equal(selectSingleCalls.length >= 2, true);
  assert.equal(selectSingleCalls[1].items.some((item) => /OpenAI \/ Codex/.test(item)), false);
  assert.equal(selectMultipleCalls.length, 2);
  assert.deepEqual(selectMultipleCalls[0].items, ["claude-opus"]);
});

test("model picker cancel returns to provider picker", async () => {
  const outputCalls = [];
  const selectSingleCalls = [];
  const selectMultipleCalls = [];
  const singleSelections = [{ index: 2 }, { index: 0 }, { index: 0 }];
  let multiCount = 0;

  const interactive = createInteractiveApi({
    config: {
      ensureConfig: () => {},
      readConfigValues: () => ({
        apiKey: "k",
        authDir: "~/.cli-proxy-api",
        host: "127.0.0.1",
        port: 8317,
        tlsEnabled: false,
      }),
      readState: () => ({}),
      updateState: () => ({}),
    },
    createSpinner: createSpinnerStub,
    isInteractiveSession: () => true,
    login: {
      PROVIDERS: [{ id: "claude", label: "Claude (Anthropic)" }],
      getProvidersWithConnectionStatus: () => [
        { id: "claude", label: "Claude (Anthropic)", connected: true },
      ],
      loginFlow: async () => ({ success: true }),
      resolveProvider: () => null,
    },
    menu: {
      selectMultiple: async (payload) => {
        selectMultipleCalls.push(payload);
        multiCount += 1;
        if (multiCount === 1) return { cancelled: true, selected: [] };
        return { cancelled: false, selected: payload.items.slice() };
      },
      selectSingle: async (payload) => {
        selectSingleCalls.push(payload);
        const next = singleSelections.shift() || { index: payload.items.length - 1 };
        return { cancelled: false, value: "", ...next };
      },
    },
    output: createOutputStub(outputCalls),
    proxy: {
      getProxyStatus: async () => ({ blocked: false, running: true }),
      startProxy: async () => ({ running: true }),
      statusProxy: async () => ({ status: "running" }),
      stopProxy: async () => true,
    },
    sync: {
      buildProtocolUnavailableError: () => new Error("unreachable"),
      fetchAvailableModelEntries: async () => [{ id: "claude-opus", provider: "anthropic" }],
      resolveReachableProtocol: async () => ({ protocol: "http", reachable: true }),
      syncDroidSettings: async () => ({ success: true, result: { modelsAdded: 1 } }),
    },
  });

  await interactive.runInteractiveHome();

  const providerPromptCount = selectSingleCalls.filter((call) =>
    /Choose provider for model selection/i.test(call.title)
  ).length;
  assert.equal(providerPromptCount >= 2, true);
  assert.equal(
    outputCalls.some(
      (entry) =>
        entry[0] === "printInfo" &&
        /Model selection cancelled\. Returning to provider list\./.test(entry[1])
    ),
    true
  );
  assert.equal(selectMultipleCalls.length >= 2, true);
});

test("connect provider menu omits status badges and keeps refresh message", async () => {
  const outputCalls = [];
  const loginCalls = [];
  const selectSingleCalls = [];
  let state = {};
  const singleSelections = [{ index: 0 }, { index: 0 }, { index: 4 }];

  const interactive = createInteractiveApi({
    config: {
      ensureConfig: () => {},
      readConfigValues: () => ({
        host: "127.0.0.1",
        port: 8317,
      }),
      readState: () => state,
      updateState: (partial) => {
        state = { ...state, ...partial };
        return state;
      },
      configExists: () => true,
    },
    createSpinner: createSpinnerStub,
    isInteractiveSession: () => true,
    login: {
      PROVIDERS: [
        { id: "claude", label: "Claude (Anthropic)" },
        { id: "codex", label: "OpenAI / Codex" },
      ],
      getProvidersWithConnectionStatus: () => [
        { id: "claude", label: "Claude (Anthropic)", connected: true },
        { id: "codex", label: "OpenAI / Codex", connected: false },
      ],
      loginFlow: async (opts) => {
        loginCalls.push(opts);
        return { success: true, provider: opts.providerId };
      },
      resolveProvider: () => null,
    },
    menu: {
      selectMultiple: async () => ({ cancelled: true, selected: [] }),
      selectSingle: async (payload) => {
        selectSingleCalls.push(payload);
        const next = singleSelections.shift() || { index: payload.items.length - 1 };
        return { cancelled: false, value: "", ...next };
      },
    },
    output: createOutputStub(outputCalls),
    proxy: {
      getProxyStatus: async () => ({ blocked: false, running: false }),
      startProxy: async () => ({ running: true }),
      statusProxy: async () => ({ status: "stopped" }),
      stopProxy: async () => true,
    },
    sync: {
      syncDroidSettings: async () => ({ success: true }),
    },
  });

  await interactive.runInteractiveHome();

  assert.equal(selectSingleCalls.length >= 2, true);
  assert.equal(selectSingleCalls[1].items.some((item) => /Connected/.test(item)), false);
  assert.equal(selectSingleCalls[1].items.some((item) => /Not connected/.test(item)), false);
  assert.deepEqual(loginCalls, [{ providerId: "claude", quiet: false }]);
  assert.equal(
    outputCalls.some(
      (entry) => entry[0] === "printInfo" && /already connected/i.test(entry[1])
    ),
    true
  );
});

test("accounts menu can list status and connect account", async () => {
  const loginCalls = [];
  const selectSingleCalls = [];
  let homePromptCount = 0;
  let accountsPromptCount = 0;

  const interactive = createInteractiveApi({
    config: {
      ensureConfig: () => {},
      readConfigValues: () => ({
        host: "127.0.0.1",
        port: 8317,
      }),
      readState: () => ({}),
      updateState: () => ({}),
      configExists: () => true,
    },
    createSpinner: createSpinnerStub,
    isInteractiveSession: () => true,
    login: {
      PROVIDERS: [
        { id: "claude", label: "Claude (Anthropic)" },
        { id: "codex", label: "OpenAI / Codex" },
      ],
      getProvidersWithConnectionStatus: () => [
        { id: "claude", label: "Claude (Anthropic)", connected: true, connectionCount: 2 },
        { id: "codex", label: "OpenAI / Codex", connected: false, connectionCount: 0 },
      ],
      loginFlow: async (opts) => {
        loginCalls.push(opts);
        return { success: true, provider: opts.providerId };
      },
      resolveProvider: () => null,
    },
    menu: {
      selectMultiple: async () => ({ cancelled: true, selected: [] }),
      selectSingle: async (payload) => {
        selectSingleCalls.push(payload);
        if (/Droxy Interactive/i.test(payload.title || "")) {
          homePromptCount += 1;
          const label = homePromptCount === 1 ? "Accounts" : "Exit";
          return { cancelled: false, index: payload.items.indexOf(label), value: label };
        }
        if (/Connected Accounts/i.test(payload.title || "")) {
          return { cancelled: false, index: 0, value: payload.items[0] };
        }
        if (/Accounts/i.test(payload.title || "")) {
          accountsPromptCount += 1;
          const label = accountsPromptCount === 1 ? payload.items[0] :
            accountsPromptCount === 2 ? "Connect Account" : "Back to Menu";
          return { cancelled: false, index: payload.items.indexOf(label), value: label };
        }
        if (/Choose provider/i.test(payload.title || "")) {
          return { cancelled: false, index: 0, value: payload.items[0] };
        }
        return { cancelled: true, index: -1, value: "" };
      },
    },
    output: createOutputStub([]),
    proxy: {
      getProxyStatus: async () => ({ blocked: false, running: true }),
      startProxy: async () => ({ running: true }),
      statusProxy: async () => ({ status: "running" }),
      stopProxy: async () => true,
    },
    sync: {
      syncDroidSettings: async () => ({ success: true }),
    },
  });

  await interactive.runInteractiveHome();

  const homePrompt = selectSingleCalls.find((payload) => /Droxy Interactive/i.test(payload.title || ""));
  const accountsPrompt = selectSingleCalls.find((payload) => /Accounts/i.test(payload.title || ""));
  const connectedListPrompt = selectSingleCalls.find((payload) =>
    /Connected Accounts/i.test(payload.title || "")
  );
  assert.equal(Boolean(homePrompt), true);
  assert.equal(homePrompt.items.includes("Accounts"), true);
  assert.equal(Boolean(accountsPrompt), true);
  assert.equal(
    accountsPrompt.items.some((item) => /List Connected Accounts \(2\)/.test(item)),
    true
  );
  assert.equal(accountsPrompt.items.includes("Connect Account"), true);
  assert.equal(Boolean(connectedListPrompt), true);
  assert.match(connectedListPrompt.title, /Connected accounts:\s+2/i);
  assert.match(connectedListPrompt.title, /Connected \(2\)/i);
  assert.deepEqual(loginCalls, [{ providerId: "claude", quiet: false }]);
});

test("interactive mode reports non-interactive sessions", async () => {
  const outputCalls = [];
  const interactive = createInteractiveApi({
    isInteractiveSession: () => false,
    output: createOutputStub(outputCalls),
  });

  const result = await interactive.runInteractiveHome();
  assert.equal(result.success, false);
  assert.equal(result.reason, "non_interactive");
  const guided = outputCalls.find((entry) => entry[0] === "printGuidedError");
  assert.equal(Boolean(guided), true);
  assert.match(String(guided[1].what), /TTY/);
});

test("buildVisibleHomeActions hides stop when proxy is not running", () => {
  const actions = buildVisibleHomeActions({
    configExists: true,
    proxyBlocked: false,
    proxyRunning: false,
    selectedModelsCount: 0,
  });
  const labels = actions.map((item) => item.label);
  assert.equal(labels.includes("Accounts"), true);
  assert.equal(labels.includes("Start Proxy"), true);
  assert.equal(labels.includes("Stop Proxy"), false);
  assert.equal(labels.includes("Sync to Droid"), false);
});

test("buildVisibleHomeActions shows stop without manual sync when proxy runs", () => {
  const actions = buildVisibleHomeActions({
    configExists: true,
    proxyBlocked: false,
    proxyRunning: true,
    selectedModelsCount: 2,
  });
  const labels = actions.map((item) => item.label);
  assert.equal(labels.includes("Accounts"), true);
  assert.equal(labels.includes("Start Proxy"), false);
  assert.equal(labels.includes("Stop Proxy"), true);
  assert.equal(labels.includes("Choose Models"), true);
  assert.equal(labels.includes("Sync to Droid"), false);
});
