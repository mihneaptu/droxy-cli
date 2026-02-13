"use strict";

const HOME_ACTIONS = Object.freeze({
  chooseModels: { id: "choose_models", label: "Choose Models" },
  connectProvider: { id: "connect_provider", label: "Connect Provider" },
  exit: { id: "exit", label: "Exit" },
  startProxy: { id: "start_proxy", label: "Start Proxy" },
  status: { id: "status", label: "Status" },
  stopProxy: { id: "stop_proxy", label: "Stop Proxy" },
  syncDroid: { id: "sync_droid", label: "Sync to Droid" },
});

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

function buildVisibleHomeActions(context = {}) {
  const configExists = context.configExists !== false;
  const proxyBlocked = context.proxyBlocked === true;
  const proxyRunning = context.proxyRunning === true;
  const selectedModelsCount = Number(context.selectedModelsCount) || 0;
  const actions = [];

  actions.push(HOME_ACTIONS.connectProvider);

  if (configExists) {
    if (proxyRunning) {
      actions.push(HOME_ACTIONS.chooseModels);
      if (selectedModelsCount > 0) {
        actions.push(HOME_ACTIONS.syncDroid);
      }
    }
    actions.push(HOME_ACTIONS.status);

    if (proxyRunning) {
      actions.push(HOME_ACTIONS.stopProxy);
    } else if (!proxyBlocked) {
      actions.push(HOME_ACTIONS.startProxy);
    }
  } else {
    actions.push(HOME_ACTIONS.status);
  }

  actions.push(HOME_ACTIONS.exit);
  return actions;
}

module.exports = {
  buildVisibleHomeActions,
  HOME_ACTIONS,
  normalizeModelIds,
  normalizeText,
};
