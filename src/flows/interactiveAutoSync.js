"use strict";

function flattenSyncedModelIdsByProvider(idsByProvider, normalizeModelIds) {
  const all = [];
  for (const ids of Object.values(idsByProvider || {})) {
    all.push(...normalizeModelIds(ids));
  }
  return normalizeModelIds(all);
}

function areModelSelectionsEqual(left, right, normalizeModelIds) {
  const leftIds = normalizeModelIds(left);
  const rightIds = normalizeModelIds(right);
  if (leftIds.length !== rightIds.length) return false;
  for (let index = 0; index < leftIds.length; index += 1) {
    if (leftIds[index] !== rightIds[index]) return false;
  }
  return true;
}

async function autoSyncSelectedModelsIfDrifted({
  canReadDroidSyncState,
  config,
  context = {},
  normalizeModelIds,
  output,
  readDroidSyncedModelIdsByProvider,
  syncSelectedModelsFlow,
} = {}) {
  if (!canReadDroidSyncState) {
    return { success: false, reason: "sync_state_unavailable" };
  }

  const state = config.readState() || {};
  const selectedModels = normalizeModelIds(state.selectedModels || []);
  const syncedByProvider = readDroidSyncedModelIdsByProvider();
  const syncedModels = flattenSyncedModelIdsByProvider(syncedByProvider, normalizeModelIds);

  if (areModelSelectionsEqual(selectedModels, syncedModels, normalizeModelIds)) {
    return { success: true, reason: "already_synced" };
  }

  if (!context.proxyRunning) {
    return { success: false, reason: "proxy_not_running" };
  }
  if (context.proxyBlocked) {
    return { success: false, reason: "proxy_blocked" };
  }

  output.printInfo("Model selection drift detected. Auto-syncing Droid...");
  const result = await syncSelectedModelsFlow({
    allowEmptySelection: true,
    selectedModels,
  });
  if (result && result.success) {
    return { success: true, reason: "auto_synced", result };
  }
  return result || { success: false, reason: "auto_sync_failed" };
}

module.exports = {
  autoSyncSelectedModelsIfDrifted,
};
