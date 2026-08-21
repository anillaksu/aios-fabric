// AIOS Control Surface — Dual Mode Launcher (Electron Window + HTTP Surface)
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultRelay } from "./agent-relay.mjs";
import { defaultControlPlane } from "./agent-control-plane.mjs";
import { processJsonRpc } from "./mcp-server.mjs";
import { defaultOrchestrator } from "./runtime-console.mjs";
import { projectCanonicalState } from "./surface-projection.mjs";
import { defaultFabricEngine } from "./fabric-engine.mjs";
import { defaultNodeRegistry } from "./node-registry.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 9320;
const BIND_HOST = process.env.AIOS_BIND_HOST || "0.0.0.0";
const ANDROID_HOST = process.env.AIOS_ANDROID_URL || "http://100.75.177.88:9300";
const WINDOWS_HOST = process.env.AIOS_WINDOWS_URL || "http://127.0.0.1:9310";

function isLoopbackAddress(remoteAddress = "") {
  return (
    remoteAddress === "127.0.0.1" ||
    remoteAddress === "::1" ||
    remoteAddress === "::ffff:127.0.0.1"
  );
}

import { randomBytes } from "node:crypto";

const operatorSessions = new Map();
const SESSION_TTL_MS = 3600 * 1000; // 1 hour

function parseCookies(cookieHeader = "") {
  const list = {};
  cookieHeader.split(";").forEach((cookie) => {
    let [name, ...rest] = cookie.split("=");
    name = name?.trim();
    if (!name) return;
    const value = rest.join("=").trim();
    if (!value) return;
    list[name] = decodeURIComponent(value);
  });
  return list;
}

function isValidSession(sessionId) {
  if (!sessionId) return false;
  const session = operatorSessions.get(sessionId);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    operatorSessions.delete(sessionId);
    return false;
  }
  return true;
}

