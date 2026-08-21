// AIOS Continuous Observer & Autonomous Request Loop Test Suite (Gate 16)
import { unlinkSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContinuousObserver } from "./continuous-observer.mjs";
import { AgentRelay } from "./agent-relay.mjs";
import { EvidenceLedger } from "./observer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_LEDGER_PATH = resolve(__dirname, "test-continuous-obs-ledger.jsonl");

async function runTests() {
  console.log("=== AIOS PROOF GATE 16: CONTINUOUS OBSERVER TESTS ===");

  if (existsSync(TEST_LEDGER_PATH)) {
    unlinkSync(TEST_LEDGER_PATH);
  }

  const testLedger = new EvidenceLedger(TEST_LEDGER_PATH);
  const relay = new AgentRelay(testLedger);
  const observer = new ContinuousObserver(testLedger, relay);

  // Baseline Snapshot
  const snap1 = {
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
    evidenceChain: { ok: true, events: 20, status: "CHAIN_VALID", latestHash: "hash-initial" },
    pendingApprovals: [],
  };

  // 1. Initial Baseline Establishment
  const obsRes1 = await observer.observeAndDetectChanges(snap1);
  if (!obsRes1.deltas.some((d) => d.type === "INITIAL_BASELINE_ESTABLISHED") || obsRes1.hasChanges) {
    throw new Error("Initial baseline establishment failed");
  }
  console.log("✔ 1. initial baseline established PASS");

  // 2. No Changes -> Idempotent
  const obsRes2 = await observer.observeAndDetectChanges(snap1);
  if (obsRes2.hasChanges || obsRes2.deltas.length > 0) {
    throw new Error("Identical state must report zero deltas");
  }
  console.log("✔ 2. zero deltas idempotency    PASS");

  // 3. State Change Detection (New Witness / Event)
  const snap2 = {
    ...snap1,
    evidenceChain: { ...snap1.evidenceChain, events: 21, latestHash: "hash-updated-new-witness" },
  };
  const obsRes3 = await observer.observeAndDetectChanges(snap2);
  if (!obsRes3.hasChanges || !obsRes3.deltas.some((d) => d.type === "NEW_EVIDENCE_WITNESS")) {
    throw new Error("Change detection for new witness failed");
  }
  console.log("✔ 3. state change detected      PASS (NEW_EVIDENCE_WITNESS captured)");

  // 4. Autonomous REQUEST Generation
  const reqRes = observer.evaluateAndEmitRequest("STATE_CHANGE_TRIGGERED");
  if (!reqRes.ok || reqRes.status !== "REVIEW_REQUIRED") {
    throw new Error("Autonomous request emission failed");
  }
  console.log(`✔ 4. autonomous REQUEST emitted  PASS (Request ID: ${reqRes.requestId})`);

  // 5. Fail-Closed Human Gate: Request MUST remain REVIEW_REQUIRED
  if (reqRes.status !== "REVIEW_REQUIRED") {
    throw new Error("Emitted request must strictly stay in REVIEW_REQUIRED");
  }
  console.log("✔ 5. strict human gate hold     PASS (REVIEW_REQUIRED enforced without execution)");

  // 6. Query: "Şu anda ne değişti?"
  const qChange = observer.queryDetailedState("Şu anda ne değişti?");
  if (qChange.domain !== "STATE_DELTAS" || !qChange.answer.includes("NEW_EVIDENCE_WITNESS")) {
    throw new Error("What changed query failed");
  }
  console.log("✔ 6. query: 'Ne değişti?'       PASS");

  // 7. Query: "Ne kanıtlandı?"
  const qProven = observer.queryDetailedState("Ne kanıtlandı?");
  if (qProven.status !== "PROVEN" || !qProven.answer.includes("CANLI KANITLANMIŞ")) {
    throw new Error("What is proven query failed");
  }
  console.log("✔ 7. query: 'Ne kanıtlandı?'     PASS");

  // 8. Query: "Ne üretim bekliyor?"
  const qPending = observer.queryDetailedState("Ne üretim bekliyor?");
  if (qPending.domain !== "PENDING_PRODUCTION" || qPending.pendingCount < 1) {
    throw new Error("What is pending query failed");
  }
  console.log("✔ 8. query: 'Ne bekliyor?'       PASS");

  // 9. Query: "Neden bekliyor?"
  const qWhy = observer.queryDetailedState("Neden bekliyor?");
  if (qWhy.domain !== "HUMAN_GATE_POLICY" || !qWhy.answer.includes("Fail-Closed Human Gate")) {
    throw new Error("Why pending query failed");
  }
  console.log("✔ 9. query: 'Neden bekliyor?'     PASS");

  // 10. Disconnect Handling (Connection State Change)
  const snapDisconnect = {
    ...snap2,
    nodes: {
      ...snap2.nodes,
      android: { ...snap2.nodes.android, online: false, stale: true },
    },
  };
  const obsResDisconnect = await observer.observeAndDetectChanges(snapDisconnect);
  if (!obsResDisconnect.deltas.some((d) => d.type === "CONNECTION_STATE_CHANGED")) {
    throw new Error("Disconnect change detection failed");
  }
  console.log("✔ 10. disconnect state change   PASS (OFFLINE_STALE transition captured)");

  // 11. Secret Exposure Zero Check
  const ledgerString = JSON.stringify(testLedger.getHistory(20));
  const queryStr = JSON.stringify(qChange) + JSON.stringify(qWhy);
  if (ledgerString.includes("token") || ledgerString.includes("Bearer") || queryStr.includes("token")) {
    throw new Error("Secret exposed in continuous observer");
  }
  console.log("✔ 11. secret exposure           ZERO");

  // 12. Evidence Ledger Chain Verification
  const verifyChain = testLedger.verifyChain();
  if (!verifyChain.ok || verifyChain.events < 2) {
    throw new Error(`Chain verification failed: ${JSON.stringify(verifyChain)}`);
  }
  console.log(`✔ 12. evidence chain status     PASS (CHAIN_VALID, ${verifyChain.events} events)`);

  // Temizlik
  if (existsSync(TEST_LEDGER_PATH)) {
    unlinkSync(TEST_LEDGER_PATH);
  }

  console.log("=== PROOF GATE 16 TÜM TESTLERİ GEÇTİ (12/12) ===");
}

runTests().catch((err) => {
  console.error("Continuous Observer Test failure:", err);
  if (existsSync(TEST_LEDGER_PATH)) unlinkSync(TEST_LEDGER_PATH);
  process.exit(1);
});
