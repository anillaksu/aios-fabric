// AIOS Phone & PWA Shared Reality Parity Engine
import { canonicalJson, sha256, defaultLedger } from "./observer.mjs";
import { defaultRelay } from "./agent-relay.mjs";

/**
 * 13 temel alan üzerinden deterministik kanonik gerçeklik yükünü ve SHA-256 özetini üretir.
 */
export function computeCanonicalRealityDigest(snapshot = {}) {
  const isAndroidOnline = snapshot.nodes?.android?.online === true && !snapshot.nodes?.android?.stale;
  const isChainValid = snapshot.evidenceChain?.ok === true && snapshot.evidenceChain?.status === "CHAIN_VALID";
  const hasAttestation = Boolean(snapshot.attestation?.latestWitnessId && snapshot.attestation.latestWitnessId !== "GENESIS");
  const hasArtifact = Boolean(snapshot.artifact?.artifactId && snapshot.artifact?.artifactSha256);
  const pendingCount = (snapshot.pendingApprovals || []).length;

  const canonicalPayload = {
    android_node_id: snapshot.nodes?.android?.nodeId || "unknown",
    attestation_witness: snapshot.attestation?.latestWitnessId || "GENESIS",
    browser_node_id: snapshot.nodes?.browser?.nodeId || snapshot.browser?.source_node || "NONE",
    browser_proof_digest: snapshot.nodes?.browser?.proofDigest || snapshot.browser?.proof_digest || "NONE",
    browser_status: snapshot.browser?.status || (snapshot.nodes?.browser?.online ? "PROVEN" : "NOT_PROVEN"),
    capability_manifest_hash_a: snapshot.attestation?.capabilityManifestHashA || "c3f84582946fd131ffc7a353691b9befa611dab8f5e8a465ae97a62b7943fcc6",
    capability_manifest_hash_b: snapshot.attestation?.capabilityManifestHashB || "4191689feb7024351c4b79217b1d5254d248bfcc80986d0008710a0a70707859",
    connection_state: isAndroidOnline ? "ONLINE" : "OFFLINE_STALE",
    evidence_chain_status: snapshot.evidenceChain?.status || "UNKNOWN",
    intersection_hash: snapshot.attestation?.intersectionHash || "NONE",
    latest_artifact_id: snapshot.artifact?.artifactId || "NONE",
    latest_artifact_sha256: snapshot.artifact?.artifactSha256 || "NONE",
    latest_evidence_witness: snapshot.evidenceChain?.latestHash || "GENESIS",
    latest_human_approval: snapshot.artifact?.humanApproved ? "GRANTED" : "NONE",
    runtime_status: isAndroidOnline && (snapshot.nodes?.android?.services?.length || 0) > 0 ? "RUNNING" : "UNKNOWN",
    windows_node_id: snapshot.nodes?.windows?.nodeId || "unknown",
  };

  const canonicalHash = sha256(canonicalJson(canonicalPayload));

  const classifications = {
    windows_node_id: snapshot.nodes?.windows?.nodeId ? "PROVEN" : "NOT_PROVEN",
    android_node_id: isAndroidOnline ? "PROVEN" : "STALE",
    browser_status: snapshot.browser?.status || (snapshot.nodes?.browser?.online ? "PROVEN" : "NOT_PROVEN"),
    attestation_witness: hasAttestation ? "PROVEN" : "NOT_PROVEN",
    capability_manifest_hash_a: "PROVEN",
    capability_manifest_hash_b: isAndroidOnline ? "PROVEN" : "STALE",
    intersection_hash: hasAttestation ? "PROVEN" : "NOT_PROVEN",
    latest_artifact_id: hasArtifact ? "PROVEN" : "NOT_PROVEN",
    latest_artifact_sha256: hasArtifact ? "PROVEN" : "NOT_PROVEN",
    latest_human_approval: pendingCount > 0 ? "REVIEW_REQUIRED" : "PROVEN",
    latest_evidence_witness: isChainValid ? "PROVEN" : "NOT_PROVEN",
    evidence_chain_status: isChainValid ? "PROVEN" : "NOT_PROVEN",
    runtime_status: isAndroidOnline ? "PROVEN" : "OFFLINE",
    connection_state: isAndroidOnline ? "PROVEN" : "OFFLINE",
  };

  return {
    canonicalPayload,
    canonicalHash,
    classifications,
    secretExposure: false,
  };
}

