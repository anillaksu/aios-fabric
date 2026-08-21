// AIOS Agent Relay & Human Approval Control Engine
import { canonicalJson, sha256, defaultLedger } from "./observer.mjs";
import {
  calculateNodeIdentity,
  computeCapabilityIntersection,
  isNodeRevoked,
} from "./attestation.mjs";
import { createDistributedArtifact } from "./distributed-artifact.mjs";
import { sendA2AMessage } from "./a2a-client.mjs";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANDROID_HOST = process.env.AIOS_ANDROID_URL || "http://100.75.177.88:9300";
const WINDOWS_HOST = process.env.AIOS_WINDOWS_URL || "http://127.0.0.1:9310";

export class AgentRelay {
  constructor(ledger = defaultLedger) {
    this.ledger = ledger;
    this.pendingApprovals = new Map();
    this.nodeStateCache = new Map();
  }

  /**
   * KURAL 1 & KURAL 7: MCP ve Evidence Bus üzerinden sistemin tam kanonik durumunu okur.
   */
  async getSystemSnapshot(options = {}) {
    const timeoutMs = options.timeoutMs || 3000;
    const now = new Date().toISOString();

    // 1. Android Düğüm Durumu
    let androidData = null;
    let androidOnline = false;
    try {
      const cardRes = await fetch(`${ANDROID_HOST}/.well-known/agent-card.json`, { signal: AbortSignal.timeout(timeoutMs) });
      const statusRes = await fetch(`${ANDROID_HOST}/runtime-status`, { signal: AbortSignal.timeout(timeoutMs) });
      const capsRes = await fetch(`${ANDROID_HOST}/capabilities`, { signal: AbortSignal.timeout(timeoutMs) });

      if (cardRes.ok && statusRes.ok && capsRes.ok) {
        const card = await cardRes.json();
        const status = await statusRes.json();
        const caps = await capsRes.json();
        androidOnline = true;
        const nodeId = calculateNodeIdentity({
          platform: "android",
          arch: "arm64",
          agentName: card.name,
          agentVersion: card.version,
          endpoint: ANDROID_HOST,
        });
        androidData = {
          nodeId,
          online: true,
          agentName: card.name,
          agentVersion: card.version,
          endpoint: ANDROID_HOST,
          services: status.services || [],
          capabilitiesCount: Array.isArray(caps) ? caps.length : 0,
          capabilities: caps,
          lastSeen: now,
          stale: false,
        };
      }
    } catch {
      androidData = {
        nodeId: "node-android-unknown",
        online: false,
        stale: true,
        lastSeen: null,
        error: "NODE_DISCONNECTED",
      };
    }

    // 2. Windows Düğüm Durumu
    const windowsNodeId = calculateNodeIdentity({
      platform: "win32",
      arch: "x64",
      agentName: "AIOS Windows Control Surface",
      agentVersion: "0.1.0",
      endpoint: WINDOWS_HOST,
    });

    const windowsData = {
      nodeId: windowsNodeId,
      platform: "win32",
      agentName: "AIOS Windows Control Surface",
      agentVersion: "0.1.0",
      endpoint: WINDOWS_HOST,
      online: true,
      lastSeen: now,
      stale: false,
    };

    // 3. Evidence Chain Bütünlüğü
    const chainStatus = this.ledger.verifyChain();

    // 4. En Son Dağıtık / Production Artifact
    let latestArtifact = null;
    const prodArtifactPath = resolve(__dirname, "artifacts", "first_production_loop_artifact.json");
    const distArtifactPath = resolve(__dirname, "artifacts", "first_distributed_artifact.json");
    const targetPath = existsSync(prodArtifactPath) ? prodArtifactPath : distArtifactPath;
    if (existsSync(targetPath)) {
      try {
        latestArtifact = JSON.parse(readFileSync(targetPath, "utf8"));
      } catch {
        latestArtifact = null;
      }
    }

    // 5. Yetenek Kesişim Kümesi (A ∩ B)
    const windowsCaps = [
      { name: "sensor.battery.read", class: "REFLEX", risk: "safe" },
      { name: "wifi.info", class: "REFLEX", risk: "safe" },
      { name: "volume.read", class: "REFLEX", risk: "safe" },
      { name: "a2a.delegate", class: "AGENT", risk: "ask" },
      { name: "system.info", class: "REFLEX", risk: "safe" },
    ];
    const androidCaps = androidData?.capabilities || [];
    const intersection = computeCapabilityIntersection(windowsCaps, androidCaps);

    const activePending = this.getPendingApprovals();

    return {
      timestamp: now,
      nodes: {
        windows: windowsData,
        android: androidData,
      },
      attestation: {
        intersectionHash: intersection.intersectionHash,
        allowedCapabilities: intersection.commonCapabilities,
        latestWitnessId: latestArtifact?.attestation_witness || latestArtifact?.attestation_witness_id || "GENESIS",
      },
      artifact: latestArtifact
        ? {
            artifactId: latestArtifact.artifact_id,
            artifactSha256: latestArtifact.artifact_sha256,
            lineageWitnessId: latestArtifact.created_from_witness || latestArtifact.attestation_witness || latestArtifact.attestation_witness_id || latestArtifact.lineage?.attestation || "GENESIS",
            humanApproved: latestArtifact.human_approval?.status === "GRANTED",
            policyResult: "ALLOWED",
          }
        : null,
      evidenceChain: chainStatus,
      pendingApprovals: activePending,
    };
  }

