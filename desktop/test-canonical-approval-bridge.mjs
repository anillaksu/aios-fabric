// AIOS Canonical Approval Bridge & Cross-Surface Human Gate Test Suite (Gate 17)
import { unlinkSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentRelay } from "./agent-relay.mjs";
import { ContinuousObserver } from "./continuous-observer.mjs";
import { processJsonRpc } from "./mcp-server.mjs";
import { computeCanonicalRealityDigest, verifyPhoneSharedRealityParity } from "./phone-shared-reality.mjs";
import { EvidenceLedger } from "./observer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_LEDGER_PATH = resolve(__dirname, "test-canonical-approval-ledger.jsonl");

async function runTests() {
  console.log("=== AIOS PROOF GATE 17: CANONICAL APPROVAL BRIDGE TESTS ===");

  if (existsSync(TEST_LEDGER_PATH)) {
    unlinkSync(TEST_LEDGER_PATH);
  }

  const testLedger = new EvidenceLedger(TEST_LEDGER_PATH);
  const relay = new AgentRelay(testLedger);
  const observer = new ContinuousObserver(testLedger, relay);

  // Baseline Snapshot
  const baseSnapshot = {
    timestamp: new Date().toISOString(),
    nodes: {
      windows: { nodeId: "node-windows-1234", platform: "win32", online: true, stale: false },
      android: { nodeId: "node-android-5678", platform: "android", online: true, stale: false, services: ["fabric"], capabilitiesCount: 39 },
    },
    attestation: {
      latestWitnessId: "attest-wit-d9b55fa5a77456e6421031141adf2e3549cffd790aaceef84cce8e95e1f019a7",
      intersectionHash: "6f0b10889cccac087656395eb2dd2f519825cc5750caedda081c763b7da47680",
      allowedCapabilities: ["sensor.battery.read"],
    },
    artifact: {
      artifactId: "art-prod-a5b3097e49810e8c3e8b5b98",
      artifactSha256: "a5b3097e49810e8c3e8b5b98a2efc4c9a2d4d85b0d2e3e7b57b49317bf09e0a3",
      lineageWitnessId: "task-wit-f4b949c263ee62b73088d147",
      humanApproved: true,
      policyResult: "ALLOWED",
    },
    evidenceChain: { ok: true, events: 20, status: "CHAIN_VALID", latestHash: "hash-baseline" },
    pendingApprovals: [],
  };

  // 1. Initialize Observer Baseline
  await observer.observeAndDetectChanges(baseSnapshot);

  // 2. Emit an Autonomous Production Request
  const emitRes = observer.evaluateAndEmitRequest("STATE_CHANGE_DETECTED");
  if (!emitRes.ok || !emitRes.requestId.startsWith("req-prod-")) {
    throw new Error("Autonomous request emission failed");
  }
  const canonicalRequestId = emitRes.requestId;
  console.log(`✔ 1. canonical request emitted   PASS (ID: ${canonicalRequestId})`);

  // 3. Relay Pending Pool Visibility
  const pendingInRelay = relay.getPendingApprovals();
  if (!pendingInRelay.some((p) => p.requestId === canonicalRequestId)) {
    throw new Error("Emitted request not found in Relay pending pool");
  }
  console.log("✔ 2. Relay pending pool sync    PASS");

  // 4. Windows Snapshot Visibility
  const winSnap = await relay.getSystemSnapshot({ timeoutMs: 100 });
  if (!winSnap.pendingApprovals.some((p) => p.requestId === canonicalRequestId)) {
    throw new Error("Pending request missing from Windows snapshot");
  }
  console.log("✔ 3. Windows surface visibility PASS");

  // 5. Phone / PWA Shared Reality Snapshot Visibility
  const phoneDigest = computeCanonicalRealityDigest(winSnap);
  if (phoneDigest.classifications.latest_human_approval !== "REVIEW_REQUIRED") {
    throw new Error("Phone reality must classify state as REVIEW_REQUIRED when pending approvals exist");
  }
  console.log("✔ 4. Phone/PWA parity sync      PASS (Classified as REVIEW_REQUIRED)");

  // 6. MCP approval.list_pending Tool
  const mcpListRes = await processJsonRpc({
    jsonrpc: "2.0",
    id: 301,
    method: "tools/call",
    params: { name: "approval.list_pending", arguments: {} },
  });
  if (mcpListRes.error || !mcpListRes.result?.content?.[0]?.text) {
    throw new Error("MCP approval.list_pending failed");
  }
  console.log("✔ 5. MCP approval.list_pending  PASS");

  // 7. Cross-Surface Resolution (APPROVE via MCP / Relay)
  const resolveRes = relay.resolveApprovalRequest(canonicalRequestId, "APPROVE", "operator-admin");
  if (!resolveRes.ok || resolveRes.request.status !== "ALLOWED") {
    throw new Error("Approval resolution failed");
  }
  console.log("✔ 6. cross-surface resolution   PASS (Decision: ALLOWED bound to canonical request)");

  // 8. Surfaces Post-Resolution Check (Pending count dropped)
  const postPending = relay.getPendingApprovals();
  if (postPending.some((p) => p.requestId === canonicalRequestId)) {
    throw new Error("Resolved request must not remain in pending pool");
  }
  console.log("✔ 7. post-resolution clean state PASS (0 pending)");

  // 9. DENY Flow Verification
  const denyEmit = observer.evaluateAndEmitRequest("SECURITY_AUDIT_TRIGGER");
  const denyRes = relay.resolveApprovalRequest(denyEmit.requestId, "DENY", "operator-admin");
  if (!denyRes.ok || denyRes.request.status !== "DENIED") {
    throw new Error("Deny resolution failed");
  }
  console.log("✔ 8. cross-surface DENY flow    PASS (Decision: DENIED bound and recorded)");

  // 10. Evidence Ledger Chain Status
  const verifyChain = testLedger.verifyChain();
  if (!verifyChain.ok || verifyChain.events < 4) {
    throw new Error(`Evidence chain validation failed: ${JSON.stringify(verifyChain)}`);
  }
  console.log(`✔ 9. evidence chain status      PASS (CHAIN_VALID, ${verifyChain.events} events)`);

  // 11. Zero Secret Exposure
  const ledgerString = JSON.stringify(testLedger.getHistory(20));
  if (ledgerString.includes("token") || ledgerString.includes("Bearer")) {
    throw new Error("Secret detected in evidence ledger");
  }
  console.log("✔ 10. secret exposure           ZERO");

  // Temizlik
  if (existsSync(TEST_LEDGER_PATH)) {
    unlinkSync(TEST_LEDGER_PATH);
  }

  console.log("=== PROOF GATE 17 TÜM TESTLERİ GEÇTİ (10/10) ===");
}

runTests().catch((err) => {
  console.error("Canonical Approval Bridge Test failure:", err);
  if (existsSync(TEST_LEDGER_PATH)) unlinkSync(TEST_LEDGER_PATH);
  process.exit(1);
});
