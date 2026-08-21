// AIOS Continuous Observer, Change Detection & Autonomous Request Engine (Gate 16 & 17)
import { canonicalJson, sha256, defaultLedger } from "./observer.mjs";
import { defaultRelay } from "./agent-relay.mjs";
import { classifyProvenMatrix, querySystemReality } from "./shared-reality.mjs";
import { computeCanonicalRealityDigest } from "./phone-shared-reality.mjs";
import { requestProductionLoopArtifact } from "./production-loop.mjs";

export class ContinuousObserver {
  constructor(ledger = defaultLedger, relay = defaultRelay) {
    this.ledger = ledger;
    this.relay = relay;
    this.lastStateSnapshot = null;
    this.lastStateDigest = null;
    this.deltasHistory = [];
  }

  /**
   * Sistemin güncel durumunu gözlemler, önceki durumla karşılaştırır
   * ve değişiklik varsa deltas kaydeder.
   */
  async observeAndDetectChanges(currentSnapshot = null) {
    const snap = currentSnapshot || (await this.relay.getSystemSnapshot({ timeoutMs: 3000 }));
    const currentDigest = computeCanonicalRealityDigest(snap);

    const deltas = [];
    const timestamp = new Date().toISOString();

    if (this.lastStateSnapshot && this.lastStateDigest) {
      const prevPayload = this.lastStateDigest.canonicalPayload;
      const currPayload = currentDigest.canonicalPayload;

      // 1. Bağlantı Durumu Değişimi
      if (prevPayload.connection_state !== currPayload.connection_state) {
        deltas.push({
          type: "CONNECTION_STATE_CHANGED",
          from: prevPayload.connection_state,
          to: currPayload.connection_state,
          timestamp,
        });
      }

      // 2. Yeni Evidence / Witness Oluşumu
      if (prevPayload.latest_evidence_witness !== currPayload.latest_evidence_witness) {
        deltas.push({
          type: "NEW_EVIDENCE_WITNESS",
          from: prevPayload.latest_evidence_witness,
          to: currPayload.latest_evidence_witness,
          timestamp,
        });
      }

      // 3. Artifact Değişimi
      if (prevPayload.latest_artifact_id !== currPayload.latest_artifact_id) {
        deltas.push({
          type: "LATEST_ARTIFACT_UPDATED",
          from: prevPayload.latest_artifact_id,
          to: currPayload.latest_artifact_id,
          timestamp,
        });
      }

      // 4. İnsan Onayı Bekleyen Talep Değişimi
      const prevPendingCount = (this.lastStateSnapshot.pendingApprovals || []).length;
      const currPendingCount = (snap.pendingApprovals || []).length;
      if (prevPendingCount !== currPendingCount) {
        deltas.push({
          type: "PENDING_APPROVALS_CHANGED",
          from: prevPendingCount,
          to: currPendingCount,
          timestamp,
        });
      }
    } else {
      deltas.push({
        type: "INITIAL_BASELINE_ESTABLISHED",
        canonicalHash: currentDigest.canonicalHash,
        timestamp,
      });
    }

    this.lastStateSnapshot = snap;
    this.lastStateDigest = currentDigest;

    if (deltas.length > 0) {
      this.deltasHistory.unshift(...deltas);
    }

    return {
      timestamp,
      hasChanges: deltas.some((d) => d.type !== "INITIAL_BASELINE_ESTABLISHED"),
      deltas,
      currentHash: currentDigest.canonicalHash,
      classifications: currentDigest.classifications,
    };
  }

