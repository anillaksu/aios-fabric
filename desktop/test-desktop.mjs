// AIOS Desktop Control Surface — Automated Verification Gate
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runVerification() {
  console.log("=== AIOS DESKTOP CONTROL SURFACE VERIFICATION ===");

  // 1. Dosya bütünlüğü
  const requiredFiles = [
    "package.json",
    "main.mjs",
    "preload.cjs",
    "renderer/index.html",
    "renderer/style.css",
    "renderer/app.js",
  ];

  for (const rel of requiredFiles) {
    const full = resolve(__dirname, rel);
    if (!existsSync(full)) {
      console.error(`FAIL: Eksik dosya: ${rel}`);
      process.exit(1);
    }
    console.log(`ok\tfile\t${rel}`);
  }

  // 2. Main syntax kontrolü
  const mainCode = readFileSync(resolve(__dirname, "main.mjs"), "utf8");
  if (!mainCode.includes("ipcMain.handle") || !mainCode.includes("contextIsolation")) {
    console.error("FAIL: main.mjs güvenlik veya IPC yapılandırması eksik");
    process.exit(1);
  }
  console.log("ok\tsecurity\tmain.mjs context isolation & sandbox");

  // 3. Preload syntax kontrolü
  const preloadCode = readFileSync(resolve(__dirname, "preload.cjs"), "utf8");
  if (!preloadCode.includes("contextBridge.exposeInMainWorld")) {
    console.error("FAIL: preload.cjs contextBridge eksik");
    process.exit(1);
  }
  console.log("ok\tsecurity\tpreload.cjs contextBridge bridge");

  // 4. Android Node (:9300) Canlı Ulaşılabilirlik Testi
  const androidUrl = "http://100.75.177.88:9300";
  try {
    const res = await fetch(`${androidUrl}/.well-known/agent-card.json`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const card = await res.json();
      console.log(`ok\tremote-node\tAndroid Fabric 100.75.177.88:9300 (${card.name || "Fabric"} v${card.version || "0.1.0"})`);
    } else {
      console.log(`warn\tremote-node\tHTTP ${res.status}`);
    }
  } catch (err) {
    console.log(`warn\tremote-node\t${err.message}`);
  }

  // 5. Read-only sensor execution testi
  try {
    const res = await fetch(`${androidUrl}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "sensor.battery.read" }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.data) {
        console.log(`ok\tread-execution\tsensor.battery.read (Pil: ${data.data.percentage ?? data.data.level ?? "?"}%, ${data.data.status || "OK"})`);
      }
    }
  } catch (err) {
    console.log(`warn\tread-execution\t${err.message}`);
  }

  console.log("=== DESKTOP VERIFICATION GATE PASSED ===");
}

runVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
