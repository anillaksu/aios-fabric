// AIOS Deterministic Node Attestation & Handshake Engine
import { createHmac, randomBytes } from "node:crypto";
import { canonicalJson, sha256, defaultLedger } from "./observer.mjs";

// Nonce Yönetimi (TTL + Single-Use Replay Protection)
const activeNonces = new Map();
const revokedNodes = new Set();

/**
 * Platform ve ajan kartı meta verilerinden deterministik Node Identity üretir.
 */
export function calculateNodeIdentity(metadata = {}) {
  const payload = {
    agent_name: metadata.agentName || "unknown-agent",
    agent_version: metadata.agentVersion || "0.0.0",
    arch: metadata.arch || "unknown-arch",
    endpoint: (metadata.endpoint || "").replace(/\/$/, ""),
    platform: metadata.platform || "unknown-os",
  };
  return "node-" + sha256(canonicalJson(payload));
}

/**
 * Replay korumalı tek-kullanımlık kriptografik challenge nonce üretir.
 */
export function createChallengeNonce(targetNodeId, ttlMs = 60000) {
  const nonceId = "chn-" + randomBytes(16).toString("hex");
  const now = Date.now();
  const entry = {
    nonce: nonceId,
    targetNodeId: targetNodeId || null,
    createdAt: now,
    expiresAt: now + ttlMs,
    used: false,
  };
  activeNonces.set(nonceId, entry);
  return entry;
}

/**
 * Nonce doğrulama ve tüketim kapısı (Single-Use & TTL enforcement).
 */
export function verifyAndConsumeNonce(nonceId, targetNodeId) {
  const entry = activeNonces.get(nonceId);
  if (!entry) {
    return { ok: false, error: "NONCE_NOT_FOUND" };
  }
  if (entry.used) {
    return { ok: false, error: "NONCE_ALREADY_USED" };
  }
  if (Date.now() > entry.expiresAt) {
    activeNonces.delete(nonceId);
    return { ok: false, error: "NONCE_EXPIRED" };
  }
  if (entry.targetNodeId && targetNodeId && entry.targetNodeId !== targetNodeId) {
    return { ok: false, error: "NONCE_TARGET_MISMATCH" };
  }

  // Tüketildi olarak işaretle
  entry.used = true;
  return { ok: true };
}

/**
 * Ham secret açığa çıkarmaksızın HMAC-SHA256 tabanlı proof-of-possession üretir.
 */
export function computePossessionProof(secretToken, challengeNonce, nodeId) {
  if (!secretToken || !challengeNonce || !nodeId) {
    throw new Error("computePossessionProof: secretToken, challengeNonce ve nodeId zorunludur");
  }
  return createHmac("sha256", secretToken)
    .update(`${challengeNonce}:${nodeId}`)
    .digest("hex");
}

/**
 * Proof-of-possession doğrulama.
 */
export function verifyPossessionProof(proof, secretToken, challengeNonce, nodeId) {
  if (!proof || !secretToken) return false;
  const expected = computePossessionProof(secretToken, challengeNonce, nodeId);
  return proof === expected;
}

/**
 * Capability listesinin kanonik SHA-256 özetini üretir.
 */
export function computeCapabilityManifestHash(capabilities = []) {
  const normalized = capabilities.map((c) => ({
    class: c.class || "REFLEX",
    name: c.name || "unknown",
    risk: c.risk || "ask",
  })).sort((a, b) => a.name.localeCompare(b.name));

  return sha256(canonicalJson(normalized));
}

/**
 * İki düğümün yetenek kesişim kümesini (A ∩ B) ve kanonik özetini hesaplar.
 */
export function computeCapabilityIntersection(manifestA = [], manifestB = []) {
  const setB = new Set(manifestB.map((c) => (typeof c === "string" ? c : c.name)));
  const commonNames = manifestA
    .map((c) => (typeof c === "string" ? c : c.name))
    .filter((name) => setB.has(name))
    .sort();

  return {
    commonCapabilities: commonNames,
    intersectionHash: sha256(canonicalJson(commonNames)),
  };
}

/**
 * Düğüm iptali (Revocation).
 */
