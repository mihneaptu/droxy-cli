"use strict";

const ACCOUNT_MENU_ACTIONS = Object.freeze({
  back: { id: "back", label: "Back to Menu" },
  connectAccount: { id: "connect_provider", label: "Connect Account" },
  listAccounts: { id: "list_accounts", label: "List Connected Accounts" },
  refreshAccounts: { id: "refresh_accounts", label: "Refresh Account Status" },
  removeAccount: { id: "remove_account", label: "Remove Account" },
});

function getConnectionCount(provider) {
  if (provider && provider.connectionState === "unknown" && provider.connected !== true) return 0;
  const count = Number(provider && provider.connectionCount);
  if (Number.isFinite(count) && count > 0) return Math.floor(count);
  return provider && provider.connected ? 1 : 0;
}

function getConnectedAccountTotal(providers, accountRows = []) {
  const rows = Array.isArray(accountRows) ? accountRows : [];
  if (rows.length) {
    return rows.filter((row) => row && row.connected).length;
  }
  return (Array.isArray(providers) ? providers : []).reduce(
    (total, provider) => (provider && provider.connected ? total + getConnectionCount(provider) : total),
    0
  );
}

function getManagedAccountCount(accountRows = []) {
  return Array.isArray(accountRows) ? accountRows.length : 0;
}

function getProviderLabel(providerId, providers = []) {
  const rows = Array.isArray(providers) ? providers : [];
  const provider = rows.find((item) => item && item.id === providerId);
  if (provider && provider.label) return provider.label;
  if (providerId) return providerId;
  return "Unknown Provider";
}

function formatProviderStatusLine(provider) {
  const label = provider && provider.label ? provider.label : "Unknown Provider";
  const id = provider && provider.id ? provider.id : "unknown";
  const connectionCount = getConnectionCount(provider);
  const countSuffix = connectionCount > 1 ? ` (${connectionCount})` : "";
  const connectionState =
    provider && provider.connectionState === "connected"
      ? "connected"
      : provider && provider.connectionState === "disconnected"
        ? "disconnected"
        : provider && Object.prototype.hasOwnProperty.call(provider, "connected")
          ? provider.connected === true
            ? "connected"
            : "disconnected"
        : provider && provider.connected === true
          ? "connected"
          : "unknown";
  const status =
    connectionState === "connected"
      ? `Connected${countSuffix}`
      : connectionState === "disconnected"
        ? "Not connected"
        : "Unknown (unverified)";
  return `- ${label} (${id}): ${status}`;
}

function formatAccountStatus(account) {
  const state = String((account && account.connectionState) || "").toLowerCase();
  if (state === "connected") return "Connected";
  if (state === "disconnected") return "Not connected";
  return "Unknown (unverified)";
}

