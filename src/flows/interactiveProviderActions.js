"use strict";

const { promptAccountsAction, promptConnectedAccountsList } = require("./interactiveAccounts");
const {
  getProvidersWithStatus,
  promptProviderSelection,
} = require("./interactiveSelection");

function createInteractiveProviderActions({
  config,
  login,
  menu,
  now,
  output,
  proxy,
}) {
  function readProviderStatuses() {
    config.ensureConfig();
    const configValues = config.readConfigValues();
    return getProvidersWithStatus(login, configValues);
  }

  async function connectProviderFlow() {
    const providers = readProviderStatuses();
    const provider = await promptProviderSelection(menu, providers);
    if (!provider) {
      output.printInfo("Provider selection cancelled.");
      return { success: false, reason: "cancelled" };
    }
    if (provider.connected) {
      output.printInfo("Provider already connected. Continuing will refresh login.");
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

  async function accountsFlow() {
    let exitAccountsMenu = false;
    while (!exitAccountsMenu) {
      const providers = readProviderStatuses();
      if (!providers.length) {
        output.printWarning("No providers available for account management.");
        return { success: false, reason: "no_providers" };
      }
      const action = await promptAccountsAction({ menu, output, providers });
      if (action === "list_accounts") {
        await promptConnectedAccountsList({ menu, output, providers });
        continue;
      }
      if (action === "connect_provider") {
        await connectProviderFlow();
        continue;
      }
      exitAccountsMenu = true;
    }

    return { success: true };
  }

  async function runAndStamp(action) {
    const result = await action();
    config.updateState({ lastInteractiveActionAt: now() });
    return result;
  }

  async function statusFlow() {
    return runAndStamp(() => proxy.statusProxy({ check: false, json: false, verbose: true, quiet: false }));
  }

  async function startProxyFlow() {
    return runAndStamp(() => proxy.startProxy({ allowAttach: true, quiet: false }));
  }

  async function stopProxyFlow() {
    return runAndStamp(() => proxy.stopProxy({ force: false, quiet: false }));
  }

  return {
    accountsFlow,
    connectProviderFlow,
    startProxyFlow,
    statusFlow,
    stopProxyFlow,
  };
}

module.exports = {
  createInteractiveProviderActions,
};
