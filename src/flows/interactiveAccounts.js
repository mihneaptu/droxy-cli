"use strict";

const ACCOUNT_MENU_ACTIONS = Object.freeze({
  back: { id: "back", label: "Back to Menu" },
  connectAccount: { id: "connect_provider", label: "Connect Account" },
  listAccounts: { id: "list_accounts", label: "List Connected Accounts" },
});

function getConnectionCount(provider) {
  const count = Number(provider && provider.connectionCount);
  if (Number.isFinite(count) && count > 0) return Math.floor(count);
  return provider && provider.connected ? 1 : 0;
}

function getConnectedAccountTotal(providers) {
  return (Array.isArray(providers) ? providers : []).reduce((total, provider) => (
    provider && provider.connected ? total + getConnectionCount(provider) : total
  ), 0);
}

function formatProviderStatusLine(provider) {
  const label = provider && provider.label ? provider.label : "Unknown Provider";
  const id = provider && provider.id ? provider.id : "unknown";
  const connectionCount = getConnectionCount(provider);
  const countSuffix = connectionCount > 1 ? ` (${connectionCount})` : "";
  const status = provider && provider.connected ? `Connected${countSuffix}` : "Not connected";
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
  const connectedAccountTotal = getConnectedAccountTotal(providers);
  const listAccountsLabel =
    connectedAccountTotal > 1
      ? `${ACCOUNT_MENU_ACTIONS.listAccounts.label} (${connectedAccountTotal})`
      : ACCOUNT_MENU_ACTIONS.listAccounts.label;
  const actions = [
    { ...ACCOUNT_MENU_ACTIONS.listAccounts, label: listAccountsLabel },
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

function buildConnectedAccountsTitle(output, providers) {
  const rows = Array.isArray(providers) ? providers : [];
  const connectedRows = rows.filter((provider) => provider && provider.connected);
  const connectedAccountTotal = getConnectedAccountTotal(rows);
  const lines = [
    output.accent("Connected Accounts"),
    output.dim(`Connected accounts: ${connectedAccountTotal}`),
    output.dim(`Connected providers: ${connectedRows.length}/${rows.length}`),
    "",
  ];
  if (!connectedRows.length) {
    lines.push(output.dim("No connected accounts found."));
    return lines.join("\n");
  }
  lines.push(...connectedRows.map(formatProviderStatusLine));
  return lines.join("\n");
}

async function promptConnectedAccountsList({ menu, output, providers }) {
  await menu.selectSingle({
    title: buildConnectedAccountsTitle(output, providers),
    items: [ACCOUNT_MENU_ACTIONS.back.label],
    hint: "Press Enter or q to return.",
  });
}

module.exports = {
  ACCOUNT_MENU_ACTIONS,
  promptConnectedAccountsList,
  promptAccountsAction,
};
