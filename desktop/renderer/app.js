// AIOS Control Surface — Agent Relay & Human Gate Logic

let witnessHistory = [];

async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function nowTimeString() {
  return new Date().toLocaleTimeString("tr-TR");
}

function appendWitness(title, data, target = "http://100.75.177.88:9300") {
  const timestamp = new Date().toISOString();
  const rawStr = JSON.stringify({ timestamp, target, title, data });
  sha256(rawStr).then((hash) => {
    const item = {
      title,
      target,
      timestamp: nowTimeString(),
      hash: hash.slice(0, 32) + "...",
      fullHash: hash,
      data: JSON.stringify(data),
    };
    witnessHistory.unshift(item);
    renderWitnessFeed();
  });
}

function renderWitnessFeed() {
  const container = document.getElementById("witness-feed");
  if (witnessHistory.length === 0) {
    container.innerHTML = '<div class="feed-empty">Henüz witness kaydı bulunmuyor.</div>';
    return;
  }
  container.innerHTML = witnessHistory
    .slice(0, 8)
    .map(
      (w) => `
      <div class="witness-card">
        <div class="witness-header">
          <span class="witness-title">⚡ ${w.title}</span>
          <span class="witness-time">${w.timestamp}</span>
        </div>
        <div class="witness-hash">HASH: ${w.hash}</div>
        <div class="witness-data">${w.data.slice(0, 100)}${w.data.length > 100 ? "..." : ""}</div>
      </div>
    `,
    )
    .join("");
}

function renderApprovalRequests(requests = []) {
  const container = document.getElementById("approval-list");
  const badge = document.getElementById("header-pending-count");
  badge.textContent = `${requests.length} BEKLEYEN`;

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
      appendWitness(`HUMAN_DECISION: ${decision}`, { approvalId, decision });
      refreshRelaySnapshot();
    }
  } catch (err) {
    console.error("Decision resolution failed", err);
  }
};

async function refreshRelaySnapshot() {
  try {
    if (!window.aios?.getRelaySnapshot) return;
    const snap = await window.aios.getRelaySnapshot();

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

    // 5. Evidence Zincir Durumu
    document.getElementById("latest-hash").textContent = snap.evidenceChain?.status || "CHAIN_VALID";

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
      appendWitness("READ: sensor.battery.read", bat);
    } else {
      appendWitness("READ: sensor.battery.read (ERROR)", res.error || "Read failed");
    }
  } catch (err) {
    appendWitness("READ: sensor.battery.read (EXCEPTION)", String(err));
  } finally {
    btn.disabled = false;
    btn.textContent = "⚡ CANLI PİL WITNESS ÜRET";
  }
}

// Initial Wireup
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-manual-refresh").addEventListener("click", () => {
    refreshRelaySnapshot();
  });

  document.getElementById("btn-read-battery").addEventListener("click", handleReadBattery);

  // İlk yükleme
  refreshRelaySnapshot();

  // Canlı polling (5s)
  setInterval(() => {
    refreshRelaySnapshot();
  }, 5000);
});