function formatAccountIdentity(account) {
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

function formatAccountLine(account) {
  const identity = formatAccountIdentity(account);
  const details = [];
  if (account && account.accountType) details.push(String(account.accountType));
  if (account && Number.isFinite(account.authIndex)) details.push(`index ${account.authIndex}`);
  if (account && account.runtimeOnly) details.push("runtime");
  if (account && account.disabled) details.push("disabled");
  if (account && account.unavailable) details.push("unavailable");
  const detailSuffix = details.length ? ` (${details.join(", ")})` : "";
  return `- ${identity}${detailSuffix}: ${formatAccountStatus(account)}`;
}

function getRemovableAccounts(accountRows = []) {
  return (Array.isArray(accountRows) ? accountRows : []).filter(
    (row) => row && row.removable === true
  );
}

function formatRemovableAccountItem(account, providers = []) {
  const providerId = String((account && account.providerId) || "").trim();
  const providerLabel = getProviderLabel(providerId, providers);
  const identity = formatAccountIdentity(account);
  const details = [];
  if (account && account.accountType) details.push(String(account.accountType));
  if (account && Number.isFinite(account.authIndex)) details.push(`index ${account.authIndex}`);
  if (account && account.name) details.push(String(account.name));
  const detailSuffix = details.length ? ` (${details.join(", ")})` : "";
  return `${providerLabel} (${providerId || "unknown"}) · ${identity}${detailSuffix}`;
}

function buildAccountsTitle(output, providers, accountRows = []) {
  const rows = Array.isArray(providers) ? providers : [];
  const connected = rows.filter((provider) => provider && provider.connected).length;
  const unknown = rows.filter((provider) =>
    provider &&
    provider.connected !== true &&
    String(provider.connectionState || "").toLowerCase() === "unknown"
  ).length;
  const lines = [
    output.accent("Accounts"),
    output.dim(`Connected providers: ${connected}/${rows.length}`),
    output.dim(`Connected accounts: ${getConnectedAccountTotal(rows, accountRows)}`),
    output.dim(`Managed auth files: ${getManagedAccountCount(accountRows)}`),
    output.dim(`Unverified providers: ${unknown}`),
    "",
  ];

  if (!rows.length) {
    lines.push(output.dim("No providers are available."));
  } else {
    lines.push(...rows.map(formatProviderStatusLine));
  }

  return lines.join("\n");
}

async function promptAccountsAction({ menu, output, providers, accountRows = [] }) {
  const connectedAccountTotal = getConnectedAccountTotal(providers, accountRows);
  const removableCount = getRemovableAccounts(accountRows).length;
  const listAccountsLabel =
    connectedAccountTotal > 1
      ? `${ACCOUNT_MENU_ACTIONS.listAccounts.label} (${connectedAccountTotal})`
      : ACCOUNT_MENU_ACTIONS.listAccounts.label;
  const removeAccountLabel =
    removableCount > 0
      ? `${ACCOUNT_MENU_ACTIONS.removeAccount.label} (${removableCount})`
      : `${ACCOUNT_MENU_ACTIONS.removeAccount.label} (none)`;
  const actions = [
    { ...ACCOUNT_MENU_ACTIONS.listAccounts, label: listAccountsLabel },
    ACCOUNT_MENU_ACTIONS.connectAccount,
    ACCOUNT_MENU_ACTIONS.refreshAccounts,
    { ...ACCOUNT_MENU_ACTIONS.removeAccount, label: removeAccountLabel },
    ACCOUNT_MENU_ACTIONS.back,
  ];
  const selection = await menu.selectSingle({
    title: buildAccountsTitle(output, providers, accountRows),
    items: actions.map((action) => action.label),
    hint: "Use ↑/↓ and Enter. Press q to return to home.",
  });
  if (!selection || selection.cancelled) return ACCOUNT_MENU_ACTIONS.back.id;
  const action = actions[selection.index];
  return action ? action.id : ACCOUNT_MENU_ACTIONS.back.id;
}

function buildConnectedAccountsTitle(output, providers, accountRows = []) {
  const rows = Array.isArray(providers) ? providers : [];
  const connectedRows = rows.filter((provider) => provider && provider.connected);
  const connectedAccountTotal = getConnectedAccountTotal(rows, accountRows);
  const unknownRows = rows.filter((provider) =>
    provider &&
    provider.connected !== true &&
    String(provider.connectionState || "").toLowerCase() === "unknown"
  );
  const lines = [
    output.accent("Connected Accounts"),
    output.dim(`Connected accounts: ${connectedAccountTotal}`),
    output.dim(`Managed auth files: ${getManagedAccountCount(accountRows)}`),
    output.dim(`Connected providers: ${connectedRows.length}/${rows.length}`),
    output.dim(`Unverified providers: ${unknownRows.length}`),
    "",
  ];
  const accounts = (Array.isArray(accountRows) ? accountRows : []).filter(
    (account) => account && account.connected
  );
  if (!accounts.length) {
    if (connectedRows.length) {
      lines.push(...connectedRows.map(formatProviderStatusLine));
      return lines.join("\n");
    }
    lines.push(output.dim("No connected accounts found."));
    return lines.join("\n");
  }
  const byProvider = new Map();
  for (const account of accounts) {
    const providerId = String(account.providerId || "").trim() || "unknown";
    if (!byProvider.has(providerId)) byProvider.set(providerId, []);
    byProvider.get(providerId).push(account);
  }
  for (const providerId of Array.from(byProvider.keys()).sort()) {
    const providerLabel = getProviderLabel(providerId, rows);
    lines.push(`${providerLabel} (${providerId})`);
    const providerAccounts = byProvider.get(providerId) || [];
    for (const account of providerAccounts) {
      lines.push(formatAccountLine(account));
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function promptConnectedAccountsList({ menu, output, providers, accountRows = [] }) {
  await menu.selectSingle({
    title: buildConnectedAccountsTitle(output, providers, accountRows),
    items: [ACCOUNT_MENU_ACTIONS.back.label],
    hint: "Press Enter or q to return.",
  });
}

async function promptAccountForRemoval({ menu, output, providers, accountRows = [] }) {
  const removableAccounts = getRemovableAccounts(accountRows);
  if (!removableAccounts.length) return null;
  const selection = await menu.selectSingle({
    title: [
      output.accent("Remove Account"),
      output.dim(`Removable accounts: ${removableAccounts.length}`),
      "",
      output.dim("Choose an account to remove."),
    ].join("\n"),
    items: removableAccounts.map((account) => formatRemovableAccountItem(account, providers)),
    hint: "Use ↑/↓ and Enter. Press q to cancel.",
  });
  if (!selection || selection.cancelled) return null;
  return removableAccounts[selection.index] || null;
}

async function promptAccountRemovalConfirmation({ menu, output, account, providers }) {
  if (!account) return false;
  const providerId = String(account.providerId || "").trim();
  const providerLabel = getProviderLabel(providerId, providers);
  const identity = formatAccountIdentity(account);
  const selection = await menu.selectSingle({
    title: [
      output.accent("Confirm Account Removal"),
      "",
      `${providerLabel} (${providerId || "unknown"})`,
      identity,
      account && account.name ? `auth file: ${account.name}` : "",
      Number.isFinite(account && account.authIndex) ? `index: ${account.authIndex}` : "",
      "",
      output.dim("This removes the auth file entry from the proxy."),
    ]
      .filter(Boolean)
      .join("\n"),
    items: ["Cancel", "Remove Account"],
    initialIndex: 0,
    hint: "Use ↑/↓ and Enter. Press q to cancel.",
  });
  if (!selection || selection.cancelled) return false;
  return selection.index === 1;
}

module.exports = {
  ACCOUNT_MENU_ACTIONS,
  formatAccountIdentity,
  getRemovableAccounts,
  promptAccountForRemoval,
  promptAccountRemovalConfirmation,
  promptConnectedAccountsList,
  promptAccountsAction,
};
