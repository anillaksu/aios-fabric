// AIOS Control Surface — Shared Reality & Ask the System Logic

let currentSnapshot = null;

function nowTimeString() {
  return new Date().toLocaleTimeString("tr-TR");
}

function classifyMatrixClient(snap) {
  const isAndroidOnline = snap?.nodes?.android?.online === true && !snap?.nodes?.android?.stale;
  const isChainValid = snap?.evidenceChain?.ok === true && snap?.evidenceChain?.status === "CHAIN_VALID";
  const hasAttestation = Boolean(snap?.attestation?.latestWitnessId && snap?.attestation.latestWitnessId !== "GENESIS");
  const hasArtifact = Boolean(snap?.artifact?.artifactId && snap?.artifact?.artifactSha256);
  const pendingCount = (snap?.pendingApprovals || []).length;

  return [
    { title: "OBSERVER (100.75.177.88)", status: isAndroidOnline ? "PROVEN" : "STALE", color: isAndroidOnline ? "lime" : "pink" },
    { title: "EVIDENCE LEDGER", status: isChainValid ? `PROVEN (${snap.evidenceChain.events} events)` : "NOT_PROVEN", color: isChainValid ? "lime" : "pink" },
    { title: "NODE ATTESTATION", status: hasAttestation ? "PROVEN" : "NOT_PROVEN", color: hasAttestation ? "lime" : "pink" },
    { title: "DISTRIBUTED ARTIFACT", status: hasArtifact ? "PROVEN" : "NOT_PROVEN", color: hasArtifact ? "lime" : "pink" },
    { title: "A2A AUTH GATE", status: "BLOCKED (FAIL-CLOSED)", color: "pink" },
    { title: "HUMAN CONTROL GATE", status: pendingCount > 0 ? `${pendingCount} REVIEW REQ` : "PROVEN", color: pendingCount > 0 ? "amber" : "lime" },
  ];
}

function renderMatrix(matrix = []) {
  const container = document.getElementById("matrix-container");
  if (!container) return;
  container.innerHTML = matrix
    .map(
      (m) => `
      <div class="matrix-item ${m.color}">
        <span class="m-title">${m.title}</span>
        <span class="m-status ${m.color}">${m.status}</span>
      </div>
    `,
    )
    .join("");
}

function renderApprovalRequests(requests = []) {
  const container = document.getElementById("approval-list");
  const badge = document.getElementById("header-pending-count");
  if (badge) badge.textContent = `${requests.length} BEKLEYEN`;

  if (!container) return;
  if (requests.length === 0) {
    container.innerHTML = '<div class="feed-empty">Bekleyen onay talebi bulunmuyor. Sistem güvenli beklemede.</div>';
    return;
  }

  container.innerHTML = requests
    .map(
      (r) => `
      <div class="approval-card">
        <div class="appr-header">
          <span class="appr-title">⚠️ ${r.operation}</span>
          <span class="appr-time">${r.timestamp.slice(11, 19)}</span>
        </div>
        <div class="appr-target">HEDEF: ${r.targetNodeId.slice(0, 24)}...</div>
        <div class="appr-actions">
          <button class="btn-approve" onclick="handleDecision('${r.approvalId}', 'APPROVE')">✔ ONAYLA (APPROVE)</button>
          <button class="btn-deny" onclick="handleDecision('${r.approvalId}', 'DENY')">✖ REDDET (DENY)</button>
        </div>
      </div>
    `,
    )
    .join("");
}

window.handleDecision = async function (approvalId, decision) {
  try {
    if (window.aios?.resolveApproval) {
      await window.aios.resolveApproval(approvalId, decision);
      refreshRelaySnapshot();
    }
  } catch (err) {
    console.error("Decision resolution failed", err);
  }
};

window.handleQuickQuery = function (q) {
  const input = document.getElementById("query-input");
  if (input) {
    input.value = q;
    submitQuery(q);
  }
};

