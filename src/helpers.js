"use strict";

const { execFileSync } = require("child_process");
const net = require("net");
const path = require("path");

function isWindows() {
  return process.platform === "win32";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}

function normalizedHost(host) {
  const trimmed = String(host || "").trim();
  if (!trimmed || trimmed === "0.0.0.0") return "127.0.0.1";
  return trimmed;
}

function normalizeIdList(items) {
  const seen = new Set();
  const output = [];
  for (const item of Array.isArray(items) ? items : []) {
    const value = String(item || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  output.sort((left, right) => left.localeCompare(right));
  return output;
}

function formatErrorSummary(err) {
  if (!err) return "";
  const raw = String(err.message || err || "").trim();
  if (!raw) return "";
  return raw.replace(/\s+/g, " ").slice(0, 220);
}

function runCommandSync(cmd, args = []) {
  try {
    execFileSync(cmd, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function runCommandOutput(cmd, args = []) {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
      maxBuffer: 5 * 1024 * 1024,
    }).trim();
  } catch {
    return "";
  }
}

function checkPort(host, port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: timeoutMs }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForPort(host, port, timeoutMs = 8000, intervalMs = 300) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await checkPort(host, port)) return true;
    await sleep(intervalMs);
  }
  return false;
}

async function waitForPortClosed(host, port, timeoutMs = 8000, intervalMs = 300) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await checkPort(host, port))) return true;
    await sleep(intervalMs);
  }
  return false;
}

function getWindowsPidByPort(port) {
  if (!isWindows()) return null;
  const ps = runCommandOutput("powershell", [
    "-NoProfile",
    "-Command",
    `(Get-NetTCPConnection -LocalPort ${port} -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess)`,
  ]);
  const psPid = Number.parseInt(ps, 10);
  if (Number.isFinite(psPid)) return psPid;

  const netstat = runCommandOutput("netstat", ["-ano", "-p", "tcp"]);
  if (!netstat) return null;
  const portToken = `:${port}`;
  for (const line of netstat.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes(portToken)) continue;
    if (!/LISTENING|LISTEN/i.test(trimmed)) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 4) continue;
    const local = parts[1] || "";
    if (!local.endsWith(portToken)) continue;
    const pid = Number.parseInt(parts[parts.length - 1], 10);
    if (Number.isFinite(pid)) return pid;
  }
  return null;
}

function getWindowsProcessDetails(pid) {
  if (!isWindows() || !pid) return "";
  const cmdLine = runCommandOutput("powershell", [
    "-NoProfile",
    "-Command",
    `(Get-CimInstance Win32_Process -Filter \"ProcessId=${pid}\" | Select-Object -First 1 -ExpandProperty CommandLine)`,
  ]);
  const exePath = runCommandOutput("powershell", [
    "-NoProfile",
    "-Command",
    `(Get-CimInstance Win32_Process -Filter \"ProcessId=${pid}\" | Select-Object -First 1 -ExpandProperty ExecutablePath)`,
  ]);
  return `${cmdLine} ${exePath}`.trim();
}

function isLikelyDroxyProcess(pid, { binaryPath = "" } = {}) {
  const details = getWindowsProcessDetails(pid).toLowerCase();
  if (!details) return false;
  if (details.includes("cli-proxy-api")) return true;
  if (details.includes("droxy")) return true;
  const binary = path.basename(binaryPath || "").toLowerCase();
  return binary ? details.includes(binary) : false;
}

function killPid(pid) {
  if (!pid) return false;
  if (isWindows()) {
    return runCommandSync("taskkill", ["/PID", String(pid), "/T", "/F"]);
  }
  try {
    process.kill(pid, "SIGTERM");
    return true;
  } catch {
    return false;
  }
}

function killPidByPort(port, options = {}) {
  const pid = getWindowsPidByPort(port);
  if (!pid) return { killed: false, reason: "pid_not_found" };
  if (!isLikelyDroxyProcess(pid, options)) {
    return { killed: false, reason: "pid_not_droxy", pid };
  }
  const ok = killPid(pid);
  return { killed: ok, pid };
}

module.exports = {
  checkPort,
  formatErrorSummary,
  getWindowsPidByPort,
  isLikelyDroxyProcess,
  isWindows,
  killPid,
  killPidByPort,
  normalizeIdList,
  normalizeUrl,
  normalizedHost,
  runCommandOutput,
  runCommandSync,
  sleep,
  waitForPort,
  waitForPortClosed,
};
