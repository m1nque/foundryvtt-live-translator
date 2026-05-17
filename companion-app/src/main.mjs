import { app, BrowserWindow, ipcMain } from "electron";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { startReverseProxy, stopReverseProxy, getProxyStatus } from "./lib/proxy-server.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const workspaceRoot = resolve(appRoot, "..");
const stateDir = join(app.getPath("userData"), "state");
const configPath = join(stateDir, "companion-config.json");
const defaults = {
  publicPort: 31000,
  foundryPort: 30000,
  translatorPort: 31001,
  translatorHost: "127.0.0.1",
  deeplApiKey: "",
  translatorBindHost: "127.0.0.1"
};

let mainWindow = null;
let translatorProcess = null;
let translatorManagedExternally = false;
let currentConfig = loadConfig();
let lastTranslatorError = "";
let lastProxyError = "";
let lastAddressInfo = {
  localhostUrl: `http://127.0.0.1:${defaults.publicPort}`,
  lanUrls: [],
  publicIpUrl: "",
  publicIpError: ""
};

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

app.whenReady().then(async () => {
  mainWindow = createWindow();
  await ensureServicesRunning().catch((error) => {
    lastProxyError = error.message;
  });
  await refreshAddressInfo();
  publishStatus();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      publishStatus();
    }
  });
});

app.on("before-quit", async () => {
  await shutdownServices();
});

ipcMain.handle("companion:get-status", async () => {
  await refreshAddressInfo();
  return buildStatusPayload();
});

ipcMain.handle("companion:save-config", async (_event, partialConfig) => {
  currentConfig = {
    ...currentConfig,
    ...sanitizeConfig(partialConfig)
  };
  saveConfig(currentConfig);
  await restartServices();
  await refreshAddressInfo();
  publishStatus();
  return buildStatusPayload();
});

ipcMain.handle("companion:restart-services", async () => {
  await restartServices();
  await refreshAddressInfo();
  publishStatus();
  return buildStatusPayload();
});

ipcMain.handle("companion:open-service-env", async () => {
  return {
    envPath: ensureServiceEnv(currentConfig)
  };
});

function createWindow() {
  const window = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 860,
    minHeight: 640,
    backgroundColor: "#f3efe6",
    title: "FoundryVTT Live Translator",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.loadFile(join(__dirname, "renderer", "index.html"));
  return window;
}

function loadConfig() {
  mkdirSync(stateDir, { recursive: true });
  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify(defaults, null, 2), "utf8");
    return { ...defaults };
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    return {
      ...defaults,
      ...sanitizeConfig(parsed)
    };
  } catch (_error) {
    return { ...defaults };
  }
}

function saveConfig(config) {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

function sanitizeConfig(input) {
  return {
    publicPort: normalizePort(input.publicPort, defaults.publicPort),
    foundryPort: normalizePort(input.foundryPort, defaults.foundryPort),
    translatorPort: normalizePort(input.translatorPort, defaults.translatorPort),
    translatorHost: normalizeHost(input.translatorHost, defaults.translatorHost),
    translatorBindHost: normalizeHost(input.translatorBindHost, defaults.translatorBindHost),
    deeplApiKey: String(input.deeplApiKey ?? defaults.deeplApiKey).trim()
  };
}

function normalizePort(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) return fallback;
  return parsed;
}

function normalizeHost(value, fallback) {
  const normalized = String(value ?? fallback).trim();
  return normalized || fallback;
}

async function ensureServicesRunning() {
  ensureServiceEnv(currentConfig);
  await startTranslatorService(currentConfig);
  try {
    await startReverseProxy({
      publicPort: currentConfig.publicPort,
      foundryPort: currentConfig.foundryPort,
      translatorPort: currentConfig.translatorPort
    });
    lastProxyError = "";
  } catch (error) {
    lastProxyError = error.message;
    throw error;
  }
}

async function restartServices() {
  await shutdownServices();
  await ensureServicesRunning();
}

async function shutdownServices() {
  stopReverseProxy();
  if (translatorProcess && !translatorManagedExternally) {
    translatorProcess.kill("SIGTERM");
  }
  translatorProcess = null;
  translatorManagedExternally = false;
}

function ensureServiceEnv(config) {
  const serviceDir = getServiceDir();
  const envPath = resolve(serviceDir, ".env");
  const cacheDir = join(stateDir, "translator-cache");
  mkdirSync(cacheDir, { recursive: true });
  const lines = [
    `HOST=${config.translatorBindHost}`,
    `PORT=${config.translatorPort}`,
    "ALLOW_ORIGIN=*",
    `DEEPL_API_KEY=${config.deeplApiKey}`,
    `CACHE_DIR=${cacheDir}`
  ];
  writeFileSync(envPath, `${lines.join("\n")}\n`, "utf8");
  return envPath;
}

