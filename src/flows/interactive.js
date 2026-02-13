"use strict";

const configModule = require("../config");
const loginModule = require("../login");
const proxyModule = require("../proxy");
const syncModule = require("../sync");
const outputModule = require("../ui/output");
const { Spinner } = require("../ui/spinner");
const {
  buildProviderLines,
  MENU_ITEMS,
  createDefaultAsk,
  normalizeModelIds,
  normalizeText,
  runModelSelectionPrompt,
} = require("./interactiveHelpers");

function createInteractiveApi(overrides = {}) {
  const config = overrides.config || configModule;
  const login = overrides.login || loginModule;
  const proxy = overrides.proxy || proxyModule;
  const sync = overrides.sync || syncModule;
  const output = overrides.output || outputModule;
  const ask =
    overrides.ask ||
    createDefaultAsk(overrides.readline, overrides.input, overrides.outputStream);
  const now = overrides.now || (() => new Date().toISOString());
  const isInteractiveSession =
    overrides.isInteractiveSession ||
    (() => Boolean(process.stdin && process.stdin.isTTY && process.stdout && process.stdout.isTTY));
  const createSpinner = overrides.createSpinner || ((text) => new Spinner(text));

  function printHome() {
    const state = config.readState() || {};
    const selectedProvider = normalizeText(state.selectedProvider) || "not selected";
    const selectedModels = normalizeModelIds(state.selectedModels);

    output.log("");
    output.printDivider();
    output.log(output.accent("Droxy Interactive"));
    output.log(output.dim("Manual setup flow with explicit provider/model selection."));
    output.log(output.dim(`Provider: ${selectedProvider}`));
    output.log(output.dim(`Selected models: ${selectedModels.length}`));
    output.printDivider();
    output.log("");

    for (const item of MENU_ITEMS) {
      output.log(item);
    }
    output.log("");
  }

  async function promptHomeChoice() {
    return normalizeText(await ask("Select action: ")).toLowerCase();
  }

  function providerLines() {
    return buildProviderLines(login.PROVIDERS);
  }

  async function promptProviderSelection() {
    const providers = Array.isArray(login.PROVIDERS) ? login.PROVIDERS : [];
    if (!providers.length) return null;

    output.log("");
    output.log("Choose provider:");
    for (const line of providerLines()) {
      output.log(`  ${line}`);
    }
    output.log("");

    const answer = normalizeText(await ask("Provider number or id (q to cancel): "));
    if (!answer) return null;
    const lower = answer.toLowerCase();
    if (lower === "q" || lower === "quit" || lower === "cancel") return null;

    const number = Number.parseInt(answer, 10);
    if (Number.isFinite(number) && number >= 1 && number <= providers.length) {
      return providers[number - 1];
    }
    return typeof login.resolveProvider === "function" ? login.resolveProvider(answer) : null;
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

    return normalizeModelIds(
      entries.map((entry) => (entry && entry.id ? String(entry.id) : ""))
    );
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
    const selectedModels = await runModelSelectionPrompt({
      ask,
      initialSelection: state.selectedModels || [],
      models,
      output,
    });
    if (!selectedModels) {
      output.printInfo("Model selection cancelled.");
      return { success: false, reason: "cancelled" };
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
      printHome();
      const choice = await promptHomeChoice();

      if (choice === "1") {
        await connectProviderFlow();
      } else if (choice === "2") {
        await chooseModelsFlow();
      } else if (choice === "3") {
        await syncSelectedModelsFlow();
      } else if (choice === "4") {
        await statusFlow();
      } else if (choice === "5") {
        await startProxyFlow();
      } else if (choice === "6") {
        await stopProxyFlow();
      } else if (choice === "7" || choice === "q" || choice === "quit" || choice === "exit") {
        exitRequested = true;
      } else {
        output.printWarning("Choose a menu number between 1 and 7.");
      }
    }

    output.log("");
    output.printInfo("Exited interactive mode.");
    return { success: true };
  }

  return {
    MENU_ITEMS,
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
