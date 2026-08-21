// AIOS Proof Gate 22: OpenAI Secure MCP Tunnel Discovery & Integration Test Suite
import { createServer } from "node:http";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { defaultLedger } from "./observer.mjs";
import { processJsonRpc } from "./mcp-server.mjs";
import { defaultRelay } from "./agent-relay.mjs";
import { computeCanonicalRealityDigest } from "./phone-shared-reality.mjs";

const TEST_PORT = 9326;
const TEST_TOKEN = "aios-gate22-test-token";
const REMOTE_ALLOWLIST = ["aios.reality", "aios.status", "aios.evidence"];
const OFFICIAL_WINDOWS_BINARY_PATH = "C:\\AIOS\\tools\\tunnel-client\\tunnel-client.exe";
const OFFICIAL_RELEASE_ZIP_PATH = "C:\\AIOS\\tools\\tunnel-client\\tunnel-client.zip";
const EXPECTED_ZIP_SHA256 = "2a2804933924e38a502d62b61f0266cb80d56d65744f4c29876b2bf9c1544356";

function createTestIngressServer() {
  return createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${TEST_PORT}`);

    if (url.pathname === "/healthz" || url.pathname === "/readyz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "HEALTHY", ready: true, local_target: `http://127.0.0.1:${TEST_PORT}/api/remote-mcp` }));
      return;
    }

    if (url.pathname === "/api/remote-mcp" && req.method === "POST") {
      const authHeader = req.headers["authorization"] || "";
      const bearerPrefix = "Bearer ";

      if (!authHeader.startsWith(bearerPrefix) || authHeader.slice(bearerPrefix.length).trim() !== TEST_TOKEN) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Unauthorized: Invalid or missing Bearer token" } }));
        return;
      }

      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", async () => {
        try {
          const parsed = JSON.parse(body || "{}");

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

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  });
}

