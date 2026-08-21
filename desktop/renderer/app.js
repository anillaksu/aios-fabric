// AIOS Control Surface — Kanonik Projeksiyon Sunumu
// ONE REALITY · MANY DETERMINISTIC PROJECTIONS
//
// Bu katman kanonik durum ÜRETMEZ, TÜRETMEZ, VARSAYMAZ.
// Yalnızca /api/projection çıktısını insan diline yansıtır.

let currentSnapshot = null;
let currentProjection = null;

/* ══════════════════ ANLAMSAL SÖZLÜK ══════════════════
   Kanonik terim → insan dili. Yeni semantik icat edilmez;
   yalnızca kanonik durumdaki değerler eşlenir. */

const SEMANTIC_TEXT = {
  CHAIN_VALID: "Kanıt zinciri bütün",
  CHAIN_BROKEN: "Kanıt zinciri kırık",
  PROVEN: "Doğrulandı",
  NOT_PROVEN: "Kanıt yok",
  STALE: "Eski veri",
  OFFLINE: "Çevrimdışı",
  UNKNOWN: "Bilinmiyor",
  PASS: "Doğrulandı",
  FAIL: "Başarısız",
  INCONCLUSIVE: "Sonuçsuz",
  "FAIL-CLOSED": "Erişim kapalı",
  BLOCKED: "Erişim kapalı",
};

const RUN_STATE_TEXT = {
  IDLE: "Beklemede",
  RUNNING: "Çalışıyor",
  PASSED: "Tamamlandı",
  FAILED: "Başarısız",
  STOPPED: "Durduruldu",
};

const RISK_TEXT = {
  safe: "düşük",
  notify: "orta",
  ask: "yüksek",
};

/** Kanonik teknik durumu insan diline çevirir; bilinmeyen değer olduğu gibi kalır. */
function semantic(raw) {
  if (raw === undefined || raw === null || raw === "") return SEMANTIC_TEXT.UNKNOWN;
  const key = String(raw).trim();
  if (SEMANTIC_TEXT[key]) return SEMANTIC_TEXT[key];
  // "PROVEN (488 events)" gibi bileşik değerlerde baş terimi eşle
  const head = key.split(/[\s(]/)[0];
  if (SEMANTIC_TEXT[head]) return SEMANTIC_TEXT[head];
  return key;
}

/** Anlamsal duruma karşılık gelen nokta sınıfı. */
function dotClass(raw, proven) {
  if (proven === true) return "proven";
  const key = String(raw || "").toUpperCase();
  if (key.startsWith("PROVEN") || key === "PASS") return "proven";
  if (key.includes("STALE")) return "stale";
  if (key.includes("OFFLINE")) return "offline";
  if (key.includes("REVIEW") || key.includes("WAITING")) return "waiting";
  if (key.includes("FAIL") || key.includes("BLOCK")) return "blocked";
  if (key.includes("RUNNING")) return "running";
  if (key === "UNKNOWN" || key === "") return "offline";
  return "blocked";
}

function nowTimeString() {
  return new Date().toLocaleTimeString("tr-TR");
}

/** Göreli yaş: "12 dk önce". Sahte tazelik üretmez. */
function relativeAge(seconds) {
  if (seconds === undefined || seconds === null || Number.isNaN(seconds)) return "";
  const s = Math.max(0, Math.floor(seconds));
  if (s < 10) return "az önce";
  if (s < 60) return `${s} sn önce`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

/* ══════════════════ TRUNCATED ID ══════════════════
   Görsel kısaltma veri kaybı değildir: tam değer
   aria-label'da taşınır ve dokunuşla kopyalanır. */

function truncateId(value, head = 8, tail = 5) {
  const v = String(value ?? "");
  if (!v || v === "NONE" || v === "GENESIS" || v === "—") return v || "—";
  if (v.length <= head + tail + 1) return v;
  return `${v.slice(0, head)}…${v.slice(-tail)}`;
}

/** Kopyalanabilir kimlik çipi üretir. */
function idChipHtml(value) {
  const full = String(value ?? "");
  if (!full || full === "NONE" || full === "GENESIS") {
    return `<span class="stat-val mono">${escapeHtml(full || "—")}</span>`;
  }
  return `<button type="button" class="idchip" data-copy="${escapeHtml(full)}" aria-label="${escapeHtml(full)} — kopyalamak için dokun">${escapeHtml(truncateId(full))}</button>`;
}

/** Var olan bir elemanı kopyalanabilir kimlik çipine dönüştürür. */
function setIdChip(elementId, value) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.innerHTML = idChipHtml(value);
}

function setText(elementId, value) {
  const el = document.getElementById(elementId);
  if (el) el.textContent = value ?? "—";
}

let copyToastTimer = null;
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch { /* kopyalama desteklenmiyor */ }
    document.body.removeChild(ta);
  }
  const toast = document.getElementById("copy-toast");
  if (!toast) return;
  toast.hidden = false;
  clearTimeout(copyToastTimer);
  copyToastTimer = setTimeout(() => { toast.hidden = true; }, 1600);
}

