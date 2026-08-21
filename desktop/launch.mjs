// AIOS Control Surface — Dual Mode Launcher (Electron Window + HTTP Surface)
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultRelay } from "./agent-relay.mjs";
import { defaultControlPlane } from "./agent-control-plane.mjs";
import { processJsonRpc } from "./mcp-server.mjs";
import { defaultOrchestrator } from "./runtime-console.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 9320;
const ANDROID_HOST = process.env.AIOS_ANDROID_URL || "http://100.75.177.88:9300";
const WINDOWS_HOST = process.env.AIOS_WINDOWS_URL || "http://127.0.0.1:9310";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

async function fetchJson(url, options = {}) {
  const timeoutMs = options.timeoutMs || 4000;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { Accept: "application/json", ...(options.headers || {}) },
    });
    clearTimeout(id);
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    clearTimeout(id);
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

// Local HTTP Bridge
const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

  // API Endpoints
  if (url.pathname === "/api/relay-snapshot") {
    const snapshot = await defaultRelay.getSystemSnapshot({ timeoutMs: 2500 });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(snapshot));
    return;
  }

  if (url.pathname === "/api/mcp" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body || "{}");
        const result = await processJsonRpc(parsed);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32600, message: err.message } }));
      }
    });
    return;
  }

  if (url.pathname === "/api/remote-mcp" && req.method === "POST") {
    const authHeader = req.headers["authorization"] || "";
    const expectedToken = process.env.AIOS_REMOTE_MCP_TOKEN || "aios-remote-mcp-bearer-token";
    const bearerPrefix = "Bearer ";

    if (!authHeader.startsWith(bearerPrefix) || authHeader.slice(bearerPrefix.length).trim() !== expectedToken) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Unauthorized: Invalid or missing remote Bearer token" } }));
      return;
    }

    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body || "{}");
        const REMOTE_ALLOWLIST = ["aios.reality", "aios.status", "aios.evidence"];

        if (parsed.method === "tools/list") {
          const fullList = await processJsonRpc(parsed);
          const filteredTools = (fullList.result?.tools || []).filter((t) => REMOTE_ALLOWLIST.includes(t.name));
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", id: parsed.id, result: { tools: filteredTools } }));
          return;
        }

        if (parsed.method === "tools/call") {
          const toolName = parsed.params?.name;
          if (!REMOTE_ALLOWLIST.includes(toolName)) {
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                id: parsed.id,
                error: {
                  code: -32600,
                  message: `Tool '${toolName}' is forbidden on the remote public surface. Only read-only allowlist tools are permitted.`,
                },
              }),
            );
            return;
          }
        }

        const result = await processJsonRpc(parsed);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32600, message: err.message } }));
      }
    });
    return;
  }

  if (url.pathname === "/api/resolve-approval" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body || "{}");
        const resolved = defaultRelay.resolveApprovalRequest(parsed.approvalId, parsed.decision, "operator-admin");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(resolved));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  if (url.pathname === "/api/android-node") {
    const [card, status, caps] = await Promise.all([
      fetchJson(`${ANDROID_HOST}/.well-known/agent-card.json`),
      fetchJson(`${ANDROID_HOST}/runtime-status`),
      fetchJson(`${ANDROID_HOST}/capabilities`),
    ]);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        host: ANDROID_HOST,
        reachable: card.ok || status.ok,
        card: card.data || null,
        status: status.data || null,
        capabilities: Array.isArray(caps.data) ? caps.data : [],
      }),
    );
    return;
  }

  if (url.pathname === "/api/windows-node") {
    const card = await fetchJson(`${WINDOWS_HOST}/.well-known/agent-card.json`, { timeoutMs: 1500 });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ host: WINDOWS_HOST, reachable: card.ok, card: card.data || null }));
    return;
  }

  if (url.pathname === "/api/read-battery") {
    const r = await fetchJson(`${ANDROID_HOST}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "sensor.battery.read" }),
      timeoutMs: 6000,
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(r));
    return;
  }

  if (url.pathname === "/api/formations") {
    const r = await fetchJson(`${ANDROID_HOST}/formation-memory`, { timeoutMs: 3000 });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(r));
    return;
  }

  if (url.pathname === "/api/canonical-state") {
    const state = await defaultControlPlane.getCanonicalState();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(state));
    return;
  }

  // Runtime Console Endpoints
  if (url.pathname === "/api/runtime/status") {
    const status = defaultOrchestrator.getStatus();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(status));
    return;
  }

  if (url.pathname === "/api/runtime/start" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body || "{}");
        const gate = parsed.gate || "24";
        // Start run asynchronously
        defaultOrchestrator.run({ gate });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, status: "RUNNING", gate }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  if (url.pathname === "/api/runtime/stop" && req.method === "POST") {
    const r = defaultOrchestrator.stop();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(r));
    return;
  }

  if (url.pathname === "/api/ask" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body || "{}");
        const prompt = parsed.prompt || "";
        const result = await defaultControlPlane.askAios(prompt, { requestedBy: "gui-operator" });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  if (url.pathname === "/api/approve-and-execute" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body || "{}");
        const requestId = parsed.requestId;
        const result = await defaultControlPlane.approveAndExecute(requestId, "gui-operator");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // Static Files
  let filePath = resolve(__dirname, "renderer", url.pathname === "/" ? "index.html" : url.pathname.slice(1));
  if (!filePath.startsWith(resolve(__dirname, "renderer"))) {
    res.writeHead(403);
    res.end();
    return;
  }

  if (existsSync(filePath)) {
    const ext = extname(filePath);
    let content = readFileSync(filePath, "utf8");

    // In HTTP mode, mock window.aios bridge to call /api/* routes seamlessly
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const bridgeScript = `
      <script>
        if (!window.aios) {
          window.aios = {
            getCanonicalState: () => fetch('/api/canonical-state').then(r => r.json()),
            askAios: (prompt) => fetch('/api/ask', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt })
            }).then(r => r.json()),
            approveAndExecute: (requestId) => fetch('/api/approve-and-execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ requestId })
            }).then(r => r.json()),
            getAndroidNode: () => fetch('/api/android-node').then(r => r.json()),
            getWindowsNode: () => fetch('/api/windows-node').then(r => r.json()),
            readBattery: () => fetch('/api/read-battery').then(r => r.json()),
            getFormations: () => fetch('/api/formations').then(r => r.json()),
            getRelaySnapshot: () => fetch('/api/relay-snapshot').then(r => r.json()),
            getRuntimeStatus: () => fetch('/api/runtime/status').then(r => r.json()),
            startRuntimeRun: (gate) => fetch('/api/runtime/start', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gate })
            }).then(r => r.json()),
            stopRuntimeRun: () => fetch('/api/runtime/stop', { method: 'POST' }).then(r => r.json()),
            resolveApproval: (approvalId, decision) => fetch('/api/resolve-approval', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ approvalId, decision })
            }).then(r => r.json()),
          };
        }
      </script>
      `;
      content = content.replace("</head>", `${bridgeScript}</head>`);
    }

    res.writeHead(200, { "Content-Type": MIME[ext] || "text/plain; charset=utf-8" });
    res.end(content);
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[AIOS Control Surface] HTTP Server dinliyor: http://127.0.0.1:${PORT}`);
});
