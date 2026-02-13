"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { DESIGN_TOKENS } = require("../src/ui/designTokens");
const { DEFAULT_UI_PROFILE, resolveUiProfile } = require("../src/ui/uiProfile");
const { VOICE_PROFILES, getMessage } = require("../src/ui/voiceCatalog");

test("ui profile resolution always maps to single canonical profile", () => {
  assert.equal(DEFAULT_UI_PROFILE, "claude");
  assert.equal(resolveUiProfile(""), "claude");
  assert.equal(resolveUiProfile("claude"), "claude");
  assert.equal(resolveUiProfile("anthropic"), "claude");
  assert.equal(resolveUiProfile("premium"), "claude");
  assert.equal(resolveUiProfile("classic"), "claude");
});

test("design tokens keep Droid orange as primary accent", () => {
  assert.equal(DESIGN_TOKENS.claude.colors.accent, "#F27B2F");
});

test("voice catalog exposes one profile and shared copy", () => {
  assert.deepEqual(Object.keys(VOICE_PROFILES), ["claude"]);
  assert.match(
    getMessage("voice.principles.actionable", {}, "classic"),
    /next command/i
  );
});

test("design tokens keep canonical voice priorities", () => {
  assert.deepEqual(
    DESIGN_TOKENS.claude.voice.priorities,
    [
      "cognitive-clarity",
      "calm-trust",
      "specific-next-command",
      "honest-uncertainty",
    ]
  );
});

test("voice catalog includes thinking-space and user-interest principles", () => {
  assert.match(getMessage("voice.principles.thinkingSpace"), /thinking space/i);
  assert.match(getMessage("voice.principles.userInterestFirst"), /user/i);
});
