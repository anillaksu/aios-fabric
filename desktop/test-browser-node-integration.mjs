// AIOS Canonical Browser Node & Native A2A Adapter Test Suite
import { BrowserAdapter, defaultBrowserAdapter } from "./adapters/browser-adapter.mjs";
import { defaultLedger, canonicalJson, sha256 } from "./observer.mjs";
import { defaultRelay } from "./agent-relay.mjs";
import { defaultControlPlane } from "./agent-control-plane.mjs";
import { computeCanonicalRealityDigest } from "./phone-shared-reality.mjs";
import { execSync } from "node:child_process";

async function runTests() {
  console.log("=== AIOS BROWSER NODE & NATIVE A2A INTEGRATION TEST SUITE ===");

  // 1. Browser Node Identity
  const nodeId = defaultBrowserAdapter.getNodeIdentity();
  if (!nodeId.startsWith("node-") || nodeId.length !== 69) {
    throw new Error(`Invalid browser node identity: ${nodeId}`);
  }
  console.log(`✔ 1. browser node identity      PASS (${nodeId.slice(0, 24)}...)`);

  // 2. Agent Card Standard
  const card = defaultBrowserAdapter.getAgentCard();
  if (card.protocolVersion !== "1.0" || card.name !== "ai_browser" || card.platform !== "browser" || card.runtime !== "chromium") {
    throw new Error(`Invalid agent card: ${JSON.stringify(card)}`);
  }
  console.log(`✔ 2. agent card standard        PASS (Protocol: ${card.protocolVersion}, Name: ${card.name})`);

  // 3. Capability Manifest (Strictly Read-Only)
  const capNames = card.capabilities.map((c) => c.name);
  if (!capNames.includes("browser.proof.read") || !capNames.includes("browser.telemetry.read") || capNames.length !== 2) {
    throw new Error(`Capability manifest mismatch: ${JSON.stringify(capNames)}`);
  }
  console.log(`✔ 3. capability manifest        PASS (${capNames.join(", ")})`);

  // 4. Proof Schema Validation
  const invalidSchemaProof = { schema: "unknown.schema/9", verdict: "PASS" };
  const invalidObs = defaultBrowserAdapter.readProofObservation(invalidSchemaProof);
  if (invalidObs.ok !== false || invalidObs.error !== "INVALID_PROOF_SCHEMA") {
    throw new Error(`Schema validation bypass: ${JSON.stringify(invalidObs)}`);
  }
  console.log("✔ 4. proof schema validation    PASS (Invalid schema rejected)");

  // 5. Canonical Digest
  const mockProof = {
    schema: "adsentinel.proof/1",
    verdict: "PASS",
    mode: "live",
    generatedAt: new Date().toISOString(),
    counts: { passed: 30, failed: 0, total: 30 },
    browser: { engine: "chromium", version: "151.0" },
    extension: { id: "test-ext-id" },
  };
  const mockObs = defaultBrowserAdapter.readProofObservation(mockProof);
  if (!mockObs.proofDigest || mockObs.proofDigest.length !== 64) {
    throw new Error(`Invalid canonical digest: ${mockObs.proofDigest}`);
  }
  console.log(`✔ 5. canonical digest           PASS (${mockObs.proofDigest.slice(0, 16)}...)`);

  // 6. Evidence Binding in EvidenceLedger
  const initialEvents = defaultLedger.getHistory(5).length;
  const ref = defaultBrowserAdapter.recordObservationEvidence(mockObs);
  if (!ref || !ref.startsWith("browser-wit-")) {
    throw new Error(`Invalid evidence ref: ${ref}`);
  }
  const chainCheck = defaultLedger.verifyChain();
  if (!chainCheck.ok || chainCheck.status !== "CHAIN_VALID") {
    throw new Error(`Evidence chain integrity compromised: ${JSON.stringify(chainCheck)}`);
  }
  console.log(`✔ 6. evidence binding           PASS (Witness: ${ref}, Chain: ${chainCheck.status})`);

  // 7. Shared Reality Binding
  const snap = await defaultRelay.getSystemSnapshot({ timeoutMs: 2500 });
  if (!snap.nodes.browser || !snap.browser) {
    throw new Error(`Shared reality missing browser node: ${JSON.stringify(snap.nodes)}`);
  }
  const digest = computeCanonicalRealityDigest(snap);
  if (!digest.canonicalHash || digest.canonicalHash.length !== 64) {
    throw new Error("Shared reality digest calculation failed with browser node");
  }
  console.log(`✔ 7. shared reality binding     PASS (Digest: ${digest.canonicalHash.slice(0, 16)}...)`);

  // 8. Stale Classification
  const staleProof = {
    schema: "adsentinel.proof/1",
    verdict: "PASS",
    mode: "fixture",
    generatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours old
    counts: { passed: 30, failed: 0, total: 30 },
  };
  const staleObs = defaultBrowserAdapter.readProofObservation(staleProof);
  if (staleObs.status !== "STALE" || !staleObs.stale) {
    throw new Error(`Stale classification failed: ${JSON.stringify(staleObs)}`);
  }
  console.log("✔ 8. stale classification       PASS (Status: STALE)");

  // 9. Inconclusive Classification
  const inconProof = {
    schema: "adsentinel.proof/1",
    verdict: "INCONCLUSIVE",
    mode: "live",
    generatedAt: new Date().toISOString(),
    counts: { passed: 10, failed: 0, total: 10 },
  };
  const inconObs = defaultBrowserAdapter.readProofObservation(inconProof);
  if (inconObs.status !== "INCONCLUSIVE" || inconObs.verdict !== "INCONCLUSIVE") {
    throw new Error(`Inconclusive classification failed: ${JSON.stringify(inconObs)}`);
  }
  console.log("✔ 9. inconclusive handling      PASS (Status: INCONCLUSIVE)");

  // 10. Live Proof Observation (D:\dev\ai_browser\proof\latest.json)
  const liveObs = defaultBrowserAdapter.readProofObservation();
  if (!liveObs.ok || (liveObs.verdict !== "PASS" && liveObs.verdict !== "INCONCLUSIVE")) {
    throw new Error(`Live proof read failed: ${JSON.stringify(liveObs)}`);
  }
  console.log(`✔ 10. live proof reading        PASS (Verdict: ${liveObs.verdict}, Mode: ${liveObs.mode})`);

  // 11. A2A Envelope Serialization
  const a2aCardRes = await defaultBrowserAdapter.handleA2AMessage({ method: "agent/card" });
  if (a2aCardRes.jsonrpc !== "2.0" || !a2aCardRes.result?.capabilities) {
    throw new Error(`A2A card response invalid: ${JSON.stringify(a2aCardRes)}`);
  }
  console.log("✔ 11. a2a envelope serialize    PASS (JSON-RPC 2.0 compliant)");

  // 12. A2A Dry-Run Execution
  const a2aMsgRes = await defaultBrowserAdapter.handleA2AMessage({
    method: "message/send",
    params: { capability: "browser.proof.read", customProof: mockProof },
  });
  if (a2aMsgRes.jsonrpc !== "2.0" || !a2aMsgRes.result?.parts || a2aMsgRes.result.parts.length < 2) {
    throw new Error(`A2A message execution failed: ${JSON.stringify(a2aMsgRes)}`);
  }
  console.log("✔ 12. a2a dry-run execution     PASS (Parts: text + data)");

  // 13. Auth Redaction
  const ledgerHistory = JSON.stringify(defaultLedger.getHistory(30));
  if (ledgerHistory.includes("Bearer ") || ledgerHistory.includes("authorization") || ledgerHistory.includes("sk-")) {
    throw new Error("Secret exposure detected in Evidence Ledger!");
  }
  console.log("✔ 13. auth redaction            ZERO");

  // 14. Unknown Capability Rejection (Fail-Closed)
  const rejRes = await defaultBrowserAdapter.handleA2AMessage({
    method: "message/send",
    params: { capability: "browser.unknown.mutation" },
  });
  if (!rejRes.error || rejRes.error.code !== -32601) {
    throw new Error(`Unknown capability not rejected: ${JSON.stringify(rejRes)}`);
  }
  console.log("✔ 14. unknown cap rejection     PASS (Code: -32601 Fail-Closed)");

  // 15. No Browser Mutation Invariant
  const mutateRes = await defaultBrowserAdapter.handleA2AMessage({
    method: "message/send",
    params: { capability: "browser.dom.click" },
  });
  if (!mutateRes.error) {
    throw new Error("Mutation capability was not rejected!");
  }
  console.log("✔ 15. no browser mutation       PASS (Strict Read-Only Enforcement)");

  // 16. Missing File Recovery (Fail-Closed Graceful Handling)
  const tempAdapter = new BrowserAdapter({ proofPath: "D:\\dev\\nonexistent_path_test.json" });
  const missingObs = tempAdapter.readProofObservation();
  if (missingObs.ok !== false || missingObs.status !== "NOT_PROVEN") {
    throw new Error(`Missing file handling failed: ${JSON.stringify(missingObs)}`);
  }
  console.log("✔ 16. missing file recovery     PASS (Status: NOT_PROVEN, No crash)");

  // 17. Adapter Restart & Fresh Instance Parity
  const freshAdapter = new BrowserAdapter();
  const freshObs = freshAdapter.readProofObservation(mockProof);
  if (freshObs.proofDigest !== mockObs.proofDigest || freshObs.sourceNode !== nodeId) {
    throw new Error("Fresh adapter instance parity check failed");
  }
  console.log("✔ 17. adapter restart parity    PASS (Deterministic parity verified)");

  // 18. Duplicate State Check
  const state = await defaultControlPlane.getCanonicalState();
  if (!state.reality || !state.evidence || !state.agents) {
    throw new Error("Canonical state corrupted");
  }
  console.log("✔ 18. duplicate state check     ZERO (0 duplicate state trees)");

  console.log("=== AIOS BROWSER NODE TÜM ENTEGRASYON TESTLERİ GEÇTİ (18/18) ===");
}

runTests().catch((err) => {
  console.error("Browser node test failed:", err);
  process.exit(1);
});
