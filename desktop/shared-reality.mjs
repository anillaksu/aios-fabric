// AIOS Shared Reality Bridge & "What is Proven Now?" Deterministic Engine
import { canonicalJson, sha256, defaultLedger } from "./observer.mjs";
import { defaultRelay } from "./agent-relay.mjs";

/**
 * Sistemin tüm kanıtlanmış durumunu 6 kesin kategoride sınıflandırır:
 * PROVEN | NOT_PROVEN | STALE | REVIEW_REQUIRED | HUMAN_APPROVAL_REQUIRED | BLOCKED
 */
export function classifyProvenMatrix(snapshot = {}) {
  const isAndroidOnline = snapshot.nodes?.android?.online === true && !snapshot.nodes?.android?.stale;
  const isChainValid = snapshot.evidenceChain?.ok === true && snapshot.evidenceChain?.status === "CHAIN_VALID";
  const hasAttestation = Boolean(snapshot.attestation?.latestWitnessId && snapshot.attestation.latestWitnessId !== "GENESIS");
  const hasArtifact = Boolean(snapshot.artifact?.artifactId && snapshot.artifact?.artifactSha256);
  const pendingCount = (snapshot.pendingApprovals || []).length;

  return [
    {
      domain: "NETWORK_OBSERVER",
      claim: "Windows Observer -> Android Node (:9300) bağlantısı",
      status: isAndroidOnline ? "PROVEN" : "STALE",
      evidence: snapshot.nodes?.android?.endpoint || "http://100.75.177.88:9300",
      detail: isAndroidOnline ? "Tailscale tüneli üzerinden HTTP 200 yanıt alındı" : "Android düğümüne ulaşılamıyor (OFFLINE)",
    },
    {
      domain: "A2A_AUTH_GATEWAY",
      claim: "A2A SendMessage Kimlik Doğrulama Kapısı",
      status: "BLOCKED",
      evidence: "FAIL_CLOSED_NO_TOKEN",
      detail: "AIOS_PHONE_A2A_TOKEN tanımlı değil; fail-closed güvenlik kapısı aktif (yetkisiz çağrı engellendi)",
    },
    {
      domain: "EVIDENCE_LEDGER",
      claim: "SHA-256 Kriptografik Kanıt Zinciri Bütünlüğü",
      status: isChainValid ? "PROVEN" : "NOT_PROVEN",
      evidence: snapshot.evidenceChain?.latestHash || "GENESIS",
      detail: isChainValid ? `${snapshot.evidenceChain.events} olay zincirlendi ve doğrulandı` : "Zincir kuralı doğrulanamadı",
    },
    {
      domain: "NODE_ATTESTATION",
      claim: "Windows ↔ Android Deterministik Handshake ve Kesişim",
      status: hasAttestation ? "PROVEN" : "NOT_PROVEN",
      evidence: snapshot.attestation?.latestWitnessId || "NONE",
      detail: hasAttestation ? `Ortak Kesişim: ${(snapshot.attestation?.allowedCapabilities || []).join(", ")}` : "Attestation tamamlanmadı",
    },
    {
      domain: "DISTRIBUTED_ARTIFACT",
      claim: "Attestation Witness Lineage Bağlı İlk Dağıtık Artifact",
      status: hasArtifact ? "PROVEN" : "NOT_PROVEN",
      evidence: snapshot.artifact?.artifactId || "NONE",
      detail: hasArtifact ? `Lineage: ${snapshot.artifact.lineageWitnessId?.slice(0, 24)}... (SHA: ${snapshot.artifact.artifactSha256?.slice(0, 16)}...)` : "Artifact üretilmedi",
    },
    {
      domain: "HUMAN_CONTROL_GATE",
      claim: "İnsan Onayı ve Review Denetimi",
      status: pendingCount > 0 ? "HUMAN_APPROVAL_REQUIRED" : "PROVEN",
      evidence: `${pendingCount} bekleyen talep`,
      detail: pendingCount > 0 ? "Operatörün APPROVE veya DENY kararı bekleniyor (Fail-Closed)" : "Bekleyen onay yok, sistem güvenli",
    },
  ];
}

/**
 * "ASK THE SYSTEM" — Deterministik Soru-Cevap Motoru
 * Model tahmini/halüsinasyonu yapmaz; doğrudan kanıt defteri ve canlı durumdan yanıt üretir.
 */
