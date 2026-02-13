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
  assert.equal(DESIGN_TOKENS.claude.colors.accent, "#FF5C00");
});

test("voice catalog exposes one profile and shared copy", () => {
  assert.deepEqual(Object.keys(VOICE_PROFILES), ["claude"]);
  assert.match(
    getMessage("voice.principles.actionable", {}, "classic"),
    /next command/i
  );
});
