// AIOS First Live Human-Approved A2A Task Delegation Engine
import { canonicalJson, sha256, defaultLedger } from "./observer.mjs";
import { isNodeRevoked } from "./attestation.mjs";
import { sendA2AMessage } from "./a2a-client.mjs";

const ANDROID_HOST = process.env.AIOS_ANDROID_URL || "http://100.75.177.88:9300";
const ALLOWED_CAPABILITIES = ["sensor.battery.read"];

/**
 * İnsan onaylı canlı A2A görev delegasyonu talebi oluşturur (REVIEW_REQUIRED).
 */
export function requestLiveTaskDelegation(params = {}, ledger = defaultLedger) {
  const {
    capability = "sensor.battery.read",
    targetNodeId = "node-e09887136f677275944a6b7ae72e8d814a941a274b836915eb47dd607fda21c4",
    sourceNodeId = "node-9bd0d97dd3c599c25e7fc6c557021343711e6bb0baaedaae2874066713421a0f",
    attestationWitnessId = "attest-wit-d9b55fa5a77456e6421031141adf2e3549cffd790aaceef84cce8e95e1f019a7",
    requestedBy = "operator-lead",
  } = params;

  // 1. Allowlist Denetimi (Gate 14B: SADECE sensor.battery.read)
  if (!ALLOWED_CAPABILITIES.includes(capability)) {
    return {
      ok: false,
      error: "CAPABILITY_NOT_PERMITTED",
      detail: `Yetenek '${capability}' Gate 14B izin listesinde değildir. Yalnızca 'sensor.battery.read' izinlidir.`,
    };
  }

  const timestampUtc = new Date().toISOString();
  const taskId = "task-a2a-" + sha256(canonicalJson({ capability, targetNodeId, sourceNodeId, timestampUtc })).slice(0, 16);

  // 2. Evidence Ledger'a Talep Kaydı
  ledger.append({
    operation: "task.delegation.requested",
    http_status: 200,
    success: true,
    response_data: { taskId, capability, targetNodeId, sourceNodeId, attestationWitnessId },
    metadata: { requestedBy, timestampUtc },
  });

  ledger.append({
    operation: "task.delegation.review_required",
    http_status: 200,
    success: true,
    response_data: { taskId, status: "REVIEW_REQUIRED" },
    metadata: { requiredAction: "HUMAN_OPERATOR_APPROVAL" },
  });

  return {
    ok: true,
    taskId,
    status: "REVIEW_REQUIRED",
    capability,
    targetNodeId,
    sourceNodeId,
    attestationWitnessId,
    timestampUtc,
  };
}

/**
 * Operatör kararına göre canlı görevi Android düğümüne iletir ve kanıt kaydını üretir.
 */
export async function executeLiveTaskDelegation(params = {}, ledger = defaultLedger) {
  const {
    taskId,
    decision = "DENIED",
    operatorId = "operator-admin",
    capability = "sensor.battery.read",
    targetNodeId = "node-e09887136f677275944a6b7ae72e8d814a941a274b836915eb47dd607fda21c4",
    sourceNodeId = "node-9bd0d97dd3c599c25e7fc6c557021343711e6bb0baaedaae2874066713421a0f",
    attestationWitnessId = "attest-wit-d9b55fa5a77456e6421031141adf2e3549cffd790aaceef84cce8e95e1f019a7",
    timeoutMs = 5000,
  } = params;

  const isApproved = decision.toUpperCase() === "APPROVE" || decision.toUpperCase() === "GRANTED";

  // 1. İnsan Onayı Denetimi (Fail-Closed)
  if (!isApproved) {
    ledger.append({
      operation: "task.delegation.denied",
      http_status: 403,
      success: false,
      response_data: { taskId, decision: "DENIED", operatorId },
      metadata: { reason: "OPERATOR_DENIED" },
    });
    return {
      ok: false,
      status: "DENIED",
      error: "HUMAN_OPERATOR_DENIED",
      detail: "İnsan operatör canlı görev delegasyonunu onaylamadı (Fail-Closed).",
    };
  }

  // 2. Allowlist ve Düğüm Denetimi
  if (!ALLOWED_CAPABILITIES.includes(capability)) {
    return { ok: false, status: "BLOCKED", error: "CAPABILITY_NOT_PERMITTED" };
  }
  if (isNodeRevoked(targetNodeId) || isNodeRevoked(sourceNodeId)) {
    return { ok: false, status: "BLOCKED", error: "NODE_REVOKED" };
  }

  const previousWitnessHash = ledger.getLatestWitnessHash();
  const requestDigest = sha256(canonicalJson({ capability, targetNodeId, sourceNodeId, attestationWitnessId }));

  // 3. Canlı İcra (Android Node: http://100.75.177.88:9300/read)
  let rawResponse = null;
  let remoteHttpStatus = 0;
  let remoteExecuted = false;

  try {
    const res = await fetch(`${ANDROID_HOST}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: capability }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    remoteHttpStatus = res.status;
    if (res.ok) {
      const json = await res.json();
      rawResponse = json.data || json;
      remoteExecuted = true;
    } else {
      rawResponse = { error: `HTTP ${res.status}` };
    }
  } catch (err) {
    return {
      ok: false,
      status: "OFFLINE",
      error: "ANDROID_NODE_UNREACHABLE",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (!remoteExecuted || !rawResponse) {
    return {
      ok: false,
      status: "TASK_FAILED",
      httpStatus: remoteHttpStatus,
      error: "EXECUTION_FAILED",
    };
  }

  // 4. Response Digest ve Task Witness Üretimi
  const responseDigest = sha256(canonicalJson(rawResponse));
  const taskWitnessId = "task-wit-" + sha256(canonicalJson({
    taskId,
    attestationWitnessId,
    requestDigest,
    responseDigest,
    previousWitnessHash,
  })).slice(0, 24);

  // 5. Evidence Ledger Entegrasyonu
  ledger.append({
    operation: "task.delegation.executed",
    http_status: remoteHttpStatus,
    success: true,
    response_data: {
      taskId,
      taskWitnessId,
      capability,
      sourceNodeId,
      targetNodeId,
      attestationWitnessId,
      requestDigest,
      responseDigest,
      rawTelemetry: rawResponse,
    },
    metadata: {
      operatorId,
      humanApproval: "GRANTED",
      remoteExecuted: true,
      remoteEndpoint: `${ANDROID_HOST}/read`,
      previousWitnessHash,
    },
  });

  const currentWitnessHash = ledger.getLatestWitnessHash();

  return {
    ok: true,
    status: "LIVE-HUMAN-APPROVED-EXECUTION-VERIFIED",
    taskId,
    taskWitnessId,
    humanApproval: "GRANTED",
    auth: "VERIFIED_READ_FACADE",
    sourceNode: sourceNodeId,
    targetNode: targetNodeId,
    capability,
    remoteHttpStatus,
    remoteExecuted: true,
    responseReceived: rawResponse,
    responseDigest,
    previousWitnessHash,
    currentWitnessHash,
    lineageBound: attestationWitnessId,
  };
}
