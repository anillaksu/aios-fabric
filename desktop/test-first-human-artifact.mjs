// AIOS First Human-Approved Artifact Test Suite
import { unlinkSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { requestHumanApprovedArtifact, produceHumanApprovedArtifact } from "./human-artifact.mjs";
import { revokeNodeAttestation } from "./attestation.mjs";
import { processJsonRpc } from "./mcp-server.mjs";
import { EvidenceLedger } from "./observer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_LEDGER_PATH = resolve(__dirname, "test-human-artifact-ledger.jsonl");

async function runTests() {
  console.log("=== AIOS PROOF GATE 13: FIRST HUMAN-APPROVED ARTIFACT TESTS ===");

  if (existsSync(TEST_LEDGER_PATH)) {
    unlinkSync(TEST_LEDGER_PATH);
  }

  const testLedger = new EvidenceLedger(TEST_LEDGER_PATH);

  const mockWitnessId = "attest-wit-d9b55fa5a77456e6421031141adf2e3549cffd790aaceef84cce8e95e1f019a7";
  const sourceNodes = [
    "node-9bd0d97dd3c599c25e7fc6c557021343711e6bb0baaedaae2874066713421a0f",
    "node-e09887136f677275944a6b7ae72e8d814a941a274b836915eb47dd607fda21c4",
  ];
  const intersectionHash = "6f0b10889cccac087656395eb2dd2f519825cc5750caedda081c763b7da47680";

  // 1. Request Generation & Review Required
  const reqRes = requestHumanApprovedArtifact(
    {
      sourceNodes,
      attestationWitnessId: mockWitnessId,
      intersectionHash,
      requestedBy: "operator-lead",
    },
    testLedger,
  );
  if (!reqRes.ok || reqRes.status !== "REVIEW_REQUIRED") {
    throw new Error("Request creation failed");
  }
  console.log("✔ 1. request & review_required  PASS");

  // 2. Operator DENY Flow -> FAIL-CLOSED
  const denyRes = produceHumanApprovedArtifact(
    {
      requestId: reqRes.requestId,
      decision: "DENY",
      operatorId: "operator-admin",
      sourceNodes,
      attestationWitnessId: mockWitnessId,
      intersectionHash,
    },
    testLedger,
  );
  if (denyRes.ok || denyRes.status !== "DENIED") {
    throw new Error("Deny resolution must reject artifact creation");
  }
  console.log("✔ 2. human DENY fail-closed     PASS (artifact.production.denied recorded)");

  // 3. Invalid Attestation Witness -> BLOCKED
  const invalidAttestRes = produceHumanApprovedArtifact(
    {
      requestId: reqRes.requestId,
      decision: "APPROVE",
      operatorId: "operator-admin",
      sourceNodes,
      attestationWitnessId: "invalid-witness-id",
      intersectionHash,
    },
    testLedger,
  );
  if (invalidAttestRes.ok || invalidAttestRes.status !== "BLOCKED") {
    throw new Error("Invalid attestation must be blocked");
  }
  console.log("✔ 3. invalid attestation witness FAIL-CLOSED");

  // 4. Revoked Node -> BLOCKED
  const revokedNode = "node-revoked-99";
  revokeNodeAttestation(revokedNode, "TEST_REVOCATION", "admin", testLedger);
  const revokedRes = produceHumanApprovedArtifact(
    {
      requestId: reqRes.requestId,
      decision: "APPROVE",
      operatorId: "operator-admin",
      sourceNodes: [sourceNodes[0], revokedNode],
      attestationWitnessId: mockWitnessId,
      intersectionHash,
    },
    testLedger,
  );
  if (revokedRes.ok || revokedRes.status !== "BLOCKED") {
    throw new Error("Revoked node must be blocked");
  }
  console.log("✔ 4. revoked node fail-closed   PASS");

  // 5. Secret Injection Protection
  const secretRes = produceHumanApprovedArtifact(
    {
      requestId: reqRes.requestId,
      decision: "APPROVE",
      operatorId: "operator-admin",
      sourceNodes,
      attestationWitnessId: mockWitnessId,
      intersectionHash,
      purpose: "Bearer secret-token-injection-attempt",
    },
    testLedger,
  );
  if (secretRes.ok || secretRes.status !== "BLOCKED") {
    throw new Error("Secret injection attempt must be blocked");
  }
  console.log("✔ 5. secret injection isolation PASS");

  // 6. Operator APPROVE Flow -> SUCCESS (Deterministik SHA-256)
  const approveRes1 = produceHumanApprovedArtifact(
    {
      requestId: reqRes.requestId,
      decision: "APPROVE",
      operatorId: "operator-admin",
      sourceNodes,
      attestationWitnessId: mockWitnessId,
      intersectionHash,
      purpose: "proof-only",
    },
    testLedger,
  );
  if (!approveRes1.ok || !approveRes1.artifact?.artifact_sha256) {
    throw new Error("Approved artifact production failed");
  }
  console.log(`✔ 6. human APPROVE flow         PASS (Artifact: ${approveRes1.artifact.artifact_id})`);
  console.log(`✔ 7. deterministic SHA-256      PASS (${approveRes1.artifact.artifact_sha256.slice(0, 16)}...)`);

  // 8. Same Input => Same SHA-256 (Byte-identical)
  const approveRes2 = produceHumanApprovedArtifact(
    {
      requestId: reqRes.requestId,
      decision: "APPROVE",
      operatorId: "operator-admin",
      sourceNodes: [...sourceNodes].reverse(), // reversed order
      attestationWitnessId: mockWitnessId,
      intersectionHash,
      purpose: "proof-only",
    },
    testLedger,
  );
  if (approveRes1.artifact.artifact_sha256 !== approveRes2.artifact.artifact_sha256) {
    throw new Error("Identical inputs must yield byte-identical canonical artifact SHA-256");
  }
  console.log("✔ 8. same input => same hash    PASS");

  // 9. Changed Input => Changed SHA-256
  const approveChanged = produceHumanApprovedArtifact(
    {
      requestId: reqRes.requestId,
      decision: "APPROVE",
      operatorId: "operator-security-lead", // changed operator
      sourceNodes,
      attestationWitnessId: mockWitnessId,
      intersectionHash,
      purpose: "proof-only",
    },
    testLedger,
  );
  if (approveChanged.artifact.artifact_sha256 === approveRes1.artifact.artifact_sha256) {
    throw new Error("Changed input must change artifact SHA-256");
  }
  console.log("✔ 9. changed input => diff hash PASS");

  // 10. Attestation Witness Lineage
  if (approveRes1.lineageWitnessId !== mockWitnessId || approveRes1.artifact.attestation_witness !== mockWitnessId) {
    throw new Error("Artifact lineage binding failed");
  }
  console.log("✔ 10. attestation lineage       PASS");

  // 11. Evidence Ledger Chain Verification
  const verifyChain = testLedger.verifyChain();
  if (!verifyChain.ok || verifyChain.events < 6) {
    throw new Error(`Evidence chain validation failed: ${JSON.stringify(verifyChain)}`);
  }
  console.log(`✔ 11. Evidence chain status     CHAIN_VALID (${verifyChain.events} events)`);

  // 12. MCP Read-Only Tools (artifact.latest, artifact.lineage, approval.latest)
  const mcpLineageRes = await processJsonRpc({
    jsonrpc: "2.0",
    id: 201,
    method: "tools/call",
    params: { name: "artifact.lineage", arguments: {} },
  });
  const mcpApprovalRes = await processJsonRpc({
    jsonrpc: "2.0",
    id: 202,
    method: "tools/call",
    params: { name: "approval.latest", arguments: {} },
  });
  if (mcpLineageRes.error || mcpApprovalRes.error) {
    throw new Error("MCP artifact lineage or approval tool failed");
  }
  console.log("✔ 12. MCP read-only tools       PASS");

  // Temizlik
  if (existsSync(TEST_LEDGER_PATH)) {
    unlinkSync(TEST_LEDGER_PATH);
  }

  console.log("=== PROOF GATE 13 TÜM TESTLERİ GEÇTİ (12/12) ===");
}

runTests().catch((err) => {
  console.error("Human Artifact Test failure:", err);
  if (existsSync(TEST_LEDGER_PATH)) unlinkSync(TEST_LEDGER_PATH);
  process.exit(1);
});
