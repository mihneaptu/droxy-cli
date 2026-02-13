"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { runCli } = require("../droxy.js");

function createDeps() {
  const calls = [];
  return {
    calls,
    deps: {
      version: "0.1.0",
      output: {
        log: (msg) => calls.push(["log", String(msg)]),
        printGuidedError: (payload) => calls.push(["printGuidedError", payload]),
      },
      proxy: {
        startProxy: async (opts) => calls.push(["startProxy", opts]),
        stopProxy: async (opts) => calls.push(["stopProxy", opts]),
        statusProxy: async (opts) => calls.push(["statusProxy", opts]),
      },
      login: {
        loginFlow: async (opts) => calls.push(["loginFlow", opts]),
      },
      sync: {
        syncDroidSettings: async (opts) => calls.push(["syncDroidSettings", opts]),
      },
    },
  };
}

test("routes start/stop/status commands", async () => {
  const first = createDeps();
  await runCli(["start", "--quiet"], first.deps);
  assert.deepEqual(first.calls, [["startProxy", { quiet: true, allowAttach: true }]]);

  const second = createDeps();
  await runCli(["stop", "--force", "--quiet"], second.deps);
  assert.deepEqual(second.calls, [["stopProxy", { force: true, quiet: true }]]);

  const third = createDeps();
  await runCli(["status", "--check", "--json", "--verbose", "--quiet"], third.deps);
  assert.deepEqual(third.calls, [[
    "statusProxy",
    { check: true, json: true, verbose: true, quiet: true },
  ]]);
});

test("routes login/connect with provider and model flags", async () => {
  const login = createDeps();
  await runCli(["login", "claude", "--with-models"], login.deps);
  assert.deepEqual(login.calls, [[
    "loginFlow",
    { providerId: "claude", selectModels: true, quiet: false },
  ]]);

  const connect = createDeps();
  await runCli(["connect", "codex", "--skip-models", "--quiet"], connect.deps);
  assert.deepEqual(connect.calls, [[
    "loginFlow",
    { providerId: "codex", selectModels: false, quiet: true },
  ]]);
});

test("routes droid sync", async () => {
  const target = createDeps();
  await runCli(["droid", "sync", "--quiet"], target.deps);
  assert.deepEqual(target.calls, [["syncDroidSettings", { quiet: true }]]);
});

test("help and version aliases log expected output", async () => {
  const help = createDeps();
  await runCli(["--help"], help.deps);
  assert.equal(help.calls.length > 0, true);
  assert.equal(help.calls[0][0], "log");
  assert.match(help.calls[0][1], /Droxy CLI v0.1.0/);

  const version = createDeps();
  await runCli(["--version"], version.deps);
  assert.deepEqual(version.calls, [["log", "0.1.0"]]);
});

test("unknown command prints suggestion and help", async () => {
  const previousExitCode = process.exitCode;
  const target = createDeps();
  try {
    process.exitCode = 0;
    await runCli(["stauts"], target.deps);
    assert.equal(process.exitCode, 1);
    const guided = target.calls.find((entry) => entry[0] === "printGuidedError");
    assert.equal(Boolean(guided), true);
    assert.match(String(guided[1].what || ""), /Unknown command "stauts"/);
    assert.equal(
      Array.isArray(guided[1].next) && guided[1].next.some((step) => /droxy status/.test(step)),
      true
    );
    assert.equal(target.calls.some((entry) => /Usage:/.test(entry[1]) || /Droxy CLI/.test(entry[1])), true);
  } finally {
    process.exitCode = previousExitCode;
  }
});
