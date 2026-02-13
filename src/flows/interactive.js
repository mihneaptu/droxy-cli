"use strict";
const configModule = require("../config");
const loginModule = require("../login");
const proxyModule = require("../proxy");
const syncModule = require("../sync");
const menuModule = require("../ui/menu");
const outputModule = require("../ui/output");
const { Spinner } = require("../ui/spinner");
const { autoSyncSelectedModelsIfDrifted } = require("./interactiveAutoSync");
const { getMenuContext, promptHomeAction } = require("./interactiveHome");
const { createInteractiveProviderActions } = require("./interactiveProviderActions");
const {
  fetchModelEntriesForSelection,
  getConnectedProvidersWithStatus,
  promptModelSelection,
  promptThinkingModelSelection,
  promptProviderModelsSelection,
  readDroidSyncedModelIdsByProvider,
  resolveThinkingModels,
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
  });
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

    const values = config.readConfigValues();
    const providerGroups = buildProviderModelGroups(
      modelEntries,
      getConnectedProvidersWithStatus(login, values)
    );
    const syncedModelIdsByProvider = readDroidSyncedModelIdsByProviderFn({ config, sync });
    const syncedByProvider = Object.fromEntries(
      Object.entries(syncedModelIdsByProvider).map(([providerId, ids]) => [
        providerId,
        normalizeModelIds(ids).length,
      ])
    );
    if (!providerGroups.length) {
      output.printGuidedError({
        what: "No connected providers with detected models.",
        why: "Model picker only shows providers that are currently connected.",
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

      providerGroup = await promptProviderModelsSelection(
        menu,
        providerGroups,
        { syncedByProvider }
      );
      if (!providerGroup) {
        output.printInfo("Provider selection cancelled.");
        return { success: false, reason: "cancelled" };
      }

      const initialSelectedForProvider = normalizeModelIds(
        (Array.isArray(syncedModelIdsByProvider[providerGroup.id])
          ? syncedModelIdsByProvider[providerGroup.id]
          : []
        ).filter((modelId) => providerGroup.models.includes(modelId))
      );
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
        providerGroup.id
      );
      break;
    }

    const currentState = config.readState() || {};
    const existingThinkingModels = normalizeModelIds(currentState.thinkingModels || []).filter((modelId) =>
      selectedModels.includes(modelId)
    );
    const initialThinkingModels = resolveThinkingModels(
      selectedModels,
      existingThinkingModels
    );
    const thinkingSelection = await promptThinkingModelSelection(
      menu,
      selectedModels,
      initialThinkingModels
    );
    const thinkingModels =
      thinkingSelection && !thinkingSelection.cancelled
        ? normalizeModelIds(thinkingSelection.selected)
        : existingThinkingModels;

    config.updateState({
      selectedModels,
      thinkingModels,
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
      `Thinking enabled for ${thinkingModels.length} selected model${thinkingModels.length === 1 ? "" : "s"}.`
    );

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