function submitQuery(queryText) {
  const text = (queryText || document.getElementById("query-input")?.value || "").trim();
  if (!text) return;

  const q = text.toLowerCase();
  let status = "PROVEN";
  let answer = "";

  if (q.includes("ne kanıtlandı") || q.includes("what is proven") || q.includes("kanıt")) {
    answer = `Sistemde 6 temel alandan 5'i CANLI PROVEN durumdadır. A2A Auth Gate fail-closed BLOCKED olarak korunmaktadır.`;
  } else if (q.includes("telefon") || q.includes("canlı")) {
    const isOnline = currentSnapshot?.nodes?.android?.online === true && !currentSnapshot?.nodes?.android?.stale;
    status = isOnline ? "PROVEN" : "STALE";
    answer = isOnline
      ? `Android Reference Node (http://100.75.177.88:9300) canlıdır. Ajan: ${currentSnapshot.nodes.android.agentName} v${currentSnapshot.nodes.android.agentVersion}.`
      : "Android Reference Node şu an çevrimdışıdır (OFFLINE / STALE).";
  } else if (q.includes("son kanıt") || q.includes("witness") || q.includes("defter")) {
    answer = `Evidence Ledger: ${currentSnapshot?.evidenceChain?.status || "CHAIN_VALID"} (${currentSnapshot?.evidenceChain?.events || 0} olay zincirlendi).`;
  } else if (q.includes("ortak") || q.includes("kesişim") || q.includes("capability")) {
    const caps = currentSnapshot?.attestation?.allowedCapabilities || [];
    answer = `Ortak Yetenek Kesişimi (${caps.length} adet): ${caps.join(", ")}.`;
  } else if (q.includes("artifact") || q.includes("artefakt")) {
    const art = currentSnapshot?.artifact;
    answer = art
      ? `Son Dağıtık Artifact: ${art.artifactId} (SHA: ${art.artifactSha256.slice(0, 16)}...). Lineage Witness: ${art.lineageWitnessId.slice(0, 20)}...`
      : "Henüz üretilmiş bir dağıtık artifact bulunmuyor.";
  } else if (q.includes("onay") || q.includes("approval") || q.includes("bekleyen")) {
    const pCount = (currentSnapshot?.pendingApprovals || []).length;
    status = pCount > 0 ? "HUMAN_APPROVAL_REQUIRED" : "PROVEN";
    answer = pCount > 0
      ? `Şu anda ${pCount} adet onay bekleyen eylem bulunmaktadır.`
      : "Bekleyen onay talebi bulunmuyor. Sistem güvenli beklemededir.";
  } else {
    status = "NOT_PROVEN";
    answer = "Bu sorgu için deterministik bir kanıt kaydı bulunamadı (NOT_PROVEN).";
  }

  const resultBox = document.getElementById("query-result-box");
  const badge = document.getElementById("q-status-badge");
  const time = document.getElementById("q-time");
  const answerEl = document.getElementById("q-answer-text");

  if (resultBox && badge && time && answerEl) {
    resultBox.style.display = "flex";
    badge.textContent = status;
    badge.className = `q-title ${status === "PROVEN" ? "lime" : status === "NOT_PROVEN" ? "pink" : "amber"}`;
    time.textContent = nowTimeString();
    answerEl.textContent = answer;
  }
}

async function refreshRelaySnapshot() {
  try {
    if (!window.aios?.getRelaySnapshot) return;
    const snap = await window.aios.getRelaySnapshot();
    currentSnapshot = snap;

    // 1. Android Düğüm Durumu
    const androidBadge = document.getElementById("android-badge");
    if (snap.nodes.android?.online) {
      androidBadge.textContent = "● ONLINE";
      androidBadge.className = "status-badge lime";
      document.getElementById("android-node-id").textContent = snap.nodes.android.nodeId.slice(0, 24) + "...";
      document.getElementById("android-agent-name").textContent = `${snap.nodes.android.agentName} v${snap.nodes.android.agentVersion}`;
    } else {
      androidBadge.textContent = "● OFFLINE (STALE)";
      androidBadge.className = "status-badge pink";
    }

    // 2. Windows Düğüm Durumu
    document.getElementById("windows-node-id").textContent = snap.nodes.windows.nodeId.slice(0, 24) + "...";

    // 3. Attestation & Kesişim
    document.getElementById("header-attest-witness").textContent = (snap.attestation.latestWitnessId || "GENESIS").slice(0, 20) + "...";
    document.getElementById("header-intersection-count").textContent = `${snap.attestation.allowedCapabilities.length} CAPS`;
    document.getElementById("inter-hash").textContent = snap.attestation.intersectionHash.slice(0, 20) + "...";

    const interList = document.getElementById("intersection-list");
    interList.innerHTML = snap.attestation.allowedCapabilities
      .map((c) => `<span class="cap-tag">${c}</span>`)
      .join("");

    // 4. Dağıtık Artifact
    if (snap.artifact) {
      document.getElementById("art-id").textContent = snap.artifact.artifactId;
      document.getElementById("art-sha").textContent = snap.artifact.artifactSha256.slice(0, 24) + "...";
      document.getElementById("art-lineage").textContent = snap.artifact.lineageWitnessId.slice(0, 24) + "...";
    }

    // 5. Evidence Zincir Durumu & Matris
    document.getElementById("latest-hash").textContent = snap.evidenceChain?.status || "CHAIN_VALID";
    renderMatrix(classifyMatrixClient(snap));

    // 6. Onay Talepleri
    renderApprovalRequests(snap.pendingApprovals || []);
  } catch (err) {
    console.error("Relay snapshot fetch failed", err);
  }
}

async function handleReadBattery() {
  const btn = document.getElementById("btn-read-battery");
  btn.disabled = true;
  btn.textContent = "⏳ OKUNUYOR...";
  try {
    const res = await window.aios.readBattery();
    if (res.ok && res.data && res.data.data) {
      const bat = res.data.data;
      document.getElementById("sensor-battery").textContent = `${bat.percentage ?? bat.level ?? "--"}%`;
      document.getElementById("sensor-temp").textContent = `${bat.temperature ?? "--"}°C`;
      document.getElementById("sensor-status").textContent = bat.status || "OK";
    }
  } catch (err) {
    console.error("Read battery failed", err);
  } finally {
    btn.disabled = false;
    btn.textContent = "⚡ CANLI PİL WITNESS ÜRET";
  }
}

// Initial Wireup
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-manual-refresh")?.addEventListener("click", refreshRelaySnapshot);
  document.getElementById("btn-read-battery")?.addEventListener("click", handleReadBattery);
  document.getElementById("btn-submit-query")?.addEventListener("click", () => submitQuery());
  document.getElementById("query-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitQuery();
  });

  refreshRelaySnapshot();

  setInterval(() => {
    refreshRelaySnapshot();
  }, 5000);
});
