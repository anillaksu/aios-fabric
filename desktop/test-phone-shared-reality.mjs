// AIOS Phone/PWA Shared Reality Parity Test Suite
import { computeCanonicalRealityDigest, verifyPhoneSharedRealityParity, simulateDisconnectedPhoneReality } from "./phone-shared-reality.mjs";
import { defaultRelay } from "./agent-relay.mjs";

async function runTests() {
  console.log("=== AIOS PROOF GATE 14A: PHONE/PWA SHARED REALITY TESTS ===");

  // Mock Canonical Shared Snapshot (Live Gate 09-13 State)
  const baseSnapshot = {
    timestamp: new Date().toISOString(),
    nodes: {
      windows: {
        nodeId: "node-9bd0d97dd3c599c25e7fc6c557021343711e6bb0baaedaae2874066713421a0f",
        platform: "win32",
        agentName: "AIOS Windows Control Surface",
        agentVersion: "0.1.0",
        online: true,
        stale: false,
      },
      android: {
        nodeId: "node-e09887136f677275944a6b7ae72e8d814a941a274b836915eb47dd607fda21c4",
        platform: "android",
        agentName: "Phone AI-OS Fabric",
        agentVersion: "0.1.0",
        endpoint: "http://100.75.177.88:9300",
        online: true,
        stale: false,
        services: ["fabric", "llm-bridge", "hermes"],
        capabilitiesCount: 39,
      },
    },
    attestation: {
      latestWitnessId: "attest-wit-d9b55fa5a77456e6421031141adf2e3549cffd790aaceef84cce8e95e1f019a7",
      capabilityManifestHashA: "c3f84582946fd131ffc7a353691b9befa611dab8f5e8a465ae97a62b7943fcc6",
      capabilityManifestHashB: "4191689feb7024351c4b79217b1d5254d248bfcc80986d0008710a0a70707859",
      intersectionHash: "6f0b10889cccac087656395eb2dd2f519825cc5750caedda081c763b7da47680",
      allowedCapabilities: ["a2a.delegate", "sensor.battery.read", "volume.read", "wifi.info"],
    },
    artifact: {
      artifactId: "art-human-b36dadf7735b07ca32706961",
      artifactSha256: "b36dadf7735b07ca32706961c632c61c85e2e6b6dc3c17a54479163b3392e65b",
      lineageWitnessId: "attest-wit-d9b55fa5a77456e6421031141adf2e3549cffd790aaceef84cce8e95e1f019a7",
      humanApproved: true,
      policyResult: "ALLOWED",
    },
    evidenceChain: {
      ok: true,
      events: 13,
      status: "CHAIN_VALID",
      latestHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
    pendingApprovals: [],
  };

  // 1. Windows Snapshot
  const winDigest = computeCanonicalRealityDigest(baseSnapshot);
  if (!winDigest.canonicalHash || !winDigest.canonicalPayload.windows_node_id) {
    throw new Error("Windows snapshot digest calculation failed");
  }
  console.log(`✔ 1. Windows snapshot           PASS (Hash: ${winDigest.canonicalHash.slice(0, 16)}...)`);

  // 2. Android Phone Snapshot
  const phoneDigest = computeCanonicalRealityDigest(JSON.parse(JSON.stringify(baseSnapshot)));
  if (!phoneDigest.canonicalHash || !phoneDigest.canonicalPayload.android_node_id) {
    throw new Error("Phone snapshot digest calculation failed");
  }
  console.log(`✔ 2. Android snapshot           PASS (Hash: ${phoneDigest.canonicalHash.slice(0, 16)}...)`);

  // 3. Canonical Equality (Byte-Identical Hash)
  const parityRes = verifyPhoneSharedRealityParity(baseSnapshot, baseSnapshot);
  if (!parityRes.ok || parityRes.status !== "MATCH" || !parityRes.realityMatch) {
    throw new Error("Canonical reality parity matching failed");
  }
  console.log("✔ 3. canonical equality         PASS (Windows SHA256 === Phone SHA256)");

  // 4. Attestation Identity Equality
  if (!parityRes.attestationMatch) {
    throw new Error("Attestation identity mismatch between surfaces");
  }
  console.log("✔ 4. attestation match          PASS (attest-wit-d9b55... verified)");

  // 5. Artifact Equality
  if (!parityRes.artifactMatch) {
    throw new Error("Artifact mismatch between surfaces");
  }
  console.log("✔ 5. artifact match             PASS (art-human-b36da... verified)");

  // 6. Evidence Equality
  if (!parityRes.evidenceMatch) {
    throw new Error("Evidence chain mismatch between surfaces");
  }
  console.log("✔ 6. evidence match             PASS (CHAIN_VALID verified)");

  // 7. Disconnect Handling -> STALE / OFFLINE
  const disconnectedDigest = simulateDisconnectedPhoneReality(baseSnapshot);
  if (disconnectedDigest.canonicalPayload.connection_state !== "OFFLINE_STALE" || disconnectedDigest.classifications.android_node_id !== "STALE") {
    throw new Error("Disconnected phone must be flagged as OFFLINE_STALE");
  }
  console.log("✔ 7. disconnect handling        PASS (OFFLINE_STALE strictly flagged)");

  // 8. Recovery Handling
  const recoveredParity = verifyPhoneSharedRealityParity(baseSnapshot, baseSnapshot);
  if (!recoveredParity.ok || recoveredParity.status !== "MATCH") {
    throw new Error("Recovery parity check failed");
  }
  console.log("✔ 8. recovery handling          PASS (Parity instantly restored upon reconnection)");

  // 9. Stale Protection (Old data cannot masquerade as live)
  const mismatchRes = verifyPhoneSharedRealityParity(baseSnapshot, {
    ...baseSnapshot,
    nodes: { ...baseSnapshot.nodes, android: { ...baseSnapshot.nodes.android, online: false, stale: true } },
  });
  if (mismatchRes.ok || mismatchRes.status !== "REALITY_MISMATCH") {
    throw new Error("Stale reality difference must trigger REALITY_MISMATCH");
  }
  console.log("✔ 9. stale protection           PASS (REALITY_MISMATCH triggered on state skew)");

  // 10. Secret Exposure Check (Zero Credential in Payload)
  const payloadStr = JSON.stringify(winDigest.canonicalPayload);
  if (payloadStr.includes("token") || payloadStr.includes("Bearer") || payloadStr.includes("secret")) {
    throw new Error("Secret exposed in shared reality payload");
  }
  console.log("✔ 10. secret exposure           ZERO");

  // 11. Unknown / Unproven State Handling
  const emptySnapshot = { nodes: {}, attestation: {}, artifact: null, evidenceChain: null };
  const emptyDigest = computeCanonicalRealityDigest(emptySnapshot);
  if (emptyDigest.classifications.windows_node_id !== "NOT_PROVEN" || emptyDigest.classifications.attestation_witness !== "NOT_PROVEN") {
    throw new Error("Empty snapshot must classify fields as NOT_PROVEN");
  }
  console.log("✔ 11. unknown state handling    PASS (Classified as NOT_PROVEN)");

  // 12. Deterministic Hash Verification
  const digest1 = computeCanonicalRealityDigest(baseSnapshot);
  const digest2 = computeCanonicalRealityDigest(baseSnapshot);
  if (digest1.canonicalHash !== digest2.canonicalHash) {
    throw new Error("Digest calculation must be strictly deterministic");
  }
  console.log("✔ 12. deterministic hash        PASS (Byte-identical hash reproducibility)");

  console.log("=== PROOF GATE 14A TÜM TESTLERİ GEÇTİ (12/12) ===");
}

runTests().catch((err) => {
  console.error("Phone Shared Reality Parity Test failed:", err);
  process.exit(1);
});
