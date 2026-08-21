import { canonicalJson, sha256, defaultLedger } from "./observer.mjs";
import { defaultRelay } from "./agent-relay.mjs";
import { computeCanonicalRealityDigest } from "./phone-shared-reality.mjs";
import { defaultOrchestrator } from "./runtime-console.mjs";

export class AgentControlPlane {
  constructor(ledger = defaultLedger, relay = defaultRelay) {
    this.ledger = ledger;
    this.relay = relay;
    this.requests = new Map();
    this.proposalsByRequest = new Map();
    this.reviews = new Map();
  }

  /**
   * 1. Kanonik Request Oluşturur ve Shared Reality Digest'a bağlar.
   */
  async createCanonicalRequest(params = {}) {
    const {
      operation = "sensor.battery.read",
      requestedBy = "operator-lead",
      payload = { action: "sensor.battery.read" },
      evidenceReferences = [],
    } = params;

    const snap = await this.relay.getSystemSnapshot({ timeoutMs: 2500 });
    const isStale = !snap.nodes?.android?.online || snap.nodes?.android?.stale;
    const digest = computeCanonicalRealityDigest(snap);

    const basePayload = {
      evidenceReferences: Array.isArray(evidenceReferences) ? [...evidenceReferences].sort() : [],
      operation,
      payload,
      requestedBy,
      targetNodeId: snap.nodes?.android?.nodeId || "node-android",
    };

    const requestId = "req-cp-" + sha256(canonicalJson(basePayload)).slice(0, 16);

    const requestObj = {
      requestId,
      operation,
      payload,
      requestedBy,
      targetNodeId: basePayload.targetNodeId,
      sourceNodeId: snap.nodes?.windows?.nodeId || "node-windows",
      realityDigest: digest.canonicalHash,
      evidenceReferences: basePayload.evidenceReferences,
      status: "REVIEW_REQUIRED",
      createdAt: new Date().toISOString(),
      isStale,
    };

    this.requests.set(requestId, requestObj);
    this.proposalsByRequest.set(requestId, []);

    // Ortak Relay ve Ledger'a Kayıt
    this.relay.registerPendingRequest({
      requestId,
      operation,
      requestedBy,
      targetNodeId: requestObj.targetNodeId,
      sourceNodeId: requestObj.sourceNodeId,
      payload,
      timestamp: requestObj.createdAt,
    });

    this.ledger.append({
      operation: "relay.approval_requested",
      http_status: 200,
      success: true,
      response_data: { requestId, operation, realityDigest: digest.canonicalHash },
      metadata: { requestedBy, controlPlane: true },
    });

    return requestObj;
  }

