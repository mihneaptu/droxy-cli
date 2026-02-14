"use strict";

const {
  promptAccountForRemoval,
  promptAccountRemovalConfirmation,
  promptAccountsAction,
  promptConnectedAccountsList,
} = require("./interactiveAccounts");
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
  sync,
}) {
  function describeAccount(account) {
    if (!account || typeof account !== "object") return "account";
    return (
      String(account.email || "").trim() ||
      String(account.account || "").trim() ||
      String(account.label || "").trim() ||
      String(account.name || "").trim() ||
      String(account.path || "").trim() ||
      "account"
    );
  }

  function getRemovableAccounts(accountRows = []) {
    return (Array.isArray(accountRows) ? accountRows : []).filter(
      (row) => row && row.removable === true
    );
  }

  async function readAccountsContext() {
    config.ensureConfig();
    const configValues = config.readConfigValues();
    const state = config.readState() || {};
    let providerStatusById = {};
    if (sync && typeof sync.fetchProviderConnectionStatusSafe === "function") {
      const status = await sync.fetchProviderConnectionStatusSafe(configValues, {
        state,
        quiet: true,
      });
      if (status && status.byProvider && typeof status.byProvider === "object") {
        providerStatusById = status.byProvider;
      }
    }
    let accountRows = [];
    if (sync && typeof sync.fetchManagedAuthFilesSafe === "function") {
      accountRows = await sync.fetchManagedAuthFilesSafe(configValues, { state, quiet: true });
      if (!Array.isArray(accountRows)) accountRows = [];
    }
    return {
      configValues,
      state,
      providerStatusById,
      accountRows,
      providers: getProvidersWithStatus(login, {
        ...configValues,
        providerStatusById,
      }),
    };
  }

  async function connectProviderFlow() {
    const context = await readAccountsContext();
    const providers = context.providers;
    const provider = await promptProviderSelection(menu, providers);
    if (!provider) {
      output.printInfo("Provider selection cancelled.");
      return { success: false, reason: "cancelled" };
    }
    if (provider.connected) {
      const connectionCount = Number(provider.connectionCount) || 1;
      output.printInfo(
        `Provider already connected with ${connectionCount} account${connectionCount === 1 ? "" : "s"}. Continuing will refresh login.`
      );
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

  async function removeAccountFlow(context) {
    const providers = Array.isArray(context && context.providers) ? context.providers : [];
    const accountRows = Array.isArray(context && context.accountRows) ? context.accountRows : [];
    const removable = getRemovableAccounts(accountRows);
    if (!removable.length) {
      output.printInfo("No removable accounts found.");
      return { success: false, reason: "no_removable_accounts" };
    }
    const account = await promptAccountForRemoval({
      menu,
      output,
      providers,
      accountRows,
    });
    if (!account) {
      output.printInfo("Account removal cancelled.");
      return { success: false, reason: "cancelled" };
    }

    const confirmed = await promptAccountRemovalConfirmation({
      menu,
      output,
      providers,
      account,
    });
    if (!confirmed) {
      output.printInfo("Account removal cancelled.");
      return { success: false, reason: "cancelled" };
    }

    if (
      !sync ||
      (
        typeof sync.removeManagedAuthFileSafe !== "function" &&
        typeof sync.removeManagedAuthFile !== "function"
      )
    ) {
      output.printWarning("Account removal is not available for this backend version yet.");
      return { success: false, reason: "unsupported" };
    }

    const removeFn =
      typeof sync.removeManagedAuthFileSafe === "function"
        ? sync.removeManagedAuthFileSafe.bind(sync)
        : sync.removeManagedAuthFile.bind(sync);

    const removeResult = await removeFn(
      context.configValues,
      {
        name: account.name,
        path: account.path,
        authIndex: account.authIndex,
        runtimeOnly: account.runtimeOnly,
      },
      {
        state: context.state,
        quiet: true,
      }
    );

    if (removeResult && removeResult.success) {
      output.printSuccess(`Removed account: ${describeAccount(account)}.`);
      return { success: true, removed: true };
    }

    output.printGuidedError({
      what: "Could not remove account.",
      why: removeResult && removeResult.message ? removeResult.message : "Management API request failed.",
      next: [
        "Run: droxy status --verbose",
        "Retry in Accounts -> Remove Account",
      ],
    });
    return { success: false, reason: "remove_failed" };
  }

  async function accountsFlow() {
    let exitAccountsMenu = false;
    while (!exitAccountsMenu) {
      const context = await readAccountsContext();
      const providers = context.providers;
      if (!providers.length) {
        output.printWarning("No providers available for account management.");
        return { success: false, reason: "no_providers" };
      }
      const action = await promptAccountsAction({
        menu,
        output,
        providers,
        accountRows: context.accountRows,
      });
      if (action === "list_accounts") {
        await promptConnectedAccountsList({
          menu,
          output,
          providers,
          accountRows: context.accountRows,
        });
        continue;
      }
      if (action === "connect_provider") {
        await connectProviderFlow();
        continue;
      }
      if (action === "refresh_accounts") {
        output.printSuccess("Refreshed account status.");
        continue;
      }
      if (action === "remove_account") {
        await removeAccountFlow(context);
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
