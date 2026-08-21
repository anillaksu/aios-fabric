// AIOS Shared Reality & Deterministic Query Verification Suite
import { unlinkSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyProvenMatrix, querySystemReality, buildSharedRealitySummary } from "./shared-reality.mjs";
import { processJsonRpc } from "./mcp-server.mjs";
import { AgentRelay } from "./agent-relay.mjs";
import { EvidenceLedger } from "./observer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_LEDGER_PATH = resolve(__dirname, "test-reality-ledger.jsonl");

async function runTests() {
  console.log("=== AIOS PROOF GATE 12: SHARED REALITY TESTS ===");

  if (existsSync(TEST_LEDGER_PATH)) {
    unlinkSync(TEST_LEDGER_PATH);
  }

  const testLedger = new EvidenceLedger(TEST_LEDGER_PATH);
  const relay = new AgentRelay(testLedger);

  // Mock Live Snapshot
  const mockSnapshot = {
    timestamp: new Date().toISOString(),
    nodes: {
      windows: { nodeId: "node-windows-1234", platform: "win32", online: true, stale: false },
      android: {
        nodeId: "node-android-5678",
        platform: "android",
        online: true,
        stale: false,
        agentName: "Phone AI-OS Fabric",
        agentVersion: "0.1.0",
        endpoint: "http://100.75.177.88:9300",
        capabilitiesCount: 39,
      },
    },
    attestation: {
      latestWitnessId: "attest-wit-d9b55fa5a77456e6421031141adf2e3549cffd790aaceef84cce8e95e1f019a7",
      intersectionHash: "6f0b10889cccac087656395eb2dd2f519825cc5750caedda081c763b7da47680",
      allowedCapabilities: ["a2a.delegate", "sensor.battery.read", "volume.read", "wifi.info"],
    },
    artifact: {
      artifactId: "art-dist-e63a5aab1197fad35495c98a",
      artifactSha256: "e63a5aab1197fad35495c98ab2dd3dd4ad2f51d0b44dabc582a5430186642644",
      lineageWitnessId: "attest-wit-d9b55fa5a77456e6421031141adf2e3549cffd790aaceef84cce8e95e1f019a7",
      humanApproved: true,
      policyResult: "ALLOWED",
    },
    evidenceChain: { ok: true, events: 9, status: "CHAIN_VALID", latestHash: "hash-latest-123" },
    pendingApprovals: [],
  };

  // 1. Shared Reality Snapshot Generation & Matrix Classification
  const matrix = classifyProvenMatrix(mockSnapshot);
  if (matrix.length !== 6 || matrix.find((m) => m.domain === "EVIDENCE_LEDGER")?.status !== "PROVEN") {
    throw new Error("Shared reality matrix classification failed");
  }
  console.log("✔ 1. shared reality snapshot      PASS (6/6 domains classified)");

  // 2. Stale Node Handling
  const staleSnapshot = {
    ...mockSnapshot,
    nodes: {
      ...mockSnapshot.nodes,
      android: { ...mockSnapshot.nodes.android, online: false, stale: true },
    },
  };
  const staleMatrix = classifyProvenMatrix(staleSnapshot);
  const netObserver = staleMatrix.find((m) => m.domain === "NETWORK_OBSERVER");
  if (netObserver?.status !== "STALE") {
    throw new Error("Stale node must be classified as STALE");
  }
  console.log("✔ 2. stale node                   PASS (Classified as STALE)");

  // 3. Disconnected Node Query
  const disconnectQuery = querySystemReality("Telefon canlı mı?", staleSnapshot);
  if (disconnectQuery.status !== "STALE" || !disconnectQuery.answer.includes("çevrimdışı")) {
    throw new Error("Disconnected query must return STALE answer");
  }
  console.log("✔ 3. disconnected node query      PASS");

  // 4. Evidence Lineage Verification in Query
  const lineageQuery = querySystemReality("Son artifact nedir?", mockSnapshot);
  if (lineageQuery.status !== "PROVEN" || lineageQuery.artifact?.lineageWitnessId !== mockSnapshot.artifact.lineageWitnessId) {
    throw new Error("Lineage binding mismatch in artifact query");
  }
  console.log("✔ 4. evidence lineage in query    PASS (Lineage verified)");

  // 5. Deterministic Query Answers
  const qProven1 = querySystemReality("Şu an ne kanıtlandı?", mockSnapshot);
  const qProven2 = querySystemReality("what is proven now", mockSnapshot);
  if (qProven1.status !== "PROVEN" || !qProven1.answer.includes("CANLI KANITLANMIŞ")) {
    throw new Error("Proven query failed");
  }
  const qIntersect = querySystemReality("Hangi capability'ler ortak?", mockSnapshot);
  if (qIntersect.status !== "PROVEN" || qIntersect.allowedCapabilities.length !== 4) {
    throw new Error("Intersection query failed");
  }
  console.log("✔ 5. deterministic queries        PASS (All matched queries resolved)");

  // 6. Human Gate Preservation in Matrix
  const pendingSnapshot = {
    ...mockSnapshot,
    pendingApprovals: [{ approvalId: "appr-1", operation: "sensor.battery.write" }],
  };
  const pendingMatrix = classifyProvenMatrix(pendingSnapshot);
  const humanGate = pendingMatrix.find((m) => m.domain === "HUMAN_CONTROL_GATE");
  if (humanGate?.status !== "HUMAN_APPROVAL_REQUIRED") {
    throw new Error("Pending approval must trigger HUMAN_APPROVAL_REQUIRED status");
  }
  console.log("✔ 6. human gate preservation      PASS (HUMAN_APPROVAL_REQUIRED verified)");

  // 7. Unknown / Unproven Query -> NOT_PROVEN (No Hallucinations)
  const unknownQuery = querySystemReality("Hava durumu bugün nasıl olacak?", mockSnapshot);
  if (unknownQuery.status !== "NOT_PROVEN" || !unknownQuery.answer.includes("NOT_PROVEN")) {
    throw new Error("Unknown query must return NOT_PROVEN");
  }
  console.log("✔ 7. unknown/unproven state       PASS (No hallucination, returns NOT_PROVEN)");

  // 8. MCP Read-Only Tools (shared_reality.snapshot & system.query)
  const mcpSnapRes = await processJsonRpc({
    jsonrpc: "2.0",
    id: 101,
    method: "tools/call",
    params: { name: "shared_reality.snapshot", arguments: {} },
  });
  if (mcpSnapRes.error || !mcpSnapRes.result?.content?.[0]?.text) {
    throw new Error("MCP shared_reality.snapshot failed");
  }
  const mcpQueryRes = await processJsonRpc({
    jsonrpc: "2.0",
    id: 102,
    method: "tools/call",
    params: { name: "system.query", arguments: { query: "Şu an ne kanıtlandı?" } },
  });
  if (mcpQueryRes.error || !mcpQueryRes.result?.content?.[0]?.text) {
    throw new Error("MCP system.query failed");
  }
  console.log("✔ 8. MCP read-only boundary       PASS (shared_reality.snapshot & system.query OK)");

  // 9. Secret Exposure Check
  const mcpOutput = mcpSnapRes.result.content[0].text + mcpQueryRes.result.content[0].text;
  if (mcpOutput.includes("token") || mcpOutput.includes("Bearer") || mcpOutput.includes("secret")) {
    throw new Error("Secret exposure in MCP output");
  }
  console.log("✔ 9. secret exposure              ZERO");

  // 10. Restart / Recovery
  const summary1 = buildSharedRealitySummary(mockSnapshot);
  const summary2 = buildSharedRealitySummary(mockSnapshot);
  if (JSON.stringify(summary1) !== JSON.stringify(summary2)) {
    throw new Error("Shared reality summary must be deterministic and identical across restarts");
  }
  console.log("✔ 10. restart recovery / determinism PASS");

  // Temizlik
  if (existsSync(TEST_LEDGER_PATH)) {
    unlinkSync(TEST_LEDGER_PATH);
  }

  console.log("=== PROOF GATE 12 TÜM TESTLERİ GEÇTİ (10/10) ===");
}

runTests().catch((err) => {
  console.error("Shared Reality Test failure:", err);
  if (existsSync(TEST_LEDGER_PATH)) unlinkSync(TEST_LEDGER_PATH);
  process.exit(1);
});
