"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const configModule = require("./config");
const helpersModule = require("./helpers");
const syncModule = require("./sync");
const outputModule = require("./ui/output");
const { formatDuration } = require("./ui/animations");

function resolveBinaryCandidates(baseDir, isWindows) {
  const primary = path.join(
    baseDir,
    isWindows ? "cli-proxy-api-plus.exe" : "cli-proxy-api-plus"
  );
  const fallback = path.join(baseDir, "cli-proxy-api-plus-x86_64-pc-windows-msvc.exe");
  return { primary, fallback };
}

function createProxyApi(overrides = {}) {
  const fsApi = overrides.fs || fs;
  const spawnFn = overrides.spawn || spawn;
  const config = overrides.config || configModule;
  const helpers = overrides.helpers || helpersModule;
  const sync = overrides.sync || syncModule;
  const output = overrides.output || outputModule;

  function getBinaryPath() {
    if (process.env.DROXY_PROXY_BIN) return process.env.DROXY_PROXY_BIN;

    const preferred = resolveBinaryCandidates(
      config.getBinaryInstallDir(),
      helpers.isWindows()
    );
    if (fsApi.existsSync(preferred.primary)) return preferred.primary;
    if (fsApi.existsSync(preferred.fallback)) return preferred.fallback;

    const repoVendor = resolveBinaryCandidates(
      path.resolve(__dirname, "..", "vendor"),
      helpers.isWindows()
    );
    if (fsApi.existsSync(repoVendor.primary)) return repoVendor.primary;
    if (fsApi.existsSync(repoVendor.fallback)) return repoVendor.fallback;

    return preferred.primary;
  }

  function binaryExists() {
    return fsApi.existsSync(getBinaryPath());
  }

  function listAuthFiles(authDir) {
    try {
      return fsApi.readdirSync(authDir).filter((name) => name && !name.startsWith("."));
    } catch {
      return [];
    }
  }

  function normalizeConnectionState(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "connected") return "connected";
    if (normalized === "disconnected") return "disconnected";
    return "unknown";
  }

  function normalizeProviderStatusEntry(value) {
    if (!value || typeof value !== "object") {
      return {
        connected: false,
        connectionState: "unknown",
        connectionCount: 0,
        verified: false,
      };
    }

    const connectionState = normalizeConnectionState(
      value.connectionState ||
      value.status ||
      value.state ||
      (
        value.connected === true
          ? "connected"
          : value.connected === false
            ? "disconnected"
            : "unknown"
      )
    );
    const countRaw = Number(value.connectionCount || value.count || 0);
    const connectionCount =
      connectionState === "connected"
        ? Math.max(1, Number.isFinite(countRaw) ? Math.floor(countRaw) : 1)
        : Math.max(0, Number.isFinite(countRaw) ? Math.floor(countRaw) : 0);
    return {
      connected: connectionState === "connected",
      connectionState,
      connectionCount,
      verified: value.verified === true || connectionState !== "unknown",
    };
  }

  function hasProviderAuth(providerId = "", providerStatusById = {}) {
    const provider = String(providerId || "").trim().toLowerCase();
    const byProvider = providerStatusById && typeof providerStatusById === "object"
      ? providerStatusById
      : {};
    if (provider) {
      const normalized = normalizeProviderStatusEntry(byProvider[provider]);
      return normalized.connectionCount > 0 || normalized.connected;
    }

    for (const value of Object.values(byProvider)) {
      const normalized = normalizeProviderStatusEntry(value);
      if (normalized.connectionCount > 0 || normalized.connected) return true;
    }
    return false;
  }

  function countConnectedProviders(providerStatusById = {}) {
    const byProvider = providerStatusById && typeof providerStatusById === "object"
      ? providerStatusById
      : {};
    let connected = 0;
    for (const value of Object.values(byProvider)) {
      if (normalizeProviderStatusEntry(value).connected) {
        connected += 1;
      }
    }
    return connected;
  }

  async function resolveProviderStatusSummary(configValues, state) {
    const providerStatus =
      sync && typeof sync.fetchProviderConnectionStatusSafe === "function"
        ? await sync.fetchProviderConnectionStatusSafe(configValues, { state, quiet: true })
        : { providersState: "unknown", providersConnected: 0, byProvider: {} };

    const providerStatusById = {};
    const rawProviderStatusById =
      providerStatus && providerStatus.byProvider && typeof providerStatus.byProvider === "object"
        ? providerStatus.byProvider
        : {};
    for (const [providerId, value] of Object.entries(rawProviderStatusById)) {
      const normalizedId = String(providerId || "").trim().toLowerCase();
      if (!normalizedId) continue;
      providerStatusById[normalizedId] = normalizeProviderStatusEntry(value);
    }

    const providersState =
      providerStatus && providerStatus.providersState === "verified" ? "verified" : "unknown";
    const providersConnected = countConnectedProviders(providerStatusById);
    return {
      providersState,
      providersConnected,
      providerStatusById,
    };
  }

  async function getProxyStatus(host, port) {
    const portOpen = await helpers.checkPort(host, port);
    if (!portOpen) {
      return { running: false, blocked: false, portOpen: false, pid: null };
    }

    let pid = null;
    if (helpers.isWindows()) {
      pid = helpers.getWindowsPidByPort(port);
      if (pid && !helpers.isLikelyDroxyProcess(pid, { binaryPath: getBinaryPath() })) {
        return { running: false, blocked: true, portOpen: true, pid };
      }
    }

    return { running: true, blocked: false, portOpen: true, pid };
  }

  async function startProxy({ allowAttach = true, quiet = false } = {}) {
    if (!config.configExists()) {
      if (!quiet) {
        output.printError(
          `Config not found at ${config.getConfigPath()}`,
          "Run `droxy login` to initialize config.",
          "droxy login"
        );
      }
      return { running: false, started: false, attached: false, reason: "config_missing" };
    }

    const { host, port, tlsEnabled } = config.readHostPortFromConfig();
    const current = await getProxyStatus(host, port);
    if (current.blocked) {
      if (!quiet) {
        output.printWarning(
          `Port ${port} is in use by another process. Use \`droxy stop --force\` only if you own it.`
        );
      }
      return { running: false, started: false, attached: false, reason: "port_in_use" };
    }

    if (current.running) {
      if (allowAttach) {
        config.updateState({
          pid: null,
          attached: true,
          lastDetectedAt: new Date().toISOString(),
        });
      }
      if (!quiet) {
        output.printInfo(`Droxy proxy is already running on ${host}:${port}.`);
      }
      return { running: true, started: false, attached: allowAttach };
    }

    if (!binaryExists()) {
      if (!quiet) {
        output.printError(
          `Proxy binary not found at ${getBinaryPath()}`,
          "Place cli-proxy-api-plus binary in vendor/ or set DROXY_PROXY_BIN.",
          "droxy start"
        );
      }
      return { running: false, started: false, attached: false, reason: "binary_missing" };
    }

    const child = spawnFn(getBinaryPath(), ["--config", config.getConfigPath()], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });

    if (!child || !child.pid) {
      if (!quiet) {
        output.printError("Failed to spawn proxy process.");
      }
      return { running: false, started: false, attached: false, reason: "spawn_failed" };
    }

    child.unref();

    config.updateState({
      pid: child.pid,
      startedAt: new Date().toISOString(),
      attached: false,
    });

    if (!quiet) {
      const protocol = tlsEnabled ? "https" : "http";
      output.printSuccess(`Proxy started (PID ${child.pid}).`);
      output.log(`Endpoint: ${protocol}://${host}:${port}/v1`);
      output.log(`Config:   ${config.getConfigPath()}`);
    }

    return { running: true, started: true, attached: false };
  }

  async function ensureProxyRunning(configValues, quiet = false) {
    if (!config.configExists()) {
      return { running: false, started: false, ready: false, reason: "config_missing" };
    }

    const result = await startProxy({ allowAttach: true, quiet: true });
    if (result && result.reason === "port_in_use") {
      if (!quiet) {
        output.printWarning("Port in use by another process. Unable to attach Droxy.");
      }
      return { ...result, ready: false, blocked: true };
    }

    await helpers.waitForPort(configValues.host, configValues.port, 8000, 300);
    const status = await getProxyStatus(configValues.host, configValues.port);
    return { ...result, ready: status.running, blocked: status.blocked };
  }

  async function stopProxy(options = {}) {
    const { force = false, quiet = false } = options;

    if (!config.configExists()) {
      if (!quiet) {
        output.printInfo("Config file is missing; nothing to stop.");
      }
      return false;
    }

    const state = config.readState() || {};
    const pid = state.pid;
    const { host, port } = config.readHostPortFromConfig();

    if (pid) {
      const killed = helpers.killPid(pid);
      if (killed) {
        await helpers.waitForPortClosed(host, port, 5000, 300);
        config.clearProxyState();
        config.updateState({ lastStoppedAt: new Date().toISOString() });
        if (!quiet) {
          output.printSuccess(`Stopped proxy process ${pid}.`);
        }
        return true;
      }

      const statusAfterKill = await getProxyStatus(host, port);
      if (!statusAfterKill.portOpen) {
        config.clearProxyState();
        config.updateState({ lastStoppedAt: new Date().toISOString() });
        if (!quiet) {
          output.printInfo("Proxy was already stopped.");
        }
        return true;
      }

      if (!quiet) {
        output.printWarning("Unable to stop tracked PID. Proxy may still be running.");
      }
      return false;
    }

    const status = await getProxyStatus(host, port);
    if (!status.portOpen) {
      if (!quiet) output.printInfo("Proxy is not running.");
      return false;
    }

    if (status.blocked && !force) {
      if (!quiet) {
        output.printWarning("Port is occupied by another process; refusing to stop without --force.");
      }
      return false;
    }

    if (!force) {
      if (!quiet) {
        output.printWarning("No tracked PID found. Re-run with --force to stop by port owner.");
      }
      return false;
    }

    if (!helpers.isWindows()) {
      if (!quiet) {
        output.printWarning("Force stop by port is currently supported only on Windows.");
      }
      return false;
    }

    const result = helpers.killPidByPort(port, { binaryPath: getBinaryPath() });
    if (result.killed) {
      await helpers.waitForPortClosed(host, port, 5000, 300);
      config.clearProxyState();
      config.updateState({ lastStoppedAt: new Date().toISOString() });
      if (!quiet) {
        output.printSuccess(`Stopped process ${result.pid} on port ${port}.`);
      }
      return true;
    }

    if (!quiet) {
      if (result.reason === "pid_not_droxy") {
        output.printWarning("Refusing to stop non-Droxy process on configured port.");
      } else if (result.reason === "pid_not_found") {
        output.printWarning("No listening PID found for configured port.");
      } else {
        output.printWarning("Failed to stop process on configured port.");
      }
    }
    return false;
  }

  async function statusProxy({ check = false, json = false, verbose = false, quiet = false } = {}) {
    if (!config.configExists()) {
      const missing = {
        status: "config_missing",
        running: false,
        blocked: false,
      };
      if (check) {
        process.exitCode = 1;
        return { running: false, blocked: false };
      }
      if (json) {
        output.log(JSON.stringify(missing, null, 2));
      } else if (!quiet) {
        output.printWarning(`Config missing at ${config.getConfigPath()}`);
      }
      return missing;
    }

    const values = config.readConfigValues();
    const status = await getProxyStatus(values.host, values.port);
    const state = config.readState() || {};

    if (check) {
      if (!status.running) {
        process.exitCode = 1;
        return { running: false, blocked: status.blocked, providersState: "unknown", strictReady: false };
      }
      const providerSummary = await resolveProviderStatusSummary(values, state);
      const strictReady = providerSummary.providersState === "verified";
      if (!strictReady) process.exitCode = 1;
      return {
        running: true,
        blocked: status.blocked,
        providersState: providerSummary.providersState,
        strictReady,
      };
    }

    const providerSummary = await resolveProviderStatusSummary(values, state);
    const providerStatusById = providerSummary.providerStatusById;
    const providersConnected = providerSummary.providersConnected;
    const providersState = providerSummary.providersState;
    const strictReady = providersState === "verified";
    const authDir = config.resolveAuthDir(values.authDir);
    const authFiles = listAuthFiles(authDir);
    const thinkingStatus =
      state && state.thinkingStatus && typeof state.thinkingStatus === "object"
        ? state.thinkingStatus
        : {};
    const thinkingState =
      thinkingStatus.state === "verified" || (state && state.thinkingState === "verified")
        ? "verified"
        : "unknown";
    const thinkingReason = String(thinkingStatus.reason || "").trim() || "";
    const thinkingModelsTotalRaw = Number(thinkingStatus.modelsTotal);
    const thinkingModelsVerifiedRaw = Number(thinkingStatus.modelsVerified);
    const thinkingModelsSupportedRaw = Number(thinkingStatus.modelsSupported);
    const thinkingModelsUnsupportedRaw = Number(thinkingStatus.modelsUnsupported);
    const thinkingModelsUnverifiedRaw = Number(thinkingStatus.modelsUnverified);
    const thinkingModelsTotal =
      Number.isFinite(thinkingModelsTotalRaw) && thinkingModelsTotalRaw >= 0
        ? Math.floor(thinkingModelsTotalRaw)
        : null;
    const thinkingModelsVerified =
      Number.isFinite(thinkingModelsVerifiedRaw) && thinkingModelsVerifiedRaw >= 0
        ? Math.floor(thinkingModelsVerifiedRaw)
        : null;
    const thinkingModelsSupported =
      Number.isFinite(thinkingModelsSupportedRaw) && thinkingModelsSupportedRaw >= 0
        ? Math.floor(thinkingModelsSupportedRaw)
        : null;
    const thinkingModelsUnsupported =
      Number.isFinite(thinkingModelsUnsupportedRaw) && thinkingModelsUnsupportedRaw >= 0
        ? Math.floor(thinkingModelsUnsupportedRaw)
        : null;
    const thinkingModelsUnverified =
      Number.isFinite(thinkingModelsUnverifiedRaw) && thinkingModelsUnverifiedRaw >= 0
        ? Math.floor(thinkingModelsUnverifiedRaw)
        : null;

    let uptime = null;
    if (status.running && state.startedAt) {
      const startedAtMs = Date.parse(String(state.startedAt));
      if (Number.isFinite(startedAtMs)) {
        const elapsedMs = Date.now() - startedAtMs;
        if (elapsedMs >= 0) uptime = formatDuration(elapsedMs);
      }
    }

    const statusState = status.blocked
      ? "blocked"
      : status.running
        ? strictReady
          ? "running"
          : "unverified"
        : "stopped";
    const data = {
      status: statusState,
      host: values.host,
      port: values.port,
      config: config.getConfigPath(),
      pid: status.pid || null,
      uptime,
      providers: providersConnected,
      providersConnected,
      providersState,
      strictReady,
      providerStatusById,
      authFilesCount: authFiles.length,
      thinkingState,
      thinkingReason: thinkingReason || null,
      thinkingModelsTotal,
      thinkingModelsVerified,
      thinkingModelsSupported,
      thinkingModelsUnsupported,
      thinkingModelsUnverified,
    };

    if (json) {
      output.log(JSON.stringify(data, null, 2));
      return data;
    }

    if (!quiet) {
      output.log(`Status:    ${statusState}`);
      output.log(`Endpoint:  ${(values.tlsEnabled ? "https" : "http")}://${values.host}:${values.port}/v1`);
      output.log(`Providers: ${providersConnected} (${providersState})`);
      if (!strictReady) {
        output.printWarning("Provider verification is unverified. Strict checks will fail until backend verification is available.");
      }
      output.log(`Thinking:  ${thinkingState}`);
      if (verbose && thinkingReason) {
        output.log(`Thinking reason: ${thinkingReason}`);
      }
      if (status.pid) output.log(`PID:       ${status.pid}`);
      if (uptime) output.log(`Uptime:    ${uptime}`);
      if (verbose) {
        output.log(`State:     ${config.getStatePath()}`);
        output.log(`Auth dir:  ${authDir}`);
        output.log(`Auth files:${authFiles.length}`);
        output.log(`Binary:    ${getBinaryPath()}`);
        const providerIds = Object.keys(providerStatusById).sort((left, right) =>
          left.localeCompare(right)
        );
        if (providerIds.length) {
          output.log("Providers detail:");
          for (const providerId of providerIds) {
            const provider = providerStatusById[providerId];
            const connectionCount = Number(provider.connectionCount) || 0;
            const connectionState = provider.connectionState || "unknown";
            const verificationLabel = provider.verified ? "verified" : "unverified";
            const details = `${connectionCount} account${connectionCount === 1 ? "" : "s"}, ${verificationLabel}`;
            output.log(`  ${providerId}: ${connectionState} (${details})`);
          }
        }
      }
    }

    return data;
  }

  return {
    binaryExists,
    countConnectedProviders,
    ensureProxyRunning,
    getBinaryPath,
    getProxyStatus,
    hasProviderAuth,
    listAuthFiles,
    startProxy,
    statusProxy,
    stopProxy,
  };
}

const proxyApi = createProxyApi();

module.exports = {
  createProxyApi,
  ...proxyApi,
};