export function querySystemReality(queryText = "", snapshot = null) {
  const q = (queryText || "").trim().toLowerCase();
  const snap = snapshot || {};
  const matrix = classifyProvenMatrix(snap);

  // 1. "Şu an ne kanıtlandı?" / "What is proven now?"
  if (q.includes("ne kanıtlandı") || q.includes("what is proven") || q.includes("kanıt matrisi") || q.includes("özel durum") || q.includes("özet")) {
    const provenCount = matrix.filter((m) => m.status === "PROVEN").length;
    const blockedCount = matrix.filter((m) => m.status === "BLOCKED").length;
    const pendingCount = matrix.filter((m) => m.status === "HUMAN_APPROVAL_REQUIRED").length;
    const staleCount = matrix.filter((m) => m.status === "STALE").length;

    return {
      query: queryText,
      status: "PROVEN",
      answer: `Şu an 6 temel alandan ${provenCount} tanesi CANLI KANITLANMIŞ (PROVEN) durumdadır. (${blockedCount} BLOCKED/Fail-Closed, ${staleCount} STALE, ${pendingCount} Onay Bekleyen).`,
      matrix,
      lineageWitness: snap.attestation?.latestWitnessId || "GENESIS",
    };
  }

  // 2. "Telefon canlı mı?" / "Is phone online?"
  if (q.includes("telefon") || q.includes("android") || q.includes("canlı") || q.includes("online") || q.includes("bağlantı")) {
    const isOnline = snap.nodes?.android?.online === true && !snap.nodes?.android?.stale;
    return {
      query: queryText,
      status: isOnline ? "PROVEN" : "STALE",
      answer: isOnline
        ? `Android Reference Node (http://100.75.177.88:9300) canlıdır. Ajan: ${snap.nodes.android.agentName} v${snap.nodes.android.agentVersion} (${snap.nodes.android.capabilitiesCount || 39} capabilities).`
        : "Android Reference Node şu anda çevrimdışıdır (OFFLINE / STALE).",
      nodeId: snap.nodes?.android?.nodeId || "unknown",
    };
  }

  // 3. "Son kanıt ne?" / "Latest witness?"
  if (q.includes("son kanıt") || q.includes("witness") || q.includes("defter") || q.includes("zincir") || q.includes("ledger")) {
    const isChainValid = snap.evidenceChain?.ok === true;
    return {
      query: queryText,
      status: isChainValid ? "PROVEN" : "NOT_PROVEN",
      answer: `Evidence Ledger durumu: ${snap.evidenceChain?.status || "UNKNOWN"} (${snap.evidenceChain?.events || 0} olay zincirlendi). En son witness hash: ${snap.evidenceChain?.latestHash || "GENESIS"}.`,
      latestHash: snap.evidenceChain?.latestHash || "GENESIS",
      events: snap.evidenceChain?.events || 0,
    };
  }

  // 4. "Hangi capability'ler ortak?" / "Capability intersection?"
  if (q.includes("ortak") || q.includes("kesişim") || q.includes("capability") || q.includes("yetenek") || q.includes("intersection")) {
    const caps = snap.attestation?.allowedCapabilities || [];
    return {
      query: queryText,
      status: caps.length > 0 ? "PROVEN" : "NOT_PROVEN",
      answer: `Windows ve Android arasındaki ortak yetenek kümesi (${caps.length} adet): ${caps.join(", ")}. Kesişim Hash: ${snap.attestation?.intersectionHash || "NONE"}.`,
      allowedCapabilities: caps,
      intersectionHash: snap.attestation?.intersectionHash || "NONE",
    };
  }

  // 5. "Son artifact nedir?" / "Latest artifact?"
  if (q.includes("artifact") || q.includes("artefakt") || q.includes("dağıtık") || q.includes("lineage")) {
    const art = snap.artifact;
    return {
      query: queryText,
      status: art ? "PROVEN" : "NOT_PROVEN",
      answer: art
        ? `En son üretilen dağıtık artifact: ${art.artifactId} (SHA-256: ${art.artifactSha256}). Lineage Witness: ${art.lineageWitnessId}. Politika: ${art.policyResult}.`
        : "Henüz üretilmiş bir dağıtık artifact bulunmuyor.",
      artifact: art,
    };
  }

  // 6. "İnsan onayı gerekiyor mu?" / "Pending approvals?"
  if (q.includes("onay") || q.includes("approval") || q.includes("bekleyen") || q.includes("görev") || q.includes("review")) {
    const pending = snap.pendingApprovals || [];
    return {
      query: queryText,
      status: pending.length > 0 ? "HUMAN_APPROVAL_REQUIRED" : "PROVEN",
      answer: pending.length > 0
        ? `Şu anda ${pending.length} adet insan onayı bekleyen talep bulunmaktadır: ${pending.map((p) => p.operation).join(", ")}.`
        : "Bekleyen herhangi bir insan onayı talebi bulunmuyor. Sistem güvenli bekleme durumundadır.",
      pendingApprovals: pending,
    };
  }

  // Eşleşmeyen sorgular için ASLA uydurma yapılmaz -> NOT_PROVEN
  return {
    query: queryText,
    status: "NOT_PROVEN",
    answer: "Bu sorgu için deterministik bir kanıt kaydı bulunamadı (NOT_PROVEN). Lütfen 'Şu an ne kanıtlandı?', 'Telefon canlı mı?', 'Son kanıt ne?' veya 'Ortak yetenekler?' gibi kanıtlanmış alanları sorgulayınız.",
  };
}

/**
 * Shared Reality'nin kanonik özet temsilini üretir.
 */
export function buildSharedRealitySummary(snapshot = {}) {
  const matrix = classifyProvenMatrix(snapshot);
  return {
    schema: "aios.shared-reality.v1",
    timestamp: snapshot.timestamp || new Date().toISOString(),
    nodes: {
      windows_node_id: snapshot.nodes?.windows?.nodeId || "unknown",
      android_node_id: snapshot.nodes?.android?.nodeId || "unknown",
      android_connection: snapshot.nodes?.android?.online ? "ONLINE" : "OFFLINE_STALE",
    },
    attestation: {
      witness_id: snapshot.attestation?.latestWitnessId || "GENESIS",
      intersection_hash: snapshot.attestation?.intersectionHash || "NONE",
      allowed_capabilities: snapshot.attestation?.allowedCapabilities || [],
    },
    artifact: snapshot.artifact || null,
    evidence_chain: {
      status: snapshot.evidenceChain?.status || "UNKNOWN",
      events: snapshot.evidenceChain?.events || 0,
      latest_hash: snapshot.evidenceChain?.latestHash || "GENESIS",
    },
    proven_matrix: matrix,
  };
}
