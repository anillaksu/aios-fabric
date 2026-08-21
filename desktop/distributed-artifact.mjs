// AIOS Distributed Artifact Engine (Cross-Node Canonical Artifacts)
import { canonicalJson, sha256, defaultLedger } from "./observer.mjs";
import { isNodeRevoked } from "./attestation.mjs";

/**
 * İki onaylanmış düğüm arasındaki attestation witness'ından deterministik
 * ve kanonik ilk dağıtık artifact'i üretir.
 */
export function createDistributedArtifact(params = {}, ledger = defaultLedger) {
  const {
    sourceNodes = [],
    attestationWitnessId,
    capabilityManifestHashA,
    capabilityManifestHashB,
    intersectionHash,
    allowedCapabilities = [],
    humanApproval = { status: "DENIED" },
    policyResult = "ALLOWED",
  } = params;

  // 1. Girdi Bütünlüğü Kontrolü
  if (!attestationWitnessId) {
    return { ok: false, error: "ATTESTATION_WITNESS_REQUIRED", detail: "Attestation witness ID zorunludur." };
  }
  if (!Array.isArray(sourceNodes) || sourceNodes.length < 2) {
    return { ok: false, error: "SOURCE_NODES_REQUIRED", detail: "En az iki kaynak düğüm (source nodes) gereklidir." };
  }

  // 2. Revocation Kontrolü
  for (const node of sourceNodes) {
    if (isNodeRevoked(node.node_id)) {
      return { ok: false, error: "NODE_REVOKED", detail: `Kaynak düğüm ${node.node_id} iptal edilmiş.` };
    }
  }

  // 3. Human Approval Kontrolü (Fail-Closed)
  if (humanApproval?.status !== "GRANTED") {
    return { ok: false, error: "HUMAN_APPROVAL_MISSING", detail: "İnsan operatör onayı olmadan artifact üretilemez." };
  }

  // 4. Kanonik Temel Yük (Hash hesaplamadan önceki alanlar)
  const canonicalNodes = sourceNodes
    .map((n) => ({
      agent_name: n.agent_name || "unknown",
      agent_version: n.agent_version || "0.0.0",
      node_id: n.node_id,
      platform: n.platform || "unknown",
    }))
    .sort((a, b) => a.node_id.localeCompare(b.node_id));

  const sortedCapabilities = [...allowedCapabilities].sort();

  const basePayload = {
    allowed_capabilities: sortedCapabilities,
    attestation_witness_id: attestationWitnessId,
    capability_manifest_hash_a: capabilityManifestHashA,
    capability_manifest_hash_b: capabilityManifestHashB,
    human_approval: {
      operator_id: humanApproval.operator_id || humanApproval.by || "operator",
      status: humanApproval.status,
    },
    intersection_hash: intersectionHash,
    policy_result: policyResult,
    schema: "aios.distributed-artifact.v1",
    source_nodes: canonicalNodes,
  };

  // 5. Deterministik SHA-256 ve Artifact ID
  const artifactSha256 = sha256(canonicalJson(basePayload));
  const artifactId = "art-dist-" + artifactSha256.slice(0, 24);

  const fullArtifact = {
    ...basePayload,
    artifact_id: artifactId,
    artifact_sha256: artifactSha256,
    artifact_type: "first_distributed_artifact",
    created_from_witness: attestationWitnessId,
  };

  // 6. Evidence Ledger Entegrasyonu
  const evidenceRecord = ledger.append({
    operation: "artifact.distributed.created",
    http_status: 200,
    success: true,
    response_data: {
      artifact_id: artifactId,
      artifact_sha256: artifactSha256,
      attestation_witness_id: attestationWitnessId,
      allowed_capabilities: sortedCapabilities,
    },
    metadata: {
      intersection_hash: intersectionHash,
      operator_id: humanApproval.operator_id || humanApproval.by || "operator",
    },
  });

  return {
    ok: true,
    artifact: fullArtifact,
    evidenceRecord,
  };
}
