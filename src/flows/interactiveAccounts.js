"use strict";

const ACCOUNT_MENU_ACTIONS = Object.freeze({
  back: { id: "back", label: "Back to Menu" },
  connectAccount: { id: "connect_provider", label: "Connect Account" },
  listAccounts: { id: "list_accounts", label: "List Accounts" },
});

function formatProviderStatusLine(provider) {
  const label = provider && provider.label ? provider.label : "Unknown Provider";
  const id = provider && provider.id ? provider.id : "unknown";
  const status = provider && provider.connected ? "Connected" : "Not connected";
  return `- ${label} (${id}): ${status}`;
}

function buildAccountsTitle(output, providers) {
  const rows = Array.isArray(providers) ? providers : [];
  const connected = rows.filter((provider) => provider && provider.connected).length;
  const lines = [
    output.accent("Accounts"),
    output.dim(`Connected providers: ${connected}/${rows.length}`),
    "",
  ];

  if (!rows.length) {
    lines.push(output.dim("No providers are available."));
  } else {
    lines.push(...rows.map(formatProviderStatusLine));
  }

  return lines.join("\n");
}

async function promptAccountsAction({ menu, output, providers }) {
  const actions = [
    ACCOUNT_MENU_ACTIONS.listAccounts,
    ACCOUNT_MENU_ACTIONS.connectAccount,
    ACCOUNT_MENU_ACTIONS.back,
  ];
  const selection = await menu.selectSingle({
    title: buildAccountsTitle(output, providers),
    items: actions.map((action) => action.label),
    hint: "Use ↑/↓ and Enter. Press q to return to home.",
  });
  if (!selection || selection.cancelled) return ACCOUNT_MENU_ACTIONS.back.id;
  const action = actions[selection.index];
  return action ? action.id : ACCOUNT_MENU_ACTIONS.back.id;
}

function printAccountsSummary(output, providers) {
  const rows = Array.isArray(providers) ? providers : [];
  const connected = rows.filter((provider) => provider && provider.connected).length;
  output.log("");
  output.printInfo(`Accounts connected: ${connected}/${rows.length}`);
  for (const line of rows.map(formatProviderStatusLine)) {
    output.log(`  ${line}`);
  }
}

module.exports = {
  ACCOUNT_MENU_ACTIONS,
  promptAccountsAction,
  printAccountsSummary,
};
