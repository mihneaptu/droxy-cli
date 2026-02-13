"use strict";

const HOME_ACTIONS = [
  { id: "connect_provider", label: "Connect Provider" },
  { id: "choose_models", label: "Choose Models" },
  { id: "sync_droid", label: "Sync to Droid" },
  { id: "status", label: "Status" },
  { id: "start_proxy", label: "Start Proxy" },
  { id: "stop_proxy", label: "Stop Proxy" },
  { id: "exit", label: "Exit" },
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

module.exports = {
  HOME_ACTIONS,
  normalizeModelIds,
  normalizeText,
};
