import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalJson, sha256, defaultLedger } from "../observer.mjs";
import { calculateNodeIdentity } from "../attestation.mjs";

const DEFAULT_PROOF_PATH = "D:\\dev\\ai_browser\\proof\\latest.json";
const STALE_TTL_MS = 60 * 60 * 1000; // 1 saat

export class BrowserAdapter {
  constructor(options = {}) {
    this.proofPath = options.proofPath || DEFAULT_PROOF_PATH;
    this.ledger = options.ledger || defaultLedger;
    this.staleTtlMs = options.staleTtlMs || STALE_TTL_MS;
  }

  /**
   * Deterministik Browser Node Identity hesaplar (Tek kanonik standart).
   */
  getNodeIdentity() {
    return calculateNodeIdentity({
      agentName: "ai_browser",
      agentVersion: "2.0.0",
      arch: "x64",
      endpoint: "browser://chromium/adsentinel",
      platform: "browser",
    });
  }

  /**
   * A2A Agent Card Standard (/.well-known/agent-card.json).
   */
  getAgentCard() {
    const nodeId = this.getNodeIdentity();
    return {
      protocolVersion: "1.0",
      name: "ai_browser",
      version: "2.0.0",
      nodeId,
      platform: "browser",
      runtime: "chromium",
      url: "browser://chromium/adsentinel",
      skills: [
        {
          id: "skill-ad-suppression",
          name: "YouTube Ad Suppression & Telemetry",
          description: "Suppresses video and cosmetic ads with deterministically verified telemetry",
        },
      ],
      capabilities: [
        { name: "browser.telemetry.read", class: "REFLEX", risk: "safe" },
        { name: "browser.proof.read", class: "REFLEX", risk: "safe" },
      ],
    };
  }

  /**
   * proof/latest.json dosyasını okur, doğrular ve kanonik gözlem nesnesine çevirir.
   */
  readProofObservation(customProof = null) {
    const nodeId = this.getNodeIdentity();
    let proof = customProof;

    if (!proof) {
      if (!existsSync(this.proofPath)) {
        return {
          ok: false,
          status: "NOT_PROVEN",
          verdict: "NOT_PROVEN",
          error: "PROOF_FILE_NOT_FOUND",
          sourceNode: nodeId,
          observedAt: new Date().toISOString(),
        };
      }
      try {
        const raw = readFileSync(this.proofPath, "utf8");
        proof = JSON.parse(raw);
      } catch (err) {
        return {
          ok: false,
          status: "NOT_PROVEN",
          verdict: "NOT_PROVEN",
          error: `PROOF_PARSE_ERROR: ${err.message}`,
          sourceNode: nodeId,
          observedAt: new Date().toISOString(),
        };
      }
    }

    // 1. Schema Validation
    if (!proof || proof.schema !== "adsentinel.proof/1") {
      return {
        ok: false,
        status: "NOT_PROVEN",
        verdict: "NOT_PROVEN",
        error: "INVALID_PROOF_SCHEMA",
        sourceNode: nodeId,
        observedAt: new Date().toISOString(),
      };
    }

    // 2. TTL & Stale Kontrolü
    const generatedTimestamp = new Date(proof.generatedAt || 0).getTime();
    const ageMs = Date.now() - generatedTimestamp;
    const isStale = ageMs > this.staleTtlMs;

    // 3. Canonical Serialization & SHA-256 Digest
    const canonicalPayload = {
      browser_engine: proof.browser?.engine || "chromium",
      browser_version: proof.browser?.version || "unknown",
      counts: proof.counts || { passed: 0, failed: 0, total: 0 },
      extension_id: proof.extension?.id || "unknown",
      generated_at: proof.generatedAt || "unknown",
      mode: proof.mode || "unknown",
      schema: proof.schema,
      verdict: proof.verdict || "UNKNOWN",
    };
    const proofDigest = sha256(canonicalJson(canonicalPayload));

    // 3b. Evidence Canonical Serialization & SHA-256 Digest (proofDigest'ten BAĞIMSIZ,
    // yalnızca gerçekten kanıt taşıyan alanlardan: checks + crash.message).
    // generatedAt/timeline/samples1/consoleTail/adNetwork/host kasıtlı olarak dışarıda.
    const evidencePayload = {
      schema: proof.schema,
      mode: proof.mode || "unknown",
      checks: (proof.checks || []).map((c) => ({
        id: c.id,
        pass: c.pass,
        detail: c.detail ?? null,
      })),
      crash: proof.crash ? { message: proof.crash.message } : null,
    };
    const proofEvidenceDigest = sha256(canonicalJson(evidencePayload));

    // 4. Status Sınıflandırması
    let status = "PROVEN";
    if (isStale) {
      status = "STALE";
    } else if (proof.verdict === "INCONCLUSIVE") {
      status = "INCONCLUSIVE";
    } else if (proof.verdict === "FAIL" || proof.verdict === "ERROR") {
      status = "FAIL";
    } else if (proof.verdict === "PASS") {
      status = "PROVEN";
    } else {
      status = "NOT_PROVEN";
    }

    // 5. Evidence Witness Reference
    const witnessId = `browser-wit-${proofDigest.slice(0, 20)}`;

    const observation = {
      ok: true,
      status,
      verdict: proof.verdict,
      mode: proof.mode,
      proofDigest,
      proofEvidenceDigest,
      counts: proof.counts,
      generatedAt: proof.generatedAt,
      observedAt: new Date().toISOString(),
      ageMs,
      stale: isStale,
      sourceNode: nodeId,
      extensionId: proof.extension?.id,
      browserVersion: proof.browser?.version,
      evidenceRef: witnessId,
    };

    return observation;
  }

