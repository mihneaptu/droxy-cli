"use strict";
const configModule = require("../config");
const loginModule = require("../login");
const proxyModule = require("../proxy");
const syncModule = require("../sync");
const menuModule = require("../ui/menu");
const outputModule = require("../ui/output");
const { Spinner } = require("../ui/spinner");
const { normalizeThinkingMode } = require("../helpers");
const { autoSyncSelectedModelsIfDrifted } = require("./interactiveAutoSync");
const { getMenuContext, promptHomeAction } = require("./interactiveHome");
const { createInteractiveProviderActions } = require("./interactiveProviderActions");
const {
  fetchModelEntriesForSelection,
  getConnectedProvidersWithStatus,
  normalizeThinkingModelModeHistory,
  promptModelSelection,
  promptThinkingManagementAction,
  promptThinkingModelForManagement,
  promptThinkingModelModes,
  promptThinkingModelSelection,
  promptProviderModelsSelection,
  readDroidSyncedModelIdsByProvider,
  resolveThinkingModeFromHistory,
  resolveThinkingModelModes,
  resolveThinkingModels,
  updateThinkingModelModeHistory,
} = require("./interactiveSelection");
const {
  buildProviderModelGroups,
  mergeProviderModelSelection,
  normalizeModelIds,
} = require("./interactiveHelpers");
function createInteractiveApi(overrides = {}) {
  const config = overrides.config || configModule;
  const login = overrides.login || loginModule;
  const proxy = overrides.proxy || proxyModule;
  const sync = overrides.sync || syncModule;
  const menu = overrides.menu || menuModule;
  const output = overrides.output || outputModule;
  const now = overrides.now || (() => new Date().toISOString());
  const readDroidSyncedModelIdsByProviderFn =
    overrides.readDroidSyncedModelIdsByProvider || readDroidSyncedModelIdsByProvider;
  const canReadDroidSyncState =
    typeof overrides.readDroidSyncedModelIdsByProvider === "function" ||
    Boolean(sync && typeof sync.getDroidManagedPaths === "function");
  const readDroidSyncedByProvider = () => readDroidSyncedModelIdsByProviderFn({ config, sync });
  const isInteractiveSession =
    overrides.isInteractiveSession ||
    (() => Boolean(process.stdin && process.stdin.isTTY && process.stdout && process.stdout.isTTY));
  const createSpinner = overrides.createSpinner || ((text) => new Spinner(text));
  const {
    accountsFlow,
    connectProviderFlow,
    startProxyFlow,
    statusFlow,
    stopProxyFlow,
  } = createInteractiveProviderActions({
    config,
    login,
    menu,
    now,
    output,
    proxy,
    sync,
  });

  function readPersistedModelsByProvider(state = {}) {
    const factory = state && state.factory && typeof state.factory === "object" ? state.factory : {};
    const byProvider =
      factory && factory.modelsByProvider && typeof factory.modelsByProvider === "object"
        ? factory.modelsByProvider
        : {};
    const output = {};
    for (const [providerId, ids] of Object.entries(byProvider)) {
      const normalizedProviderId = String(providerId || "").trim().toLowerCase();
      if (!normalizedProviderId) continue;
      output[normalizedProviderId] = normalizeModelIds(ids);
    }
    return output;
  }

  function resolveSyncedDefaultsForProvider({
    droidSyncedByProvider = {},
    persistedByProvider = {},
    providerGroup,
  } = {}) {
    const providerId = providerGroup && providerGroup.id ? providerGroup.id : "";
    if (!providerId) return [];

    const persistedIds = Array.isArray(persistedByProvider[providerId])
      ? persistedByProvider[providerId]
      : [];
    const droidIds = Array.isArray(droidSyncedByProvider[providerId])
      ? droidSyncedByProvider[providerId]
      : [];
    const sourceIds = persistedIds.length ? persistedIds : droidIds;
    return normalizeModelIds(sourceIds).filter((modelId) => providerGroup.models.includes(modelId));
  }
  async function chooseModelsFlow() {
    const spinner = createSpinner("Fetching available models...").start();
    let modelEntries = [];
    let detectedProtocol = null;
    try {
      const { entries = [], protocol = null } =
        await fetchModelEntriesForSelection({ config, proxy, sync });
      modelEntries = Array.isArray(entries) ? entries : [];
      detectedProtocol = typeof protocol === "string" && protocol ? protocol : null;
      spinner.succeed(`Loaded ${modelEntries.length} model${modelEntries.length === 1 ? "" : "s"}.`);
    } catch (err) {
      spinner.fail("Model fetch failed.");
      const message = err && err.message ? err.message : String(err || "Unknown error");
      output.printGuidedError({
        what: "Unable to load models.",
        why: message,
        next: [
          "Run: droxy start",
          "Run: droxy status --verbose",
          "Try this action again",
        ],
      });
      return { success: false, reason: "model_fetch_failed" };
    }

    if (!modelEntries.length) {
      output.printWarning("No models detected from your current proxy session.");
      return { success: false, reason: "no_models" };
    }

    const detectedModelIds = normalizeModelIds(
      modelEntries.map((entry) => (entry && entry.id ? entry.id : ""))
    );
    const detectedModelIdsByLower = new Map(
      detectedModelIds.map((modelId) => [String(modelId).toLowerCase(), modelId])
    );
    const projectIdsToDetectedModels = (ids, allowedSet = null) => {
      const projected = [];
      for (const modelId of normalizeModelIds(ids || [])) {
        const canonicalId = detectedModelIdsByLower.get(String(modelId).toLowerCase());
        if (!canonicalId) continue;
        if (allowedSet && !allowedSet.has(canonicalId)) continue;
        projected.push(canonicalId);
      }
      return normalizeModelIds(projected);
    };

    const stateAtLoadRaw = config.readState() || {};
    const selectedBeforePrune = normalizeModelIds(stateAtLoadRaw.selectedModels || []);
    const selectedAfterPrune = projectIdsToDetectedModels(selectedBeforePrune);
    const selectedAfterPruneSet = new Set(selectedAfterPrune);
    const thinkingBeforePrune = normalizeModelIds(stateAtLoadRaw.thinkingModels || []);
    const thinkingAfterPrune = projectIdsToDetectedModels(
      thinkingBeforePrune,
      selectedAfterPruneSet
    );
    const thinkingModesBeforePrune =
      stateAtLoadRaw.thinkingModelModes && typeof stateAtLoadRaw.thinkingModelModes === "object"
        ? stateAtLoadRaw.thinkingModelModes
        : {};
    const thinkingModesAfterPrune = {};
    for (const [modelId, mode] of Object.entries(thinkingModesBeforePrune)) {
      const canonicalId = detectedModelIdsByLower.get(String(modelId || "").trim().toLowerCase());
      if (!canonicalId) continue;
      if (!selectedAfterPruneSet.has(canonicalId)) continue;
      thinkingModesAfterPrune[canonicalId] = mode;
    }

    const staleSelectedCount = selectedBeforePrune.length - selectedAfterPrune.length;
    const staleThinkingCount = thinkingBeforePrune.length - thinkingAfterPrune.length;
    const staleThinkingModeCount =
      Object.keys(thinkingModesBeforePrune).length - Object.keys(thinkingModesAfterPrune).length;
    const staleStateDetected =
      staleSelectedCount > 0 ||
      staleThinkingCount > 0 ||
      staleThinkingModeCount > 0;

    const stateAtLoad = staleStateDetected
      ? config.updateState({
          selectedModels: selectedAfterPrune,
          thinkingModels: thinkingAfterPrune,
          thinkingModelModes: thinkingModesAfterPrune,
          lastInteractiveActionAt: now(),
        })
      : stateAtLoadRaw;

    if (staleSelectedCount > 0) {
      output.printInfo(
        `Removed ${staleSelectedCount} stale selected model${staleSelectedCount === 1 ? "" : "s"} not present in your current /v1/models list.`
      );
    }
    if (staleThinkingCount > 0 || staleThinkingModeCount > 0) {
      output.printInfo(
        "Pruned stale thinking settings that are no longer available for your current account."
      );
    }

    const values = config.readConfigValues();
    let providerStatusById = {};
    if (sync && typeof sync.fetchProviderConnectionStatusSafe === "function") {
      const providerStatus = await sync.fetchProviderConnectionStatusSafe(values, {
        state: stateAtLoad,
        quiet: true,
      });
      if (providerStatus && providerStatus.byProvider && typeof providerStatus.byProvider === "object") {
        providerStatusById = providerStatus.byProvider;
      }
    }
    const providerGroups = buildProviderModelGroups(
      modelEntries,
      getConnectedProvidersWithStatus(login, {
        ...values,
        providerStatusById,
      })
    );
    const syncedModelIdsByProvider = readDroidSyncedModelIdsByProviderFn({ config, sync });
    const persistedByProvider = readPersistedModelsByProvider(stateAtLoad);
    const syncedByProvider = Object.fromEntries(
      providerGroups.map((group) => {
        const defaults = resolveSyncedDefaultsForProvider({
          droidSyncedByProvider: syncedModelIdsByProvider,
          persistedByProvider,
          providerGroup: group,
        });
        return [group.id, defaults.length];
      })
    );
    if (!providerGroups.length) {
      output.printGuidedError({
        what: "No providers with detected models.",
        why: "Model picker only shows providers with explicit model metadata.",
        next: [
          "Use menu action: Connect Provider",
          "Then retry: Choose Models",
        ],
      });
      return { success: false, reason: "no_connected_provider_models" };
    }

    let selectedForProvider = [];
    let selectedModels = [];
    let providerGroup = null;
    let existingSelectedModels = [];

    while (true) {
      const state = config.readState() || {};
      existingSelectedModels = normalizeModelIds(state.selectedModels || []);
      const stateByProvider = readPersistedModelsByProvider(state);

      providerGroup = await promptProviderModelsSelection(
        menu,
        providerGroups,
        { syncedByProvider }
      );
      if (!providerGroup) {
        output.printInfo("Provider selection cancelled.");
        return { success: false, reason: "cancelled" };
      }

      const initialSelectedForProvider = resolveSyncedDefaultsForProvider({
        droidSyncedByProvider: syncedModelIdsByProvider,
        persistedByProvider: stateByProvider,
        providerGroup,
      });
      const selection = await promptModelSelection(
        menu,
        providerGroup.models,
        initialSelectedForProvider,
        providerGroup.label
      );
      if (!selection || selection.cancelled) {
        output.printInfo("Model selection cancelled. Returning to provider list.");
        continue;
      }

      selectedForProvider = normalizeModelIds(selection.selected);
      selectedModels = mergeProviderModelSelection(
        existingSelectedModels,
        providerGroup.models,
        selectedForProvider,
        providerGroup.id,
        stateByProvider[providerGroup.id] || []
      );
      break;
    }

    const currentState = config.readState() || {};
    const selectedModelSet = new Set(selectedModels);
    const existingSelectedModelSet = new Set(existingSelectedModels);
    const newlyAddedModels = selectedModels.filter((modelId) => !existingSelectedModelSet.has(modelId));
    const existingThinkingModels = normalizeModelIds(currentState.thinkingModels || []).filter((modelId) =>
      selectedModelSet.has(modelId)
    );
    const existingThinkingModelModes =
      currentState.thinkingModelModes && typeof currentState.thinkingModelModes === "object"
        ? currentState.thinkingModelModes
        : {};
    const existingThinkingModelModeHistory =
      currentState.thinkingModelModeHistory && typeof currentState.thinkingModelModeHistory === "object"
        ? currentState.thinkingModelModeHistory
        : {};
    let thinkingModelModeHistory = normalizeThinkingModelModeHistory(existingThinkingModelModeHistory);
    let effectiveThinkingModelModes = resolveThinkingModelModes(
      existingThinkingModels,
      existingThinkingModelModes
    );

    const initialNewThinkingModels = resolveThinkingModels(
      newlyAddedModels,
      [],
      { hasSavedThinkingSelection: false }
    );
    let newThinkingModels = [];
    if (newlyAddedModels.length) {
      const thinkingSelection = await promptThinkingModelSelection(
        menu,
        newlyAddedModels,
        initialNewThinkingModels
      );
      newThinkingModels =
        thinkingSelection && !thinkingSelection.cancelled
          ? normalizeModelIds(thinkingSelection.selected)
          : [];
    }

    if (newThinkingModels.length) {
      const initialNewThinkingModelModes = {};
      for (const modelId of newThinkingModels) {
        initialNewThinkingModelModes[modelId] =
          effectiveThinkingModelModes[modelId] ||
          resolveThinkingModeFromHistory(thinkingModelModeHistory, modelId) ||
          "medium";
      }
      const newThinkingModelModes = await promptThinkingModelModes(
        menu,
        newThinkingModels,
        initialNewThinkingModelModes
      );
      for (const [modelId, mode] of Object.entries(newThinkingModelModes)) {
        const normalizedMode = normalizeThinkingMode(mode) || "medium";
        if (normalizedMode === "none") {
          delete effectiveThinkingModelModes[modelId];
          continue;
        }
        effectiveThinkingModelModes[modelId] = normalizedMode;
        thinkingModelModeHistory = updateThinkingModelModeHistory(
          thinkingModelModeHistory,
          modelId,
          normalizedMode
        );
      }
    }

    while (selectedModels.length) {
      const action = await promptThinkingManagementAction(menu, {
        selectedModelsCount: selectedModels.length,
        thinkingModelsCount: Object.keys(effectiveThinkingModelModes).length,
      });
      if (action !== "manage_thinking_modes") break;
      const modelId = await promptThinkingModelForManagement(
        menu,
        selectedModels,
        effectiveThinkingModelModes,
        thinkingModelModeHistory
      );
      if (!modelId) continue;

      const initialMode =
        effectiveThinkingModelModes[modelId] ||
        resolveThinkingModeFromHistory(thinkingModelModeHistory, modelId) ||
        "medium";
      const nextModeMap = await promptThinkingModelModes(
        menu,
        [modelId],
        { [modelId]: initialMode }
      );
      const nextMode = normalizeThinkingMode(nextModeMap[modelId]) || initialMode;
      if (nextMode === "none") {
        delete effectiveThinkingModelModes[modelId];
        output.printSuccess(`Thinking disabled for ${modelId}.`);
        continue;
      }
      effectiveThinkingModelModes[modelId] = nextMode;
      thinkingModelModeHistory = updateThinkingModelModeHistory(
        thinkingModelModeHistory,
        modelId,
        nextMode
      );
      output.printSuccess(`Thinking mode saved for ${modelId}: ${nextMode}.`);
    }

    effectiveThinkingModelModes = Object.fromEntries(
      Object.entries(effectiveThinkingModelModes).filter(
        ([modelId, mode]) => selectedModelSet.has(modelId) && mode !== "none"
      )
    );
    const effectiveThinkingModels = normalizeModelIds(Object.keys(effectiveThinkingModelModes));

    config.updateState({
      selectedModels,
      thinkingModels: effectiveThinkingModels,
      thinkingModelModes: effectiveThinkingModelModes,
      thinkingModelModeHistory,
      lastInteractiveActionAt: now(),
    });

    if (selectedForProvider.length) {
      output.printSuccess(
        `Saved ${selectedForProvider.length} selected model${selectedForProvider.length === 1 ? "" : "s"} for ${providerGroup.label}.`
      );
    } else {
      output.printSuccess(`Cleared selected models for ${providerGroup.label}.`);
    }
    output.printSuccess(
      `Thinking enabled for ${effectiveThinkingModels.length} selected model${effectiveThinkingModels.length === 1 ? "" : "s"}.`
    );
    if (effectiveThinkingModels.length) {
      output.printSuccess(
        `Thinking modes saved for ${Object.keys(effectiveThinkingModelModes).length} model${Object.keys(effectiveThinkingModelModes).length === 1 ? "" : "s"}.`
      );
    }

    if (!selectedModels.length) {
      output.printInfo("No models selected overall. Clearing Droxy-managed models in Droid.");
    }

    const syncResult = await syncSelectedModelsFlow({
      allowEmptySelection: true,
      selectedModels,
      detectedEntries: modelEntries,
      protocol: detectedProtocol,
    });
    if (syncResult && syncResult.success) {
      return { success: true, selectedModels, synced: true };
    }

    output.printNextStep("Droxy will auto-retry Droid sync when proxy/model state is ready.");
    return { success: true, selectedModels, synced: false, syncResult };
  }
  async function syncSelectedModelsFlow(options = {}) {
    const state = config.readState() || {};
    const allowEmptySelection = options.allowEmptySelection === true;
    const selectedModels = normalizeModelIds(
      Array.isArray(options.selectedModels) ? options.selectedModels : state.selectedModels
    );
    if (!selectedModels.length && !allowEmptySelection) {
      output.printGuidedError({
        what: "No models selected yet.",
        why: "Droxy auto-syncs only models you explicitly selected.",
        next: [
          "Use menu action: Choose Models",
          "Droxy will sync automatically",
        ],
      });
      return { success: false, reason: "no_selected_models" };
    }

    const spinner = createSpinner("Syncing selected models to Droid...").start();
    let result;
    try {
      result = await sync.syncDroidSettings({
        quiet: true,
        selectedModels,
        detectedEntries: Array.isArray(options.detectedEntries) ? options.detectedEntries : undefined,
        protocol: options.protocol || undefined,
      });
    } catch (err) {
      spinner.fail("Sync failed.");
      output.printGuidedError({
        what: "Droid sync failed.",
        why: err && err.message ? err.message : String(err || "Unknown sync error."),
        next: ["Run: droxy status --verbose", "Droxy will auto-retry sync when ready"],
      });
      return { success: false, reason: "sync_failed" };
    }

    if (result && result.success) {
      if (result.result && result.result.status === "cleared") {
        spinner.succeed("Cleared Droxy-managed models in Droid.");
        config.updateState({ lastInteractiveActionAt: now() });
        return result;
      }
      const count =
        result.result && Number.isFinite(result.result.modelsAdded)
          ? result.result.modelsAdded
          : selectedModels.length;
      spinner.succeed(`Synced ${count} model${count === 1 ? "" : "s"} to Droid.`);
      config.updateState({ lastInteractiveActionAt: now() });
      return result;
    }

    spinner.fail("Sync skipped.");
    if (result && result.reason === "selected_models_not_found") {
      output.printGuidedError({
        what: "Selected models were not found in current proxy results.",
        why: "Your provider/model catalog changed since last selection.",
        next: ["Use menu action: Choose Models", "Droxy will auto-sync after selection"],
      });
    } else if (result && result.reason === "proxy_unreachable") {
      output.printGuidedError({
        what: "Proxy is unreachable for model sync.",
        why: "Droxy could not query /v1/models on your configured host/port.",
        next: ["Use menu action: Start Proxy", "Droxy auto-sync resumes once proxy is running"],
      });
    } else {
      output.printGuidedError({
        what: "Sync could not be completed.",
        why: "Droxy did not receive a successful sync result.",
        next: ["Run: droxy status --verbose", "Droxy auto-sync will retry"],
      });
    }
    return result || { success: false, reason: "sync_failed" };
  }
  async function runInteractiveHome() {
    if (!isInteractiveSession()) {
      output.printGuidedError({
        what: "Interactive mode requires a TTY terminal.",
        why: "Prompts and model picker need interactive stdin/stdout.",
        next: ["Run: droxy help"],
      });
      return { success: false, reason: "non_interactive" };
    }
    let exitRequested = false;
    while (!exitRequested) {
      const context = await getMenuContext({ config, proxy });
      await autoSyncSelectedModelsIfDrifted({
        canReadDroidSyncState, config, context, normalizeModelIds, output,
        readDroidSyncedModelIdsByProvider: readDroidSyncedByProvider, syncSelectedModelsFlow,
      });
      const refreshedContext = await getMenuContext({ config, proxy });
      const action = await promptHomeAction({ menu, output, context: refreshedContext });
      if (action === "connect_provider") {
        await connectProviderFlow();
      } else if (action === "accounts") {
        await accountsFlow();
      } else if (action === "choose_models") {
        await chooseModelsFlow();
      } else if (action === "status") {
        await statusFlow();
      } else if (action === "start_proxy") {
        await startProxyFlow();
      } else if (action === "stop_proxy") {
        await stopProxyFlow();
      } else {
        exitRequested = true;
      }
    }

    output.log("");
    output.printInfo("Exited interactive mode.");
    return { success: true };
  }
  return {
    accountsFlow,
    chooseModelsFlow,
    connectProviderFlow,
    runInteractiveHome,
    syncSelectedModelsFlow,
  };
}
const interactiveApi = createInteractiveApi();

module.exports = {
  createInteractiveApi,
  ...interactiveApi,
};