/* ══════════════════ TAZELİK DURUM MAKİNESİ ══════════════════
   LIVE / STALE / OFFLINE — üç ayrı durum.
   Offline veri asla LIVE olarak gösterilmez. */

const FRESHNESS_LIVE_MAX_MS = 10_000;
const FRESHNESS_STALE_MAX_MS = 120_000;

let lastSuccessfulFetchAt = null;

function currentFreshness() {
  if (lastSuccessfulFetchAt === null) return "OFFLINE";
  const age = Date.now() - lastSuccessfulFetchAt;
  if (age <= FRESHNESS_LIVE_MAX_MS) return "LIVE";
  if (age <= FRESHNESS_STALE_MAX_MS) return "STALE";
  return "STALE";
}

function applyFreshness(state) {
  const chip = document.getElementById("freshness-chip");
  const pulse = document.getElementById("global-pulse");
  const ageMs = lastSuccessfulFetchAt ? Date.now() - lastSuccessfulFetchAt : null;

  const label =
    state === "LIVE" ? "Canlı"
      : state === "STALE" ? `Eski veri · ${relativeAge(ageMs / 1000)}`
        : "Çevrimdışı";

  if (chip) {
    chip.textContent = label;
    chip.dataset.freshness = state;
  }
  if (pulse) {
    pulse.className = `pulse-indicator ${state === "LIVE" ? "online" : state === "STALE" ? "stale" : "offline"}`;
  }
  document.body.dataset.freshness = state;
}

/* ══════════════════ SEMANTIC LIST RENDER ══════════════════ */

function renderSemanticList(containerId, rows) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = rows
    .map(
      (r) => `
      <li class="semantic-row">
        <span class="status-dot ${r.dot}" aria-hidden="true"></span>
        <span class="semantic-label">${escapeHtml(r.label)}</span>
        <span class="semantic-state">${escapeHtml(r.state)}</span>
      </li>`,
    )
    .join("");
}

/** Kanıt matrisi başlıklarını insan diline çevirir. */
const MATRIX_LABEL = {
  "EVIDENCE LEDGER": "Kanıt zinciri",
  "NODE ATTESTATION": "Düğüm doğrulaması",
  "BROWSER SENTINEL": "Tarayıcı gözcüsü",
  "DISTRIBUTED ARTIFACT": "Dağıtık artifact",
  "A2A AUTH GATE": "Ajan erişim kapısı",
  "HUMAN CONTROL GATE": "İnsan kontrol kapısı",
};

function matrixLabel(title) {
  if (MATRIX_LABEL[title]) return MATRIX_LABEL[title];
  if (String(title).startsWith("OBSERVER")) return "Telefon gözlemcisi";
  return title;
}

/** PRIMARY: anlamsal gerçeklik listesi. Hash, URL, protokol yok. */
function renderRealitySemantic(matrix = []) {
  renderSemanticList(
    "reality-semantic-list",
    matrix.map((m) => ({
      label: matrixLabel(m.title),
      state: semantic(m.status),
      dot: dotClass(m.status, m.proven),
    })),
  );
}

/** DETAIL: teknik matris, disclosure altında. */
function renderMatrix(matrix = []) {
  const container = document.getElementById("matrix-container");
  if (!container) return;
  container.innerHTML = matrix
    .map((m) => {
      const color = m.proven ? "lime" : String(m.status).includes("STALE") ? "amber" : "pink";
      return `
      <div class="matrix-item ${color}">
        <span class="m-title">${escapeHtml(m.title)}</span>
        <span class="m-status ${color}">${escapeHtml(m.status)}</span>
      </div>`;
    })
    .join("");
}