  /**
   * Browser gözlemini tek EvidenceLedger zincirine kaydeder.
   */
  recordObservationEvidence(observation) {
    if (!observation || !observation.ok) return null;

    const event = {
      operation: "browser.proof_observed",
      http_status: 200,
      success: true,
      response_data: {
        nodeId: observation.sourceNode,
        verdict: observation.verdict,
        proofDigest: observation.proofDigest,
        proofEvidenceDigest: observation.proofEvidenceDigest,
        counts: observation.counts,
        evidenceRef: observation.evidenceRef,
        stale: observation.stale,
      },
      metadata: {
        source: "ai_browser",
        mode: observation.mode,
        observedAt: observation.observedAt,
      },
    };

    this.ledger.append(event);
    return observation.evidenceRef;
  }

  /**
   * A2A Inbound Message Dispatcher (Sadece Read Capability).
   * Token/Secret asla loglanmaz.
   */
  async handleA2AMessage(a2aRequest = {}) {
    const { method, params = {} } = a2aRequest;

    if (method === "agent/card" || method === "agent.card") {
      return {
        jsonrpc: "2.0",
        result: this.getAgentCard(),
      };
    }

    const capability = params.capability || params.operation;
    const allowedCaps = ["browser.telemetry.read", "browser.proof.read"];

    // Bilinmeyen veya mutation capability reddi (Fail-Closed)
    if (!allowedCaps.includes(capability)) {
      return {
        jsonrpc: "2.0",
        error: {
          code: -32601,
          message: `UNKNOWN_OR_DISALLOWED_CAPABILITY: ${capability || "NONE"}. ai_browser is strictly read-only.`,
        },
      };
    }

    const observation = this.readProofObservation(params.customProof);
    this.recordObservationEvidence(observation);

    return {
      jsonrpc: "2.0",
      result: {
        parts: [
          { text: `AdSentinel Proof Verdict: ${observation.verdict} (${observation.status})` },
          { data: observation },
        ],
      },
    };
  }
}

export const defaultBrowserAdapter = new BrowserAdapter();
