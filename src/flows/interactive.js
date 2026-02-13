"use strict";

const configModule = require("../config");
const loginModule = require("../login");
const proxyModule = require("../proxy");
const syncModule = require("../sync");
const menuModule = require("../ui/menu");
const outputModule = require("../ui/output");
const { Spinner } = require("../ui/spinner");
const { buildVisibleHomeActions, normalizeModelIds, normalizeText } = require("./interactiveHelpers");

function createInteractiveApi(overrides = {}) {
  const config = overrides.config || configModule;
  const login = overrides.login || loginModule;
  const proxy = overrides.proxy || proxyModule;
  const sync = overrides.sync || syncModule;
  const menu = overrides.menu || menuModule;
  const output = overrides.output || outputModule;
  const now = overrides.now || (() => new Date().toISOString());
  const isInteractiveSession =
    overrides.isInteractiveSession ||
    (() => Boolean(process.stdin && process.stdin.isTTY && process.stdout && process.stdout.isTTY));
  const createSpinner = overrides.createSpinner || ((text) => new Spinner(text));

  function homeTitle(context) {
    const selectedProvider = normalizeText(context.selectedProvider) || "not selected";
    const selectedModelsCount = Number(context.selectedModelsCount) || 0;
    const proxyState = context.proxyBlocked
      ? "blocked"
      : context.proxyRunning
        ? "running"
        : "stopped";
    const configState = context.configExists ? "loaded" : "missing";
    return [
      output.accent("Droxy Interactive"),
      output.dim("Manual setup flow with explicit provider/model selection"),
      output.dim(`Config: ${configState} | Proxy: ${proxyState}`),
      output.dim(`Provider: ${selectedProvider}`),
      output.dim(`Selected models: ${selectedModelsCount}`),
    ].join("\n");
  }

  async function promptHomeAction(context) {
    const actions = buildVisibleHomeActions(context);
    const selection = await menu.selectSingle({
      title: homeTitle(context),
      items: actions.map((item) => item.label),
      hint: "Use ↑/↓ and Enter. Press q to exit.",
    });
    if (!selection || selection.cancelled) return "exit";
    const action = actions[selection.index];
    return action ? action.id : "exit";
  }

  async function getMenuContext() {
    const state = config.readState() || {};
    const selectedModels = normalizeModelIds(state.selectedModels);
    const context = {
      configExists:
        typeof config.configExists === "function" ? config.configExists() : true,
      proxyBlocked: false,
      proxyRunning: false,
      selectedModelsCount: selectedModels.length,
      selectedProvider: normalizeText(state.selectedProvider) || "",
    };

    if (!context.configExists) {
      return context;
    }

    if (
      typeof config.readConfigValues !== "function" ||
      typeof proxy.getProxyStatus !== "function"
    ) {
      return context;
    }

    try {
      const values = config.readConfigValues();
      if (!values || !values.host || !values.port) return context;
      const status = await proxy.getProxyStatus(values.host, values.port);
      context.proxyRunning = Boolean(status && status.running);
      context.proxyBlocked = Boolean(status && status.blocked);
    } catch {
      // Keep default proxy state when status lookup fails.
    }

    return context;
  }

  async function promptProviderSelection() {
    const providers = Array.isArray(login.PROVIDERS) ? login.PROVIDERS : [];
    if (!providers.length) return null;

    const selection = await menu.selectSingle({
      title: "Choose provider",
      items: providers.map((provider) => `${provider.label} (${provider.id})`),
      hint: "Use ↑/↓ and Enter. Press q to cancel.",
    });

    if (!selection || selection.cancelled) return null;
    return providers[selection.index] || null;
  }

  async function connectProviderFlow() {
    config.ensureConfig();
    const provider = await promptProviderSelection();
    if (!provider) {
      output.printInfo("Provider selection cancelled.");
      return { success: false, reason: "cancelled" };
    }

    const result = await login.loginFlow({
      providerId: provider.id,
      quiet: false,
    });

    if (result && result.success === false) {
      return result;
    }

    config.updateState({
      selectedProvider: provider.id,
      lastInteractiveActionAt: now(),
    });

    output.printSuccess(`Provider selected: ${provider.id}`);
    return { success: true, provider: provider.id };
  }

  async function fetchModelIdsForSelection() {
    config.ensureConfig();
    const values = config.readConfigValues();
    const status = await proxy.getProxyStatus(values.host, values.port);
    if (status.blocked) {
      throw new Error("Configured proxy port is blocked by a non-Droxy process.");
    }
    if (!status.running) {
      throw new Error("Droxy proxy is not running.");
    }

    const state = config.readState() || {};
    const apiKey = values.apiKey || state.apiKey || "";
    const protocolResolution = await sync.resolveReachableProtocol(values, {
      probePath: "/v1/models",
    });

    if (!protocolResolution.reachable) {
      throw sync.buildProtocolUnavailableError(protocolResolution);
    }

    const entries = await sync.fetchAvailableModelEntries(
      { ...values, apiKey },
      { protocolResolution }
    );

    return normalizeModelIds(entries.map((entry) => (entry && entry.id ? String(entry.id) : "")));
  }

  async function promptModelSelection(models, initialSelected) {
    return menu.selectMultiple({
      title: "Choose models",
      items: models,
      initialSelected: normalizeModelIds(initialSelected),
      hint: "↑/↓ move  space toggle  a all  n none  enter confirm  q cancel",
    });
  }

  async function chooseModelsFlow() {
    const spinner = createSpinner("Fetching available models...").start();
    let models = [];
    try {
      models = await fetchModelIdsForSelection();
      spinner.succeed(`Loaded ${models.length} model${models.length === 1 ? "" : "s"}.`);
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

    if (!models.length) {
      output.printWarning("No models detected from your current proxy session.");
      return { success: false, reason: "no_models" };
    }

    const state = config.readState() || {};
    const selection = await promptModelSelection(models, state.selectedModels || []);
    if (!selection || selection.cancelled) {
      output.printInfo("Model selection cancelled.");
      return { success: false, reason: "cancelled" };
    }

    const selectedModels = normalizeModelIds(selection.selected);
    if (!selectedModels.length) {
      output.printWarning("No models selected. Selection was not changed.");
      return { success: false, reason: "empty_selection" };
    }

    config.updateState({
      selectedModels,
      lastInteractiveActionAt: now(),
    });

    output.printSuccess(`Saved ${selectedModels.length} selected model${selectedModels.length === 1 ? "" : "s"}.`);
    output.printNextStep("Use menu action `Sync to Droid`.");
    return { success: true, selectedModels };
  }

  async function syncSelectedModelsFlow() {
    const state = config.readState() || {};
    const selectedModels = normalizeModelIds(state.selectedModels);
    if (!selectedModels.length) {
      output.printGuidedError({
        what: "No models selected yet.",
        why: "Manual mode syncs only models you explicitly selected.",
        next: [
          "Use menu action: Choose Models",
          "Then use menu action: Sync to Droid",
        ],
      });
      return { success: false, reason: "no_selected_models" };
    }

    const spinner = createSpinner("Syncing selected models to Droid...").start();
    let result;
    try {
      result = await sync.syncDroidSettings({ quiet: true, selectedModels });
    } catch (err) {
      spinner.fail("Sync failed.");
      output.printGuidedError({
        what: "Droid sync failed.",
        why: err && err.message ? err.message : String(err || "Unknown sync error."),
        next: ["Run: droxy status --verbose", "Retry menu action: Sync to Droid"],
      });
      return { success: false, reason: "sync_failed" };
    }

    if (result && result.success) {
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
        next: ["Use menu action: Choose Models", "Then retry: Sync to Droid"],
      });
    } else if (result && result.reason === "proxy_unreachable") {
      output.printGuidedError({
        what: "Proxy is unreachable for model sync.",
        why: "Droxy could not query /v1/models on your configured host/port.",
        next: ["Use menu action: Start Proxy", "Then retry: Sync to Droid"],
      });
    } else {
      output.printGuidedError({
        what: "Sync could not be completed.",
        why: "Droxy did not receive a successful sync result.",
        next: ["Run: droxy status --verbose", "Retry menu action: Sync to Droid"],
      });
    }
    return result || { success: false, reason: "sync_failed" };
  }

  async function statusFlow() {
    const result = await proxy.statusProxy({ check: false, json: false, verbose: true, quiet: false });
    config.updateState({ lastInteractiveActionAt: now() });
    return result;
  }

  async function startProxyFlow() {
    const result = await proxy.startProxy({ allowAttach: true, quiet: false });
    config.updateState({ lastInteractiveActionAt: now() });
    return result;
  }

  async function stopProxyFlow() {
    const result = await proxy.stopProxy({ force: false, quiet: false });
    config.updateState({ lastInteractiveActionAt: now() });
    return result;
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
      const context = await getMenuContext();
      const action = await promptHomeAction(context);

      if (action === "connect_provider") {
        await connectProviderFlow();
      } else if (action === "choose_models") {
        await chooseModelsFlow();
      } else if (action === "sync_droid") {
        await syncSelectedModelsFlow();
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
