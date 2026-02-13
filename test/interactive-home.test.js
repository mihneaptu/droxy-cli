"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { promptHomeAction } = require("../src/flows/interactiveHome");

function createOutputStub() {
  return {
    accent: (text) => String(text),
    dim: (text) => String(text),
  };
}

async function renderHomeTitle(context) {
  let seenTitle = "";
  await promptHomeAction({
    context,
    menu: {
      selectSingle: async (payload) => {
        seenTitle = payload.title;
        return { cancelled: true, index: -1, value: "" };
      },
    },
    output: createOutputStub(),
  });
  return seenTitle;
}

test("home title shows single selected model with thinking inline", async () => {
  const title = await renderHomeTitle({
    configExists: true,
    proxyBlocked: false,
    proxyRunning: true,
    selectedModelsCount: 1,
    selectedProvider: "codex",
    thinkingModelsCount: 1,
  });
  assert.match(title, /Selected models: 1 \(with thinking\)/);
  assert.doesNotMatch(title, /Thinking models:/);
});

test("home title shows multiple selected models with thinking count inline", async () => {
  const title = await renderHomeTitle({
    configExists: true,
    proxyBlocked: false,
    proxyRunning: true,
    selectedModelsCount: 3,
    selectedProvider: "codex",
    thinkingModelsCount: 2,
  });
  assert.match(title, /Selected models: 3 \(2 with thinking\)/);
  assert.doesNotMatch(title, /Thinking models:/);
});

test("home title omits thinking suffix when no thinking models are selected", async () => {
  const title = await renderHomeTitle({
    configExists: true,
    proxyBlocked: false,
    proxyRunning: true,
    selectedModelsCount: 3,
    selectedProvider: "codex",
    thinkingModelsCount: 0,
  });
  assert.match(title, /Selected models: 3/);
  assert.doesNotMatch(title, /with thinking/);
});