async function startTranslatorService(config) {
  if (await isTranslatorServiceReachable(config)) {
    translatorManagedExternally = true;
    translatorProcess = { pid: null };
    lastTranslatorError = "";
    publishStatus();
    return ensureServiceEnv(config);
  }

  const serviceDir = getServiceDir();
  const serviceScriptPath = resolve(serviceDir, "server.js");
  const envPath = ensureServiceEnv(config);
  translatorManagedExternally = false;
  translatorProcess = spawn(process.execPath, [serviceScriptPath], {
    cwd: serviceDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOST: config.translatorBindHost,
      PORT: String(config.translatorPort),
      DEEPL_API_KEY: config.deeplApiKey,
      CACHE_DIR: join(stateDir, "translator-cache")
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  translatorProcess.stdout.on("data", () => {
    lastTranslatorError = "";
    publishStatus();
  });
  translatorProcess.stderr.on("data", (chunk) => {
    lastTranslatorError = String(chunk).trim();
    publishStatus();
  });
  translatorProcess.on("error", (error) => {
    lastTranslatorError = error.message;
    translatorProcess = null;
    translatorManagedExternally = false;
    publishStatus();
  });
  translatorProcess.on("exit", (code) => {
    if (code !== 0 && !lastTranslatorError) {
      lastTranslatorError = `Translator service exited with code ${code}`;
    }
    translatorProcess = null;
    translatorManagedExternally = false;
    publishStatus();
  });

  return envPath;
}

function buildStatusPayload() {
  const proxyStatus = getProxyStatus();
  const serviceDir = getServiceDir();
  return {
    config: currentConfig,
    proxy: proxyStatus,
    translator: {
      running: Boolean(translatorProcess),
      managedExternally: translatorManagedExternally,
      envPath: resolve(serviceDir, ".env"),
      lastError: lastTranslatorError
    },
    proxyError: lastProxyError,
    addresses: lastAddressInfo
  };
}

function publishStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("companion:status", buildStatusPayload());
}

function getServiceDir() {
  if (app.isPackaged) {
    return join(process.resourcesPath, "live-translator-service");
  }

  return resolve(workspaceRoot, "services", "live-translator-service");
}

async function isTranslatorServiceReachable(config) {
  const healthUrl = `http://${config.translatorBindHost}:${config.translatorPort}/health`;
  try {
    const response = await fetch(healthUrl);
    if (!response.ok) return false;
    const payload = await response.json();
    return payload?.service === "live-translator-service";
  } catch (_error) {
    return false;
  }
}

function buildAddressInfo(publicPort) {
  const interfaces = networkInterfaces();
  const lanUrls = [];

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (!entry || entry.internal) continue;
      if (entry.family !== "IPv4") continue;
      lanUrls.push(`http://${entry.address}:${publicPort}`);
    }
  }

  return {
    localhostUrl: `http://127.0.0.1:${publicPort}`,
    lanUrls: Array.from(new Set(lanUrls)).sort(),
    publicIpUrl: "",
    publicIpError: ""
  };
}

async function refreshAddressInfo() {
  const baseInfo = buildAddressInfo(currentConfig.publicPort);
  lastAddressInfo = baseInfo;

  try {
    const publicIp = await fetchPublicIp();
    lastAddressInfo = {
      ...baseInfo,
      publicIpUrl: publicIp ? `http://${publicIp}:${currentConfig.publicPort}` : "",
      publicIpError: publicIp ? "" : "Public IP lookup returned no result."
    };
  } catch (error) {
    lastAddressInfo = {
      ...baseInfo,
      publicIpUrl: "",
      publicIpError: error.message
    };
  }
}

async function fetchPublicIp() {
  const services = [
    "https://api.ipify.org?format=json",
    "https://ifconfig.me/all.json"
  ];

  for (const serviceUrl of services) {
    try {
      const response = await fetch(serviceUrl, {
        headers: {
          "Accept": "application/json"
        }
      });

      if (!response.ok) continue;
      const payload = await response.json();
      const ip = String(payload.ip_addr ?? payload.ip ?? "").trim();
      if (ip) return ip;
    } catch (_error) {
      // Try the next service.
    }
  }

  throw new Error("Unable to determine public IP from external lookup services.");
}
