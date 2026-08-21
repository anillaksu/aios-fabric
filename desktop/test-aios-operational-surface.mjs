// AIOS Final Operational Surface & ASK AIOS Test Suite
import { defaultControlPlane } from "./agent-control-plane.mjs";
import { defaultRelay } from "./agent-relay.mjs";
import { defaultLedger } from "./observer.mjs";
import { defaultOrchestrator } from "./runtime-console.mjs";
import { computeCanonicalRealityDigest } from "./phone-shared-reality.mjs";
import { execSync } from "node:child_process";

async function runTests() {
  console.log("=== AIOS FINAL OPERATIONAL SURFACE TEST SUITE ===");

  // 1. ASK AIOS: Prompt to Canonical Request
  const prompt = "Telefonun pil durumunu kontrol et.";
  const askRes = await defaultControlPlane.askAios(prompt, { requestedBy: "operator-test" });

  if (!askRes.ok || !askRes.requestId.startsWith("req-cp-")) {
    throw new Error(`askAios failed to create canonical request: ${JSON.stringify(askRes)}`);
  }
  if (askRes.operation !== "sensor.battery.read") {
    throw new Error(`Capability classification mismatch: ${askRes.operation}`);
  }
  console.log(`✔ 1. ask aios canonical req     PASS (Request ID: ${askRes.requestId})`);

  // 2. Multi-Agent Proposals Convergence
  if (!Array.isArray(askRes.proposals) || askRes.proposals.length < 4) {
    throw new Error(`Expected at least 4 agent proposals, got ${askRes.proposals?.length}`);
  }
  const agentNames = askRes.proposals.map((p) => p.agentName);
  console.log(`✔ 2. multi-agent proposals      PASS (${askRes.proposals.length} agents: ${agentNames.join(", ")})`);

  // 3. Human Gate Review Required Invariant
  if (askRes.status !== "REVIEW_REQUIRED" || !askRes.humanGateRequired) {
    throw new Error("Human Gate protection failed: Request must require review");
  }
  console.log("✔ 3. human gate review hold     PASS (Fail-Closed REVIEW_REQUIRED)");

  // 4. Human Denial Path (Fail-Closed)
  const denyRes = await defaultControlPlane.resolveRequest(askRes.requestId, "DENY", "operator-admin");
  if (denyRes.status !== "DENIED") {
    throw new Error(`Denial failed: ${JSON.stringify(denyRes)}`);
  }
  console.log("✔ 4. human gate denial flow     PASS (Status: DENIED)");

  // 5. Fresh ASK AIOS & Approve & Execute Flow
  const freshAsk = await defaultControlPlane.askAios("Telefon bataryasını oku.", { requestedBy: "operator-user" });
  const execRes = await defaultControlPlane.approveAndExecute(freshAsk.requestId, "operator-admin");

  if (!execRes.ok || execRes.status !== "COMPLETED" || execRes.decision !== "ALLOWED") {
    throw new Error(`Approve and execute failed: ${JSON.stringify(execRes)}`);
  }
  console.log(`✔ 5. approve & execute flow     PASS (Task Status: ${execRes.status})`);

  // 6. Task Witness Generation
  if (!execRes.taskWitnessId || !execRes.taskWitnessId.startsWith("task-wit-")) {
    throw new Error(`Task witness ID generation failed: ${execRes.taskWitnessId}`);
  }
  console.log(`✔ 6. task witness generation    PASS (${execRes.taskWitnessId})`);

  // 7. Evidence Ledger Lineage Binding
  const chainVerify = defaultLedger.verifyChain();
  if (!chainVerify.ok || chainVerify.status !== "CHAIN_VALID") {
    throw new Error(`Evidence chain invalid: ${JSON.stringify(chainVerify)}`);
  }
  if (!execRes.evidenceHash || execRes.evidenceHash.length !== 64) {
    throw new Error("Evidence hash generation failed");
  }
  console.log(`✔ 7. evidence lineage binding   PASS (Chain: ${chainVerify.status}, ${chainVerify.events} events)`);

  // 8. Shared Reality & Artifact Update
  const snap = await defaultRelay.getSystemSnapshot({ timeoutMs: 2500 });
  const digest = computeCanonicalRealityDigest(snap);
  if (!digest.canonicalHash || digest.canonicalHash.length !== 64) {
    throw new Error("Shared reality digest compute failed");
  }
  console.log(`✔ 8. shared reality update      PASS (Digest: ${digest.canonicalHash.slice(0, 16)}...)`);

  // 9. CLI ask --auto-approve End-to-End Command Test
  const cliJsonOutput = execSync('node desktop/cli.mjs ask "Telefonun pil durumunu kontrol et." --auto-approve --json', { encoding: "utf8" });
  const parsedCli = JSON.parse(cliJsonOutput);
  if (!parsedCli.ok || parsedCli.status !== "COMPLETED" || !parsedCli.taskWitnessId) {
    throw new Error(`CLI ask execution failed: ${cliJsonOutput}`);
  }
  console.log(`✔ 9. cli ask end-to-end         PASS (Witness: ${parsedCli.taskWitnessId.slice(0, 18)}...)`);

  // 10. Secret Exposure Scan
  const ledgerHistory = JSON.stringify(defaultLedger.getHistory(30));
  if (ledgerHistory.includes("Bearer ") || ledgerHistory.includes(".a2a-token")) {
    throw new Error("Secret leaked across operational surfaces!");
  }
  console.log("✔ 10. secret exposure scan      ZERO");

  console.log("=== AIOS OPERATIONAL SURFACE TÜM TESTLERİ GEÇTİ (10/10) ===");
}

runTests().catch((err) => {
  console.error("Operational surface test failed:", err);
  process.exit(1);
});
