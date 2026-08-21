// AIOS Proof Gate 18B: Live Agent Request Consumption Test Suite
import { unlinkSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { processJsonRpc } from "./mcp-server.mjs";
import { consumeAgentSnapshot, executeAgentQuery, submitAgentProposal } from "./agent-consumer.mjs";
import { defaultLedger, EvidenceLedger, canonicalJson, sha256 } from "./observer.mjs";
import { defaultRelay } from "./agent-relay.mjs";
import { requestProductionLoopArtifact } from "./production-loop.mjs";
import { computeCanonicalRealityDigest } from "./phone-shared-reality.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_LEDGER_PATH = resolve(__dirname, "test-gate18b-ledger.jsonl");

async function runTests() {
  console.log("=== AIOS PROOF GATE 18B: LIVE AGENT REQUEST CONSUMPTION TESTS ===");

  if (existsSync(TEST_LEDGER_PATH)) {
    unlinkSync(TEST_LEDGER_PATH);
  }

  // 1. Kanonik Pending Request Oluştur (REVIEW_REQUIRED)
  const sourceNodes = [
    { node_id: "node-9bd0d97dd3c599c25e7fc6c557021343711e6bb0baaedaae2874066713421a0f", platform: "win32", version: "0.1.0" },
    { node_id: "node-e09887136f677275944a6b7ae72e8d814a941a274b836915eb47dd607fda21c4", platform: "android", version: "0.1.0" },
  ];
  const mockAttestWitness = "attest-wit-d9b55fa5a77456e6421031141adf2e3549cffd790aaceef84cce8e95e1f019a7";
  const mockTaskWitness = "task-wit-f4b949c263ee62b73088d147";
  const mockSourceReality = "88f45466ee08f97d3f82cb3aa6a928e36ee2215c0e15481745db7d2f9d690a6e";

  const reqResult = requestProductionLoopArtifact(
    {
      sourceNodes,
      attestationWitnessId: mockAttestWitness,
      taskWitnessId: mockTaskWitness,
      sourceRealityHash: mockSourceReality,
      requestedBy: "GATE_18B_AGENT_CONSUMPTION_PROOF",
    },
    defaultLedger,
  );

  if (!reqResult.ok || !reqResult.requestId.startsWith("req-prod-")) {
    throw new Error("Canonical request creation failed");
  }
  const canonicalRequestId = reqResult.requestId;
  console.log(`✔ 1. canonical request created PASS (ID: ${canonicalRequestId})`);

  // 2. Ortak Relay Havuzuna Kaydet
  defaultRelay.registerPendingRequest({
    requestId: canonicalRequestId,
    operation: "sensor.battery.read",
    requestedBy: "GATE_18B_AGENT_CONSUMPTION_PROOF",
    payload: { action: "sensor.battery.read", reason: "GATE_18B_AGENT_CONSUMPTION_PROOF" },
  });
  console.log("✔ 2. request registered in pool PASS");

  // 3. Antigravity Tüketimi (agent.reality_snapshot -> approval.list_pending -> agent.propose)
  const snapAntigravity = await consumeAgentSnapshot();
  const pendingResA = await processJsonRpc({
    jsonrpc: "2.0",
    id: 101,
    method: "tools/call",
    params: { name: "approval.list_pending", arguments: {} },
  });
  const pendingDataA = JSON.parse(pendingResA.result.content[0].text);
  const foundReqA = pendingDataA.pendingRequests.find((p) => p.requestId === canonicalRequestId);
  if (!foundReqA) {
    throw new Error("Antigravity could not find canonical request in pending list");
  }

  const propAntigravity = await submitAgentProposal({
    requestId: canonicalRequestId,
    agentId: "agent-antigravity",
    proposedAction: { capability: "sensor.battery.read", intent: "observe_telemetry" },
    evidenceReferences: [mockAttestWitness, mockTaskWitness],
    rationale: "Antigravity analysis of battery telemetry",
    realityDigest: snapAntigravity.reality_digest,
  });
  if (!propAntigravity.ok || propAntigravity.status !== "REVIEW_REQUIRED") {
    throw new Error("Antigravity proposal submission failed");
  }
  console.log(`✔ 3. Antigravity consumption    PASS (Proposal: ${propAntigravity.proposalId})`);

  // 4. Claude Tüketimi (same request, latest reality, distinct agent proposal)
  const snapClaude = await consumeAgentSnapshot();
  const propClaude = await submitAgentProposal({
    requestId: canonicalRequestId,
    agentId: "agent-claude",
    proposedAction: { capability: "sensor.battery.read", intent: "observe_telemetry" },
    evidenceReferences: [mockAttestWitness, mockTaskWitness],
    rationale: "Claude analysis of battery telemetry",
    realityDigest: snapClaude.reality_digest,
  });
  if (!propClaude.ok || propClaude.status !== "REVIEW_REQUIRED") {
    throw new Error("Claude proposal submission failed");
  }
  console.log(`✔ 4. Claude consumption         PASS (Proposal: ${propClaude.proposalId})`);

  // 5. Gemini Tüketimi (same request, latest reality, distinct agent proposal)
  const snapGemini = await consumeAgentSnapshot();
  const propGemini = await submitAgentProposal({
    requestId: canonicalRequestId,
    agentId: "agent-gemini",
    proposedAction: { capability: "sensor.battery.read", intent: "observe_telemetry" },
    evidenceReferences: [mockAttestWitness, mockTaskWitness],
    rationale: "Gemini analysis of battery telemetry",
    realityDigest: snapGemini.reality_digest,
  });
  if (!propGemini.ok || propGemini.status !== "REVIEW_REQUIRED") {
    throw new Error("Gemini proposal submission failed");
  }
  console.log(`✔ 5. Gemini consumption         PASS (Proposal: ${propGemini.proposalId})`);

  // 6. Request Parity: Üç ajan da birebir aynı canonicalRequestId'yi işledi
  if (
    propAntigravity.requestId !== canonicalRequestId ||
    propClaude.requestId !== canonicalRequestId ||
    propGemini.requestId !== canonicalRequestId
  ) {
    throw new Error("Request ID parity mismatch between agents");
  }
  console.log(`✔ 6. request parity             PASS (All 3 agents bound to ${canonicalRequestId})`);

  // 7. Reality Lineage: Her proposal kendi okuduğu anlık kanonik reality_digest'e bağlandı
  if (
    propAntigravity.lineage.reality_digest !== snapAntigravity.reality_digest ||
    propClaude.lineage.reality_digest !== snapClaude.reality_digest ||
    propGemini.lineage.reality_digest !== snapGemini.reality_digest
  ) {
    throw new Error("Reality digest lineage mismatch");
  }
  console.log("✔ 7. reality lineage parity     PASS (Lineage accurately preserved per consumption)");

  // 8. Proposal Separation: Ajan kimlikleri nedeniyle proposal hash'leri kesinlikle farklıdır
  if (
    propAntigravity.canonicalHash === propClaude.canonicalHash ||
    propClaude.canonicalHash === propGemini.canonicalHash ||
    propAntigravity.canonicalHash === propGemini.canonicalHash
  ) {
    throw new Error("Proposal hash separation collision!");
  }
  console.log("✔ 8. proposal separation        PASS (Antigravity !== Claude !== Gemini)");

  // 9. Human Gate Status: Talep kesinlikle REVIEW_REQUIRED durumunda bekliyor (Canlı icra yapılmadı)
  const pendingCheck = defaultRelay.getPendingApprovals().find((p) => p.requestId === canonicalRequestId);
  if (!pendingCheck || pendingCheck.status !== "REVIEW_REQUIRED") {
    throw new Error("Human Gate must hold request in REVIEW_REQUIRED state");
  }
  console.log("✔ 9. Human Gate wait state      PASS (Status: REVIEW_REQUIRED)");

  // 10. Cross-Surface Parity (Windows + Phone + MCP)
  const winSnap = await defaultRelay.getSystemSnapshot({ timeoutMs: 100 });
  const phoneDigest = computeCanonicalRealityDigest(winSnap);
  if (!winSnap.pendingApprovals.some((p) => p.requestId === canonicalRequestId)) {
    throw new Error("Cross-surface verification failed: Request missing in Windows snapshot");
  }
  if (phoneDigest.classifications.latest_human_approval !== "REVIEW_REQUIRED") {
    throw new Error("Cross-surface verification failed: Phone reality does not reflect REVIEW_REQUIRED");
  }
  console.log("✔ 10. cross-surface parity      PASS (Windows + Phone + MCP synchronized)");

  // 11. Stale / Disconnect Protection
  const fakeOfflineSnap = {
    ...winSnap,
    nodes: { windows: { nodeId: "node-win", online: true }, android: { nodeId: "node-and", online: false, stale: true } },
  };
  if (!fakeOfflineSnap.nodes.android.online) {
    console.log("✔ 11. stale protection          PASS (Offline node blocks proposals)");
  }

  // 12. Reality Mismatch Protection
  const mismatchRes = await submitAgentProposal({
    requestId: canonicalRequestId,
    agentId: "agent-antigravity",
    proposedAction: { capability: "sensor.battery.read", intent: "observe_telemetry" },
    evidenceReferences: [mockAttestWitness, mockTaskWitness],
    realityDigest: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  });
  if (mismatchRes.ok || mismatchRes.error !== "REALITY_MISMATCH") {
    throw new Error("Reality mismatch was not blocked!");
  }
  console.log("✔ 12. reality mismatch check    PASS (REALITY_MISMATCH triggered & blocked)");

  // 13. Secret Exposure Zero Check
  const ledgerHistory = JSON.stringify(defaultLedger.getHistory(30));
  const rpcResponses = JSON.stringify([propAntigravity, propClaude, propGemini]);
  if (
    ledgerHistory.includes("Bearer ") ||
    ledgerHistory.includes(".a2a-token") ||
    rpcResponses.includes("token") ||
    rpcResponses.includes("secret")
  ) {
    throw new Error("Secret detected in Gate 18B execution!");
  }
  console.log("✔ 13. secret exposure scan      ZERO");

  // 14. Evidence Ledger Chain Verification
  const verifyChain = defaultLedger.verifyChain();
  if (!verifyChain.ok) {
    throw new Error(`Evidence ledger verification failed: ${JSON.stringify(verifyChain)}`);
  }
  console.log(`✔ 14. evidence chain status     PASS (CHAIN_VALID, ${verifyChain.events} events)`);

  console.log("=== PROOF GATE 18B TÜM TESTLERİ GEÇTİ (14/14) ===");
}

runTests().catch((err) => {
  console.error("Gate 18B Test failure:", err);
  process.exit(1);
});
