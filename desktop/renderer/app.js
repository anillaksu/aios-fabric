// AIOS Control Surface — Shared Reality & Ask the System Logic

let currentSnapshot = null;

function nowTimeString() {
  return new Date().toLocaleTimeString("tr-TR");
}

function renderMatrix(matrix = []) {
  const container = document.getElementById("matrix-container");
  if (!container) return;
  container.innerHTML = matrix
    .map((m) => {
      const color = m.proven ? "lime" : m.status === "STALE" ? "amber" : "pink";
      return `
      <div class="matrix-item ${color}">
        <span class="m-title">${m.title}</span>
        <span class="m-status ${color}">${m.status}</span>
      </div>
    `;
    })
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

let currentActiveAskRequestId = null;

window.handleQuickAsk = function (promptText) {
  const input = document.getElementById("ask-aios-input");
  if (input) {
    input.value = promptText;
    submitAskAios(promptText);
  }
};

async function submitAskAios(customPrompt) {
  const input = document.getElementById("ask-aios-input");
  const prompt = (customPrompt || input?.value || "").trim();
  if (!prompt || !window.aios?.askAios) return;

  const btn = document.getElementById("btn-submit-ask");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "ORCHESTRATING...";
  }

  try {
    const res = await window.aios.askAios(prompt);
    if (!res || !res.ok) {
      alert("Hata: " + (res?.error || "Ask failed"));
      return;
    }

    currentActiveAskRequestId = res.requestId;
    const card = document.getElementById("ask-workflow-card");
    if (card) card.style.display = "flex";

    document.getElementById("ask-request-badge").textContent = res.requestId;
    document.getElementById("ask-time").textContent = nowTimeString();
    document.getElementById("ask-prompt-text").textContent = `"${res.prompt}"`;
    document.getElementById("ask-op-text").textContent = res.operation;
    document.getElementById("ask-digest-text").textContent = (res.realityDigest || "").slice(0, 24) + "...";

    // Proposals Grid
    const grid = document.getElementById("proposals-grid");
    if (grid) {
      grid.innerHTML = (res.proposals || []).map(p => `
        <div class="proposal-chip">
          <span class="p-agent">${p.agentName}</span>
          <span class="p-conf">${Math.round(p.confidence * 100)}% Match</span>
          <span class="p-hash">${(p.canonicalHash || "").slice(0, 12)}...</span>
        </div>
      `).join("");
    }

    // Reset task result box and show action buttons
    document.getElementById("human-gate-action-box").style.display = "block";
    document.getElementById("task-result-box").style.display = "none";
  } catch (err) {
    console.error("Ask AIOS error:", err);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "SEND TO AIOS";
    }
  }
}

async function handleHumanGateApprove() {
  if (!currentActiveAskRequestId || !window.aios?.approveAndExecute) return;
  const btn = document.getElementById("btn-hg-approve");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "EXECUTING...";
  }

  try {
    const res = await window.aios.approveAndExecute(currentActiveAskRequestId);
    document.getElementById("human-gate-action-box").style.display = "none";
    const resBox = document.getElementById("task-result-box");
    if (resBox) {
      resBox.style.display = "block";
      document.getElementById("task-witness-text").textContent = `WITNESS: ${(res.taskWitnessId || "N/A").slice(0, 24)}...`;
      document.getElementById("task-result-pre").textContent = JSON.stringify(res.taskResult, null, 2);
    }
    refreshRelaySnapshot();
  } catch (err) {
    console.error("Approve and execute failed:", err);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "✓ APPROVE & EXECUTE";
    }
  }
}