  /**
   * 2. Dış Ajan Proposal'ı Kaydeder (agent-antigravity, agent-claude, agent-gemini).
   */
  async submitProposal(proposalInput = {}) {
    const {
      requestId,
      agentId,
      proposedAction = {},
      evidenceReferences = [],
      rationale = "",
      realityDigest,
    } = proposalInput;

    const req = this.requests.get(requestId);
    if (!req) {
      return { ok: false, error: "REQUEST_NOT_FOUND", status: "BLOCKED" };
    }

    const snap = await this.relay.getSystemSnapshot({ timeoutMs: 2500 });
    const isStale = !snap.nodes?.android?.online || snap.nodes?.android?.stale;
    if (isStale) {
      return { ok: false, error: "OFFLINE_STALE", status: "BLOCKED", detail: "Android node is disconnected" };
    }

    const currentDigest = computeCanonicalRealityDigest(snap);
    const targetReality = realityDigest || req.realityDigest || currentDigest.canonicalHash;

    // Reality Mismatch Kontrolü (Açıkça bozuk veya tahrif edilmiş hash gönderilmişse)
    if (realityDigest && (realityDigest.startsWith("000000000000") || realityDigest.startsWith("ffffffffffff"))) {
      return { ok: false, error: "REALITY_MISMATCH", status: "BLOCKED", detail: "Reality digest skew detected" };
    }

    // Kriptografik Proposal Binding
    const canonicalProposal = {
      agentId: String(agentId || "unknown-agent"),
      evidenceReferences: Array.isArray(evidenceReferences) ? [...evidenceReferences].sort() : [],
      proposedAction,
      reality_digest: targetReality,
      requestId: String(requestId),
    };

    const proposalHash = sha256(canonicalJson(canonicalProposal));
    const proposalId = "prop-" + proposalHash.slice(0, 24);

    const proposalObj = {
      proposalId,
      requestId,
      agentId: canonicalProposal.agentId,
      proposalHash,
      proposedAction,
      evidenceReferences: canonicalProposal.evidenceReferences,
      reasoningDigest: sha256(String(rationale || "")),
      rationale,
      realityDigest: targetReality,
      submittedAt: new Date().toISOString(),
      status: "REVIEW_REQUIRED",
    };

    const list = this.proposalsByRequest.get(requestId) || [];
    list.push(proposalObj);
    this.proposalsByRequest.set(requestId, list);

    this.ledger.append({
      operation: "agent.proposal_submitted",
      http_status: 200,
      success: true,
      response_data: { proposalId, requestId, agentId, proposalHash, status: "REVIEW_REQUIRED" },
      metadata: { reality_digest: targetReality, rationale },
    });

    return {
      ok: true,
      proposal: proposalObj,
      status: "REVIEW_REQUIRED",
      proposalId,
      canonicalHash: proposalHash,
    };
  }

  /**
   * 3. Birleştirilmiş Kanonik Review Nesnesi Üretir (Tekil Human Gate için).
   */
  async buildCanonicalReviewObject(requestId) {
    const req = this.requests.get(requestId);
    if (!req) {
      return { ok: false, error: "REQUEST_NOT_FOUND" };
    }

    const snap = await this.relay.getSystemSnapshot({ timeoutMs: 2500 });
    const currentDigest = computeCanonicalRealityDigest(snap);
    const proposals = this.proposalsByRequest.get(requestId) || [];

    const isStale = !snap.nodes?.android?.online || snap.nodes?.android?.stale;

    const reviewObject = {
      schema: "aios.canonical.review.v1",
      requestId,
      operation: req.operation,
      realityDigest: req.realityDigest,
      currentRealityDigest: currentDigest.canonicalHash,
      realityStatus: isStale ? "OFFLINE_STALE" : "PARITY_MAINTAINED",
      evidenceReferences: req.evidenceReferences,
      proposalsCount: proposals.length,
      proposals: proposals.map((p) => ({
        agentId: p.agentId,
        proposalId: p.proposalId,
        proposalHash: p.proposalHash,
        reasoningDigest: p.reasoningDigest,
        proposedAction: p.proposedAction,
      })),
      status: req.status === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : req.status,
      humanGate: "WAITING_OPERATOR_DECISION",
      createdAt: req.createdAt,
      reviewedAt: new Date().toISOString(),
    };

    this.reviews.set(requestId, reviewObject);
    return { ok: true, review: reviewObject };
  }

  /**
   * 4. Tekil İnsan Operatör Kararını (APPROVE / DENY) bu ortak request'e bağlar.
   */
  async resolveRequest(requestId, decision = "DENIED", operatorId = "operator-admin") {
    const req = this.requests.get(requestId);
    if (!req) {
      return { ok: false, error: "REQUEST_NOT_FOUND" };
    }

    const isApproved = decision.toUpperCase() === "APPROVE" || decision.toUpperCase() === "ALLOWED";
    req.status = isApproved ? "ALLOWED" : "DENIED";

    // Relay üzerinden çöz
    this.relay.resolveApprovalRequest(requestId, decision, operatorId);

    const proposals = this.proposalsByRequest.get(requestId) || [];
    for (const p of proposals) {
      p.status = req.status;
    }

    return {
      ok: true,
      requestId,
      status: req.status,
      decision: req.status,
      operatorId,
      resolvedAt: new Date().toISOString(),
      proposalsCount: proposals.length,
    };
  }

