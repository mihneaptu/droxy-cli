"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { PassThrough } = require("stream");

const { createMenuApi } = require("../src/ui/menu");

function createTtyIo() {
  const input = new PassThrough();
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = (nextValue) => {
    input.isRaw = Boolean(nextValue);
  };

  const output = new PassThrough();
  output.isTTY = true;

  return { input, output };
}

test("selectMultiple keeps backward compatibility for string items", async () => {
  const { input, output } = createTtyIo();
  const menu = createMenuApi({ input, output });

  const selectionPromise = menu.selectMultiple({
    title: "Choose",
    items: ["a", "b"],
    initialSelected: ["b"],
  });

  process.nextTick(() => {
    input.emit("data", Buffer.from("\r"));
  });

  const result = await selectionPromise;
  assert.equal(result.cancelled, false);
  assert.deepEqual(result.selected, ["b"]);
});

test("selectMultiple supports object items and returns canonical values", async () => {
  const { input, output } = createTtyIo();
  const menu = createMenuApi({ input, output });

  const selectionPromise = menu.selectMultiple({
    title: "Choose",
    items: [
      { value: "gpt-oss-120b-medium", label: "gpt-oss-120b-medium  · family: gpt" },
      { value: "gemini-3-flash", label: "gemini-3-flash  · family: gemini" },
    ],
    initialSelected: ["gemini-3-flash"],
  });

  process.nextTick(() => {
    input.emit("data", Buffer.from("\r"));
  });

  const result = await selectionPromise;
  assert.equal(result.cancelled, false);
  assert.deepEqual(result.selected, ["gemini-3-flash"]);
});
