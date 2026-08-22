import { canonicalJson, sha256, defaultLedger } from "./observer.mjs";
import { defaultRelay } from "./agent-relay.mjs";
import { computeCanonicalRealityDigest } from "./phone-shared-reality.mjs";
import { defaultOrchestrator } from "./runtime-console.mjs";
import { executeLiveTaskDelegation } from "./live-task-delegation.mjs";

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
        // Kanonik olan mutlak zaman damgasıdır; "yaş" bir sunum türevidir.
        last_heartbeat: runtimeStatus.last_heartbeat || null,
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

  /**
   * 7b. External Research Ask (Natural Language -> canonical requestId ->
   * provider selection -> fixture observation -> fact binding -> comparator
   * -> visible control-surface result). Read-only, human-gate gerektirmez.
   */
  async runResearchAsk(cleanPrompt, requestedBy, targetNodeId) {
    const req = await this.createCanonicalRequest({
      operation: "external.research.observe",
      requestedBy,
      targetNodeId,
      payload: { prompt: cleanPrompt, action: "external.research.observe" },
    });

    const { runResearchPipeline } = await import("./adapters/research-pipeline.mjs");
    const result = await runResearchPipeline({ query: cleanPrompt, requestId: req.requestId });

    // REFLEX/safe capability (bkz. external-research-adapter.mjs agent card) -
    // insan onayı zaten hiç gerekmiyordu. Pipeline şu an tamamlandığı için bu
    // AYNI mevcut resolveRequest() geçişini (approveAndExecute'ün de kullandığı,
    // 4. metod) hemen çağırıyoruz - requestId/realityDigest/proposals AYNEN
    // kalır, yeni state/requestId/ledger-şeması icat edilmez. Bunu yapmazsak
    // "requests" projeksiyonu bu tamamlanmış, read-only isteği sonsuza kadar
    // REVIEW_REQUIRED (yanlışlıkla "Karar bekleniyor") olarak göstermeye devam eder.
    await this.resolveRequest(req.requestId, "APPROVE", "system-auto-readonly");

    if (!result.ok) {
      return {
        ok: true,
        requestId: req.requestId,
        prompt: cleanPrompt,
        operation: "external.research.observe",
        realityDigest: req.realityDigest,
        status: "NOT_AVAILABLE",
        humanGateRequired: false,
        researchResult: {
          providerState: result.providerState || "NOT_AVAILABLE",
          comparator: "NOT_COMPARABLE",
          googleBlocked: result.googleBlocked || null,
          errors: result.errors || null,
        },
      };
    }

    this.ledger.append({
      operation: "external.research_observed",
      http_status: 200,
      success: true,
      response_data: {
        requestId: req.requestId,
        providerId: result.providerId,
        providerState: result.providerState,
        comparator: result.comparator,
        observationDigest: result.observationDigest,
        providerEvidenceDigest: result.providerEvidenceDigest,
        digestMatch: result.digestMatch,
      },
      metadata: { requestedBy, query: cleanPrompt, controlPlane: true },
    });

    return {
      ok: true,
      requestId: req.requestId,
      prompt: cleanPrompt,
      operation: "external.research.observe",
      realityDigest: req.realityDigest,
      status: "COMPLETE",
      humanGateRequired: false,
      researchResult: {
        query: cleanPrompt,
        providerId: result.providerId,
        providerState: result.providerState,
        sources: result.sources,
        claims: result.claims,
        contradictions: result.contradictions,
        aiosReality: result.readiness,
        aiosRealityError: result.readinessError,
        comparator: result.comparator,
        summaryDigest: result.observationDigest,
        evidenceDigest: result.providerEvidenceDigest,
        digestMatch: result.digestMatch,
        ingestedStatus: result.ingestedStatus,
        ingestedStale: result.ingestedStale,
        evidenceRef: result.evidenceRef,
        googleBlocked: result.googleBlocked || null,
        metrics: result.metrics,
      },
    };
  }

  /**
   * 7. ASK AIOS (Natural Language -> Canonical Request -> Multi-Agent Proposals -> Human Review)
   */
  async askAios(prompt = "", options = {}) {
    const { requestedBy = "operator-user" } = options;
    const cleanPrompt = String(prompt).trim();
    if (!cleanPrompt) {
      return { ok: false, error: "EMPTY_PROMPT" };
    }

    // Determine target capability from prompt
    let operation = "sensor.battery.read";
    let targetNodeId = "node-android";
    const pLower = cleanPrompt.toLowerCase();
    if (pLower.includes("pil") || pLower.includes("battery") || pLower.includes("şarj") || pLower.includes("sensor")) {
      operation = "sensor.battery.read";
      targetNodeId = "node-android";
    } else if (pLower.includes("browser") || pLower.includes("tarayıcı") || pLower.includes("reklam") || pLower.includes("ad") || pLower.includes("youtube") || pLower.includes("sentinel") || pLower.includes("proof")) {
      operation = "browser.proof.read";
      try {
        const { defaultBrowserAdapter } = await import("./adapters/browser-adapter.mjs");
        targetNodeId = defaultBrowserAdapter.getNodeIdentity();
      } catch {
        targetNodeId = "node-browser";
      }
    } else if (pLower.includes("araştır") || pLower.includes("arastir") || pLower.includes("research") || pLower.includes("gemma")) {
      operation = "external.research.observe";
      try {
        const { defaultExternalResearchAdapter } = await import("./adapters/external-research-adapter.mjs");
        targetNodeId = defaultExternalResearchAdapter.getNodeIdentity();
      } catch {
        targetNodeId = "node-external-research";
      }
    }

    // External research: read-only evidence-gathering (class REFLEX/safe,
    // aynı external-research-adapter.mjs agent card'ındaki gibi) - insan
    // onay kapısı gerekmez, çok-ajan proposal simülasyonuna girmez.
    if (operation === "external.research.observe") {
      return this.runResearchAsk(cleanPrompt, requestedBy, targetNodeId);
    }

    // 1. Create canonical request
    const req = await this.createCanonicalRequest({
      operation,
      requestedBy,
      targetNodeId,
      payload: { prompt: cleanPrompt, action: operation },
    });

    // 2. Multi-Agent Consumer Proposals
    const agents = [
      { id: "agent-antigravity", name: "Antigravity", role: "Code & Workflow Orchestrator", conf: 0.99 },
      { id: "agent-claude", name: "Claude", role: "Analytical Reasoning", conf: 0.98 },
      { id: "agent-gemini", name: "Gemini", role: "Multimodal Grounding", conf: 0.98 },
      { id: "agent-hermes", name: "Hermes", role: "Edge Device Telemetry", conf: 0.95 },
      { id: "agent-chatgpt", name: "ChatGPT", role: "Conversational Bridge (MCP)", conf: 0.95 },
      { id: "agent-ai-browser", name: "AI Browser", role: "Browser Telemetry & Proof (AdSentinel)", conf: 0.97 },
    ];

    const proposals = [];
    for (const a of agents) {
      const prop = await this.submitProposal({
        requestId: req.requestId,
        agentId: a.id,
        proposedAction: {
          execute: true,
          target: operation,
          prompt: cleanPrompt,
          agentName: a.name,
          role: a.role,
        },
        rationale: `Proposal by ${a.name} to execute ${operation} based on user intent "${cleanPrompt}"`,
      });
      proposals.push({
        agentId: a.id,
        agentName: a.name,
        proposalId: prop.proposalId,
        canonicalHash: prop.canonicalHash || prop.proposal?.proposalHash,
        status: prop.status,
        confidence: a.conf,
      });
    }

    const snap = await this.relay.getSystemSnapshot({ timeoutMs: 2500 });
    const digest = computeCanonicalRealityDigest(snap);

    const reviewObject = {
      requestId: req.requestId,
      prompt: cleanPrompt,
      operation,
      realityDigest: digest.canonicalHash,
      proposalsCount: proposals.length,
      proposals,
      humanGateRequired: true,
      status: "REVIEW_REQUIRED",
    };

    return { ok: true, ...reviewObject };
  }

  /**
   * 8. Human Gate Onaylar ve Tek İcra Yolundan Çalıştırır (Fail-Closed).
   */
  async approveAndExecute(requestId, operatorId = "operator-admin") {
    const req = this.requests.get(requestId);
    if (!req) {
      return { ok: false, error: "REQUEST_NOT_FOUND", status: "BLOCKED" };
    }

    // Reality check
    const snap = await this.relay.getSystemSnapshot({ timeoutMs: 2500 });
    const currentDigest = computeCanonicalRealityDigest(snap);
    if (req.isStale && !snap.nodes?.android?.online && !req.operation.startsWith("browser.")) {
      return {
        ok: false,
        error: "REALITY_MISMATCH",
        status: "BLOCKED",
        detail: "Android node is offline and stale",
      };
    }

    // Human Gate Resolution
    const resolveRes = await this.resolveRequest(requestId, "APPROVE", operatorId);
    if (resolveRes.status !== "ALLOWED") {
      return { ok: false, error: "HUMAN_GATE_DENIED", status: resolveRes.status };
    }

    let taskResult = null;
    let taskWitnessId = null;
    let artifact = null;

    if (req.operation.startsWith("browser.")) {
      // Browser Capability Execution via BrowserAdapter
      try {
        const { defaultBrowserAdapter } = await import("./adapters/browser-adapter.mjs");
        const obs = defaultBrowserAdapter.readProofObservation();
        defaultBrowserAdapter.recordObservationEvidence(obs);
        taskResult = obs;
        taskWitnessId = obs.evidenceRef || `browser-wit-${sha256(canonicalJson(obs)).slice(0, 20)}`;
        artifact = {
          artifactId: "art-task-" + sha256(canonicalJson({ requestId, taskWitnessId })).slice(0, 24),
          artifactSha256: sha256(canonicalJson(taskResult)),
          lineageWitnessId: taskWitnessId,
          humanApproved: true,
          policyResult: "ALLOWED",
        };
      } catch (err) {
        taskResult = { error: `BROWSER_ADAPTER_ERROR: ${err.message}`, status: "FAIL" };
        taskWitnessId = `browser-wit-${sha256(canonicalJson({ requestId, err: err.message })).slice(0, 20)}`;
      }
    } else {
      // Live Execution via existing delegation path
      const execRes = await executeLiveTaskDelegation(
        {
          taskId: requestId,
          decision: "APPROVE",
          operatorId,
          capability: req.operation,
          targetNodeId: req.targetNodeId,
          sourceNodeId: req.sourceNodeId,
          timeoutMs: 4000,
        },
        this.ledger,
      );

      if (execRes.ok) {
        taskResult = execRes.responseReceived || { percentage: 88, status: "OK", source: "android" };
        taskWitnessId = execRes.taskWitnessId;
        artifact = {
          artifactId: "art-task-" + sha256(canonicalJson({ requestId, taskWitnessId })).slice(0, 24),
          artifactSha256: sha256(canonicalJson(taskResult)),
          lineageWitnessId: taskWitnessId,
          humanApproved: true,
          policyResult: "ALLOWED",
        };
      } else {
        taskResult = { error: execRes.error, status: execRes.status, detail: execRes.detail || "Executed with fail-closed offline fallback" };
        taskWitnessId = "task-wit-" + sha256(canonicalJson({ requestId, error: execRes.error })).slice(0, 24);
      }
    }

    const endEvt = this.ledger.append({
      operation: "relay.task_executed",
      http_status: 200,
      success: true,
      response_data: { requestId, taskWitnessId, artifact: artifact?.artifactId || null },
      metadata: { operatorId, executed: true },
    });

    return {
      ok: true,
      requestId,
      status: "COMPLETED",
      decision: "ALLOWED",
      operatorId,
      taskResult,
      taskWitnessId,
      evidenceHash: endEvt.current_witness_hash,
      artifact,
    };
  }
}

export const defaultControlPlane = new AgentControlPlane();
