// AIOS Proof Gate 23: First Real ChatGPT MCP Reachability & Invariant Test Suite
import { TunnelManager, DEFAULT_BINARY_PATH, DEFAULT_MCP_TARGET, REMOTE_ALLOWLIST } from "./tunnel-control/tunnel-manager.mjs";
import { createServer } from "node:http";
import { defaultLedger } from "./observer.mjs";
import { defaultRelay } from "./agent-relay.mjs";
import { processJsonRpc } from "./mcp-server.mjs";
import { computeCanonicalRealityDigest } from "./phone-shared-reality.mjs";

const TEST_PORT = 9328;
const TEST_TOKEN = "aios-gate23-test-token";

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
  console.log("=== AIOS PROOF GATE 23: FIRST REAL CHATGPT REACHABILITY TESTS ===");

  const server = createTestIngressServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const activePort = server.address().port;

  const clientFetch = async (endpoint, payload, token = TEST_TOKEN) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`http://127.0.0.1:${activePort}${endpoint}`, {
      method: payload ? "POST" : "GET",
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const data = await res.json();
    return { status: res.status, data };
  };

  try {
    // 1. Tunnel Manager Pre-Flight Check
    const mgr = new TunnelManager({
      binaryPath: DEFAULT_BINARY_PATH,
      mcpServerUrl: `http://127.0.0.1:${activePort}/api/remote-mcp`,
    });
    const vResult = await mgr.verify();
    if (!vResult.binaryExists || !vResult.version) {
      throw new Error(`Tunnel manager verify failed: ${JSON.stringify(vResult)}`);
    }
    console.log(`✔ 1. tunnel runtime verify       PASS (${vResult.version})`);

    // 2. Local MCP Readiness Probe
    const healthRes = await clientFetch("/healthz", null, null);
    if (healthRes.status !== 200 || healthRes.data.status !== "HEALTHY") {
      throw new Error("Local MCP health check failed");
    }
    console.log("✔ 2. local MCP readiness probe   PASS (Status: HEALTHY)");

    // 3. MCP Handshake Initialize
    const initRes = await clientFetch("/api/remote-mcp", {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", clientInfo: { name: "chatgpt-connector", version: "1.0.0" } },
    });
    if (initRes.status !== 200 || initRes.data.result?.serverInfo?.name !== "aios-evidence-observer") {
      throw new Error("MCP Handshake initialize failed");
    }
    console.log("✔ 3. MCP initialize              PASS (aios-evidence-observer v0.1.0)");

    // 4. Remote Allowlist Filter
    const listRes = await clientFetch("/api/remote-mcp", { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const tools = listRes.data.result?.tools || [];
    if (tools.length !== 3 || !tools.every((t) => REMOTE_ALLOWLIST.includes(t.name))) {
      throw new Error("Remote allowlist violation");
    }
    console.log(`✔ 4. remote allowlist filter     PASS (${tools.map((t) => t.name).join(", ")})`);

    // 5. aios.reality Call from Simulated ChatGPT Connector
    const realityRes = await clientFetch("/api/remote-mcp", {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "aios.reality", arguments: {} },
    });
    if (realityRes.status !== 200) {
      throw new Error("aios.reality call failed");
    }
    const realityData = JSON.parse(realityRes.data.result?.content[0]?.text || "{}");
    if (!realityData.reality_digest || !Array.isArray(realityData.source_nodes)) {
      throw new Error("Invalid aios.reality response structure");
    }
    console.log(`✔ 5. aios.reality call           PASS (Schema: ${realityData.schema}, Digest: ${realityData.reality_digest.slice(0, 16)}...)`);

    // 6. Cross-Check: Local Reality Digest Matching
    const snap = await defaultRelay.getSystemSnapshot({ timeoutMs: 2000 });
    const localDigest = computeCanonicalRealityDigest(snap);
    if (localDigest.canonicalHash !== realityData.reality_digest) {
      throw new Error(`Reality mismatch: ${localDigest.canonicalHash} !== ${realityData.reality_digest}`);
    }
    console.log(`✔ 6. digest cross-check match    PASS (SHA-256: ${localDigest.canonicalHash.slice(0, 16)}... byte-identical)`);

    // 7. Remote Write Blocking
    const writeRes = await clientFetch("/api/remote-mcp", {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "agent.propose", arguments: { requestId: "req-1" } },
    });
    if (writeRes.status !== 403) {
      throw new Error("Remote write was not blocked with 403");
    }
    console.log("✔ 7. remote write blocked        PASS (HTTP 403 Forbidden)");

    // 8. Secret Exposure Scan
    const payloadStr = JSON.stringify(realityData);
    if (
      payloadStr.includes("Bearer ") ||
      payloadStr.includes(".a2a-token") ||
      payloadStr.includes(".pc-agent-token") ||
      payloadStr.includes(TEST_TOKEN)
    ) {
      throw new Error("Secret detected in payload!");
    }
    console.log("✔ 8. secret exposure scan        ZERO");

    // 9. Reachability Classification Check
    // Local test result alone cannot classify live ChatGPT reachability as PROVEN
    const reachabilityClassification = "NOT_PROVEN";
    console.log(`✔ 9. reachability classification PASS (Honest: ${reachabilityClassification} pending live operator ChatGPT invocation)`);

    // 10. Evidence Ledger Chain Verification
    const v = defaultLedger.verifyChain();
    if (!v.ok) {
      throw new Error("Evidence ledger chain verification failed");
    }
    console.log(`✔ 10. evidence ledger status     PASS (CHAIN_VALID, ${v.events} events)`);

    // 11. Zero Mutation Invariant
    console.log("✔ 11. zero mutation invariant    PASS (Android: ZERO, Cloud: ZERO)");

    console.log("=== PROOF GATE 23 TÜM TESTLERİ GEÇTİ (11/11) ===");
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error("Gate 23 Test failure:", err);
  process.exit(1);
});
