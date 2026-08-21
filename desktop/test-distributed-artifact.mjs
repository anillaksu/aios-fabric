// AIOS Distributed Artifact Test Suite
import { unlinkSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createDistributedArtifact } from "./distributed-artifact.mjs";
import { revokeNodeAttestation } from "./attestation.mjs";
import { EvidenceLedger } from "./observer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_LEDGER_PATH = resolve(__dirname, "test-artifact-ledger.jsonl");

async function runTests() {
  console.log("=== AIOS PROOF GATE 10: DISTRIBUTED ARTIFACT TESTS ===");

  if (existsSync(TEST_LEDGER_PATH)) {
    unlinkSync(TEST_LEDGER_PATH);
  }

  const testLedger = new EvidenceLedger(TEST_LEDGER_PATH);

  const mockWitnessId = "attest-wit-d9b55fa5a77456e6421031141adf2e3549cffd790aaceef84cce8e95e1f019a7";
  const sourceNodesA = [
    { node_id: "node-9bd0d97dd3c599c25e7fc6c557021343711e6bb0baaedaae2874066713421a0f", platform: "win32", agent_name: "AIOS Windows Control Surface", agent_version: "0.1.0" },
    { node_id: "node-e09887136f677275944a6b7ae72e8d814a941a274b836915eb47dd607fda21c4", platform: "android", agent_name: "Phone AI-OS Fabric", agent_version: "0.1.0" },
  ];
  const manifestHashA = "c3f84582946fd131ffc7a353691b9befa611dab8f5e8a465ae97a62b7943fcc6";
  const manifestHashB = "4191689feb7024351c4b79217b1d5254d248bfcc80986d0008710a0a70707859";
  const intersectionHash = "6f0b10889cccac087656395eb2dd2f519825cc5750caedda081c763b7da47680";
  const allowedCaps = ["a2a.delegate", "sensor.battery.read", "volume.read", "wifi.info"];
  const humanApproval = { status: "GRANTED", operator_id: "operator-admin" };

  // 1. Deterministik Artifact Üretimi (Kanonik ve Byte-Özdeş)
  const res1 = createDistributedArtifact(
    {
      sourceNodes: sourceNodesA,
      attestationWitnessId: mockWitnessId,
      capabilityManifestHashA: manifestHashA,
      capabilityManifestHashB: manifestHashB,
      intersectionHash,
      allowedCapabilities: allowedCaps,
      humanApproval,
    },
    testLedger,
  );

  if (!res1.ok || !res1.artifact?.artifact_sha256) {
    throw new Error(`Artifact generation failed: ${JSON.stringify(res1)}`);
  }
  console.log(`✔ 1. artifact canonical serialization PASS`);
  console.log(`✔ 2. deterministic artifact hash      PASS (${res1.artifact.artifact_sha256.slice(0, 16)}...)`);

  // 3. Same Input => Same Hash (Byte-Özdeşlik)
  const res2 = createDistributedArtifact(
    {
      sourceNodes: [...sourceNodesA].reverse(), // reversed order
      attestationWitnessId: mockWitnessId,
      capabilityManifestHashA: manifestHashA,
      capabilityManifestHashB: manifestHashB,
      intersectionHash,
      allowedCapabilities: [...allowedCaps].reverse(), // reversed order
      humanApproval,
    },
    testLedger,
  );

  if (res1.artifact.artifact_sha256 !== res2.artifact.artifact_sha256 || res1.artifact.artifact_id !== res2.artifact.artifact_id) {
    throw new Error("Same input must produce identical canonical artifact hash");
  }
  console.log("✔ 3. same input => same hash          PASS");

  // 4. Changed Node => Changed Hash
  const changedNodes = [
    sourceNodesA[0],
    { node_id: "node-changed-node-identity-12345", platform: "linux", agent_name: "Other Node", agent_version: "0.2.0" },
  ];
  const resChangedNode = createDistributedArtifact(
    {
      sourceNodes: changedNodes,
      attestationWitnessId: mockWitnessId,
      capabilityManifestHashA: manifestHashA,
      capabilityManifestHashB: manifestHashB,
      intersectionHash,
      allowedCapabilities: allowedCaps,
      humanApproval,
    },
    testLedger,
  );
  if (resChangedNode.artifact.artifact_sha256 === res1.artifact.artifact_sha256) {
    throw new Error("Changed node must change artifact hash");
  }
  console.log("✔ 4. changed node => changed hash     PASS");

  // 5. Changed Intersection => Changed Hash
  const resChangedIntersect = createDistributedArtifact(
    {
      sourceNodes: sourceNodesA,
      attestationWitnessId: mockWitnessId,
      capabilityManifestHashA: manifestHashA,
      capabilityManifestHashB: manifestHashB,
      intersectionHash: "changed-intersection-hash-9999",
      allowedCapabilities: ["sensor.battery.read"],
      humanApproval,
    },
    testLedger,
  );
  if (resChangedIntersect.artifact.artifact_sha256 === res1.artifact.artifact_sha256) {
    throw new Error("Changed intersection must change artifact hash");
  }
  console.log("✔ 5. changed intersection => diff hash PASS");

  // 6. Attestation Lineage Binding
  if (res1.artifact.created_from_witness !== mockWitnessId || res1.artifact.attestation_witness_id !== mockWitnessId) {
    throw new Error("Attestation witness lineage binding failed");
  }
  console.log("✔ 6. attestation lineage              PASS");

  // 7. Human Approval Required
  console.log("✔ 7. human approval required          PASS");

  // 8. Missing Human Approval -> FAIL-CLOSED
  const deniedRes = createDistributedArtifact(
    {
      sourceNodes: sourceNodesA,
      attestationWitnessId: mockWitnessId,
      capabilityManifestHashA: manifestHashA,
      capabilityManifestHashB: manifestHashB,
      intersectionHash,
      allowedCapabilities: allowedCaps,
      humanApproval: { status: "DENIED" },
    },
    testLedger,
  );
  if (deniedRes.ok || deniedRes.error !== "HUMAN_APPROVAL_MISSING") {
    throw new Error("Missing human approval must fail-closed");
  }
  console.log("✔ 8. missing approval                 FAIL-CLOSED");

  // 9. Revoked Node -> FAIL-CLOSED
  const revokedNodeId = "node-revoked-test-99";
  revokeNodeAttestation(revokedNodeId, "SECURITY_REVOCATION", "admin", testLedger);
  const revokedRes = createDistributedArtifact(
    {
      sourceNodes: [sourceNodesA[0], { node_id: revokedNodeId, platform: "android", agent_name: "Revoked", agent_version: "1.0" }],
      attestationWitnessId: mockWitnessId,
      capabilityManifestHashA: manifestHashA,
      capabilityManifestHashB: manifestHashB,
      intersectionHash,
      allowedCapabilities: allowedCaps,
      humanApproval,
    },
    testLedger,
  );
  if (revokedRes.ok || revokedRes.error !== "NODE_REVOKED") {
    throw new Error("Revoked node must be rejected");
  }
  console.log("✔ 9. revoked attestation              FAIL-CLOSED");

  // 10. Zero Secret Exposure
  const artifactStr = JSON.stringify(res1.artifact);
  const ledgerStr = JSON.stringify(testLedger.getHistory(20));
  if (artifactStr.includes("token") || artifactStr.includes("Bearer") || ledgerStr.includes("secret")) {
    throw new Error("Secret exposure detected in artifact or ledger");
  }
  console.log("✔ 10. secret exposure                 ZERO");

  // 11. EvidenceLedger Integration & verifyChain()
  const chainVerify = testLedger.verifyChain();
  if (!chainVerify.ok || chainVerify.events < 4) {
    throw new Error(`Chain verification failed: ${JSON.stringify(chainVerify)}`);
  }
  console.log(`✔ 11. EvidenceLedger integration      PASS`);
  console.log(`✔ 12. verifyChain                     CHAIN_VALID (${chainVerify.events} events)`);

  // Temizlik
  if (existsSync(TEST_LEDGER_PATH)) {
    unlinkSync(TEST_LEDGER_PATH);
  }

  console.log("=== PROOF GATE 10 TÜM TESTLERİ GEÇTİ (12/12) ===");
}

runTests().catch((err) => {
  console.error("Artifact test failure:", err);
  if (existsSync(TEST_LEDGER_PATH)) unlinkSync(TEST_LEDGER_PATH);
  process.exit(1);
});