export function revokeNodeAttestation(nodeId, reason = "OPERATOR_REVOCATION", operatorId = "operator", ledger = defaultLedger) {
  revokedNodes.add(nodeId);
  const event = ledger.append({
    operation: "attestation.revoked",
    http_status: 200,
    success: true,
    response_data: { revokedNodeId: nodeId, reason, operatorId },
    metadata: { reason, operatorId },
  });
  return { ok: true, event };
}

export function isNodeRevoked(nodeId) {
  return revokedNodes.has(nodeId);
}

/**
 * Tam Deterministik Node Attestation Handshake
 */
export function executeAttestationHandshake(params = {}, ledger = defaultLedger) {
  const {
    initiatorNode,
    responderNode,
    challengeNonce,
    possessionProof,
    secretToken, // yalnızca yerel hesaplama için, loglanmaz
    manifestA = [],
    manifestB = [],
    humanApproval = { status: "DENIED" },
  } = params;

  const initiatorId = initiatorNode?.id || calculateNodeIdentity(initiatorNode);
  const responderId = responderNode?.id || calculateNodeIdentity(responderNode);

  // 1. Revocation kontrolü
  if (isNodeRevoked(initiatorId) || isNodeRevoked(responderId)) {
    return { ok: false, error: "NODE_REVOKED", detail: "Düğüm daha önce iptal edilmiş (revoked)." };
  }

  // 2. Nonce doğrulama ve tüketim
  const nonceCheck = verifyAndConsumeNonce(challengeNonce, responderId);
  if (!nonceCheck.ok) {
    return { ok: false, error: nonceCheck.error, detail: "Challenge nonce geçersiz, süresi dolmuş veya tekrar kullanılmış." };
  }

  // 3. Secret doğrulama (HMAC proof)
  const isProofValid = verifyPossessionProof(possessionProof, secretToken, challengeNonce, initiatorId);
  if (!isProofValid) {
    return { ok: false, error: "INVALID_POSSESSION_PROOF", detail: "HMAC proof-of-possession doğrulanamadı." };
  }

  // 4. Human Approval Kontrolü (risk: "ask" kapısı)
  if (humanApproval?.status !== "GRANTED") {
    return { ok: false, error: "HUMAN_APPROVAL_MISSING", detail: "Operatör onayı (human approval) verilmedi." };
  }

  // 5. Capability ve Kesişim Hash'leri
  const manifestAHash = computeCapabilityManifestHash(manifestA);
  const manifestBHash = computeCapabilityManifestHash(manifestB);
  const intersection = computeCapabilityIntersection(manifestA, manifestB);

  // 6. Immutable Witness ID üretimi
  const witnessPayload = {
    challenge_nonce: challengeNonce,
    initiator_id: initiatorId,
    intersection_hash: intersection.intersectionHash,
    manifest_a_hash: manifestAHash,
    manifest_b_hash: manifestBHash,
    proof_digest: sha256(possessionProof),
    responder_id: responderId,
  };
  const immutableWitnessId = "attest-wit-" + sha256(canonicalJson(witnessPayload));

  // 7. Evidence Ledger'a ekle (Sıfır secret kaydı)
  const evidenceRecord = ledger.append({
    operation: "attestation.handshake",
    http_status: 200,
    success: true,
    response_data: {
      witnessId: immutableWitnessId,
      initiatorId,
      responderId,
      intersectionHash: intersection.intersectionHash,
      allowedCapabilitiesCount: intersection.commonCapabilities.length,
    },
    metadata: {
      humanApprovedBy: humanApproval.by || "operator",
      manifestAHash,
      manifestBHash,
    },
  });

  return {
    ok: true,
    witnessId: immutableWitnessId,
    initiatorId,
    responderId,
    intersection,
    evidenceRecord,
  };
}

/**
 * Attestation witness'ını sonradan üretilen artifact'lere lineage olarak bağlar.
 */
export function createArtifactLineage(artifactTitle, artifactHash, attestationWitnessId) {
  const lineage = {
    artifact_title: artifactTitle,
    artifact_hash: artifactHash,
    attestation_witness_id: attestationWitnessId,
    timestamp_utc: new Date().toISOString(),
  };
  const lineageId = "lineage-" + sha256(canonicalJson(lineage));
  return {
    lineageId,
    lineage,
    canonicalLineageHash: sha256(canonicalJson(lineage)),
  };
}
