// AIOS First Human-Approved Artifact Production Engine
import { canonicalJson, sha256, defaultLedger } from "./observer.mjs";
import { isNodeRevoked } from "./attestation.mjs";

/**
 * İnsan onaylı ilk üretim artifact talebini oluşturur (REVIEW_REQUIRED).
 */
export function requestHumanApprovedArtifact(params = {}, ledger = defaultLedger) {
  const {
    sourceNodes = [],
    attestationWitnessId,
    intersectionHash,
    requestedBy = "operator-lead",
    purpose = "proof-only",
  } = params;

  if (!attestationWitnessId) {
    return { ok: false, error: "ATTESTATION_WITNESS_REQUIRED" };
  }
  if (!Array.isArray(sourceNodes) || sourceNodes.length < 2) {
    return { ok: false, error: "SOURCE_NODES_REQUIRED" };
  }

  const requestId = "req-art-" + sha256(canonicalJson({ sourceNodes, attestationWitnessId, intersectionHash, timestamp: Date.now() })).slice(0, 16);

  // Evidence Ledger'a Talep ve Review Required Olayları Yazılır
  ledger.append({
    operation: "artifact.production.requested",
    http_status: 200,
    success: true,
    response_data: { requestId, purpose, sourceNodes, attestationWitnessId },
    metadata: { intersectionHash, requestedBy },
  });

  ledger.append({
    operation: "artifact.production.review_required",
    http_status: 200,
    success: true,
    response_data: { requestId, status: "REVIEW_REQUIRED" },
    metadata: { requiredAction: "HUMAN_OPERATOR_APPROVAL" },
  });

  return {
    ok: true,
    requestId,
    status: "REVIEW_REQUIRED",
    sourceNodes,
    attestationWitnessId,
    intersectionHash,
    purpose,
  };
}

/**
 * İnsan operatör onay/ret kararına göre deterministik artifact üretir veya reddeder.
 */
export function produceHumanApprovedArtifact(params = {}, ledger = defaultLedger) {
  const {
    requestId,
    decision = "DENIED", // APPROVE | DENY
    operatorId = "operator-admin",
    sourceNodes = [],
    attestationWitnessId,
    intersectionHash,
    purpose = "proof-only",
  } = params;

  const isApproved = decision.toUpperCase() === "APPROVE" || decision.toUpperCase() === "GRANTED";

  // 1. Karar DENY ise: Fail-Closed dur ve deftere kaydet
  if (!isApproved) {
    ledger.append({
      operation: "artifact.production.denied",
      http_status: 403,
      success: false,
      response_data: { requestId, decision: "DENIED", operatorId },
      metadata: { reason: "OPERATOR_DENIED" },
    });
    return {
      ok: false,
      status: "DENIED",
      error: "HUMAN_OPERATOR_DENIED",
      detail: "İnsan operatör artifact üretim talebini reddetti (Fail-Closed).",
    };
  }

  // 2. Doğrulama: Düğüm Revokasyonu
  for (const node of sourceNodes) {
    const nId = typeof node === "string" ? node : node?.node_id;
    if (isNodeRevoked(nId)) {
      ledger.append({
        operation: "artifact.production.denied",
        http_status: 403,
        success: false,
        response_data: { requestId, decision: "BLOCKED", nodeId: nId },
        metadata: { reason: "NODE_REVOKED" },
      });
      return { ok: false, status: "BLOCKED", error: "NODE_REVOKED", detail: `Düğüm ${nId} iptal edilmiştir.` };
    }
  }

  // 3. Doğrulama: Attestation Witness
  if (!attestationWitnessId || !attestationWitnessId.startsWith("attest-wit-")) {
    return { ok: false, status: "BLOCKED", error: "INVALID_ATTESTATION_WITNESS" };
  }

  // 4. Doğrulama: Secret / Token Sızıntı Kontrolü (Payload Temizliği)
  const sortedSourceNodes = sourceNodes
    .map((n) => (typeof n === "string" ? n : n?.node_id || ""))
    .sort();

  const basePayload = {
    attestation_witness: attestationWitnessId,
    human_approval: {
      operator_id: operatorId,
      status: "GRANTED",
    },
    intersection_hash: intersectionHash,
    purpose: purpose,
    schema: "aios.first-human-approved-artifact.v1",
    source_nodes: sortedSourceNodes,
  };

  const payloadString = JSON.stringify(basePayload);
  if (payloadString.includes("token") || payloadString.includes("Bearer") || payloadString.includes("secret")) {
    return { ok: false, status: "BLOCKED", error: "SECRET_INJECTION_DETECTED" };
  }

  // 5. Deterministik SHA-256 ve Artifact ID
  const artifactSha256 = sha256(canonicalJson(basePayload));
  const artifactId = "art-human-" + artifactSha256.slice(0, 24);

  const fullArtifact = {
    ...basePayload,
    artifact_id: artifactId,
    artifact_sha256: artifactSha256,
  };

  // 6. Evidence Ledger Olayları (approved -> completed)
  ledger.append({
    operation: "artifact.production.approved",
    http_status: 200,
    success: true,
    response_data: { requestId, operatorId, artifactId, artifactSha256 },
    metadata: { decision: "GRANTED" },
  });

  ledger.append({
    operation: "artifact.production.completed",
    http_status: 200,
    success: true,
    response_data: {
      artifactId,
      artifactSha256,
      attestationWitnessId,
      sourceNodes: sortedSourceNodes,
    },
    metadata: {
      lineageBound: true,
      operatorId,
      purpose,
    },
  });

  return {
    ok: true,
    status: "COMPLETED",
    artifact: fullArtifact,
    lineageWitnessId: attestationWitnessId,
  };
}
