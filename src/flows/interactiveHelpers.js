"use strict";

const readline = require("readline");

const MENU_ITEMS = [
  "1. Connect Provider",
  "2. Choose Models",
  "3. Sync to Droid",
  "4. Status",
  "5. Start Proxy",
  "6. Stop Proxy",
  "7. Exit",
];

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeModelIds(items) {
  const seen = new Set();
  const output = [];
  for (const item of Array.isArray(items) ? items : []) {
    const value = normalizeText(item);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  output.sort((left, right) => left.localeCompare(right));
  return output;
}

function parseIndexTokens(text, max) {
  const picked = new Set();
  const invalid = [];
  const tokens = normalizeText(text).split(/[,\s]+/).filter(Boolean);
  for (const token of tokens) {
    const parsed = Number.parseInt(token, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > max) {
      invalid.push(token);
      continue;
    }
    picked.add(parsed - 1);
  }
  return {
    indexes: Array.from(picked.values()),
    invalid,
  };
}

function createDefaultAsk(readlineApi = readline, input = process.stdin, output = process.stdout) {
  return async function ask(prompt) {
    return new Promise((resolve) => {
      const rl = readlineApi.createInterface({ input, output });
      rl.question(prompt, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  };
}

function buildProviderLines(providers) {
  return (Array.isArray(providers) ? providers : []).map(
    (provider, index) => `${index + 1}. ${provider.label} (${provider.id})`
  );
}

function printModelPicker(output, models, selected) {
  output.log("");
  output.log("Choose models:");
  for (let idx = 0; idx < models.length; idx += 1) {
    const marker = selected.has(models[idx]) ? "[x]" : "[ ]";
    output.log(`  ${marker} ${idx + 1}. ${models[idx]}`);
  }
  output.log("");
  output.log(output.dim("Commands: numbers toggle, a all, n none, c confirm, q cancel"));
  output.log("");
}

async function runModelSelectionPrompt({ ask, initialSelection, models, output }) {
  const selected = new Set(normalizeModelIds(initialSelection).filter((id) => models.includes(id)));
  while (true) {
    printModelPicker(output, models, selected);
    const answer = normalizeText(await ask("Model selection: ")).toLowerCase();
    if (!answer) continue;

    if (answer === "q" || answer === "quit" || answer === "cancel") {
      return null;
    }
    if (answer === "a" || answer === "all") {
      for (const model of models) selected.add(model);
      continue;
    }
    if (answer === "n" || answer === "none" || answer === "clear") {
      selected.clear();
      continue;
    }
    if (answer === "c" || answer === "confirm" || answer === "done") {
      if (!selected.size) {
        output.printWarning("Select at least one model before confirming.");
        continue;
      }
      return normalizeModelIds(Array.from(selected.values()));
    }

    const parsed = parseIndexTokens(answer, models.length);
    if (!parsed.indexes.length) {
      output.printWarning("Use model numbers like `1 2` or `1,3`.");
      continue;
    }

    for (const idx of parsed.indexes) {
      const id = models[idx];
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
    }
  }
}

module.exports = {
  buildProviderLines,
  MENU_ITEMS,
  createDefaultAsk,
  normalizeModelIds,
  normalizeText,
  parseIndexTokens,
  runModelSelectionPrompt,
};