function renderNodesSemantic(nodeOverview = {}) {
  const rows = [];
  const a = nodeOverview.android || {};
  const w = nodeOverview.windows || {};
  const b = nodeOverview.browser || {};

  rows.push({
    label: "Telefon",
    state: a.online ? "Bağlı" : a.stale ? SEMANTIC_TEXT.STALE : SEMANTIC_TEXT.OFFLINE,
    dot: a.online ? "proven" : a.stale ? "stale" : "offline",
  });
  rows.push({
    label: "Bilgisayar",
    state: w.online ? "Bağlı" : SEMANTIC_TEXT.OFFLINE,
    dot: w.online ? "proven" : "offline",
  });
  rows.push({
    label: "Tarayıcı",
    state: semantic(b.verdict),
    dot: dotClass(b.verdict),
  });

  renderSemanticList("nodes-semantic-list", rows);
}

function renderEvidenceSemantic(slots) {
  const ev = slots.recentEvidence || {};
  const rows = [
    {
      label: "Kanıt zinciri",
      state: ev.chainStatus === "CHAIN_VALID"
        ? `${SEMANTIC_TEXT.CHAIN_VALID} · ${ev.eventsCount} olay`
        : semantic(ev.chainStatus),
      dot: ev.chainStatus === "CHAIN_VALID" ? "proven" : dotClass(ev.chainStatus),
    },
    {
      label: "Son artifact",
      state: ev.latestArtifactId && ev.latestArtifactId !== "NONE"
        ? truncateId(ev.latestArtifactId)
        : "Yok",
      dot: ev.latestArtifactId && ev.latestArtifactId !== "NONE" ? "proven" : "offline",
    },
    {
      label: "Gerçeklik",
      state: semantic(slots.currentReality?.status),
      dot: dotClass(slots.currentReality?.status),
    },
  ];
  renderSemanticList("evidence-semantic-list", rows);
}

/* ══════════════════ HUMAN GATE ══════════════════
   Mobilde birincil deneyim: NE / NEDEN / KİM / HANGİ REALITY / RİSK. */

function gateCardHtml(r) {
  const risk = RISK_TEXT[r.risk] || r.risk || "belirtilmemiş";
  const age = r.timestamp ? relativeAge((Date.now() - new Date(r.timestamp).getTime()) / 1000) : "";
  const id = escapeHtml(r.approvalId || r.requestId || "");

  return `
    <div class="gate-card">
      <div class="gate-head">
        <span class="status-dot waiting" aria-hidden="true"></span>
        <span class="gate-title">Karar bekleniyor</span>
      </div>

      <p class="gate-what">${escapeHtml(r.summary || r.operation || "Bilinmeyen işlem")}</p>

      <dl class="gate-facts">
        <div class="gate-fact"><dt>Yapılacak</dt><dd>${escapeHtml(r.operation || "—")}</dd></div>
        <div class="gate-fact"><dt>Neden</dt><dd>${escapeHtml(r.reason || "İşlem insan onayı gerektiriyor")}</dd></div>
        <div class="gate-fact"><dt>Öneren</dt><dd>${escapeHtml(r.requestedBy || "—")}${age ? " · " + escapeHtml(age) : ""}</dd></div>
        <div class="gate-fact"><dt>Risk</dt><dd>${escapeHtml(risk)}</dd></div>
        <div class="gate-fact"><dt>Gerçeklik</dt><dd>${idChipHtml(r.realityDigest || currentProjection?.realityDigest || "")}</dd></div>
      </dl>

      <details class="disclosure">
        <summary>Teknik ayrıntı</summary>
        <div class="disclosure-body">
          <div class="stat-line"><span class="stat-key">İstek</span><span class="stat-val">${idChipHtml(r.approvalId || r.requestId)}</span></div>
          <div class="stat-line"><span class="stat-key">Hedef düğüm</span><span class="stat-val">${idChipHtml(r.targetNodeId)}</span></div>
          <div class="stat-line"><span class="stat-key">Durum</span><span class="stat-val mono">${escapeHtml(r.status || "REVIEW_REQUIRED")}</span></div>
          <div class="stat-line"><span class="stat-key">Zaman</span><span class="stat-val mono">${escapeHtml(r.timestamp || "—")}</span></div>
        </div>
      </details>

      <div class="gate-actions">
        <button class="btn-approve" type="button" data-decision="APPROVE" data-approval="${id}">Onayla</button>
        <button class="btn-deny" type="button" data-decision="DENY" data-approval="${id}">Reddet</button>
      </div>
    </div>`;
}