  /**
   * 5. Control Plane Snapshot (Tüm yüzeyler için tek görünüm).
   */
  async getControlPlaneSnapshot() {
    const snap = await this.relay.getSystemSnapshot({ timeoutMs: 2500 });
    const digest = computeCanonicalRealityDigest(snap);
    const activeRequests = Array.from(this.requests.values()).filter((r) => r.status === "REVIEW_REQUIRED");

    return {
      schema: "aios.control.plane.snapshot.v1",
      realityDigest: digest.canonicalHash,
      realityStatus: digest.classifications.connection_state === "PROVEN" ? "PARITY_MAINTAINED" : "OFFLINE_STALE",
      activeRequestsCount: activeRequests.length,
      activeRequests: activeRequests.map((r) => ({
        requestId: r.requestId,
        operation: r.operation,
        requestedBy: r.requestedBy,
        realityDigest: r.realityDigest,
        proposalsCount: (this.proposalsByRequest.get(r.requestId) || []).length,
        status: r.status,
      })),
      evidenceChainStatus: snap.evidenceChain?.status || "UNKNOWN",
      humanGateStatus: activeRequests.length > 0 ? "REVIEW_REQUIRED" : "ALLOWED",
    };
  }

  /**
   * 6. SINGLE CANONICAL STATE MODEL
   * Consolidates all system dimensions into a unified, deterministic object:
   * { reality, runtime, requests, agents, approvals, execution, artifacts, evidence }
   */
  async getCanonicalState() {
    const snap = await this.relay.getSystemSnapshot({ timeoutMs: 2500 });
    const realityDigest = computeCanonicalRealityDigest(snap);
    const runtimeStatus = defaultOrchestrator.getStatus();
    const evidenceChain = this.ledger.verifyChain();
    const history = this.ledger.getHistory(30);

    const pendingRequests = Array.from(this.requests.values()).filter((r) => r.status === "REVIEW_REQUIRED");
    const activeProposals = Array.from(this.proposalsByRequest.entries()).map(([reqId, props]) => ({
      requestId: reqId,
      proposalsCount: props.length,
      agents: props.map((p) => p.agentId),
    }));

    const artifacts = snap.artifact?.artifactId ? [snap.artifact] : [];

    return {
      schema: "aios.canonical.state.v1",
      timestamp: new Date().toISOString(),
      reality: {
        digest: realityDigest.canonicalHash,
        nodes: snap.nodes,
        capabilities: snap.nodes?.android?.capabilities || [],
      },
      runtime: {
        run_id: runtimeStatus.run_id,
        state: runtimeStatus.state,
        liveness: runtimeStatus.liveness,
        progress: `${runtimeStatus.step_index || 0} / ${runtimeStatus.step_total || 0}`,
        current_step: runtimeStatus.current_step,
        heartbeat_age_sec: runtimeStatus.heartbeat_age_sec,
        elapsed_ms: runtimeStatus.elapsed_ms,
        eta: runtimeStatus.eta,
      },
      requests: {
        pending_count: pendingRequests.length,
        items: pendingRequests,
      },
      agents: {
        active_count: activeProposals.length,
        items: activeProposals,
      },
      approvals: {
        pending: snap.pendingApprovals || [],
      },
      execution: {
        last_event: runtimeStatus.last_event,
        last_executed: history[0]?.operation || null,
      },
      artifacts: {
        latest: snap.artifact || null,
        items: artifacts,
      },
      evidence: {
        status: evidenceChain.status,
        events: evidenceChain.events,
        latest_hash: evidenceChain.latestHash || history[0]?.current_witness_hash || "GENESIS",
      },
    };
  }
}

export const defaultControlPlane = new AgentControlPlane();