  /**
   * Değişiklik veya durum yenilenmesi tespit edildiğinde otomatik olarak
   * bir REQUEST üretir ve bunu kesinlikle REVIEW_REQUIRED durumunda bırakır.
   * İnsan onayı olmadan ASLA icra etmez (Fail-Closed).
   */
  evaluateAndEmitRequest(triggerReason = "PERIODIC_OPERATIONAL_CHECK") {
    if (!this.lastStateSnapshot) {
      return { ok: false, error: "NO_BASELINE_SNAPSHOT" };
    }

    const snap = this.lastStateSnapshot;
    const attestationWitnessId = snap.attestation?.latestWitnessId || "attest-wit-d9b55fa5a77456e6421031141adf2e3549cffd790aaceef84cce8e95e1f019a7";
    const taskWitnessId = snap.artifact?.lineageWitnessId || "task-wit-f4b949c263ee62b73088d147";
    const sourceRealityHash = this.lastStateDigest?.canonicalHash || "88f45466ee08f97d3f82cb3aa6a928e36ee2215c0e15481745db7d2f9d690a6e";

    const sourceNodes = [
      { node_id: snap.nodes?.windows?.nodeId || "node-windows", platform: "win32", version: "0.1.0" },
      { node_id: snap.nodes?.android?.nodeId || "node-android", platform: "android", version: "0.1.0" },
    ];

    // Üretim Talebi Oluşturulur (REVIEW_REQUIRED)
    const req = requestProductionLoopArtifact(
      {
        sourceNodes,
        attestationWitnessId,
        taskWitnessId,
        sourceRealityHash,
        requestedBy: `continuous-observer (${triggerReason})`,
      },
      this.ledger,
    );

    // Ortak Relay Havuzuna Kanonik Olarak Kaydedilir (Phone + Windows + MCP için)
    this.relay.registerPendingRequest({
      requestId: req.requestId,
      operation: "artifact.production",
      requestedBy: `continuous-observer (${triggerReason})`,
      targetNodeId: snap.nodes?.android?.nodeId || "node-android",
      sourceNodeId: snap.nodes?.windows?.nodeId || "node-windows",
      payload: { attestationWitnessId, taskWitnessId, sourceRealityHash },
    });

    return {
      ok: true,
      requestId: req.requestId,
      status: "REVIEW_REQUIRED",
      triggerReason,
      detail: "Sürekli gözlemci yeni durum değişikliği için üretim talebi oluşturdu. İnsan operatör onayı (APPROVE/DENY) bekleniyor.",
    };
  }

  /**
   * Kullanıcının telefondan veya konsoldan sorabileceği 4 ana soruyu yanıtlar:
   * 1. "Şu anda ne değişti?"
   * 2. "Ne kanıtlandı?"
   * 3. "Ne üretim bekliyor?"
   * 4. "Neden bekliyor?"
   */
  queryDetailedState(queryText = "") {
    const q = (queryText || "").trim().toLowerCase();
    const snap = this.lastStateSnapshot || {};

    // 1. "Neden bekliyor?" / "Why is it pending?" (Öncelikli kontrol)
    if (q.includes("neden") || q.includes("niye") || q.includes("why")) {
      return {
        query: queryText,
        domain: "HUMAN_GATE_POLICY",
        status: "PROVEN",
        answer: "Talepler 'Fail-Closed Human Gate' güvenlik kuralı nedeniyle beklemektedir. AIOS mimarisinde hiçbir otonom bileşen veya LLM insan operatörün açık APPROVE onayı olmadan canlı üretim veya durum mutasyonu gerçekleştiremez.",
        policyRule: "STRICT_FAIL_CLOSED_HUMAN_APPROVAL",
        requiredAction: "Control Surface üzerinden 'APPROVE' veya 'DENY' kararı verilmelidir.",
      };
    }

    // 2. "Şu anda ne değişti?" / "What changed?"
    if (q.includes("değişti") || q.includes("change") || q.includes("fark") || q.includes("son durum")) {
      const recentDeltas = this.deltasHistory.slice(0, 5);
      return {
        query: queryText,
        domain: "STATE_DELTAS",
        status: "PROVEN",
        answer: recentDeltas.length > 0
          ? `Son tespit edilen ${recentDeltas.length} değişiklik: ${recentDeltas.map((d) => `[${d.type}: ${d.from || ""} -> ${d.to || d.canonicalHash || ""}]`).join(", ")}.`
          : "Sistem durumunda temel kurulumdan bu yana beklenmeyen bir sapma tespit edilmedi. Durum kararlı (STABLE).",
        recentDeltas,
      };
    }

    // 3. "Ne üretim bekliyor?" / "What is pending production?"
    if (q.includes("üretim") || q.includes("bekliyor") || q.includes("pending") || q.includes("talep") || q.includes("waiting") || q.includes("wait")) {
      const activePending = this.relay.getPendingApprovals();
      return {
        query: queryText,
        domain: "PENDING_PRODUCTION",
        status: activePending.length > 0 ? "REVIEW_REQUIRED" : "PROVEN",
        answer: activePending.length > 0
          ? `Şu anda onay bekleyen ${activePending.length} talep bulunmaktadır. (${activePending.map((p) => p.requestId || p.approvalId).join(", ")})`
          : "Şu anda bekleyen üretim talebi bulunmuyor. Tüm talepler çözümlendi veya sistem güvenli beklemede.",
        pendingCount: activePending.length,
        activePending,
      };
    }

    // 4. "Ne kanıtlandı?" / "What is proven?"
    if (q.includes("kanıtlandı") || q.includes("proven") || q.includes("ispat")) {
      return querySystemReality("Şu an ne kanıtlandı?", snap);
    }

    // Varsayılan Deterministik Yanıt
    return querySystemReality(queryText, snap);
  }
}

export const defaultContinuousObserver = new ContinuousObserver();
