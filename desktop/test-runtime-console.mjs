// AIOS Proof Gate 24.1: Canonical Runtime Console & Orchestrator Test Suite
import { unlinkSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RuntimeOrchestrator,
  computePlanHash,
  generateRunId,
  redactSecrets,
  ALLOWED_STATES,
} from "./runtime-console.mjs";
import { EvidenceLedger } from "./observer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_STATE_PATH = resolve(__dirname, ".test-runtime-state.json");
const TEST_LEDGER_PATH = resolve(__dirname, "test-runtime-ledger.jsonl");

async function runTests() {
  console.log("=== AIOS PROOF GATE 24.1: CANONICAL RUNTIME CONSOLE TESTS ===");

  if (existsSync(TEST_STATE_PATH)) unlinkSync(TEST_STATE_PATH);
  if (existsSync(TEST_LEDGER_PATH)) unlinkSync(TEST_LEDGER_PATH);

  const testLedger = new EvidenceLedger(TEST_LEDGER_PATH);
  const orchestrator = new RuntimeOrchestrator(testLedger, TEST_STATE_PATH);

  // 1. Run Creation
  const runId = generateRunId("24");
  if (!runId.startsWith("gate24-") || runId.length < 20) {
    throw new Error("Invalid runId format generated");
  }
  console.log(`✔ 1. run creation                PASS (Run ID: ${runId})`);

  // 2. Plan Hash Determinism
  const planA = ["step1.js", "step2.js"];
  const planB = ["step1.js", "step2.js"];
  const hashA = computePlanHash(planA);
  const hashB = computePlanHash(planB);
  if (hashA !== hashB || hashA.length !== 64) {
    throw new Error("Plan hash calculation is not deterministic");
  }
  console.log(`✔ 2. plan hash determinism       PASS (SHA-256: ${hashA.slice(0, 16)}...)`);

  // 3. Step Start & Plan Execution
  const miniPlan = ["desktop/test-gate24-discovery.mjs"];
  let progressCount = 0;
  const runRes = await orchestrator.run({
    gate: "24",
    plan: miniPlan,
    onProgress: (p) => {
      progressCount++;
    },
  });
  if (runRes.state !== "PASSED" || runRes.step_total !== 1 || progressCount < 1) {
    throw new Error("Mini plan execution failed");
  }
  console.log("✔ 3. step start & progress       PASS (State: PASSED)");

  // 4. Heartbeat Emission
  if (!runRes.last_heartbeat || isNaN(Date.parse(runRes.last_heartbeat))) {
    throw new Error("Heartbeat was not recorded");
  }
  console.log(`✔ 4. heartbeat emission          PASS (Last: ${runRes.last_heartbeat})`);

  // 5. Step Pass Handling
  const step0 = runRes.steps[0];
  if (!step0 || step0.status !== "PASSED" || step0.exit_code !== 0 || !step0.stdout_digest) {
    throw new Error("Step pass tracking corrupted");
  }
  console.log(`✔ 5. step pass tracking          PASS (Digest: ${step0.stdout_digest.slice(0, 12)}...)`);

  // 6. Step Fail Handling
  const failingPlan = ["desktop/scratch/non_existent_step_failure.js"];
  const failRunRes = await orchestrator.run({
    gate: "24",
    plan: failingPlan,
  });
  if (failRunRes.state !== "FAILED" || failRunRes.steps[0].status !== "FAILED") {
    throw new Error("Failing step was not handled properly");
  }
  console.log("✔ 6. step fail handling          PASS (State: FAILED correctly trapped)");

  // 7. Stale Detection (>10s)
  const staleMock = {
    run_id: "gate24-stale-test",
    state: "RUNNING",
    last_heartbeat: new Date(Date.now() - 15000).toISOString(),
    started_at: new Date(Date.now() - 20000).toISOString(),
  };
  writeFileSync(TEST_STATE_PATH, JSON.stringify(staleMock), "utf-8");
  const staleStatus = orchestrator.getStatus();
  if (staleStatus.state !== "STALE" || staleStatus.liveness !== "NO_HEARTBEAT") {
    throw new Error("Stale detection failed for >10s heartbeat gap");
  }
  console.log("✔ 7. stale detection (>10s)      PASS (State: STALE, NO_HEARTBEAT)");

  // 8. Process Gone Detection
  const deadPidMock = {
    run_id: "gate24-dead-pid-test",
    state: "RUNNING",
    pid: 9999999, // Highly improbable PID
    last_heartbeat: new Date().toISOString(),
    started_at: new Date().toISOString(),
  };
  writeFileSync(TEST_STATE_PATH, JSON.stringify(deadPidMock), "utf-8");
  const deadPidStatus = orchestrator.getStatus();
  if (deadPidStatus.state !== "STALE" || deadPidStatus.liveness !== "PROCESS_GONE") {
    throw new Error("Process gone detection failed");
  }
  console.log("✔ 8. process gone detection      PASS (State: STALE, PROCESS_GONE)");

  // 9. Cancellation (Stop)
  const cancelRes = orchestrator.stop();
  if (!cancelRes.ok || cancelRes.status !== "CANCELLED") {
    throw new Error("Stop / cancellation failed");
  }
  console.log("✔ 9. cancellation (stop)         PASS (Fail-closed CANCELLED)");

  // 10. Retry Step Capability
  const retryRes = await orchestrator.run({
    gate: "24",
    plan: miniPlan,
  });
  if (retryRes.state !== "PASSED") {
    throw new Error("Retry step run failed");
  }
  console.log("✔ 10. retry step capability      PASS (State: PASSED)");

  // 11. Recovery from Disk
  const reloaded = orchestrator.loadState();
  if (!reloaded || reloaded.run_id !== retryRes.run_id) {
    throw new Error("Disk state recovery failed");
  }
  console.log("✔ 11. state recovery from disk   PASS");

  // 12. Observational ETA Calculation
  const etaCalc = orchestrator.calculateObservationalEta(2, 5, [1000, 2000]);
  if (etaCalc.type !== "OBSERVATIONAL" || !etaCalc.formatted.startsWith("~")) {
    throw new Error("ETA calculation failure");
  }
  console.log(`✔ 12. observational ETA          PASS (Estimate: ${etaCalc.formatted})`);

  // 13. Evidence Ledger Binding
  const v = testLedger.verifyChain();
  if (!v.ok || v.events < 2) {
    throw new Error("Evidence ledger chain broken");
  }
  console.log(`✔ 13. evidence ledger binding    PASS (CHAIN_VALID, ${v.events} events)`);

  // 14. Canonical Status Formatting
  const finalStatus = orchestrator.getStatus();
  if (!finalStatus.ok || !ALLOWED_STATES.includes(finalStatus.state)) {
    throw new Error("Invalid canonical state format");
  }
  console.log(`✔ 14. canonical status           PASS (State: ${finalStatus.state})`);

  // 15. Zero Secret Exposure
  const rawLeak = "Bearer my_super_secret_token_123456";
  const redacted = redactSecrets(rawLeak);
  if (redacted.includes("my_super_secret_token")) {
    throw new Error("Secret redaction failure");
  }
  console.log("✔ 15. secret redaction scan      ZERO (Secrets masked with '••••••••')");

  // 16. JSON CLI Output Format
  const doc = orchestrator.doctor();
  if (!doc.ok || !doc.supported_gates.includes("24")) {
    throw new Error("Doctor check failed");
  }
  console.log("✔ 16. JSON CLI & doctor check    PASS (Supported gates: 24)");

  // 17. GUI Snapshot / State Structure
  if (
    typeof finalStatus.step_index !== "number" ||
    typeof finalStatus.step_total !== "number" ||
    !finalStatus.run_id
  ) {
    throw new Error("GUI snapshot fields missing");
  }
  console.log("✔ 17. GUI snapshot payload       PASS");

  // Temizlik
  if (existsSync(TEST_STATE_PATH)) unlinkSync(TEST_STATE_PATH);
  if (existsSync(TEST_LEDGER_PATH)) unlinkSync(TEST_LEDGER_PATH);

  console.log("=== PROOF GATE 24.1 TÜM TESTLERİ GEÇTİ (17/17) ===");
}

runTests().catch((err) => {
  console.error("Gate 24.1 Test failure:", err);
  process.exit(1);
});