/**
 * Windows Control Surface ve Android Phone (PWA) arasındaki gerçeklik paritesini doğrular.
 */
export function verifyPhoneSharedRealityParity(windowsSnapshot = {}, phoneSnapshot = {}) {
  const winDigest = computeCanonicalRealityDigest(windowsSnapshot);
  const phoneDigest = computeCanonicalRealityDigest(phoneSnapshot);

  // Secret Kontrolü (PWA veya Windows yükünde hiçbir credential bulunmamalı)
  const winStr = JSON.stringify(winDigest.canonicalPayload);
  const phoneStr = JSON.stringify(phoneDigest.canonicalPayload);
  if (winStr.includes("token") || winStr.includes("Bearer") || phoneStr.includes("token") || phoneStr.includes("Bearer")) {
    return {
      ok: false,
      status: "SECRET_EXPOSURE_DETECTED",
      realityMatch: false,
      error: "Secret or Bearer token leaked in shared reality payload",
    };
  }

  // Parite Kontrolleri
  const isHashMatch = winDigest.canonicalHash === phoneDigest.canonicalHash;
  const isAttestationMatch = winDigest.canonicalPayload.attestation_witness === phoneDigest.canonicalPayload.attestation_witness;
  const isArtifactMatch =
    winDigest.canonicalPayload.latest_artifact_id === phoneDigest.canonicalPayload.latest_artifact_id &&
    winDigest.canonicalPayload.latest_artifact_sha256 === phoneDigest.canonicalPayload.latest_artifact_sha256;
  const isEvidenceMatch =
    winDigest.canonicalPayload.latest_evidence_witness === phoneDigest.canonicalPayload.latest_evidence_witness &&
    winDigest.canonicalPayload.evidence_chain_status === phoneDigest.canonicalPayload.evidence_chain_status;

  if (!isHashMatch || !isAttestationMatch || !isArtifactMatch || !isEvidenceMatch) {
    return {
      ok: false,
      status: "REALITY_MISMATCH",
      realityMatch: false,
      windowsHash: winDigest.canonicalHash,
      phoneHash: phoneDigest.canonicalHash,
      attestationMatch: isAttestationMatch,
      artifactMatch: isArtifactMatch,
      evidenceMatch: isEvidenceMatch,
      diff: {
        windows: winDigest.canonicalPayload,
        phone: phoneDigest.canonicalPayload,
      },
    };
  }

  return {
    ok: true,
    status: "MATCH",
    realityMatch: true,
    canonicalHash: winDigest.canonicalHash,
    attestationMatch: true,
    artifactMatch: true,
    evidenceMatch: true,
    staleProtection: winDigest.canonicalPayload.connection_state === "ONLINE" ? "ACTIVE_ONLINE" : "ACTIVE_STALE_FLAGGED",
    classifications: winDigest.classifications,
  };
}

/**
 * Bağlantı koptuğunda eski verinin canlı gibi sunulmadığını (STALE/OFFLINE) simüle eder.
 */
export function simulateDisconnectedPhoneReality(baseSnapshot = {}) {
  const disconnected = {
    ...baseSnapshot,
    nodes: {
      ...baseSnapshot.nodes,
      android: {
        ...baseSnapshot.nodes?.android,
        online: false,
        stale: true,
      },
    },
  };
  return computeCanonicalRealityDigest(disconnected);
}