function renderApprovalRequests(requests = []) {
  const container = document.getElementById("approval-list");
  const headerBadge = document.getElementById("header-pending-count");
  const navBadge = document.getElementById("nav-pending-badge");

  if (headerBadge) headerBadge.textContent = `${requests.length} BEKLEYEN`;

  // Bekleyen karar sayısı sekme rozetine bağlanır.
  if (navBadge) {
    if (requests.length > 0) {
      navBadge.hidden = false;
      navBadge.textContent = String(requests.length);
      navBadge.setAttribute("aria-label", `${requests.length} bekleyen karar`);
    } else {
      navBadge.hidden = true;
    }
  }

  const tab = document.getElementById("tab-nav-requests");
  if (tab) tab.setAttribute("aria-label", requests.length > 0 ? `Kararlar, ${requests.length} bekleyen` : "Kararlar");

  if (!container) return;
  if (requests.length === 0) {
    container.innerHTML =
      '<div class="feed-empty">Bekleyen karar yok. Sistem güvenli beklemede.</div>';
    return;
  }
  container.innerHTML = requests.map(gateCardHtml).join("");
}

/* ══════════════════ ASK AIOS ══════════════════ */

let currentActiveAskRequestId = null;

function showAskError(message) {
  const el = document.getElementById("ask-error");
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

window.handleQuickAsk = function (promptText) {
  const input = document.getElementById("ask-aios-input");
  if (input) input.value = promptText;
  submitAskAios(promptText);
};

async function submitAskAios(customPrompt) {
  const input = document.getElementById("ask-aios-input");
  const prompt = (customPrompt || input?.value || "").trim();
  if (!prompt || !window.aios?.askAios) return;

  showAskError(null);
  const btn = document.getElementById("btn-submit-ask");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Çalışıyor…";
  }

  try {
    const res = await window.aios.askAios(prompt);
    if (!res || !res.ok) {
      // Modal diyalog yok: hata satır içi, role="alert" ile duyurulur.
      showAskError(res?.error ? `İstek başarısız: ${res.error}` : "İstek başarısız oldu.");
      return;
    }

    currentActiveAskRequestId = res.requestId;
    const card = document.getElementById("ask-workflow-card");
    if (card) card.hidden = false;

    setText("ask-prompt-text", `“${res.prompt}”`);
    setText("ask-op-text", res.operation || "—");
    setText("ask-why-text", res.reason || "İşlem insan onayı gerektiriyor");
    setText("ask-by-text", res.requestedBy || "orchestrator");
    setText("ask-risk-text", RISK_TEXT[res.risk] || res.risk || "belirtilmemiş");
    setIdChip("ask-digest-text", res.realityDigest || "");
    setIdChip("ask-request-badge", res.requestId || "");
    setText("ask-time", nowTimeString());

    const grid = document.getElementById("proposals-grid");
    if (grid) {
      grid.innerHTML = (res.proposals || [])
        .map(
          (p) => `
        <div class="proposal-chip">
          <span class="p-agent">${escapeHtml(p.agentName)}</span>
          <span class="p-conf">%${Math.round((p.confidence || 0) * 100)} eşleşme</span>
          <span class="p-hash">${escapeHtml(truncateId(p.canonicalHash || ""))}</span>
        </div>`,
        )
        .join("");
    }

    const actionBox = document.getElementById("human-gate-action-box");
    if (actionBox) actionBox.hidden = false;
    const resultBox = document.getElementById("task-result-box");
    if (resultBox) resultBox.hidden = true;
  } catch (err) {
    console.error("Ask AIOS error:", err);
    showAskError("AIOS'a ulaşılamadı. Bağlantıyı kontrol edin.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Gönder";
    }
  }
}