function isAuthorizedOperator(req, isLocal) {
  if (isLocal) return true;

  // 1. Check HttpOnly operator session cookie
  const cookies = parseCookies(req.headers["cookie"] || "");
  if (cookies.aios_session && isValidSession(cookies.aios_session)) {
    return true;
  }

  // 2. Check Authorization Bearer header
  const authHeader = req.headers["authorization"] || "";
  const expectedToken = (process.env.AIOS_REMOTE_TOKEN || process.env.AIOS_REMOTE_MCP_TOKEN || "").trim();
  if (!expectedToken) {
    return false; // Fail-closed: No remote token configured in environment
  }
  const bearerPrefix = "Bearer ";
  if (authHeader.startsWith(bearerPrefix) && authHeader.slice(bearerPrefix.length).trim() === expectedToken) {
    return true;
  }
  return false;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// Binary türler utf8 olarak okunamaz; Buffer olarak servis edilir.
const BINARY_EXT = new Set([".png", ".ico", ".woff2"]);

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

// Local / LAN / Tailscale HTTP Bridge
const server = createServer(async (req, res) => {
  const clientIp = req.socket.remoteAddress || "";
  const isLocal = isLoopbackAddress(clientIp);
  const hostHeader = req.headers["host"] || `127.0.0.1:${PORT}`;
  const url = new URL(req.url || "/", `http://${hostHeader}`);

  // API Endpoints
  if (url.pathname === "/api/projection") {
    const requested = (url.searchParams.get("profile") || "desktop")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    // TEK kanonik state okumasi. Coklu profil istendiginde tum projeksiyonlar
    // ayni state'ten uretilir; parite ancak boyle gozlemlenebilir.
    const state = await defaultControlPlane.getCanonicalState();

    if (requested.length === 1) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(projectCanonicalState(state, requested[0])));
      return;
    }

    const projections = {};
    for (const profile of requested) {
      projections[profile] = projectCanonicalState(state, profile);
    }
    const slotHashes = [...new Set(Object.values(projections).map((p) => p.semanticSlotHash))];
    const realityDigests = [...new Set(Object.values(projections).map((p) => p.realityDigest))];

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        schema: "aios.surface.projection.parity.v1",
        realityDigest: realityDigests.length === 1 ? realityDigests[0] : null,
        realityDigestParity: realityDigests.length === 1,
        semanticSlotHash: slotHashes.length === 1 ? slotHashes[0] : null,
        semanticSlotParity: slotHashes.length === 1,
        projectionHashes: Object.fromEntries(
          Object.entries(projections).map(([k, v]) => [k, v.projectionHash]),
        ),
        projections,
      }),
    );
    return;
  }

  // Operator Session Management Endpoint (HttpOnly Cookie-based Authentication for Remote Operator)
  if (url.pathname === "/api/operator/session") {
    if (req.method === "GET") {
      const authorized = isAuthorizedOperator(req, isLocal);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, authenticated: authorized, isLocal }));
      return;
    }

    if (req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body || "{}");
          const providedToken = (parsed.token || "").trim();
          const expectedToken = (process.env.AIOS_REMOTE_TOKEN || process.env.AIOS_REMOTE_MCP_TOKEN || "").trim();

          if (!expectedToken || !providedToken || providedToken !== expectedToken) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, status: "UNAUTHORIZED", error: "Invalid operator authentication token" }));
            return;
          }

          const sessionId = "sess-" + randomBytes(24).toString("hex");
          const expiresAt = Date.now() + SESSION_TTL_MS;
          operatorSessions.set(sessionId, { createdAt: Date.now(), expiresAt, role: "operator" });

          res.writeHead(200, {
            "Content-Type": "application/json",
            "Set-Cookie": `aios_session=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600`,
          });
          res.end(JSON.stringify({ ok: true, status: "AUTHENTICATED", expiresAt }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }
  }

  if (url.pathname === "/api/relay-snapshot") {
    const snapshot = await defaultRelay.getSystemSnapshot({ timeoutMs: 2500 });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(snapshot));
    return;
  }

  // Scale Fabric Distributed Metrics & Nodes
  if (url.pathname === "/api/fabric/metrics") {
    const metrics = defaultFabricEngine.getFabricMetrics();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, metrics }));
    return;
  }

  if (url.pathname === "/api/fabric/nodes") {
    const nodeMetrics = defaultNodeRegistry.getNodeMetrics();
    const nodes = Array.from(defaultNodeRegistry.nodes.values());
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, nodeMetrics, nodes }));
    return;
  }

  if (url.pathname === "/api/fabric/tasks") {
    const tasks = Array.from(defaultFabricEngine.tasks.values());
    const queue = defaultFabricEngine.queue;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, totalTasks: tasks.length, queueDepth: queue.length, tasks, queue }));
    return;
  }

  if (url.pathname === "/api/mcp" && req.method === "POST") {
    // Security Gate: Local Loopback Only
    if (!isLocal) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Forbidden: /api/mcp is strictly restricted to local loopback (127.0.0.1).",
          },
        }),
      );
      return;
    }

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
    const expectedToken = (process.env.AIOS_REMOTE_MCP_TOKEN || process.env.AIOS_REMOTE_TOKEN || "").trim();
    const bearerPrefix = "Bearer ";

    if (!expectedToken || !authHeader.startsWith(bearerPrefix) || authHeader.slice(bearerPrefix.length).trim() !== expectedToken) {
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
    if (!isAuthorizedOperator(req, isLocal)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, status: "UNAUTHORIZED", error: "Unauthorized: Remote approval operations require valid Bearer token." }));
      return;
    }

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
    if (!isAuthorizedOperator(req, isLocal)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, status: "UNAUTHORIZED", error: "Unauthorized: Remote battery trigger requires valid Bearer token." }));
      return;
    }

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
  if (url.pathname === "/api/runtime/status" || url.pathname === "/api/runtime/current") {
    const status = defaultOrchestrator.getStatus();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(status));
    return;
  }

  // Handle /api/runtime/:runId
  const runtimeRunMatch = url.pathname.match(/^\/api\/runtime\/(gate[0-9a-zA-Z_\-]+)$/);
  if (runtimeRunMatch) {
    const requestedRunId = runtimeRunMatch[1];
    const status = defaultOrchestrator.getStatus();
    if (status.run_id === requestedRunId) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(status));
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "RUN_NOT_FOUND", run_id: requestedRunId }));
    }
    return;
  }

  if (url.pathname === "/api/runtime/logs") {
    const status = defaultOrchestrator.getStatus();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, run_id: status.run_id, steps: status.raw?.steps || [] }));
    return;
  }

  if (url.pathname === "/api/runtime/attach" && req.method === "POST") {
    const r = defaultOrchestrator.attach();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(r));
    return;
  }

  if (url.pathname === "/api/runtime/pause" && req.method === "POST") {
    if (!isAuthorizedOperator(req, isLocal)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, status: "UNAUTHORIZED", error: "Unauthorized: Remote runtime pause requires valid Bearer token." }));
      return;
    }
    const r = defaultOrchestrator.pause();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(r));
    return;
  }

  if (url.pathname === "/api/runtime/resume" && req.method === "POST") {
    if (!isAuthorizedOperator(req, isLocal)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, status: "UNAUTHORIZED", error: "Unauthorized: Remote runtime resume requires valid Bearer token." }));
      return;
    }
    const r = defaultOrchestrator.resume();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(r));
    return;
  }

  if (url.pathname === "/api/runtime/start" && req.method === "POST") {
    if (!isAuthorizedOperator(req, isLocal)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, status: "UNAUTHORIZED", error: "Unauthorized: Remote runtime trigger requires valid Bearer token." }));
      return;
    }

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
    if (!isAuthorizedOperator(req, isLocal)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, status: "UNAUTHORIZED", error: "Unauthorized: Remote runtime stop requires valid Bearer token." }));
      return;
    }

    const r = defaultOrchestrator.stop();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(r));
    return;
  }

  if (url.pathname === "/api/ask" && req.method === "POST") {
    if (!isAuthorizedOperator(req, isLocal)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, status: "UNAUTHORIZED", error: "Unauthorized: Remote execution request requires valid Bearer token." }));
      return;
    }

    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body || "{}");
        const prompt = parsed.prompt || "";
        const result = await defaultControlPlane.askAios(prompt, { requestedBy: "operator" });
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
    if (!isAuthorizedOperator(req, isLocal)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, status: "UNAUTHORIZED", error: "Unauthorized: Remote execution approval requires valid Bearer token." }));
      return;
    }

    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body || "{}");
        const requestId = parsed.requestId;
        const result = await defaultControlPlane.approveAndExecute(requestId, "operator");
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

    if (BINARY_EXT.has(ext)) {
      const buf = readFileSync(filePath);
      res.writeHead(200, { "Content-Type": MIME[ext], "Cache-Control": "public, max-age=86400" });
      res.end(buf);
      return;
    }

    let content = readFileSync(filePath, "utf8");

    // In HTTP mode, mock window.aios bridge to call /api/* routes seamlessly
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const bridgeScript = `
      <script>
        if (!window.aios) {
          window.aios = {
            getProjection: (profile = 'desktop') => fetch('/api/projection?profile=' + encodeURIComponent(profile)).then(r => r.json()),
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

server.listen(PORT, BIND_HOST, () => {
  console.log(`[AIOS Control Surface] HTTP Server dinliyor (${BIND_HOST}:${PORT}):`);
  console.log(`  Local:     http://127.0.0.1:${PORT}`);
  console.log(`  Tailscale: http://100.109.236.30:${PORT}`);
  console.log(`  LAN:       http://192.168.1.13:${PORT}`);
});
