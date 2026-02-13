"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");

function listJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listJsFiles(fullPath));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".js")) {
      out.push(fullPath);
    }
  }
  return out;
}

test("non-ui modules do not write directly to stdout or console.log", () => {
  const root = path.resolve(__dirname, "..");
  const srcRoot = path.join(root, "src");
  const files = listJsFiles(srcRoot)
    .filter((file) => !file.includes(`${path.sep}src${path.sep}ui${path.sep}`))
    .concat(path.join(root, "droxy.js"));

  const offenders = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    if (/console\.log\s*\(/.test(text) || /process\.stdout\.write\s*\(/.test(text)) {
      offenders.push(path.relative(root, file));
    }
  }

  assert.deepEqual(offenders, []);
});