/** Ham sonucu kısa anlamsal cümleye indirger. */
function summarizeTaskResult(taskResult) {
  if (!taskResult) return "Sonuç döndü.";
  const d = taskResult.data?.data || taskResult.data || taskResult;
  if (d && typeof d === "object") {
    if (d.percentage !== undefined || d.level !== undefined) {
      const pct = d.percentage ?? d.level;
      const temp = d.temperature !== undefined ? ` · ${d.temperature}°C` : "";
      return `Pil %${pct}${temp}${d.status ? ` · ${d.status}` : ""}`;
    }
    if (d.ssid) return `Ağ: ${d.ssid}`;
    if (d.verdict) return `Karar: ${semantic(d.verdict)}`;
  }
  return "Sonuç kanıtlandı ve zincire yazıldı.";
}

async function handleHumanGateApprove() {
  if (!currentActiveAskRequestId || !window.aios?.approveAndExecute) return;
  const btn = document.getElementById("btn-hg-approve");
  const denyBtn = document.getElementById("btn-hg-deny");
  if (btn) { btn.disabled = true; btn.textContent = "Çalıştırılıyor…"; }
  if (denyBtn) denyBtn.disabled = true;

  try {
    const res = await window.aios.approveAndExecute(currentActiveAskRequestId);
    const actionBox = document.getElementById("human-gate-action-box");
    if (actionBox) actionBox.hidden = true;

    const resBox = document.getElementById("task-result-box");
    if (resBox) {
      resBox.hidden = false;
      const ok = res && res.ok !== false;
      setText("task-result-title", ok ? "Tamamlandı" : "Başarısız");
      const dot = document.getElementById("task-result-dot");
      if (dot) dot.className = `status-dot ${ok ? "proven" : "failed"}`;
      setText("task-result-summary", ok ? summarizeTaskResult(res.taskResult) : (res?.error || "İşlem başarısız."));
      setIdChip("task-witness-text", res?.taskWitnessId || "");
      const pre = document.getElementById("task-result-pre");
      if (pre) pre.textContent = JSON.stringify(res?.taskResult ?? res, null, 2);
    }
    refreshSurface();
  } catch (err) {
    console.error("Approve and execute failed:", err);
    showAskError("Onaylanan işlem çalıştırılamadı.");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Onayla"; }
    if (denyBtn) denyBtn.disabled = false;
  }
}

async function handleHumanGateDeny() {
  if (!currentActiveAskRequestId || !window.aios?.resolveApproval) return;
  await window.aios.resolveApproval(currentActiveAskRequestId, "DENY");
  const actionBox = document.getElementById("human-gate-action-box");
  if (actionBox) actionBox.hidden = true;
  const resBox = document.getElementById("task-result-box");
  if (resBox) {
    resBox.hidden = false;
    setText("task-result-title", "Reddedildi");
    const dot = document.getElementById("task-result-dot");
    if (dot) dot.className = "status-dot blocked";
    setText("task-result-summary", "İstek insan operatör tarafından reddedildi. İşlem çalıştırılmadı.");
  }
  refreshSurface();
}

window.handleDecision = async function (approvalId, decision) {
  try {
    if (window.aios?.resolveApproval) {
      await window.aios.resolveApproval(approvalId, decision);
      refreshSurface();
    }
  } catch (err) {
    console.error("Decision resolution failed", err);
  }
};

/* ══════════════════ KANONİK PROJEKSİYON TÜKETİMİ ══════════════════ */

function activeProfile() {
  const w = window.innerWidth;
  if (w <= 380) return "compact-mobile";
  if (w <= 899) return "mobile";
  if (w <= 1279) return "tablet";
  return "desktop";
}