  /**
   * Tüm motorlardan (Continuous Observer, Task Delegation, Relay) gelen
   * kanonik talepleri tek havuzda kaydeder.
   */
  registerPendingRequest(params = {}) {
    const approvalId = params.requestId || params.approvalId;
    const request = {
      approvalId,
      requestId: approvalId,
      operation: params.operation || params.purpose || "artifact.production",
      targetNodeId: params.targetNodeId || "node-android",
      sourceNodeId: params.sourceNodeId || "node-windows",
      payload: params.payload || {},
      risk: params.risk || "ask",
      requestedBy: params.requestedBy || "continuous-observer",
      timestamp: params.timestamp || new Date().toISOString(),
      status: "REVIEW_REQUIRED",
      decision: null,
      resolvedAt: null,
      resolvedBy: null,
    };
    this.pendingApprovals.set(approvalId, request);
    return request;
  }

  /**
   * Hem bellek içi hem de Evidence Ledger'daki aktif REVIEW_REQUIRED taleplerini listeler.
   */
  getPendingApprovals() {
    return Array.from(this.pendingApprovals.values()).filter((a) => a.status === "REVIEW_REQUIRED");
  }

  /**
   * KURAL 3: Human Approval Talebi Oluşturur (REVIEW_REQUIRED).
   */
  createApprovalRequest(params = {}) {
    const { operation, targetNodeId, payload = {}, risk = "ask", requestedBy = "agent-relay" } = params;

    const timestamp = new Date().toISOString();
    const approvalId = "appr-" + sha256(canonicalJson({ operation, payload, targetNodeId, timestamp })).slice(0, 16);

    const request = {
      approvalId,
      requestId: approvalId,
      operation,
      targetNodeId,
      payload,
      risk,
      requestedBy,
      timestamp,
      status: "REVIEW_REQUIRED",
      decision: null,
      resolvedAt: null,
      resolvedBy: null,
    };

    this.pendingApprovals.set(approvalId, request);

    this.ledger.append({
      operation: "relay.approval_requested",
      http_status: 200,
      success: true,
      response_data: { approvalId, operation, targetNodeId },
      metadata: { risk, requestedBy },
    });

    return request;
  }

  /**
   * KURAL 3: Ortak İnsan Operatör Kararı (APPROVE / DENY).
   * Phone, Windows ve MCP yüzeylerinden gelen tüm kararları bu ortak request'e bağlar.
   */
  resolveApprovalRequest(approvalId, decision = "DENIED", operatorId = "operator-admin") {
    let request = this.pendingApprovals.get(approvalId);

    // Eğer bellek içinde yoksa, defterdeki son olaydan talep oluştur
    if (!request) {
      request = {
        approvalId,
        requestId: approvalId,
        operation: "artifact.production",
        targetNodeId: "node-android",
        status: "REVIEW_REQUIRED",
      };
      this.pendingApprovals.set(approvalId, request);
    }

    const isApproved = decision.toUpperCase() === "APPROVE" || decision.toUpperCase() === "ALLOWED" || decision.toUpperCase() === "GRANTED";
    request.status = isApproved ? "ALLOWED" : "DENIED";
    request.decision = isApproved ? "ALLOWED" : "DENIED";
    request.resolvedAt = new Date().toISOString();
    request.resolvedBy = operatorId;

    this.ledger.append({
      operation: isApproved ? "artifact.production.approved" : "artifact.production.denied",
      http_status: isApproved ? 200 : 403,
      success: isApproved,
      response_data: { approvalId, requestId: approvalId, decision: request.status, operatorId },
      metadata: { resolvedAt: request.resolvedAt, crossSurfaceResolved: true },
    });

    return { ok: true, request };
  }

  /**
   * KURAL 3 & 8: Onaylanmış eylemi doğrular ve icra kapısına iletir (Fail-Closed).
   */
  async executeApprovedAction(approvalId, actionFn) {
    const request = this.pendingApprovals.get(approvalId);
    if (!request) {
      return { ok: false, error: "APPROVAL_REQUEST_NOT_FOUND" };
    }

    if (request.status !== "ALLOWED") {
      return {
        ok: false,
        error: "HUMAN_APPROVAL_MISSING",
        detail: `Eylem durumu '${request.status}' — İnsan operatör onayı olmadan icra edilemez (Fail-Closed).`,
      };
    }

    if (isNodeRevoked(request.targetNodeId)) {
      return { ok: false, error: "NODE_REVOKED", detail: "Hedef düğüm iptal listesindedir." };
    }

    try {
      const result = await actionFn(request.payload);
      this.ledger.append({
        operation: "relay.action_executed",
        http_status: 200,
        success: true,
        response_data: { approvalId, operation: request.operation, resultDigest: sha256(canonicalJson(result || {})) },
        metadata: { targetNodeId: request.targetNodeId },
      });
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: "ACTION_EXECUTION_FAILED", detail: err instanceof Error ? err.message : String(err) };
    }
  }
}

export const defaultRelay = new AgentRelay();
