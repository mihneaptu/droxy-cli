"use strict";

const {
  buildVisibleHomeActions,
  normalizeModelIds,
  normalizeText,
} = require("./interactiveHelpers");

function buildSelectedModelsSummary(selectedModelsCount, thinkingModelsCount) {
  const summary = `Selected models: ${selectedModelsCount}`;
  if (thinkingModelsCount <= 0) return summary;
  if (selectedModelsCount === 1 && thinkingModelsCount === 1) {
    return `${summary} (with thinking)`;
  }
  return `${summary} (${thinkingModelsCount} with thinking)`;
}

function buildHomeTitle(output, context) {
  const selectedProvider = normalizeText(context.selectedProvider) || "not selected";
  const selectedModelsCount = Number(context.selectedModelsCount) || 0;
  const thinkingModelsCount = Number(context.thinkingModelsCount) || 0;
  const proxyState = context.proxyBlocked ? "blocked" : context.proxyRunning ? "running" : "stopped";
  const configState = context.configExists ? "loaded" : "missing";
  return [
    output.accent("Droxy Interactive"),
    output.dim("Manual setup flow with explicit provider/model selection"),
    output.dim(`Config: ${configState} | Proxy: ${proxyState}`),
    output.dim(`Provider: ${selectedProvider}`),
    output.dim(buildSelectedModelsSummary(selectedModelsCount, thinkingModelsCount)),
  ].join("\n");
}

async function promptHomeAction({ menu, output, context }) {
  const actions = buildVisibleHomeActions(context);
  const selection = await menu.selectSingle({
    title: buildHomeTitle(output, context),
    items: actions.map((item) => item.label),
    hint: "Use ↑/↓ and Enter. Press q to exit.",
  });
  if (!selection || selection.cancelled) return "exit";
  const action = actions[selection.index];
  return action ? action.id : "exit";
}

async function getMenuContext({ config, proxy }) {
  const state = config.readState() || {};
  const selectedModels = normalizeModelIds(state.selectedModels);
  const thinkingModels = normalizeModelIds(state.thinkingModels).filter((modelId) =>
    selectedModels.includes(modelId)
  );
  const context = {
    configExists:
      typeof config.configExists === "function" ? config.configExists() : true,
    proxyBlocked: false,
    proxyRunning: false,
    selectedModelsCount: selectedModels.length,
    thinkingModelsCount: thinkingModels.length,
    selectedProvider: normalizeText(state.selectedProvider) || "",
  };

  if (!context.configExists) return context;
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

module.exports = {
  getMenuContext,
  promptHomeAction,
};