async function refreshSurface() {
  let projection = null;
  let snap = null;

  try {
    if (window.aios?.getProjection) {
      projection = await window.aios.getProjection(activeProfile());
    }
    if (projection && projection.semanticSlots) {
      lastSuccessfulFetchAt = Date.now();
    } else {
      applyFreshness("OFFLINE");
      return;
    }
  } catch (err) {
    console.error("Projection fetch failed", err);
    // Offline veri LIVE olarak gösterilmez; son değerler yerinde kalır
    // ama tazelik durumu dürüstçe OFFLINE'a düşer.
    applyFreshness("OFFLINE");
    return;
  }

  try {
    snap = window.aios?.getRelaySnapshot ? await window.aios.getRelaySnapshot() : null;
  } catch {
    snap = null;
  }

  currentProjection = projection;
  currentSnapshot = snap;
  applyFreshness(currentFreshness());

  const slots = projection.semanticSlots;

  // ── PRIMARY: gerçeklik ──
  renderRealitySemantic(slots.currentReality?.matrix || []);
  renderMatrix(slots.currentReality?.matrix || []);
  renderNodesSemantic(slots.nodeOverview || {});
  renderEvidenceSemantic(slots);
  setIdChip("reality-digest", slots.currentReality?.digest || "");

  const policyBadge = document.getElementById("policy-badge");
  if (policyBadge) {
    policyBadge.textContent = `${slots.currentReality?.provenMatrixCount ?? 0}/${(slots.currentReality?.matrix || []).length} doğrulandı`;
  }

  // ── Düğümler ──
  const a = slots.nodeOverview?.android || {};
  const androidBadge = document.getElementById("android-badge");
  if (androidBadge) {
    if (a.online) { androidBadge.textContent = "Bağlı"; androidBadge.className = "status-badge lime"; }
    else if (a.stale) { androidBadge.textContent = SEMANTIC_TEXT.STALE; androidBadge.className = "status-badge amber"; }
    else { androidBadge.textContent = SEMANTIC_TEXT.OFFLINE; androidBadge.className = "status-badge pink"; }
  }
  setIdChip("android-node-id", a.nodeId || "");
  setIdChip("windows-node-id", slots.nodeOverview?.windows?.nodeId || "");

  const b = slots.nodeOverview?.browser || {};
  setIdChip("browser-node-id", b.nodeId || "");
  const bStat = document.getElementById("browser-status-verdict");
  if (bStat) {
    bStat.textContent = semantic(b.verdict);
    bStat.className = `stat-val ${b.verdict === "PASS" ? "lime" : b.verdict === "UNKNOWN" ? "" : "pink"}`;
  }

  // ── Kanıt / attestation (DETAIL) ──
  setIdChip("art-id", slots.recentEvidence?.latestArtifactId || "");
  setIdChip("latest-hash", slots.recentEvidence?.latestHash || "");
  setText("diag-profile", projection.profile);
  setIdChip("diag-projection-hash", projection.projectionHash || "");
  setIdChip("diag-slot-hash", projection.semanticSlotHash || "");

  // ── Bekleyen kararlar ──
  renderApprovalRequests(slots.pendingHuman?.items || []);

  // ── Snapshot'tan gelen tamamlayıcı ayrıntılar (varsa) ──
  if (snap) {
    if (snap.nodes?.android) {
      setText("android-agent-name", `${snap.nodes.android.agentName || "ajan"} v${snap.nodes.android.agentVersion || "?"}`);
      setText("android-endpoint", snap.nodes.android.endpoint || "—");
      renderServices(snap.nodes.android.services || []);
    }
    if (snap.nodes?.windows) setText("windows-endpoint", snap.nodes.windows.endpoint || "—");

    if (snap.attestation) {
      setIdChip("header-attest-witness", snap.attestation.latestWitnessId || "");
      setText("header-intersection-count", `${snap.attestation.allowedCapabilities?.length || 0} CAPS`);
      setIdChip("inter-hash", snap.attestation.intersectionHash || "");
      const interList = document.getElementById("intersection-list");
      if (interList) {
        interList.innerHTML = (snap.attestation.allowedCapabilities || [])
          .map((c) => `<span class="cap-tag">${escapeHtml(c)}</span>`)
          .join("");
      }
    }

    if (snap.artifact) {
      setIdChip("art-sha", snap.artifact.artifactSha256 || "");
      setIdChip("art-lineage", snap.artifact.lineageWitnessId || "");
      setText("art-approval", snap.artifact.humanApproved ? "Verildi" : "Yok");
      setText("art-policy", snap.artifact.policyResult === "ALLOWED" ? "İzin verildi" : semantic(snap.artifact.policyResult));
    }

    const browserRaw = snap.browser || snap.nodes?.browser;
    if (browserRaw) {
      setIdChip("browser-digest", browserRaw.proofDigest || browserRaw.proof_digest || "");
      setIdChip("browser-evidence-ref", browserRaw.evidenceRef || browserRaw.evidence_ref || "");
      const observed = browserRaw.lastSeen || browserRaw.observed_at;
      setText("browser-observed-at", observed ? relativeAge((Date.now() - new Date(observed).getTime()) / 1000) : "—");
    }
  }
}