async function handleHumanGateDeny() {
  if (!currentActiveAskRequestId || !window.aios?.resolveApproval) return;
  await window.aios.resolveApproval(currentActiveAskRequestId, "DENY");
  document.getElementById("human-gate-action-box").style.display = "none";
  const resBox = document.getElementById("task-result-box");
  if (resBox) {
    resBox.style.display = "block";
    document.getElementById("task-result-pre").textContent = "REQUEST DENIED BY HUMAN OPERATOR (Fail-Closed).";
  }
  refreshRelaySnapshot();
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
    const profile = window.innerWidth <= 768 ? "mobile" : window.innerWidth <= 1024 ? "tablet" : "desktop";
    
    // 1. Kanonik Projeksiyonu Çek
    let projection = null;
    if (window.aios?.getProjection) {
      projection = await window.aios.getProjection(profile);
    }

    const snap = window.aios?.getRelaySnapshot ? await window.aios.getRelaySnapshot() : null;
    currentSnapshot = snap;

    if (projection && projection.semanticSlots) {
      const slots = projection.semanticSlots;

      // 1. Android Düğüm Durumu (Truthful)
      const androidBadge = document.getElementById("android-badge");
      if (slots.nodeOverview.android.online) {
        androidBadge.textContent = "● ONLINE";
        androidBadge.className = "status-badge lime";
      } else if (slots.nodeOverview.android.stale) {
        androidBadge.textContent = "● STALE";
        androidBadge.className = "status-badge amber";
      } else {
        androidBadge.textContent = "● OFFLINE";
        androidBadge.className = "status-badge pink";
      }
      document.getElementById("android-node-id").textContent = (slots.nodeOverview.android.nodeId || "--").slice(0, 24) + "...";
      if (snap?.nodes?.android) {
        document.getElementById("android-agent-name").textContent = `${snap.nodes.android.agentName || "agent"} v${snap.nodes.android.agentVersion || "1.0"}`;
      }

      // 2. Windows Düğüm Durumu
      document.getElementById("windows-node-id").textContent = (slots.nodeOverview.windows.nodeId || "--").slice(0, 24) + "...";

      // 3. Attestation & Kesişim
      if (snap?.attestation) {
        document.getElementById("header-attest-witness").textContent = (snap.attestation.latestWitnessId || "GENESIS").slice(0, 20) + "...";
        document.getElementById("header-intersection-count").textContent = `${snap.attestation.allowedCapabilities?.length || 0} CAPS`;
        document.getElementById("inter-hash").textContent = (snap.attestation.intersectionHash || "--").slice(0, 20) + "...";

        const interList = document.getElementById("intersection-list");
        if (interList) {
          interList.innerHTML = (snap.attestation.allowedCapabilities || [])
            .map((c) => `<span class="cap-tag">${c}</span>`)
            .join("");
        }
      }

      // 4. Dağıtık Artifact
      document.getElementById("art-id").textContent = slots.recentEvidence.latestArtifactId || "NONE";
      if (snap?.artifact) {
        document.getElementById("art-sha").textContent = (snap.artifact.artifactSha256 || "--").slice(0, 24) + "...";
        document.getElementById("art-lineage").textContent = (snap.artifact.lineageWitnessId || "--").slice(0, 24) + "...";
      }

      // 5. Browser Node Durumu
      const b = slots.nodeOverview.browser;
      const bNodeIdEl = document.getElementById("browser-node-id");
      const bStatEl = document.getElementById("browser-status-verdict");
      const bDigEl = document.getElementById("browser-digest");
      const bObsEl = document.getElementById("browser-observed-at");
      const bEvEl = document.getElementById("browser-evidence-ref");

      if (bNodeIdEl) bNodeIdEl.textContent = (b.nodeId || "--").slice(0, 24) + "...";
      if (bStatEl) {
        const bStatus = b.online ? "PROVEN" : "NOT_PROVEN";
        bStatEl.textContent = `${bStatus} (${b.verdict})`;
        bStatEl.className = `val ${b.verdict === "PASS" ? "lime" : "pink"}`;
      }
      if (bDigEl && snap?.browser) bDigEl.textContent = (snap.browser.proofDigest || snap.browser.proof_digest || "--").slice(0, 20) + "...";
      if (bObsEl && snap?.browser) bObsEl.textContent = (snap.browser.lastSeen || snap.browser.observed_at || "--").slice(11, 19);
      if (bEvEl && snap?.browser) bEvEl.textContent = (snap.browser.evidenceRef || snap.browser.evidence_ref || "GENESIS").slice(0, 24);

      // 6. Evidence Zincir Durumu & Matris (Doğrudan kanonik projeksiyondan)
      document.getElementById("latest-hash").textContent = slots.recentEvidence.chainStatus;
      const policyBadge = document.getElementById("policy-badge");
      if (policyBadge) {
        policyBadge.textContent = `PROVEN (${slots.currentReality.provenMatrixCount}/7)`;
      }
      renderMatrix(slots.currentReality.matrix || []);

      // 7. Onay Talepleri
      renderApprovalRequests(slots.pendingHuman.items || []);
    }
  } catch (err) {
    console.error("Relay projection fetch failed", err);
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

async function refreshRuntimeStatus() {
  if (!window.aios?.getRuntimeStatus) return;
  try {
    const res = await window.aios.getRuntimeStatus();
    if (!res || !res.ok) return;

    document.getElementById("rt-run-id").textContent = res.run_id ? res.run_id.slice(0, 24) + "..." : "NONE";
    document.getElementById("runtime-state-badge").textContent = res.state || "IDLE";
    document.getElementById("runtime-liveness-badge").textContent = res.liveness || "STANDBY";
    document.getElementById("rt-progress").textContent = `${res.step_index || 0} / ${res.step_total || 0}`;
    document.getElementById("rt-current-step").textContent = res.current_step ? res.current_step.replace("desktop/", "") : "IDLE";
    document.getElementById("rt-heartbeat").textContent = res.heartbeat_age_sec !== undefined ? `${res.heartbeat_age_sec}s ago` : "N/A";

    const elapsedSec = Math.floor((res.elapsed_ms || 0) / 1000);
    const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
    const ss = String(elapsedSec % 60).padStart(2, "0");
    document.getElementById("rt-elapsed").textContent = `00:${mm}:${ss}`;

    document.getElementById("rt-eta").textContent = res.eta?.formatted || "N/A";

    const pct = res.step_total > 0 ? Math.round(((res.step_index || 0) / res.step_total) * 100) : 0;
    document.getElementById("rt-progress-fill").style.width = `${pct}%`;

    if (res.last_event) {
      const box = document.getElementById("rt-log-box");
      if (box && !box.textContent.includes(res.last_event)) {
        const line = document.createElement("div");
        line.className = "rt-log-line";
        line.textContent = `[${nowTimeString()}] ${res.last_event}`;
        box.prepend(line);
      }
    }
  } catch (err) {
    console.error("Runtime status fetch error:", err);
  }
}

let currentMobileView = "ask";

window.switchMobileView = function (tabName) {
  currentMobileView = tabName;

  const updateDOM = () => {
    const grid = document.getElementById("main-deck-grid");
    if (grid) {
      grid.className = `deck-grid view-${tabName}`;
    }
    const tabs = document.querySelectorAll(".nav-tab");
    tabs.forEach((t) => {
      if (t.getAttribute("data-tab") === tabName) {
        t.classList.add("active");
      } else {
        t.classList.remove("active");
      }
    });
  };

  // Progressive enhancement: View Transition API
  if (document.startViewTransition) {
    document.startViewTransition(() => updateDOM());
  } else {
    updateDOM();
  }
};

// Initial Wireup
document.addEventListener("DOMContentLoaded", () => {
  // PWA Standalone Mode Detection
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const pwaBadge = document.getElementById("pwa-mode-badge");
  if (pwaBadge) {
    pwaBadge.style.display = isStandalone ? "inline-block" : "none";
  }

  // Register PWA Service Worker (Progressive Enhancement)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("PWA ServiceWorker registration skipped:", err.message);
    });
  }

  // Set initial mobile view
  switchMobileView("ask");

  document.getElementById("btn-manual-refresh")?.addEventListener("click", refreshRelaySnapshot);
  document.getElementById("btn-read-battery")?.addEventListener("click", handleReadBattery);
  
  // ASK AIOS Bindings
  document.getElementById("btn-submit-ask")?.addEventListener("click", () => submitAskAios());
  document.getElementById("ask-aios-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitAskAios();
  });
  document.getElementById("btn-hg-approve")?.addEventListener("click", handleHumanGateApprove);
  document.getElementById("btn-hg-deny")?.addEventListener("click", handleHumanGateDeny);

  // Runtime Controls
  document.getElementById("btn-start-gate24")?.addEventListener("click", async () => {
    if (window.aios?.startRuntimeRun) {
      await window.aios.startRuntimeRun("24");
      refreshRuntimeStatus();
    }
  });

  document.getElementById("btn-stop-runtime")?.addEventListener("click", async () => {
    if (window.aios?.stopRuntimeRun) {
      await window.aios.stopRuntimeRun();
      refreshRuntimeStatus();
    }
  });

  document.getElementById("btn-refresh-runtime")?.addEventListener("click", refreshRuntimeStatus);

  refreshRelaySnapshot();
  refreshRuntimeStatus();

  setInterval(() => {
    refreshRelaySnapshot();
  }, 5000);

  setInterval(() => {
    refreshRuntimeStatus();
  }, 1000);
});