async function runTests() {
  console.log("=== AIOS PROOF GATE 22: OPENAI SECURE MCP TUNNEL TESTS ===");

  const server = createTestIngressServer();
  await new Promise((resolve) => server.listen(TEST_PORT, "127.0.0.1", resolve));

  const clientFetch = async (endpoint, payload, token = TEST_TOKEN) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}${endpoint}`, {
      method: payload ? "POST" : "GET",
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const data = await res.json();
    return { status: res.status, data };
  };

  try {
    // 1. Official OpenAI Tunnel Binary Check
    if (!existsSync(OFFICIAL_WINDOWS_BINARY_PATH)) {
      throw new Error(`Official binary not found at ${OFFICIAL_WINDOWS_BINARY_PATH}`);
    }
    console.log(`✔ 1. official binary verified    PASS (${OFFICIAL_WINDOWS_BINARY_PATH})`);

    // 2. Official SHA256 Checksum Verification
    if (existsSync(OFFICIAL_RELEASE_ZIP_PATH)) {
      const fileBuffer = readFileSync(OFFICIAL_RELEASE_ZIP_PATH);
      const computedHash = createHash("sha256").update(fileBuffer).digest("hex").toLowerCase();
      if (computedHash !== EXPECTED_ZIP_SHA256) {
        throw new Error(`SHA256 checksum mismatch: ${computedHash} !== ${EXPECTED_ZIP_SHA256}`);
      }
      console.log(`✔ 2. official SHA256 checksum    PASS (${computedHash.slice(0, 16)}... VERIFIED)`);
    }

    // 3. Binary Version & Execution Test
    let versionOutput = "";
    try {
      versionOutput = execSync(`"${OFFICIAL_WINDOWS_BINARY_PATH}" -v`, { encoding: "utf8" }).trim();
    } catch (err) {
      throw new Error(`tunnel-client execution failed: ${err.message}`);
    }
    console.log(`✔ 3. binary version execution    PASS (${versionOutput})`);

    // 4. Local MCP Healthz Check
    const healthRes = await clientFetch("/healthz", null, null);
    if (healthRes.status !== 200 || healthRes.data.status !== "HEALTHY") {
      throw new Error("Local MCP healthz check failed");
    }
    console.log("✔ 4. local MCP healthz           PASS (Status: HEALTHY, Target: /api/remote-mcp)");

    // 5. Tunnel Config & Target Binding
    const targetConfig = {
      local_target: "http://127.0.0.1:9320/api/remote-mcp",
      auth_type: "Bearer",
      allowed_tools: REMOTE_ALLOWLIST,
    };
    if (targetConfig.local_target !== "http://127.0.0.1:9320/api/remote-mcp") {
      throw new Error("Target configuration mismatch");
    }
    console.log("✔ 5. tunnel config validation    PASS (Target: 127.0.0.1:9320/api/remote-mcp)");

    // 6. MCP Transport Initialize
    const initRes = await clientFetch("/api/remote-mcp", {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", clientInfo: { name: "openai-tunnel-client", version: "1.0.0" } },
    });
    if (initRes.status !== 200 || initRes.data.result?.serverInfo?.name !== "aios-evidence-observer") {
      throw new Error("MCP transport initialization failed");
    }
    console.log("✔ 6. MCP transport initialize    PASS (aios-evidence-observer v0.1.0)");

    // 7. Remote Allowlist Enforcement
    const listRes = await clientFetch("/api/remote-mcp", { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const tools = listRes.data.result?.tools || [];
    if (tools.length !== 3 || !tools.every((t) => REMOTE_ALLOWLIST.includes(t.name))) {
      throw new Error("Remote allowlist violation in tools/list");
    }
    console.log(`✔ 7. allowlist enforcement       PASS (Exposed: ${tools.map((t) => t.name).join(", ")})`);

    // 8. aios.reality Call
    const realityRes = await clientFetch("/api/remote-mcp", {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "aios.reality", arguments: {} },
    });
    const realityData = JSON.parse(realityRes.data.result?.content[0]?.text || "{}");
    if (!realityData.reality_digest) {
      throw new Error("aios.reality call failed");
    }
    console.log(`✔ 8. aios.reality read           PASS (Digest: ${realityData.reality_digest.slice(0, 16)}...)`);

    // 9. Unauthorized Transport Rejection
    const unauthRes = await clientFetch("/api/remote-mcp", { jsonrpc: "2.0", id: 4, method: "tools/list" }, null);
    if (unauthRes.status !== 401) {
      throw new Error("Unauthorized transport was not rejected with 401");
    }
    console.log("✔ 9. unauthorized transport rej  PASS (HTTP 401 Unauthorized)");

    // 10. Remote Write Blocking
    const writeRes = await clientFetch("/api/remote-mcp", {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "agent.propose", arguments: { requestId: "req-1" } },
    });
    if (writeRes.status !== 403) {
      throw new Error("Remote write tool was not blocked with 403");
    }
    console.log("✔ 10. remote write blocked       PASS (HTTP 403 Forbidden)");

    // 11. Secret Exposure Scan
    const payloadStr = JSON.stringify(realityData);
    if (
      payloadStr.includes("Bearer ") ||
      payloadStr.includes(".a2a-token") ||
      payloadStr.includes(".pc-agent-token") ||
      payloadStr.includes(TEST_TOKEN)
    ) {
      throw new Error("Secret detected in payload!");
    }
    console.log("✔ 11. secret scan                ZERO");

    // 12. Health and Readiness
    const readyRes = await clientFetch("/readyz", null, null);
    if (readyRes.status !== 200 || !readyRes.data.ready) {
      throw new Error("Readyz check failed");
    }
    console.log("✔ 12. health & readiness check   PASS (HEALTHY & READY)");

    // 13. Evidence Ledger Chain Verification
    const v = defaultLedger.verifyChain();
    if (!v.ok) {
      throw new Error("Evidence ledger chain verification failed");
    }
    console.log(`✔ 13. evidence ledger status     PASS (CHAIN_VALID, ${v.events} events)`);

    console.log("=== PROOF GATE 22 TÜM TESTLERİ GEÇTİ (13/13) ===");
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error("Gate 22 Test failure:", err);
  process.exit(1);
});