function renderServices(services = []) {
  const el = document.getElementById("android-services");
  if (!el) return;
  if (services.length === 0) {
    el.innerHTML = '<div class="feed-empty">Servis bilgisi yok</div>';
    return;
  }
  el.innerHTML = services
    .map((s) => {
      const online = s.status === "online";
      return `
      <div class="service-item">
        <span class="s-name">${escapeHtml(s.label || s.id)}</span>
        <span class="s-status ${online ? "lime" : "pink"}">${online ? "Çalışıyor" : "Durmuş"}</span>
      </div>`;
    })
    .join("");
}

/* ══════════════════ ÇALIŞMA (RUN) ══════════════════ */

const RUN_STALE_AFTER_SEC = 120;

async function refreshRuntimeStatus() {
  if (!window.aios?.getRuntimeStatus) return;
  try {
    const res = await window.aios.getRuntimeStatus();
    if (!res || !res.ok) return;

    const state = res.state || "IDLE";
    const ageSec = res.heartbeat_age_sec;
    // Biten bir koşu "canlı" olarak okunmaz: yaş eşiği aşılmışsa STALE.
    const isRunning = state === "RUNNING";
    const isStale = isRunning && ageSec !== undefined && ageSec > RUN_STALE_AFTER_SEC;

    setText("run-headline", isStale ? "Yanıt vermiyor" : (RUN_STATE_TEXT[state] || state));
    setText("run-age", ageSec !== undefined ? relativeAge(ageSec) : "");

    const dot = document.getElementById("run-dot");
    if (dot) {
      dot.className = `status-dot ${
        isStale ? "stale"
          : state === "RUNNING" ? "running"
            : state === "PASSED" ? "proven"
              : state === "FAILED" ? "failed"
                : "offline"
      }`;
    }

    setText("runtime-state-badge", state);
    setText("runtime-liveness-badge", isStale ? "STALE" : (res.liveness || "STANDBY"));
    setText("rt-progress", `${res.step_index || 0} / ${res.step_total || 0}`);
    setText("rt-current-step", res.current_step ? res.current_step.replace("desktop/", "") : "—");
    setText("rt-heartbeat", ageSec !== undefined ? relativeAge(ageSec) : "—");
    setIdChip("rt-run-id", res.run_id || "");

    const elapsedSec = Math.floor((res.elapsed_ms || 0) / 1000);
    const hh = String(Math.floor(elapsedSec / 3600)).padStart(2, "0");
    const mm = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, "0");
    const ss = String(elapsedSec % 60).padStart(2, "0");
    setText("rt-elapsed", `${hh}:${mm}:${ss}`);
    setText("rt-eta", res.eta?.formatted || "—");

    // Sahte ilerleme yok: toplam adım bilinmiyorsa belirsiz durum.
    const bar = document.getElementById("rt-progress-bar");
    const fill = document.getElementById("rt-progress-fill");
    const total = res.step_total || 0;
    if (bar && fill) {
      if (total > 0) {
        const pct = Math.round(((res.step_index || 0) / total) * 100);
        bar.dataset.indeterminate = "false";
        bar.setAttribute("aria-valuenow", String(pct));
        fill.style.width = `${pct}%`;
      } else if (isRunning) {
        bar.dataset.indeterminate = "true";
        bar.removeAttribute("aria-valuenow");
      } else {
        bar.dataset.indeterminate = "false";
        bar.setAttribute("aria-valuenow", "0");
        fill.style.width = "0%";
      }
    }

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

async function handleReadBattery() {
  const btn = document.getElementById("btn-read-battery");
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = "Okunuyor…";
  try {
    const res = await window.aios.readBattery();
    if (res.ok && res.data && res.data.data) {
      const bat = res.data.data;
      setText("sensor-battery", `${bat.percentage ?? bat.level ?? "—"}%`);
      setText("sensor-temp", `${bat.temperature ?? "—"}°`);
      setText("sensor-status", bat.status || "OK");
    }
  } catch (err) {
    console.error("Read battery failed", err);
  } finally {
    btn.disabled = false;
    btn.textContent = "Pil durumunu kanıtla";
  }
}

/* ══════════════════ NAVİGASYON ══════════════════ */

const TAB_HEADINGS = {
  ask: "Ne yapmak istiyorsun?",
  reality: "Şu an ne kanıtlandı?",
  requests: "Senden karar bekleniyor",
  evidence: "Son sonuç ve kanıt",
  nodes: "Düğümler",
};

let currentMobileView = "ask";

window.switchMobileView = function (tabName) {
  currentMobileView = tabName;

  const updateDOM = () => {
    const grid = document.getElementById("main-deck-grid");
    if (grid) grid.className = `deck-grid view-${tabName}`;

    document.querySelectorAll(".nav-tab").forEach((t) => {
      const selected = t.getAttribute("data-tab") === tabName;
      t.classList.toggle("active", selected);
      t.setAttribute("aria-selected", selected ? "true" : "false");
      t.setAttribute("tabindex", selected ? "0" : "-1");
    });

    const heading = document.getElementById("center-heading");
    if (heading && TAB_HEADINGS[tabName]) heading.textContent = TAB_HEADINGS[tabName];

    // Sekme değişiminde içerik başına dön; kaydırma konumu taşınmaz.
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  };

  if (document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.startViewTransition(() => updateDOM());
  } else {
    updateDOM();
  }
};

/** Tab listesinde ok tuşu gezinmesi (ARIA tab pattern). */
function handleTabKeydown(e) {
  const tabs = Array.from(document.querySelectorAll(".nav-tab"));
  const idx = tabs.indexOf(document.activeElement);
  if (idx === -1) return;
  let next = null;
  if (e.key === "ArrowRight") next = tabs[(idx + 1) % tabs.length];
  else if (e.key === "ArrowLeft") next = tabs[(idx - 1 + tabs.length) % tabs.length];
  else if (e.key === "Home") next = tabs[0];
  else if (e.key === "End") next = tabs[tabs.length - 1];
  if (next) {
    e.preventDefault();
    next.focus();
    switchMobileView(next.getAttribute("data-tab"));
  }
}

/* ══════════════════ BAĞLAMA ══════════════════ */

document.addEventListener("DOMContentLoaded", () => {
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const pwaBadge = document.getElementById("pwa-mode-badge");
  if (pwaBadge) pwaBadge.hidden = !isStandalone;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("PWA ServiceWorker registration skipped:", err.message);
    });
  }

  switchMobileView("ask");

  // Tab bar
  document.getElementById("mobile-bottom-nav")?.addEventListener("click", (e) => {
    const tab = e.target.closest(".nav-tab");
    if (tab) switchMobileView(tab.getAttribute("data-tab"));
  });
  document.getElementById("mobile-bottom-nav")?.addEventListener("keydown", handleTabKeydown);

  // Kimlik çipi kopyalama + gate kararları + hazır istekler (olay delegasyonu)
  document.addEventListener("click", (e) => {
    const chip = e.target.closest(".idchip");
    if (chip) {
      copyToClipboard(chip.dataset.copy || chip.textContent);
      return;
    }
    const decision = e.target.closest("[data-decision]");
    if (decision) {
      handleDecision(decision.dataset.approval, decision.dataset.decision);
      return;
    }
    const ask = e.target.closest("[data-ask]");
    if (ask) {
      handleQuickAsk(ask.dataset.ask);
      return;
    }
    const goto = e.target.closest("[data-goto]");
    if (goto) switchMobileView(goto.dataset.goto);
  });

  document.getElementById("btn-manual-refresh")?.addEventListener("click", refreshSurface);
  document.getElementById("btn-read-battery")?.addEventListener("click", handleReadBattery);

  document.getElementById("btn-submit-ask")?.addEventListener("click", () => submitAskAios());
  document.getElementById("ask-aios-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitAskAios();
  });
  document.getElementById("btn-hg-approve")?.addEventListener("click", handleHumanGateApprove);
  document.getElementById("btn-hg-deny")?.addEventListener("click", handleHumanGateDeny);

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

  // Profil sınırı geçildiğinde kanonik projeksiyon yeniden istenir.
  let lastProfile = activeProfile();
  window.addEventListener("resize", () => {
    const p = activeProfile();
    if (p !== lastProfile) {
      lastProfile = p;
      refreshSurface();
    }
  });

  refreshSurface();
  refreshRuntimeStatus();

  setInterval(refreshSurface, 5000);
  setInterval(refreshRuntimeStatus, 1000);
  // Tazelik, ağ olmadan da geçen süreyle birlikte dürüstçe yaşlanır.
  setInterval(() => applyFreshness(currentFreshness()), 2000);
});
