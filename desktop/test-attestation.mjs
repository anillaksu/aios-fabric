// AIOS Node Attestation & Handshake Verification Suite
import { unlinkSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  calculateNodeIdentity,
  createChallengeNonce,
  verifyAndConsumeNonce,
  computePossessionProof,
  verifyPossessionProof,
  computeCapabilityManifestHash,
  computeCapabilityIntersection,
  executeAttestationHandshake,
  revokeNodeAttestation,
  isNodeRevoked,
  createArtifactLineage,
} from "./attestation.mjs";
import { EvidenceLedger } from "./observer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_LEDGER_PATH = resolve(__dirname, "test-attestation-ledger.jsonl");

async function runTests() {
  console.log("=== AIOS PROOF GATE 08: ATTESTATION TEST SUITE ===");

  if (existsSync(TEST_LEDGER_PATH)) {
    unlinkSync(TEST_LEDGER_PATH);
  }

  const testLedger = new EvidenceLedger(TEST_LEDGER_PATH);
  const secretKey = "super-secure-token-998877";

  // 1. Canonical Node Identity (deterministik, sıralı, byte-özdeş)
  const nodeA_meta1 = { platform: "win32", arch: "x64", agentName: "PC Agent", agentVersion: "0.1.0", endpoint: "http://100.109.236.30:9310" };
  const nodeA_meta2 = { agentVersion: "0.1.0", platform: "win32", endpoint: "http://100.109.236.30:9310", agentName: "PC Agent", arch: "x64" };
  const id1 = calculateNodeIdentity(nodeA_meta1);
  const id2 = calculateNodeIdentity(nodeA_meta2);
  if (id1 !== id2 || !id1.startsWith("node-")) {
    throw new Error("Canonical node identity must be deterministic");
  }
  console.log(`✔ 1. canonical identity        PASS (${id1.slice(0, 20)}...)`);

  // 2. Challenge Nonce Generation & Replay Protection
  const challenge = createChallengeNonce(id1, 2000);
  if (!challenge.nonce.startsWith("chn-") || challenge.used !== false) {
    throw new Error("Challenge nonce creation failed");
  }
  console.log("✔ 2. challenge generation      PASS");

  // 3. HMAC Possession Proof
  const validProof = computePossessionProof(secretKey, challenge.nonce, id1);
  const verifyOk = verifyPossessionProof(validProof, secretKey, challenge.nonce, id1);
  if (!verifyOk) {
    throw new Error("HMAC possession proof must verify with correct key");
  }
  console.log("✔ 3. HMAC possession proof     PASS");

  // 4. Wrong Secret -> FAIL-CLOSED
  const wrongProofVerify = verifyPossessionProof(validProof, "wrong-secret-token", challenge.nonce, id1);
  if (wrongProofVerify !== false) {
    throw new Error("Wrong secret must fail validation");
  }
  console.log("✔ 4. wrong secret              FAIL-CLOSED");

  // 5. Expired Nonce -> FAIL-CLOSED
  const expiredChallenge = createChallengeNonce(id1, -100); // already expired
  const expiredCheck = verifyAndConsumeNonce(expiredChallenge.nonce, id1);
  if (expiredCheck.ok || expiredCheck.error !== "NONCE_EXPIRED") {
    throw new Error("Expired nonce must be rejected");
  }
  console.log("✔ 5. expired nonce             FAIL-CLOSED");

  // 6. Reused Nonce -> FAIL-CLOSED
  const singleUseNonce = createChallengeNonce(id1, 5000);
  const firstUse = verifyAndConsumeNonce(singleUseNonce.nonce, id1);
  const secondUse = verifyAndConsumeNonce(singleUseNonce.nonce, id1);
  if (!firstUse.ok || secondUse.ok || secondUse.error !== "NONCE_ALREADY_USED") {
    throw new Error("Reused nonce must fail closed");
  }
  console.log("✔ 6. reused nonce              FAIL-CLOSED");

  // 7. Capability Manifest Hash
  const capsA = [
    { name: "sensor.battery.read", class: "REFLEX", risk: "safe" },
    { name: "a2a.delegate", class: "AGENT", risk: "ask" },
    { name: "wifi.info", class: "REFLEX", risk: "safe" },
  ];
  const capHash1 = computeCapabilityManifestHash(capsA);
  const capHash2 = computeCapabilityManifestHash([...capsA].reverse());
  if (capHash1 !== capHash2) {
    throw new Error("Capability manifest hash must be order-independent/canonical");
  }
  console.log("✔ 7. capability hash           PASS");

  // 8. Intersection Hash (A ∩ B)
  const capsB = [
    { name: "wifi.info", class: "REFLEX", risk: "safe" },
    { name: "sensor.battery.read", class: "REFLEX", risk: "safe" },
    { name: "shizuku.status", class: "REFLEX", risk: "safe" },
  ];
  const intersect = computeCapabilityIntersection(capsA, capsB);
  if (intersect.commonCapabilities.length !== 2 || !intersect.commonCapabilities.includes("wifi.info")) {
    throw new Error("Capability intersection computation failed");
  }
  console.log("✔ 8. intersection hash         PASS");

  // 9. Full Handshake with Human Approval -> PASS
  const handshakeChallenge = createChallengeNonce("node-android-test", 10000);
  const handshakeProof = computePossessionProof(secretKey, handshakeChallenge.nonce, id1);

  const handshakeRes = executeAttestationHandshake(
    {
      initiatorNode: nodeA_meta1,
      responderNode: { id: "node-android-test" },
      challengeNonce: handshakeChallenge.nonce,
      possessionProof: handshakeProof,
      secretToken: secretKey,
      manifestA: capsA,
      manifestB: capsB,
      humanApproval: { status: "GRANTED", by: "operator-admin" },
    },
    testLedger,
  );

  if (!handshakeRes.ok || !handshakeRes.witnessId.startsWith("attest-wit-")) {
    throw new Error(`Handshake execution failed: ${JSON.stringify(handshakeRes)}`);
  }
  console.log(`✔ 9. human approval            PASS (Witness: ${handshakeRes.witnessId.slice(0, 20)}...)`);

  // 10. Missing Human Approval -> FAIL-CLOSED
  const deniedChallenge = createChallengeNonce("node-android-test", 10000);
  const deniedProof = computePossessionProof(secretKey, deniedChallenge.nonce, id1);
  const deniedHandshake = executeAttestationHandshake(
    {
      initiatorNode: nodeA_meta1,
      responderNode: { id: "node-android-test" },
      challengeNonce: deniedChallenge.nonce,
      possessionProof: deniedProof,
      secretToken: secretKey,
      manifestA: capsA,
      manifestB: capsB,
      humanApproval: { status: "DENIED" },
    },
    testLedger,
  );
  if (deniedHandshake.ok || deniedHandshake.error !== "HUMAN_APPROVAL_MISSING") {
    throw new Error("Missing approval must fail-closed");
  }
  console.log("✔ 10. missing approval         FAIL-CLOSED");

  // 11. Revocation Check -> FAIL-CLOSED
  const revokeRes = revokeNodeAttestation(id1, "SECURITY_AUDIT_REVOCATION", "sec-admin", testLedger);
  if (!revokeRes.ok || !isNodeRevoked(id1)) {
    throw new Error("Node revocation failed");
  }
  const revokedChallenge = createChallengeNonce("node-android-test", 10000);
  const revokedProof = computePossessionProof(secretKey, revokedChallenge.nonce, id1);
  const revokedHandshake = executeAttestationHandshake(
    {
      initiatorNode: nodeA_meta1,
      responderNode: { id: "node-android-test" },
      challengeNonce: revokedChallenge.nonce,
      possessionProof: revokedProof,
      secretToken: secretKey,
      manifestA: capsA,
      manifestB: capsB,
      humanApproval: { status: "GRANTED" },
    },
    testLedger,
  );
  if (revokedHandshake.ok || revokedHandshake.error !== "NODE_REVOKED") {
    throw new Error("Revoked node must be rejected");
  }
  console.log("✔ 11. revoked node             FAIL-CLOSED");

  // 12. Evidence Chain Verification
  const verifyChainResult = testLedger.verifyChain();
  if (!verifyChainResult.ok || verifyChainResult.events !== 2) {
    throw new Error(`Evidence chain verification failed: ${JSON.stringify(verifyChainResult)}`);
  }
  console.log(`✔ 12. evidence chain           PASS (${verifyChainResult.events} chained events verified)`);

  // 13. Artifact Lineage Binding
  const lineage = createArtifactLineage("AIOS Production Sample v1", "hash-sample-1234", handshakeRes.witnessId);
  if (!lineage.lineageId.startsWith("lineage-") || lineage.lineage.attestation_witness_id !== handshakeRes.witnessId) {
    throw new Error("Artifact lineage binding failed");
  }
  console.log(`✔ 13. artifact lineage         PASS (Lineage ID: ${lineage.lineageId.slice(0, 20)}...)`);

  // 14. Zero Secret Exposure Check
  const ledgerContents = JSON.stringify(testLedger.getHistory(10));
  const resContents = JSON.stringify(handshakeRes);
  if (ledgerContents.includes(secretKey) || resContents.includes(secretKey)) {
    throw new Error("CRITICAL: Secret was exposed in ledger or handshake return value");
  }
  console.log("✔ 14. secret exposure          ZERO (Secret never logged or persisted)");

  // Temizlik
  if (existsSync(TEST_LEDGER_PATH)) {
    unlinkSync(TEST_LEDGER_PATH);
  }

  console.log("=== PROOF GATE 08 TÜM TESTLERİ GEÇTİ (14/14) ===");
}

runTests().catch((err) => {
  console.error("Attestation test failure:", err);
  if (existsSync(TEST_LEDGER_PATH)) unlinkSync(TEST_LEDGER_PATH);
  process.exit(1);
});
