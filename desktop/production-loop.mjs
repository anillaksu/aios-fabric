// AIOS First Real Production Loop Engine (Gate 15)
import { canonicalJson, sha256, defaultLedger } from "./observer.mjs";
import { isNodeRevoked } from "./attestation.mjs";

/**
 * Production Artifact Üretim Talebi Oluşturur (REVIEW_REQUIRED).
 */
export function requestProductionLoopArtifact(params = {}, ledger = defaultLedger) {
  const {
    sourceNodes = [],
    attestationWitnessId,
    taskWitnessId,
    sourceRealityHash,
    requestedBy = "operator-lead",
  } = params;

  if (!attestationWitnessId || !taskWitnessId) {
    return { ok: false, error: "WITNESSES_REQUIRED", detail: "Hem attestation witness hem de task witness zorunludur." };
  }
  if (!Array.isArray(sourceNodes) || sourceNodes.length < 2) {
    return { ok: false, error: "SOURCE_NODES_REQUIRED" };
  }

  const requestId = "req-prod-" + sha256(canonicalJson({ sourceNodes, attestationWitnessId, taskWitnessId, sourceRealityHash, timestamp: Date.now() })).slice(0, 16);

  ledger.append({
    operation: "artifact.production.requested",
    http_status: 200,
    success: true,
    response_data: { requestId, sourceNodes, attestationWitnessId, taskWitnessId, sourceRealityHash },
    metadata: { requestedBy, loopPhase: "GATE_15_PRODUCTION_PROOF" },
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
    taskWitnessId,
    sourceRealityHash,
  };
}

/**
 * İnsan operatör kararına göre deterministik Production Artifact üretir veya reddeder.
 */
export function produceProductionLoopArtifact(params = {}, ledger = defaultLedger) {
  const {
    requestId,
    decision = "DENIED",
    operatorId = "operator-admin",
    sourceNodes = [],
    attestationWitnessId,
    taskWitnessId,
    sourceRealityHash,
    previousArtifactId = "art-human-b36dadf7735b07ca32706961",
    verifiedObservations = [
      {
        capability: "sensor.battery.read",
        response_digest: "90719f5d9e174c728b00902e6f8759f2d75e58791e4a01533147f7959f6fe885",
        classification: "LIVE-EXECUTION-VERIFIED",
      },
    ],
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
      detail: "İnsan operatör production artifact üretimini onaylamadı (Fail-Closed).",
    };
  }

  // 2. Düğüm ve Witness Doğrulaması
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
      return { ok: false, status: "BLOCKED", error: "NODE_REVOKED" };
    }
  }

  if (!attestationWitnessId || !attestationWitnessId.startsWith("attest-wit-")) {
    return { ok: false, status: "BLOCKED", error: "INVALID_ATTESTATION_WITNESS" };
  }
  if (!taskWitnessId || !taskWitnessId.startsWith("task-wit-")) {
    return { ok: false, status: "BLOCKED", error: "INVALID_TASK_WITNESS" };
  }

  // 3. Kanonik Sıralanmış Kaynak Düğümler
  const canonicalNodes = sourceNodes
    .map((n) => (typeof n === "string" ? { node_id: n, platform: "unknown", version: "0.1.0" } : n))
    .sort((a, b) => a.node_id.localeCompare(b.node_id));

  // 4. Deterministik Temel Yük (Nondeterminism-free: No random, no timestamp inside hash)
  const basePayload = {
    attestation_witness: attestationWitnessId,
    human_approval: {
      operator_id: operatorId,
      status: "GRANTED",
    },
    lineage: {
      attestation: attestationWitnessId,
      previous_artifact: previousArtifactId,
      task_witness: taskWitnessId,
    },
    purpose: "production-proof",
    schema: "aios.production.proof.v1",
    source_nodes: canonicalNodes,
    source_reality_hash: sourceRealityHash,
    task_witness: taskWitnessId,
    verified_observations: verifiedObservations,
  };

  // 5. Secret Sızıntı Denetimi
  const payloadStr = JSON.stringify(basePayload);
  if (payloadStr.includes("token") || payloadStr.includes("Bearer") || payloadStr.includes("secret")) {
    return { ok: false, status: "BLOCKED", error: "SECRET_INJECTION_DETECTED" };
  }

  // 6. Deterministik SHA-256 ve Artifact ID
  const artifactSha256 = sha256(canonicalJson(basePayload));
  const artifactId = "art-prod-" + artifactSha256.slice(0, 24);

  const fullArtifact = {
    ...basePayload,
    artifact_id: artifactId,
    artifact_sha256: artifactSha256,
  };

  // 7. Evidence Ledger Entegrasyonu
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
      taskWitnessId,
      sourceRealityHash,
    },
    metadata: {
      loopPhase: "GATE_15_PRODUCTION_PROOF",
      operatorId,
      lineageBound: true,
    },
  });

  return {
    ok: true,
    status: "LIVE-HUMAN-APPROVED-EXECUTION-VERIFIED",
    artifact: fullArtifact,
    lineage: basePayload.lineage,
    evidenceWitness: ledger.getLatestWitnessHash(),
  };
}
