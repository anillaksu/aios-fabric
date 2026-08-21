import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { defaultRelay } from "./agent-relay.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ANDROID_HOST = process.env.AIOS_ANDROID_URL || "http://100.75.177.88:9300";
const WINDOWS_HOST = process.env.AIOS_WINDOWS_URL || "http://127.0.0.1:9310";

async function fetchJson(url, options = {}) {
  const timeoutMs = options.timeoutMs || 4000;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.headers || {}),
      },
    });
    clearTimeout(id);
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    clearTimeout(id);
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

function registerIpcHandlers() {
  ipcMain.handle("aios:get-relay-snapshot", async () => {
    return defaultRelay.getSystemSnapshot({ timeoutMs: 3000 });
  });

  ipcMain.handle("aios:resolve-approval", async (_, { approvalId, decision }) => {
    return defaultRelay.resolveApprovalRequest(approvalId, decision, "operator-admin");
  });

  ipcMain.handle("aios:get-android-node", async () => {
    const [card, status, caps] = await Promise.all([
      fetchJson(`${ANDROID_HOST}/.well-known/agent-card.json`),
      fetchJson(`${ANDROID_HOST}/runtime-status`),
      fetchJson(`${ANDROID_HOST}/capabilities`),
    ]);
    return {
      host: ANDROID_HOST,
      reachable: card.ok || status.ok,
      card: card.data || null,
      status: status.data || null,
      capabilities: Array.isArray(caps.data) ? caps.data : [],
    };
  });

  ipcMain.handle("aios:get-windows-node", async () => {
    const card = await fetchJson(`${WINDOWS_HOST}/.well-known/agent-card.json`, { timeoutMs: 1500 });
    return {
      host: WINDOWS_HOST,
      reachable: card.ok,
      card: card.data || null,
    };
  });

  ipcMain.handle("aios:read-battery", async () => {
    return fetchJson(`${ANDROID_HOST}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "sensor.battery.read" }),
      timeoutMs: 6000,
    });
  });

  ipcMain.handle("aios:get-artifacts", async () => {
    return fetchJson(`${ANDROID_HOST}/artifacts`, { timeoutMs: 3000 });
  });

  ipcMain.handle("aios:get-formations", async () => {
    return fetchJson(`${ANDROID_HOST}/formation-memory`, { timeoutMs: 3000 });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "AIOS Control Surface — Windows Observer & Agent Relay Deck",
    backgroundColor: "#0a0c10",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(join(__dirname, "renderer", "index.html"));
}

// Headless CI / Verification Modu
const isHeadlessCheck = process.argv.includes("--headless-check");

if (isHeadlessCheck) {
  console.log("AIOS_DESKTOP_PREFLIGHT_OK");
  process.exit(0);
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
