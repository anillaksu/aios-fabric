// AIOS Desktop Control Surface — Renderer Logic

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
    document.getElementById("latest-hash").textContent = hash;
    document.getElementById("header-witness-time").textContent = item.timestamp;
    document.getElementById("witness-count").textContent = `${witnessHistory.length} KAYIT`;
  });
}

function renderWitnessFeed() {
  const container = document.getElementById("witness-feed");
  if (witnessHistory.length === 0) {
    container.innerHTML = '<div class="feed-empty">Henüz witness kaydı bulunmuyor.</div>';
    return;
  }
  container.innerHTML = witnessHistory
    .slice(0, 15)
    .map(
      (w) => `
      <div class="witness-card">
        <div class="witness-header">
          <span class="witness-title">⚡ ${w.title}</span>
          <span class="witness-time">${w.timestamp}</span>
        </div>
        <div class="witness-hash">HASH: ${w.hash}</div>
        <div class="witness-data">${w.data.slice(0, 120)}${w.data.length > 120 ? "..." : ""}</div>
      </div>
    `,
    )
    .join("");
}

async function refreshAndroidNode() {
  try {
    const res = await window.aios.getAndroidNode();
    const badge = document.getElementById("android-badge");
    if (res.reachable) {
      badge.textContent = "● ONLINE (HTTP 200)";
      badge.className = "status-badge lime";
    } else {
      badge.textContent = "● ULAŞILAMIYOR";
      badge.className = "status-badge pink";
    }

    if (res.card) {
      document.getElementById("android-agent-name").textContent = res.card.name || "Phone AI-OS Fabric";
      document.getElementById("android-agent-version").textContent = `v${res.card.version || "0.1.0"}`;
    }

    if (res.status && Array.isArray(res.status.services)) {
      const container = document.getElementById("android-services");
      container.innerHTML = res.status.services
        .map(
          (s) => `
        <div class="service-item">
          <span class="s-name">${s.id}</span>
          <span class="s-status ${s.status === "online" ? "lime" : "amber"}">${s.status.toUpperCase()}</span>
        </div>
      `,
        )
        .join("");
    }

    if (Array.isArray(res.capabilities)) {
      document.getElementById("cap-count").textContent = res.capabilities.length;
      const list = document.getElementById("caps-list");
      list.innerHTML = res.capabilities
        .slice(0, 12)
        .map((c) => `<span class="cap-tag">${c.name}</span>`)
        .join("");
    }
  } catch (err) {
    console.error("Android node fetch failed", err);
  }
}

async function refreshWindowsNode() {
  try {
    const res = await window.aios.getWindowsNode();
    const badge = document.getElementById("windows-badge");
    if (res.reachable) {
      badge.textContent = "● ONLINE (:9310)";
      badge.className = "status-badge lime";
    } else {
      badge.textContent = "● READY (STANDBY)";
      badge.className = "status-badge cyan";
    }
  } catch (err) {
    console.error("Windows node fetch failed", err);
  }
}

async function refreshFormations() {
  try {
    const res = await window.aios.getFormations();
    if (res.ok && res.data) {
      document.getElementById("f-count").textContent = (res.data.formations || []).length;
      document.getElementById("edge-count").textContent = (res.data.provenanceEdges || []).length;
    }
  } catch (err) {
    console.error("Formations fetch failed", err);
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
    refreshAndroidNode();
    refreshWindowsNode();
    refreshFormations();
  });

  document.getElementById("btn-read-battery").addEventListener("click", handleReadBattery);

  // İlk yükleme
  refreshAndroidNode();
  refreshWindowsNode();
  refreshFormations();

  // Otomatik okuma döngüsü (8 saniye)
  setInterval(() => {
    refreshAndroidNode();
    refreshWindowsNode();
  }, 8000);
});
