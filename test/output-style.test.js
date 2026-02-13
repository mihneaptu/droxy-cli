"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const output = require("../src/ui/output");

function captureStdout(fn) {
  const originalWrite = process.stdout.write;
  const chunks = [];
  process.stdout.write = (value) => {
    chunks.push(String(value));
    return true;
  };
  try {
    fn();
    return chunks.join("");
  } finally {
    process.stdout.write = originalWrite;
  }
}

test("printGuidedError renders what/why/next structure", () => {
  const text = captureStdout(() => {
    output.printGuidedError({
      what: "Sync failed.",
      why: "Proxy is unreachable.",
      next: ["Run: droxy start", "Retry via interactive auto-sync: droxy"],
    });
  });

  assert.match(text, /Sync failed\./);
  assert.match(text, /Why:/);
  assert.match(text, /Next:/);
  assert.match(text, /droxy start/);
});

test("printError keeps compatibility and adds next command guidance", () => {
  const text = captureStdout(() => {
    output.printError("Binary missing.", "No proxy binary found.", "droxy start");
  });

  assert.match(text, /Binary missing\./);
  assert.match(text, /No proxy binary found\./);
  assert.match(text, /Run: droxy start/);
});

test("printGuidedError omits next section when no next steps are provided", () => {
  const text = captureStdout(() => {
    output.printGuidedError({
      what: "Sync skipped.",
      why: "No selected models were found.",
      next: [],
    });
  });

  assert.match(text, /Sync skipped\./);
  assert.match(text, /Why:/);
  assert.doesNotMatch(text, /Next:/);
});

test("printError adds calm fallback guidance when hint and command are missing", () => {
  const text = captureStdout(() => {
    output.printError("Request failed.");
  });

  assert.match(text, /Request failed\./);
  assert.match(text, /Droxy could not complete this step yet\./);
  assert.match(text, /Run: droxy help/);
});

test("printSuccess/printWarning/printInfo skip empty messages", () => {
  const text = captureStdout(() => {
    output.printSuccess("   ");
    output.printWarning("");
    output.printInfo(null);
  });

  assert.equal(text, "");
});
