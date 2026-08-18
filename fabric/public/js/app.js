/* ═══════════════════════════════════════════════════════════════
   AI-OS · SHELL  (v0.3)
   ───────────────────────────────────────────────────────────────
   SERT KURALLAR (tasarim anayasasi):
     · 1 ekran = 1 ana amac
     · 1 ekran = 1 ana GIRIS yuzeyi   -> tek composer (alt), ust bar input DEGIL
     · 1 komut = 1 net durum akisi
     · 1 sonuc  = 1 birincil ARTEFAKT -> metin kisa, cikti artefakt
     · FAB yok  -> mic composer'in icinde
   Sekmeler: HOME · KEŞFET · ARTEFAKT · AKTİF · HERMES
   (Keşfet: sistem yüzeyleri + Android uygulamaları + AIOS uygulamaları)
   ═══════════════════════════════════════════════════════════════ */

import { read, getJSON, postJSON, sendIntent, events } from "./api.js";
import { render, el } from "./registry.js";
import { validateScreen, mount, setAllowedActions } from "./renderer.js";
import * as SC from "./screens.js";
import { UI_META_ACTIONS } from "./ui-actions.js";
import { WindowManager } from "./windowmanager.js";
import { admitArtifact, capabilitySetVersion } from "./artifact-contract.js";
import { SCROLLABLE_SOUND_PANEL, SOUND_PANEL_REQUIREMENTS, musicVolumeFromResponse, soundPanelWithMusicVolume, DEVICE_STATUS_PANEL, DEVICE_STATUS_PANEL_ID, DEVICE_STATUS_PANEL_REQUIREMENTS, deviceStatusWithLiveData } from "./reference-artifacts.js";
import { meetsUiRequirements } from "./ui-requirements.js";
import { getAll as storeGetAll, putAll as storePutAll, requestPersistence } from "./artifact-store.js";
import { applicationsForArtifact, canDeleteArtifact, createApplicationEntry, nextApplicationPosition, orderedApplications, recordApplicationOpen, updateApplicationEntry } from "./application-model.js";
import { cacheKey, getCached, putCached, writeEligible } from "./prompt-cache.js";
import { logClientError } from "./client-log.js";
import { ParseClient } from "./parse-client.js";
import { hasMeaningfulData } from "./dispatch-utils.js";
import { normalizeNavigation, toHistoryState, isSameNavigation } from "./navigation-state.js";
import { runViewTransition } from "./view-transitions.js";
import { createRootFormation, verifyFormation } from "./formation-memory.js";

// W6.K: LLM ciktisinin ayiklanmasi/dogrulanmasi (JSON.parse + validateScreen +
// admitArtifact) artik ayri bir Worker'da kosar - izole, terminate() edilebilir,
// kacak/asili bir parse ana thread'i (dolayisiyla UI'yi) kilitlemez. Worker
// yalnizca compute/transform yapar, capability.execute() CAGIRAMAZ (bkz.
// parse-worker.js basindaki not, docs/CHECKLIST.md W6.K).
const parseClient = new ParseClient(() => new Worker(new URL("./parse-worker.js", import.meta.url), { type: "module" }));

const S = SC.S;

/* ════════ TOAST/SHEET (Framework7 kaldirildi, native <dialog>/Popover) ════════ */
let toastHost = null;
function showToast(text, err) {
  if (!toastHost) {
    toastHost = el("div", "native-toast");
    toastHost.setAttribute("popover", "manual");
    document.body.appendChild(toastHost);
  }
  toastHost.textContent = text;
  toastHost.classList.toggle("err", !!err);
  toastHost.showPopover();
  clearTimeout(toastHost._t);
  toastHost._t = setTimeout(() => toastHost.hidePopover(), 2100);
}

function createSheet(html) {
  const dlg = document.createElement("dialog");
  dlg.className = "aios-sheet";
  dlg.innerHTML = html;
  document.body.appendChild(dlg);
  const listeners = {};
  const close = () => { if (dlg.open) dlg.close(); };
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg || e.target.closest(".sheet-close")) close();
  });
  dlg.addEventListener("close", () => (listeners.closed || []).forEach((cb) => cb()));
  return {
    open: () => dlg.showModal(),
    close,
    on(ev, cb) { (listeners[ev] || (listeners[ev] = [])).push(cb); },
    destroy: () => dlg.remove(),
  };
}
let currentTab = "home";
let secondary = null;
let secondaryArg = null;   // ikincil ekrana parametre (orn. journal tur filtresi)
let artifactOpenId = null;
let navigationIndex = 0;
let capabilityNames = [];
let capabilitiesWithRisk = []; // [{name,risk}] - W6.L cacheKey() icin (yalnizca ad degil, risk seviyesi de)
let capVersion = null; // artifact-contract.js:capabilitySetVersion() - boot()'ta hesaplanir
// W6.C (orijinal kapsam): "bos pencere" acikken alt composer normal Hermes
// sohbetine DEGIL, bu pencerenin icini doldurmaya yonlendirilir. null =
// normal sohbet modu.
let fillTarget = null; // { id } - pending (henuz artifacts[]'e yazilmamis) pencere
// Artefakt sozlesmesi icin: yalnizca REFLEX/AGENT capability leri "is yapar"
// sayilir. THOUGHT (llm.generate) ve ui.* gezinme eylemleri haric.
let ACTIONABLE = new Set();
let query = "";            // KOMUT sekmesi filtresi
const $ = (s) => document.querySelector(s);

/* ════════ ARTEFAKT DEPOSU ════════
   "Artefakt merkezi": uretilenler kaybolmaz, sabitlenebilir, yeniden
   uretilebilir. localStorage'da kalir.                                  */
const ART_KEY = "aios.artifacts";
let artifacts = [];        // { id, title, spec, prompt, createdAt, pinned }
let artifactsLoadState = "loading"; // loading | ready | error — yalniz galeri kaynagi
let artifactsLoadError = null;
// W6.G: ApplicationEntry ayri launcher identity'sidir; artifact'in spec/capability
// kopyasi degildir. Sunucu birincil, /applications yalniz bu kucuk listeyi tasir.
let applications = [];     // { id, artifactId, title, icon, position }
let applicationsLoadState = "loading";
let applicationsLoadError = null;

// W6.C: artefakt acma/kapama artik WindowManager'in lifecycle'indan geciyor
// (register/focus/unfocus). Icerik hala mevcut artifactBlock()/render() ile
// cizilir - YENI URETIM YOK, yalnizca ac/kapa durumu WindowManager'a tasindi.
const wm = new WindowManager();

// M-9 (2026-08-18, owner istegi): depolama yonu ters cevrildi. Fabric zaten
// Termux'un kendi sureci - sinirsiz erisimli dosya sistemi var. Tarayicinin
// kisitli/denetlenmesi zor deposunu (bugunku SELinux/Shizuku arastirmasi
// bunu gosterdi) birincil yapmak gereksiz riskti. Simdi: SUNUCU birincil
// kaynak, IndexedDB yalnizca cevrimdisi/hizli-acilis ONBELLEGI.
async function loadArtifacts() {
  let serverList = null;
  try {
    const r = await fetch("/artifacts", { signal: AbortSignal.timeout(4000) });
    if (r.ok) { const j = await r.json(); if (Array.isArray(j)) serverList = j; }
  } catch (err) { artifactsLoadError = String(err.message || err); logClientError("loadArtifacts.serverFetch", err); } // B-9 riskiyle ayni: sunucu erisilemez olabilir, onbellege dus

  if (serverList && serverList.length) {
    artifacts = serverList;
    try { await storePutAll(artifacts); } catch (err) { logClientError("loadArtifacts.storePutAll(sunucu->onbellek senkron)", err); }
    artifactsLoadState = "ready"; artifactsLoadError = null;
    return;
  }

  // Sunucu bos ya da erisilemedi - yerel onbellekten oku.
  try { artifacts = await storeGetAll(); } catch (err) { artifactsLoadError = String(err.message || err); logClientError("loadArtifacts.storeGetAll", err); artifacts = []; }
  if (artifacts.length === 0) {
    // W6.F GOC (2026-08-17): IndexedDB de bosSA eski localStorage'da veri
    // kalmis olabilir - TEK SEFERLIK tasi, veri kaybi olmasin.
    try {
      const legacy = JSON.parse(localStorage.getItem(ART_KEY) || "[]");
      if (Array.isArray(legacy) && legacy.length) artifacts = legacy;
    } catch (err) { logClientError("loadArtifacts.legacyLocalStorage", err); }
  }
  // Yerelde veri var ama sunucu bosSA/erisilemediyse: sunucuyu bu veriyle
  // besle - boylece sunucu GERCEKTEN birincil kaynak OLUR, bir dahaki
  // acilista GET bunu dondurur (serverList===null: erisilemedi, tekrar
  // denenecek; serverList===[]: sunucu gercekten bos, buradan doldurulur).
  if (artifacts.length > 0 && (serverList === null || serverList.length === 0)) {
    try { await storePutAll(artifacts); } catch (err) { logClientError("loadArtifacts.storePutAll(yerel->onbellek)", err); }
    fetch("/artifacts", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(artifacts),
    }).catch((err) => logClientError("loadArtifacts.serverSeed", err));
  }
  try { localStorage.removeItem(ART_KEY); } catch (err) { logClientError("loadArtifacts.legacyCleanup", err); }
  artifactsLoadState = artifactsLoadError && artifacts.length === 0 ? "error" : "ready";
}
async function saveArtifacts() {
  // Sunucu BIRINCIL kaynak (M-9) - once sunucuya yazilir.
  try {
    await fetch("/artifacts", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(artifacts), signal: AbortSignal.timeout(6000),
    });
  } catch (err) { logClientError("saveArtifacts.serverPost", err); } // sunucuya ulasilamadi - onbellek yine de guncellenir, bir sonraki basarili acilista sunucu bu onbellekten beslenir
  // 30 kayit sinirlamasi YOK (W6.F) - IndexedDB kotasi buna gerek birakmiyor.
  try { await storePutAll(artifacts); } catch (err) { logClientError("saveArtifacts.storePutAll", err); }
}
async function loadApplications() {
  try {
    const r = await fetch("/applications", { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const list = await r.json();
    if (!Array.isArray(list)) throw new Error("dizi bekleniyor");
    applications = list;
    applicationsLoadState = "ready"; applicationsLoadError = null;
  } catch (err) {
    // İlk kurulumda dosya yoksa sunucu [] döner; gerçek ağ/parsing hatası görünür kalır.
    logClientError("loadApplications", err);
    applications = [];
    applicationsLoadState = "error"; applicationsLoadError = String(err.message || err);
  }
}
async function refreshAndroidApps() {
  S.appsLoadState = "loading"; S.appsLoadError = null; paint();
  try {
    const result = await read("app.list", {});
    if (!result.ok || !Array.isArray(result.data?.apps)) throw new Error(result.error || "uygulama listesi alınamadı");
    S.apps = result.data.apps;
    S.appsLoadState = "ready";
  } catch (err) {
    S.apps = []; S.appsLoadState = "error"; S.appsLoadError = String(err.message || err);
    logClientError("refreshAndroidApps", err);
  }
  paint();
}
async function refreshArtifacts() { await loadArtifacts(); paint(); }
async function refreshApplications() { applicationsLoadState = "loading"; applicationsLoadError = null; paint(); await loadApplications(); paint(); }
async function saveApplications() {
  try {
    const r = await fetch("/applications", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(applications), signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
  } catch (err) { logClientError("saveApplications", err); }
}
function addApplication(artifact) {
  const id = "app" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const entry = createApplicationEntry({ id, artifact, position: nextApplicationPosition(applications) });
  applications.push(entry);
  saveApplications();
  return entry;
}
function removeApplication(id) {
  const before = applications.length;
  applications = applications.filter((entry) => entry.id !== id);
  if (applications.length === before) return false;
  saveApplications();
  return true;
}
function editApplication(entry) {
  const title = window.prompt("Uygulama adı", entry.title || "Uygulama");
  if (title === null) return false;
  const icon = window.prompt("Framework7 ikon adı", entry.icon || "square_grid_2x2_fill");
  if (icon === null) return false;
  const result = updateApplicationEntry(applications, entry.id, { title, icon });
  if (!result.changed) return false;
  applications = result.entries;
  saveApplications();
  return true;
}
function openApplication(applicationId, artifactId) {
  if (applicationId) {
    const result = recordApplicationOpen(applications, applicationId);
    if (result.changed) { applications = result.entries; saveApplications(); }
  }
  openArtifact(artifactId);
}
function addArtifact(spec, prompt, contract, id) {
  const item = {
    id: id || ("a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
    title: spec.title || "Artefakt", spec, prompt: prompt || "",
    createdAt: Date.now(), pinned: false,
    // M-5 sozlesme alanlari (2026-08-17): admitArtifact()'in urettigi kapi
    // gecmis kayit. approvalScope henuz yok - Katman B/KARAR-2 onay akisi
    // W6.4'te kurulunca eklenecek, bugun uretilen hepsi risk:safe render.
    capabilities: (contract && contract.capabilities) || [],
    version: (contract && contract.version) || null,
    provenance: (contract && contract.provenance) || "hermes",
  };
  artifacts.unshift(item);
  saveArtifacts();
  // Formation kaydi artifact'in yerini almaz: ayni kalici artefakta eklenen,
  // deterministic ve portable kimlik/provenance projeksiyonudur. Web Crypto
  // asenkron oldugu icin ilk kayit once mevcut semantikle yazilir; identity
  // hazir olunca ayni kayit tekrar sunucu-birincil depoya yazilir.
  void ensureRootFormation(item);
  updateBadges();
  return item;
}
const findArtifact = (id) => artifacts.find((a) => a.id === id);

async function ensureRootFormation(artifact) {
  try {
    if (artifact?.formation && await verifyFormation(artifact.formation)) return artifact.formation;
    const formation = await createRootFormation(artifact);
    artifact.formation = formation;
    await saveArtifacts();
    return formation;
  } catch (err) {
    // Artefaktin mevcut davranisi identity hesap hatasiyla bozulmaz; hata
    // sessiz kalmaz ve formation kaydi FACT diye sunulmaz.
    logClientError("formationMemory.ensureRootFormation", err);
    return null;
  }
}

/* ════════ TEMALAR ════════ */
const THEMES = [
  { id: "phosphor", short: "PHS", bg: "#070B10", primary: "#4ADE80" },
  { id: "amber",    short: "AMB", bg: "#0C0906", primary: "#FBBF24" },
  { id: "ice",      short: "ICE", bg: "#060A12", primary: "#38BDF8" },
  { id: "synth",    short: "SYN", bg: "#0A0714", primary: "#C084FC" },
  { id: "paper",    short: "PPR", bg: "#F4F6F5", primary: "#15803D" },
];
const currentTheme = () => document.documentElement.dataset.theme || "phosphor";
function setTheme(id) {
  document.documentElement.dataset.theme = id;
  const t = THEMES.find((x) => x.id === id);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && t) meta.setAttribute("content", t.bg);
  try { localStorage.setItem("aios.theme", id); } catch (err) { logClientError("setTheme.persist", err); }
}
function loadTheme() {
  let id = "phosphor";
  try { id = localStorage.getItem("aios.theme") || "phosphor"; } catch (err) { logClientError("loadTheme.read", err); }
  setTheme(THEMES.some((t) => t.id === id) ? id : "phosphor");
}

/* ════════ ACTION DISPATCHER ════════ */
let lastReceipt = null;
const ctx = {
  async dispatch(action) {
    if (!action || !action.type) return { ok: false, error: "eylem yok" };
    const { type, payload } = action;

    if (type === "ui.goto") {
      if (payload && payload.tab) goTab(payload.tab);
      else if (payload && payload.screen) goSecondary(payload.screen, payload.filter);
      return { ok: true };
    }
    if (type === "ui.back")      { goBack(); return { ok: true }; }
    if (type === "ui.appsheet")  { openAppSheet(payload); return { ok: true }; }
    if (type === "ui.control")   { openControlCenter(); return { ok: true }; }
    // silent: soruyu sohbete TEKRAR yazma - "TEKRAR DENE" butonu icin gerekli,
    // yoksa ayni kullanici mesaji iki kez gorunuyor.
    if (type === "ui.ask")       { ask(payload && payload.q, { silent: !!(payload && payload.silent) }); return { ok: true }; }
    if (type === "ui.artifact")  { openArtifact(payload && payload.id); return { ok: true }; }
    if (type === "ui.application") { openApplication(payload && payload.applicationId, payload && payload.artifactId); return { ok: true }; }
    if (type === "ui.referenceSoundPanel") return openReferenceArtifact(SCROLLABLE_SOUND_PANEL, SOUND_PANEL_REQUIREMENTS, "Kaydırılabilir Ses Paneli");
    if (type === "ui.referenceDeviceStatus") return openReferenceArtifact(DEVICE_STATUS_PANEL, DEVICE_STATUS_PANEL_REQUIREMENTS, "Cihaz Durum Merkezi");
    if (type === "ui.compose")   { focusComposer(payload && payload.text); return { ok: true }; }
    if (type === "ui.refreshApps") { await refreshAndroidApps(); return { ok: S.appsLoadState === "ready", error: S.appsLoadError }; }
    if (type === "ui.refreshArtifacts") { await refreshArtifacts(); return { ok: artifactsLoadState === "ready", error: artifactsLoadError }; }
    if (type === "ui.refreshApplications") { await refreshApplications(); return { ok: applicationsLoadState === "ready", error: applicationsLoadError }; }
    if (type === "cap.test")     { return testCapability(payload && payload.name); }
    // MINI-APP URETIMI: normal bir istekten tek farki, sonucun otomatik
    // SABITLENMESI. "Kalici giris" derken kastedilen sey buydu - artefakt
    // zaten calisabilir bir arayuz, eksik olan onu kalici kilan adimdi.
    if (type === "ui.miniapp") {
      const what = (payload && payload.what) || "";
      if (!what) { focusComposer("Bana bir "); return { ok: true }; }
      await ask(what, { pin: true });
      return { ok: true };
    }
    if (type === "ui.taskCancel" || type === "ui.taskRetry" || type === "ui.taskUndo") {
      const path = type === "ui.taskCancel" ? "/task/cancel"
                 : type === "ui.taskUndo"   ? "/task/undo" : "/task/retry";
      const r = await postJSON(path, { taskId: payload && payload.taskId });
      if (r && !r.ok && r.error) toast(String(r.error).slice(0, 90), true);
      await refresh();
      return r || { ok: false, error: "istek başarısız" };
    }
    // OTOMASYON KURALLARI
    if (type === "ui.ruleAdd") {
      const r = await postJSON("/automations", (payload && payload.rule) || {});
      toast(r && r.ok ? "Kural eklendi" : String((r && r.error) || "eklenemedi"), !(r && r.ok));
      paint();
      return r;
    }
    if (type === "ui.ruleToggle") {
      const r = await postJSON("/automations/toggle", { id: payload && payload.id, enabled: payload && payload.enabled });
      paint();
      return r;
    }
    if (type === "ui.ruleRemove") {
      const r = await postJSON("/automations/remove", { id: payload && payload.id });
      toast(r && r.ok ? "Kural silindi" : "silinemedi", !(r && r.ok));
      paint();
      return r;
    }

    // Her eylem ZARF olarak gider: kaynak + ham ifade kaydedilir, gorev
    // olusur, AKTİF sekmesinde ve DevTools ta gorunur. Sonuc yine burada.
    const t0 = performance.now();
    // 2026-08-17 W0.3: timeout zinciri capability < envelope < UI olmali.
    // Envelope varsayilani 30sn (server.ts); UI'nin kendi bekleme suresi
    // ondan uzun olmali, yoksa sunucu hala calisirken UI "zaman asimi" gosterir.
    const res = await sendIntent(type, payload, {
      source: action.source || "ui",
      raw: action.raw || labelForAction(type, payload),
      timeoutMs: type === "script.run" ? 60000 : 35000,
    });
    const ms = Math.round(performance.now() - t0);

    if (type === "app.open" && res.ok && payload && payload.pkg) rememberRecent(payload.pkg);

    if (type === "script.run") {
      const out = res.ok ? String((res.data && res.data.stdout) || "(çıktı yok)") : String(res.error || "hata");
      chat.push({ role: "agent", spec: {
        type: "action-receipt", state: res.ok ? "success" : "error",
        steps: [{ name: String((payload && payload.cmd) || "").slice(0, 60), ms }],
        executor: "device/shell",
      } });
      chat.push({ role: "agent", text: out.slice(0, 1500), mono: true });
      if (currentTab === "hermes") paint();
      else toast(res.ok ? "Betik çalıştı — HERMES'te" : "Betik hatası", !res.ok);
    } else if (res.ok && hasMeaningfulData(res.data)) {
      // B-12 (2026-08-18'de bulundu): veri donduren REFLEX capability'ler
      // (konum, uygulama listesi, wifi bilgisi, ses seviyesi vb.) script.run
      // DISINDA hicbir yerde gorunmuyordu - dispatch basariyla tamamlaniyor
      // ama sonuc hicbir zaman ekrana cikmiyordu (owner canli testte
      // yakaladi: "Konum Bilgisi bir sey vermedi", "Uygulama Listesi ise
      // yaramadi" - ikisi de sunucuda GERCEKTEN basarili olmustu, journal
      // kanitladi). script.run'in KENDI deseni (action-receipt + mono metin,
      // HERMES'e dusme) burada AYNEN genellendi - yeni bir gosterim bicimi
      // icat edilmedi (K10).
      const out = typeof res.data === "string" ? res.data : JSON.stringify(res.data, null, 1);
      chat.push({ role: "agent", spec: {
        type: "action-receipt", state: "success",
        steps: [{ name: type, ms }],
        executor: "device/local",
      } });
      chat.push({ role: "agent", text: out.slice(0, 1500), mono: true });
      if (currentTab === "hermes") paint();
      else toast("Sonuç — HERMES'te", false);
    }

    lastReceipt = {
      type: "action-receipt", state: res.ok ? "success" : "error",
      steps: [{ name: type, change: payload && payload.pkg ? payload.pkg : undefined, ms }],
      executor: "device/local",
    };
    if (!res.ok && type !== "script.run") toast(String(res.error || "hata").slice(0, 90), true);
    return res;
  },
};

/** Referans artefact'lar LLM uretimi degildir; ayni admission/persistence kapisindan gecer. */
async function openReferenceArtifact(spec, requirements, prompt) {
  const existing = findArtifact(spec.id);
  if (existing) { openArtifact(existing.id); return { ok: true }; }
  if (!meetsUiRequirements(spec, requirements)) {
    return { ok: false, error: "referans artefact contract gereksinimlerini karşılamıyor" };
  }
  const contract = admitArtifact(spec, {
    knownCapabilities: capabilityNames,
    versionStamp: await capabilitySetVersion(capabilityNames),
    provenance: "reference",
  });
  if (!contract.ok) return { ok: false, error: contract.reason };
  const artifact = addArtifact(spec, prompt, contract.contract, spec.id);
  openArtifact(artifact.id);
  return { ok: true };
}

/** Eylemi insan diline cevirir - zarfin "ham ifade" alani icin. */
function labelForAction(type, payload) {
  if (type === "app.open" && payload && payload.pkg) {
    const a = S.apps.find((x) => x.pkg === payload.pkg);
    return (a ? a.name : payload.pkg) + " uygulamasını aç";
  }
  if (type === "torch.set") return payload && payload.on ? "Feneri aç" : "Feneri kapat";
  if (type === "script.run") return "Betik çalıştır: " + String((payload && payload.cmd) || "").slice(0, 50);
  if (type === "volume.set") return "Sesi " + (payload && payload.value) + " yap";
  if (type === "media.play_search") return "\"" + ((payload && payload.query) || "") + "\" çal";
  if (type === "doc.create") return ((payload && payload.format) || "belge").toUpperCase() + " oluştur";
  return type;
}

const toast = (text, err) => showToast(text, err);

/* ════════ SON KULLANILAN ════════ */
function rememberRecent(pkg) {
  const found = S.apps.find((a) => a.pkg === pkg) || { pkg, name: pkg };
  S.recent = [found, ...S.recent.filter((r) => r.pkg !== pkg)].slice(0, 8);
  try { localStorage.setItem("aios.recent", JSON.stringify(S.recent)); } catch (err) { logClientError("rememberRecent.persist", err); }
}
function loadRecent() {
  try { S.recent = JSON.parse(localStorage.getItem("aios.recent") || "[]"); } catch (err) { logClientError("loadRecent.read", err); S.recent = []; }
}

/* ════════ NAVIGASYON ════════
   Tab bir hedef secimidir, geri yiginina yeni adim eklemez. Secondary ekran
   ve odakli artifact ise geri donulebilir ayni-belge history adimidir.
   Dialog/sheet burada yer almaz: native dialog kendi cancel/close semantigini
   korur, browser geri tusu ile sayfa navigation'i karismaz. */
function navigationSnapshot() {
  return { tab: currentTab, screen: secondary, arg: secondaryArg, artifactId: artifactOpenId, index: navigationIndex };
}
function applyNavigation(next, historyMode = null) {
  const nav = normalizeNavigation(next);
  if (fillTarget && fillTarget.id !== nav.artifactId) { wm.remove(fillTarget.id); fillTarget = null; }
  if (artifactOpenId && artifactOpenId !== nav.artifactId) wm.unfocus();
  currentTab = nav.tab; secondary = nav.screen; secondaryArg = nav.arg;
  artifactOpenId = nav.artifactId; navigationIndex = nav.index;
  if (historyMode === "push") history.pushState(toHistoryState(nav), "");
  if (historyMode === "replace") history.replaceState(toHistoryState(nav), "");
  document.querySelectorAll(".aios-tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === currentTab));
  syncComposer();
  const kind = historyMode === "push" ? "push" : historyMode === null ? "pop" : "tab";
  runViewTransition({ kind, render: () => { paint(); } });
}
function goTab(tab) {
  // Bos pencere doldurulmadan sekme degistirilirse iptal say - kalici
  // hicbir sey yazilmadi (M-8: dogrulanmadan kalicilasmaz), WindowManager
  // kaydi da temizlenir ki orphan kalmasin.
  applyNavigation({ tab, index: navigationIndex }, "replace");
}
function goSecondary(screen, arg = null) {
  // Eski Control Center "device" hedefi ayrı bir ekran değil, aynı kalıcı
  // referans artifact'tır. Böylece geri tuşu hayalet secondary ekrana değil,
  // geldiği AIOS yüzeyine döner.
  if (screen === "device") { openReferenceArtifact(DEVICE_STATUS_PANEL, DEVICE_STATUS_PANEL_REQUIREMENTS, "Cihaz Durum Merkezi"); return; }
  const next = { tab: currentTab, screen, arg, index: navigationIndex + 1 };
  applyNavigation(next, isSameNavigation(navigationSnapshot(), next) ? "replace" : "push");
}
function goBack() {
  if (navigationIndex > 0) { history.back(); return; }
  if (artifactOpenId) wm.unfocus();
  if (secondary || artifactOpenId || currentTab !== "home") applyNavigation({ tab: "home", index: 0 }, "replace");
}

function syncComposer() {
  const inp = $("#input");
  inp.placeholder =
    fillTarget              ? "Bu pencere için ne üretilsin?" :
    currentTab === "hermes" ? "Hermes'e yaz…" :
    currentTab === "komut"  ? "Uygulama, araç veya özellik ara…" :
                              "Ne yapmak istiyorsun?";
  if (currentTab !== "komut" && inp.value !== "" && query === inp.value) { /* koru */ }
}

function updateBadges() {
  const art = $("#b-art"), act = $("#b-act");
  const running = S.tasks.filter((t) => ["running", "optimistic", "pending"].includes(t.status)).length;
  art.textContent = artifacts.length ? String(artifacts.length) : "";
  art.classList.toggle("on", artifacts.length > 0);
  act.textContent = running ? String(running) : "";
  act.classList.toggle("on", running > 0);
}

/* ════════ CIZIM ════════ */
async function paint() {
  const host = $("#screen");
  if (artifactOpenId) return openArtifact(artifactOpenId, null);
  if (secondary === "discover") return mountSecondary(host, validateScreen(SC.discoverScreen(query, capabilityNames, artifacts, orderedApplications(applications), secondaryArg)));
  if (secondary === "androidApps") return mountSecondary(host, validateScreen(SC.androidAppsScreen()));
  if (secondary === "tools") return mountSecondary(host, validateScreen(SC.toolsScreen()));
  if (secondary === "agents")   return mountSecondary(host, validateScreen(SC.agentsScreen()));
  if (secondary === "capabilities") return mountSecondary(host, validateScreen(await SC.capabilitiesScreen()));
  if (secondary === "journal")     return mountSecondary(host, validateScreen(await SC.journalScreen(secondaryArg)));
  if (secondary === "connections") return mountSecondary(host, validateScreen(await SC.connectionsScreen()));
  if (secondary === "management") return mountSecondary(host, validateScreen(await SC.managementScreen(artifacts, orderedApplications(applications))));
  if (secondary === "settings")    return mountSecondary(host, validateScreen(await SC.settingsScreen()));
  if (secondary === "miniapps")    return paintApplications();
  if (secondary === "automations") return mountSecondary(host, validateScreen(await SC.automationsScreen()));
  if (secondary === "history")     return mountSecondary(host, validateScreen(await SC.intentHistoryScreen(secondaryArg)));

  if (currentTab === "home")      return mount(host, validateScreen(SC.homeScreen(artifacts, orderedApplications(applications))), ctx);
  if (currentTab === "komut")     return mount(host, validateScreen(SC.discoverScreen(query, capabilityNames, artifacts, orderedApplications(applications))), ctx);
  if (currentTab === "activity")  return mount(host, validateScreen(SC.activityScreen()), ctx);
  if (currentTab === "artifacts") return paintArtifacts();
  if (currentTab === "hermes")    return paintHermes();
}

function mountSecondary(host, screen) {
  mount(host, screen, ctx);
  host.prepend(pageHead(screen.title, screen.subtitle, goBack));
}

/* ════════ ARTEFAKT GALERISI ════════ */
function newWindowCard() {
  // Direkt DOM click - action-bus'a girmez (renderer.js:cleanAction /
  // UI_META_ACTIONS). Bu saf istemci navigasyonu (K7: sifir token) ve
  // B-6'nin drift-korumali listesine yeni bir eylem eklemeyi gerektirmez -
  // control-center dugmeleri de ayni sekilde dogrudan baglaniyor.
  const n = el("div", "c-card art-card");
  n.dataset.tap = "1";
  const row = el("div", "c-row");
  const i = el("i", "icon f7-icons"); i.textContent = "plus";
  i.style.color = "var(--primary)";
  row.appendChild(i);
  const g = el("div", "c-grow");
  g.appendChild(el("div", "c-title", "Yeni boş pencere"));
  g.appendChild(el("div", "c-sub", "Hermes yalnızca bu pencerenin içini üretsin"));
  row.appendChild(g);
  n.appendChild(row);
  n.addEventListener("click", createEmptyWindow);
  return n;
}

function paintArtifacts() {
  const host = $("#screen");
  host.innerHTML = "";
  host.appendChild(pageHead("Artefakt", artifacts.length + " KAYIT"));

  const newWrap = el("div", "c-section");
  const newBody = el("div", "body");
  newBody.appendChild(newWindowCard());
  newWrap.appendChild(newBody);
  host.appendChild(newWrap);

  if (artifactsLoadState === "error" && !artifacts.length) {
    const wrap = el("div", "c-section");
    const body = el("div", "body");
    body.appendChild(render({ type: "error-state", icon: "wifi_exclamationmark", title: "Artefaktlar yüklenemedi",
      detail: "Sunucu ve yerel önbellekte kayıt okunamadı. Bağlantıyı kontrol edip yeniden deneyebilirsin.",
      actionLabel: "TEKRAR DENE", action: { type: "ui.refreshArtifacts" } }, ctx));
    wrap.appendChild(body); host.appendChild(wrap); return;
  }
  if (!artifacts.length) {
    const wrap = el("div", "c-section");
    const body = el("div", "body");
    body.appendChild(render({
      type: "empty-state", icon: "square_stack_3d_up",
      title: "Henüz artefakt yok",
      detail: "Hermes'e bir şey sor — ürettiği paneller burada birikir.",
      action: { type: "ui.goto", payload: { tab: "hermes" } }, actionLabel: "HERMES'E GİT",
    }, ctx));
    wrap.appendChild(body);
    host.appendChild(wrap);
    return;
  }

  const pinned = artifacts.filter((a) => a.pinned);
  const rest = artifacts.filter((a) => !a.pinned);
  if (pinned.length) host.appendChild(artifactSection("SABİTLENEN", pinned, true));
  if (rest.length) host.appendChild(artifactSection("SON ÜRETİLENLER", rest, false));
}

function artifactSection(title, list, expanded) {
  const sec = el("section", "c-section");
  const h = el("header");
  h.appendChild(el("span", "t", title));
  h.appendChild(el("span", "rule"));
  h.appendChild(el("span", "t", String(list.length)));
  sec.appendChild(h);
  const body = el("div", "body");
  list.forEach((a) => body.appendChild(expanded ? artifactBlock(a) : artifactCard(a)));
  sec.appendChild(body);
  return sec;
}

function artifactCard(a) {
  const n = el("div", "c-card art-card");
  n.dataset.tap = "1";
  const row = el("div", "c-row");
  const i = el("i", "icon f7-icons"); i.textContent = "square_stack_3d_up";
  i.style.color = "var(--info)";
  row.appendChild(i);
  const g = el("div", "c-grow");
  g.appendChild(el("div", "c-title", a.title));
  g.appendChild(el("div", "c-sub", a.prompt ? a.prompt.slice(0, 60) : ""));
  row.appendChild(g);
  row.appendChild(el("span", "art-when", when(a.createdAt)));
  n.appendChild(row);
  n.addEventListener("click", () => openArtifact(a.id));
  return n;
}

/** Tam artefakt + hizli aksiyonlar (yenile / sabitle / sil) */
function artifactBlock(a) {
  const b = el("div", "msg-block artifact");
  const head = el("div", "artifact-head");
  head.appendChild(el("span", "k-micro", "ARTEFAKT"));
  head.appendChild(el("span", "c-grow"));
  head.appendChild(el("span", "k-micro", a.title || ""));
  b.appendChild(head);

  const inner = el("div", "artifact-body");
  (a.spec.sections || []).forEach((s) => {
    const node = render(s, ctx);
    if (node) inner.appendChild(node);
  });
  b.appendChild(inner);

  const acts = el("div", "artifact-actions");
  const mk = (icon, label, on, fn) => {
    const btn = el("button");
    const i = el("i", "icon f7-icons"); i.textContent = icon;
    btn.appendChild(i); btn.appendChild(el("span", null, label));
    if (on) btn.classList.add("on");
    btn.addEventListener("click", (e) => { e.stopPropagation(); fn(btn); });
    return btn;
  };
  acts.appendChild(mk("arrow_clockwise", "YENİLE", false, async () => {
    if (!a.prompt) { toast("Bu artefakt yeniden üretilemiyor", true); return; }
    toast("Yeniden üretiliyor…");
    // W6.L (2026-08-18): YENILE narrow (gecmissiz) VE kendi kaydedilmis
    // orijinal prompt'unu tekrar calistiriyor - sohbet-ici bir "devam" degil,
    // fillWindow()'la ayni sinifta STANDALONE bir yeniden-uretim. trustedWrite
    // bu yuzden true - bkz. ask()'taki writeOrigin yorumu.
    await ask(a.prompt, { silent: true, narrow: true, trustedWrite: true });
  }));
  acts.appendChild(mk(a.pinned ? "pin_fill" : "pin", a.pinned ? "SABİT" : "SABİTLE", a.pinned, () => {
    a.pinned = !a.pinned; saveArtifacts(); paint();
    toast(a.pinned ? "Sabitlendi" : "Sabit kaldırıldı");
  }));
  acts.appendChild(mk("square_grid_2x2_fill", "ANA EKRANA EKLE", false, () => {
    const entry = addApplication(a);
    toast(`Ana ekrana eklendi: ${entry.title}`);
  }));
  acts.appendChild(mk("trash", "SİL", false, () => {
    const linked = applicationsForArtifact(applications, a.id);
    if (!canDeleteArtifact(applications, a.id)) {
      toast(`Silinmedi: önce ${linked.length} ana ekran girişini kaldır`, true);
      return;
    }
    artifacts = artifacts.filter((x) => x.id !== a.id);
    saveArtifacts(); updateBadges(); paint(); toast("Silindi");
  }));
  b.appendChild(acts);
  return b;
}

/* ════════ W6.G UYGULAMALAR ════════
   Buradaki kayıtlar yalnız launcher entry'dir. Kaldırmak artifact'i silmez;
   artifact silmek ise bağlı entry varken fail-closed bloklanır. */
function paintApplications() {
  const host = $("#screen");
  host.innerHTML = "";
  host.appendChild(pageHead("Uygulamalar", applications.length + " GİRİŞ", goBack));
  const wrap = el("div", "c-section");
  const body = el("div", "body");
  const entries = orderedApplications(applications);
  const reference = el("button", "c-btn", "KAYDIRILABİLİR SES PANELİ");
  reference.dataset.variant = "ghost";
  reference.title = "Native range + dispatcher referansı";
  reference.addEventListener("click", async () => {
    try {
      const result = await ctx.dispatch({ type: "ui.referenceSoundPanel" });
      if (!result.ok) toast(result.error || "Ses paneli açılamadı", true);
    } catch (err) {
      logClientError("referenceSoundPanel.open", err);
      toast("Ses paneli açılamadı; istemci günlüğünü kontrol et", true);
    }
  });
  body.appendChild(reference);
  const deviceReference = el("button", "c-btn", "CİHAZ DURUM MERKEZİ");
  deviceReference.dataset.variant = "ghost";
  deviceReference.title = "Gerçek battery + Wi-Fi durumunu dispatcher üzerinden oku";
  deviceReference.addEventListener("click", async () => {
    try {
      const result = await ctx.dispatch({ type: "ui.referenceDeviceStatus" });
      if (!result.ok) toast(result.error || "Cihaz Durum Merkezi açılamadı", true);
    } catch (err) {
      logClientError("referenceDeviceStatus.open", err);
      toast("Cihaz Durum Merkezi açılamadı; istemci günlüğünü kontrol et", true);
    }
  });
  body.appendChild(deviceReference);
  if (applicationsLoadState === "error") {
    body.appendChild(render({ type: "error-state", icon: "wifi_exclamationmark", title: "Uygulamalarım yüklenemedi",
      detail: "Launcher girişleri sunucudan okunamadı. Bağlantıyı kontrol edip yeniden deneyebilirsin.",
      actionLabel: "TEKRAR DENE", action: { type: "ui.refreshApplications" } }, ctx));
  } else if (!entries.length) {
    body.appendChild(render({ type: "empty-state", icon: "square_grid_2x2", title: "Henüz uygulama yok",
      detail: "Bir artefaktta ANA EKRANA EKLE seçeneğini kullan." }, ctx));
  } else {
    entries.forEach((entry) => {
      const row = el("div", "c-rowitem");
      const icon = el("i", "icon f7-icons"); icon.textContent = entry.icon || "square_grid_2x2_fill";
      const lead = el("div", "lead"); lead.appendChild(icon);
      row.appendChild(lead);
      const grow = el("div", "c-grow");
      grow.appendChild(el("div", "c-title", entry.title || "Uygulama"));
      const artifact = findArtifact(entry.artifactId);
      grow.appendChild(el("div", "c-sub", artifact ? (entry.lastOpenedAt ? "Son açılış: " + when(entry.lastOpenedAt) : "Henüz açılmadı") : "Bağlı artefakt bulunamadı"));
      row.appendChild(grow);
      row.addEventListener("click", () => { if (artifact) openApplication(entry.id, entry.artifactId); else toast("Bağlı artefakt bulunamadı", true); });
      const remove = el("button", "c-btn", "KALDIR");
      remove.dataset.variant = "ghost";
      remove.addEventListener("click", (event) => { event.stopPropagation(); removeApplication(entry.id); paintApplications(); toast("Ana ekran girişi kaldırıldı"); });
      row.appendChild(remove);
      const edit = el("button", "c-btn", "DÜZENLE");
      edit.dataset.variant = "ghost";
      edit.addEventListener("click", (event) => {
        event.stopPropagation();
        if (editApplication(entry)) { paintApplications(); toast("Uygulama güncellendi"); }
      });
      row.appendChild(edit);
      body.appendChild(row);
    });
  }
  wrap.appendChild(body);
  host.appendChild(wrap);
}

function openArtifact(id, historyMode = "push") {
  const a = findArtifact(id);
  if (!a) return;
  // Legacy kayitlar ilk gerçek açılışta geriye uyumlu formation kökü alır.
  // Bu navigation/execution semantiğini değiştirmez.
  void ensureRootFormation(a);
  if (historyMode) {
    const next = { tab: currentTab, artifactId: id, index: navigationIndex + 1 };
    applyNavigation(next, isSameNavigation(navigationSnapshot(), next) ? "replace" : historyMode);
    return;
  }
  wm.register({ id: a.id, title: a.title });
  wm.focus(id);
  const draw = (spec = a.spec) => {
    const host = $("#screen");
    host.innerHTML = "";
    const head = pageHead(a.title, when(a.createdAt), () => {
      wm.unfocus();
      goBack();
    });
    host.appendChild(head);
    const wrap = el("div", "c-section");
    const body = el("div", "body");
    body.appendChild(artifactBlock({ ...a, spec }));
    wrap.appendChild(body);
    host.appendChild(wrap);
  };
  // Izgara -> tam ekran gecisi native View Transitions ile (K6, sifir token).
  // Desteklenmeyen tarayicida sessizce dogrudan cizer (ozellik algila, tarayici degil).
  // Referans medya paneli acilirken yalniz mevcut volume.read capability'si
  // dispatcher zarfina gider. Diger artifact'lerde state loader yoktur;
  // yeni bir genel widget-state sistemi burada acilmiyor.
  if (a.id === SCROLLABLE_SOUND_PANEL.id) {
    draw(soundPanelWithMusicVolume(null));
    sendIntent("volume.read", {}, {
      source: "ui", raw: "Medya paneli ses durumunu oku", by: "deterministic", timeoutMs: 12000,
    }).then((result) => {
      if (!result.ok) {
        logClientError("referenceSoundPanel.volumeRead", new Error(String(result.error || "volume.read başarısız")));
        return;
      }
      const volume = musicVolumeFromResponse(result.data);
      if (!volume) {
        logClientError("referenceSoundPanel.volumeRead", new Error("geçerli music volume cevabı yok"));
        return;
      }
      // Kullanici bu arada geri donduyse gec cevap gorunur ekrani ezmez.
      if (wm.focusedId === a.id) draw(soundPanelWithMusicVolume(volume));
    }).catch((err) => logClientError("referenceSoundPanel.volumeRead", err));
    return;
  }
  if (a.id === DEVICE_STATUS_PANEL_ID) {
    draw(deviceStatusWithLiveData());
    Promise.all([
      sendIntent("sensor.battery.read", {}, { source: "ui", raw: "Cihaz Durum Merkezi pil durumunu oku", by: "deterministic", timeoutMs: 12000 }),
      sendIntent("wifi.info", {}, { source: "ui", raw: "Cihaz Durum Merkezi Wi-Fi durumunu oku", by: "deterministic", timeoutMs: 12000 }),
      sendIntent("app.list", {}, { source: "ui", raw: "Cihaz Durum Merkezi uygulama listesini oku", by: "deterministic", timeoutMs: 18000 }),
    ]).then(([batteryResult, wifiResult, appsResult]) => {
      const battery = batteryResult.ok ? batteryResult.data : null;
      const wifi = wifiResult.ok ? wifiResult.data : null;
      const appCount = appsResult.ok && Number.isFinite(Number(appsResult.data?.count)) ? Number(appsResult.data.count) : null;
      if (!batteryResult.ok) logClientError("referenceDeviceStatus.battery", new Error(String(batteryResult.error || "battery.read başarısız")));
      if (!wifiResult.ok) logClientError("referenceDeviceStatus.wifi", new Error(String(wifiResult.error || "wifi.info başarısız")));
      if (!appsResult.ok) logClientError("referenceDeviceStatus.appList", new Error(String(appsResult.error || "app.list başarısız")));
      if (wm.focusedId === a.id) draw(deviceStatusWithLiveData({ battery, wifi, appCount, fabricReachable: !!(batteryResult.ok || wifiResult.ok || appsResult.ok) }));
    }).catch((err) => logClientError("referenceDeviceStatus.load", err));
    return;
  }
  draw();
}

/* ════════ W6.C (orijinal kapsam): BOŞ PENCERE ════════
   "Yeni boş pencere" -> WindowManager'a icerik OLMADAN kaydedilir, tam
   ekrana odaklanir. Icerik alt composer'dan gelir (fillTarget devreye
   girer). Basarili uretim ayni id ile addArtifact()'e yazilir - pencere
   kimligi degismez, sadece ici dolar. Iptal edilirse (geri/sekme
   degistir) hicbir yere yazilmaz - M-8: dogrulanmadan kalicilasmaz. */
function createEmptyWindow() {
  const id = "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  wm.register({ id, title: "Yeni pencere" });
  openEmptyWindow(id);
}

function openEmptyWindow(id) {
  wm.focus(id);
  fillTarget = { id };
  syncComposer();
  const draw = () => {
    const host = $("#screen");
    host.innerHTML = "";
    const head = pageHead("Yeni pencere", "boş", () => goTab("artifacts"));
    host.appendChild(head);
    const wrap = el("div", "c-section");
    const body = el("div", "body");
    body.appendChild(render({
      type: "empty-state", icon: "square_stack_3d_up",
      title: "Bu pencere boş",
      detail: "Alttaki kutuya ne olmasını istediğini yaz — yalnızca bu pencerenin içi üretilecek, sayfanın geri kalanı değişmez.",
    }, ctx));
    wrap.appendChild(body);
    host.appendChild(wrap);
  };
  draw();
}

function renderWindowLoading(text) {
  const host = $("#screen");
  host.innerHTML = "";
  host.appendChild(pageHead("Yeni pencere", "boş", () => goTab("artifacts")));
  const wrap = el("div", "c-section");
  const body = el("div", "body");
  // "Hermes calisiyor" ile ayni yukleme deseni (ask()'ta da kullanilan) - yeni bir gorsel dil icat edilmedi
  body.appendChild(render({
    type: "task-card", title: "Üretiliyor…", source: text.slice(0, 60),
    status: "WORKING", tone: "info", state: "loading",
  }, ctx));
  wrap.appendChild(body);
  host.appendChild(wrap);
}

function renderWindowError(icon, title, detail) {
  const host = $("#screen");
  host.innerHTML = "";
  host.appendChild(pageHead("Yeni pencere", "boş", () => goTab("artifacts")));
  const wrap = el("div", "c-section");
  const body = el("div", "body");
  body.appendChild(render({ type: "error-state", icon, title, detail }, ctx));
  wrap.appendChild(body);
  host.appendChild(wrap);
}

async function fillWindow(id, text) {
  // W6.L: ayni/kanonik-esdeger istek daha once basariyla uretildiyse LLM'e
  // HIC gidilmez - onbellekteki spec dogrudan kullanilir (sifir token).
  // ARTEFAKT/bos pencere STANDALONE (guvenilir) uretim kaynagidir - bu yuzden
  // asagidaki getCached/putCached kosulsuz (ask()'taki opts.trustedWrite ile
  // AYNI kategori, bkz. ask()'taki writeOrigin yorumu, 2026-08-18 revize).
  const key = await cacheKey(text, capabilitiesWithRisk);
  const cached = await getCached(key);
  if (cached) {
    const item = addArtifact(cached.spec, text, cached.contract, id);
    updateBadges();
    fillTarget = null;
    openArtifact(item.id);
    fetch("/prompt-cache-hit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) }).catch((err) => logClientError("promptCache.hitPing(fillWindow)", err));
    return;
  }

  renderWindowLoading(text);
  const r = await sendIntent("llm.generate",
    { prompt: text, max_tokens: 2000, context: deviceContext() },
    { source: "hermes", raw: text, by: "llm", timeoutMs: 90000 });
  if (!fillTarget || fillTarget.id !== id) return; // kullanici bu arada baska yere gitti
  if (!r.ok || !r.data || !r.data.text) {
    renderWindowError("hand_raised", "Üretim başarısız", (r.error || "bilinmeyen hata") + " — tekrar yazmayı deneyebilirsin.");
    return;
  }
  let parsed;
  try {
    parsed = await parseClient.parse(r.data.text, { actionableTypes: ACTIONABLE, knownCapabilities: capabilityNames, versionStamp: capVersion });
  } catch (err) {
    logClientError("parseClient.parse(fillWindow)", err);
    renderWindowError("hand_raised", "Ayıklama başarısız", "İşlem zaman aşımına uğradı ya da çöktü — tekrar yazmayı deneyebilirsin.");
    return;
  }
  if (!fillTarget || fillTarget.id !== id) return; // kullanici bekleme sirasinda baska yere gitti
  if (!parsed.admitted.length) {
    const rejected = [...parsed.rejected, ...parsed.contractRejected];
    renderWindowError("hand_raised", "Artefakt üretilemedi",
      (rejected.length ? rejected.join(", ") + " — içinde çalıştırılabilir bir iş yok." : "Boş yanıt.") + " Tekrar yazmayı deneyebilirsin.");
    return;
  }
  const { spec, contract } = parsed.admitted[0];
  const item = addArtifact(spec, text, contract, id);
  updateBadges();
  fillTarget = null;
  openArtifact(item.id);
  putCached(key, { spec, contract, title: spec.title || "Artefakt" });
}

function when(ts) {
  const d = Math.round((Date.now() - ts) / 60000);
  if (d < 1) return "şimdi";
  if (d < 60) return d + " dk";
  if (d < 1440) return Math.round(d / 60) + " sa";
  return Math.round(d / 1440) + " gün";
}

function pageHead(title, sub, onBack) {
  const h = el("div", "page-head");
  if (onBack) {
    const b = el("button", "back");
    const i = el("i", "icon f7-icons"); i.textContent = "chevron_left";
    b.appendChild(i);
    b.addEventListener("click", onBack);
    h.appendChild(b);
  }
  h.appendChild(el("span", "h", title));
  if (sub) h.appendChild(el("span", "s", sub));
  return h;
}

/* ════════ HERMES ════════
   Kural: 1 sonuc = 1 birincil artefakt. Metin KISA, cikti artefakt.     */
const chat = [];

function paintHermes() {
  const host = $("#screen");
  host.innerHTML = "";
  host.appendChild(pageHead("Hermes", "gpt-5.6-luna"));

  const wrap = el("div", "c-section");
  const body = el("div", "body");

  if (!chat.length) {
    // Bos ekran DEGIL: son artefaktlar + hizli komutlar + aktif isler
    const suggestions = SC.hermesEmptyScreen(artifacts);
    suggestions.sections.forEach((s) => {
      const node = render(s, ctx);
      if (node) body.appendChild(node);
    });
  }

  chat.forEach((m) => {
    if (m.artifactId) {
      const a = findArtifact(m.artifactId);
      if (a) body.appendChild(artifactBlock(a));
    } else if (m.spec) {
      const b = el("div", "msg-block");
      b.appendChild(render(m.spec, ctx));
      body.appendChild(b);
    } else {
      const b = el("div", "msg-block" + (m.role === "user" ? " sent" : ""));
      const card = el("div", "c-card");
      if (m.role === "user") { card.style.background = "var(--primary-a)"; card.style.borderColor = "var(--primary)"; }
      card.appendChild(render({ type: "text", text: m.text, mono: m.mono }, ctx));
      b.appendChild(card);
      body.appendChild(b);
    }
  });

  wrap.appendChild(body);
  host.appendChild(wrap);
  host.scrollTop = host.scrollHeight;
}

// ARTEFAKT SOZLESMESI (2026-08-16, kullanici karari: "Uretilen her sema EN AZ
// BIR REFLEX/AGENT capability'sine baglanmak zorunda; salt-bilgi kartlari
// reddedilsin") + ayiklama/dogrulama mantigi W6.K (2026-08-18) ile
// public/js/artifact-parse.js'e (saf compute) tasindi - parse-worker.js
// bunu izole bir Worker icinde kosturur (bkz. parseClient, dosya basi).

function deviceContext() {
  const b = S.battery, w = S.wifi;
  return [
    b ? "pil %" + (b.percentage ?? b.level) + (b.status === "CHARGING" ? " (sarjda)" : "") : null,
    b && b.temperature ? b.temperature + "C" : null,
    w && w.ssid ? "wifi " + String(w.ssid).replace(/"/g, "") : null,
    S.apps.length ? S.apps.length + " uygulama kurulu" : null,
  ].filter(Boolean).join(", ");
}

async function ask(q, opts = {}) {
  const text = (q || "").trim();
  if (!text) return;
  // W6.H (dar context, 2026-08-18): opts.narrow olan cagrilar (orn. artefakt
  // YENILE) sohbet gecmisini TASIMAZ ve Hermes sekmesine ZIPLAMAZ - yalnizca
  // bu tek istegin kendisi modele gider. fillWindow() zaten bu ilkeyi
  // (history hic yok) tasiyordu; burada ayni ilke ask()'a da genellendi.
  if (!opts.narrow) goTab("hermes");
  if (!opts.silent) chat.push({ role: "user", text });
  chat.push({ role: "agent", spec: { type: "task-card", title: "Hermes çalışıyor",
    source: "gpt-5.6-luna", status: "WORKING", tone: "info", state: "loading" } });
  if (!opts.narrow) paintHermes();

  const history = opts.narrow ? [] : chat.filter((m) => m.text).slice(-7)
    .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));

  // W6.L (2026-08-18, REVIZE — owner karari): "canWrite = history.length===0"
  // modeli terk edildi. Gercek canli kullanimda HERMES sohbetinde 2. mesajdan
  // sonra cache TAMAMEN kapaniyordu - bagimsiz, birebir tekrarlanan bir istek
  // bile artik hicbir zaman onbellekten donmuyordu (sohbet gecmisi bir daha
  // hic bos olmuyor). Yeni kural: yazma uygunlugu SOHBET GECMISINDEN degil
  // URETIMIN KAYNAGINDAN belirlenir.
  //   READ  -> HER ZAMAN denenir. cacheKey() zaten gecmis tasimiyor (bkz.
  //            prompt-cache.js: yalnizca normalizedPrompt+capSig+regVer+
  //            model) - bir isabet ancak bu METNIN daha once GUVENILIR bir
  //            kaynaktan yazilmis olmasiyla mumkun (asagiya bak), yani
  //            gecmis olsa da olmasa da guvenli.
  //   WRITE -> yalnizca opts.trustedWrite=true isaretli, BAGIMSIZ/STANDALONE
  //            uretim kaynaklarindan (fillWindow() zaten kosulsuz yaziyor -
  //            ayri fonksiyon, asagida degil; YENILE burada trustedWrite
  //            ile isaretleniyor). Sohbet ici genel `ask()` cagrilari
  //            (normal HERMES mesaji, ui.ask retry, ui.miniapp, share-intent)
  //            VARSAYILAN OLARAK YAZAMAZ - "evet"/"onu degistir" gibi
  //            baglama bagli kisa mesajlarin cache'e HICBIR ZAMAN girmemesini
  //            garanti eden asil sinir bu: byte-exact eslesme + guvenilmeyen
  //            yazma kaynagi cift katmanli savunma.
  const canWrite = writeEligible(opts.trustedWrite);
  const cacheKeyValue = await cacheKey(text, capabilitiesWithRisk);
  const cached = await getCached(cacheKeyValue);
  if (cached) {
    chat.pop(); // "Hermes calisiyor" yukleme kartini kaldir
    const item = addArtifact(cached.spec, text, cached.contract);
    chat.push({ role: "agent", artifactId: item.id });
    if (!opts.narrow) paintHermes();
    updateBadges();
    fetch("/prompt-cache-hit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: cacheKeyValue }) }).catch((err) => logClientError("promptCache.hitPing(ask)", err));
    return;
  }

  // OTOMATIK DEVAM (2026-08-16).
  // Sorun: max_tokens dolunca yanit ortasindan kesiliyordu. Kesilen yanitta
  // ```aios blogu KAPANMADIGI icin extractArtifacts hicbir sey bulamiyor,
  // ekranda yarim metin kaliyor ve kullanici her seferinde elle "devam et"
  // yazmak zorunda kaliyordu (artefakt #26/#27/#29 tam olarak bunun sikayeti).
  // Cozum: kopru artik finish_reason donuyor; "length" ise kaldigi yerden
  // devamini isteyip parcalari birlestiriyoruz.
  // LLM cagrisi yavastir (5-30sn), ama SONSUZ degildir: 90sn'de kesilir ki
  // arayuz donmus gibi gorunmesin.
  const LLM_TIMEOUT = 90000;
  // 2026-08-17 DENETIMI: burasi `read()` cagiriyordu, yani Hermes'e yazilan
  // her sey dispatcher'i ATLIYORDU - "her giris ayni borudan gecer" iddiasinin
  // tek istisnasi buydu ve sohbetler ne AKTİF sekmesinde ne DevTools'ta
  // gorunuyordu. Artik o da zarf: kaynak "hermes", ham ifade kullanicinin
  // yazdigi metin.
  let r = await sendIntent("llm.generate",
    { prompt: text, max_tokens: 2000, history, context: deviceContext() },
    { source: opts.source || "hermes", raw: text, by: "llm", timeoutMs: LLM_TIMEOUT });
  let full = r.ok && r.data ? String(r.data.text || "") : "";
  for (let i = 0; i < 3 && r.ok && r.data && r.data.truncated; i++) {
    const cont = await sendIntent("llm.generate", {
      prompt: "Yanitin token siniri yuzunden kesildi. Kaldigin yerden AYNEN devam et. " +
              "Bastan baslama, ozet yapma, aciklama ekleme - sadece eksik kalan kismi yaz.",
      max_tokens: 2000,
      history: [...history, { role: "user", content: text }, { role: "assistant", content: full }],
      context: deviceContext(),
    }, { source: "hermes", raw: "(devam) " + text, by: "llm", timeoutMs: LLM_TIMEOUT });
    if (!cont.ok || !cont.data || !cont.data.text) break;
    full += cont.data.text;
    r = cont;
  }
  chat.pop();

  if (full) {
    // W6.K: ayiklama + M-7 sozlesme kapisi (admitArtifact) artik izole bir
    // Worker'da kosuyor - bkz. parseClient tanimi (dosya basi) ve
    // parse-worker.js. Ana thread yalnizca sonucu DOM'a yazar/dispatcher'a
    // baglar, hicbir parse/dogrulama islemini kendi icinde yapmaz.
    let parsed;
    try {
      parsed = await parseClient.parse(full, { actionableTypes: ACTIONABLE, knownCapabilities: capabilityNames, versionStamp: capVersion });
    } catch (err) {
      logClientError("parseClient.parse(ask)", err);
      chat.push({ role: "agent", spec: {
        type: "error-state", icon: "hand_raised", title: "Ayıklama başarısız",
        detail: "İşlem zaman aşımına uğradı ya da çöktü — tekrar yazmayı deneyebilirsin.",
        actionLabel: "TEKRAR DENE",
        action: { type: "ui.ask", payload: { q: text, silent: true } },
      } });
      if (lastReceipt) { chat.push({ role: "agent", spec: lastReceipt }); lastReceipt = null; }
      paintHermes();
      updateBadges();
      return;
    }
    const { text: reply, admitted, rejected, contractRejected } = parsed;
    const specsLength = admitted.length + contractRejected.length;
    // 1 sonuc = 1 birincil artefakt: artefakt varsa metin KISA tutulur
    if (reply) {
      const short = specsLength ? reply.split(/\n\n/)[0].slice(0, 220) : reply;
      chat.push({ role: "agent", text: short });
    }
    // M-7 sozlesme kapisi: icerik (ScreenSpec) zaten validateScreen'den
    // gecti (W5), ama ARTEFAKT KAYDI (hangi capability'leri kullaniyor,
    // hangi capability surumune karsi uretildi) worker icinde ayrica
    // dogrulandi. Basarisiz olan addArtifact()'e HIC ULASMAZ - ephemeral
    // kalir, hicbir yere yazilmaz (M-8'in en ucuz hali).
    admitted.forEach(({ spec: s, contract }) => {
      const item = addArtifact(s, text, contract);
      // Mini-app olarak istendiyse kalici kil (opts.pin).
      if (opts.pin) { item.pinned = true; saveArtifacts(); }
      chat.push({ role: "agent", artifactId: item.id });
      // W6.L: yalnizca gecmis-siz, TEK spec'lik cagrilarda onbellege yazilir -
      // birden fazla spec varsa hangisinin bu anahtara karsilik geldigi
      // belirsiz olurdu (bilincli sinir).
      if (canWrite && specsLength === 1) putCached(cacheKeyValue, { spec: s, contract, title: s.title || "Artefakt" });
    });
    if (opts.pin && admitted.length) toast("Mini uygulama sabitlendi");
    // Reddedilen sema sessizce kaybolmaz - kullanici NEDEN gormedigini bilsin.
    const allRejected = [...(rejected || []), ...contractRejected];
    if (allRejected.length) {
      chat.push({ role: "agent", spec: {
        type: "error-state", icon: "hand_raised", title: "Artefakt reddedildi",
        detail: allRejected.join(", ") + " — içinde çalıştırılabilir bir iş yok ya da bilinmeyen bir "
              + "capability'ye başvuruyor. Artefakt yalnızca bilinen, gerçek cihaz eylemlerine bağlanabilir.",
        actionLabel: "İŞ EKLEYEREK TEKRAR ÜRET",
        action: { type: "ui.ask", payload: { q: text + " (kartta gerçekten çalışan butonlar olsun)", silent: true } },
      } });
    }
    if (!reply && !admitted.length && !allRejected.length) chat.push({ role: "agent", text: "(boş yanıt)" });
  } else {
    // Hata artik TEKRAR DENENEBILIR. Onceden sadece olu bir metin kutusu
    // cikiyordu; kullanicinin tek caresi elle yeniden yazmakti.
    chat.push({ role: "agent", spec: {
      type: "error-state",
      title: r.timeout ? "Hermes yanıt vermedi" : "Yanıt alınamadı",
      detail: String(r.error || "").slice(0, 160),
      actionLabel: "TEKRAR DENE",
      action: { type: "ui.ask", payload: { q: text, silent: true } },
    } });
  }
  if (lastReceipt) { chat.push({ role: "agent", spec: lastReceipt }); lastReceipt = null; }
  paintHermes();
  updateBadges();
}

/* ════════ CONTROL CENTER ════════ */
let torchOn = false;
function openControlCenter() {
  const html = `
    <div class="sheet-modal" style="height:auto"><div class="sheet-modal-inner">
      <div style="padding:14px 16px 10px" class="hstack">
        <span class="k-micro">CONTROL</span><span style="flex:1"></span>
        <a href="#" class="link sheet-close k-micro">KAPAT</a>
      </div>
      <div class="cc-grid" id="cc-toggles"></div>
      <div style="padding:14px 16px 4px" id="cc-approvals-label" hidden><span class="k-micro">İZİNLER</span></div>
      <div style="padding:0 16px 8px" id="cc-approvals"></div>
      <div style="padding:14px 16px 8px"><span class="k-micro">TEMA</span></div>
      <div style="padding:0 16px"><div class="theme-row" id="cc-themes"></div></div>
      <div style="padding:14px 16px 4px"><span class="k-micro">SERVİSLER</span></div>
      <div style="padding:0 16px 16px" id="cc-services"></div>
      <div style="padding:0 16px 22px" class="c-btn-row">
        <button class="c-btn" data-variant="ghost" id="cc-device" style="flex:1">DEVICE</button>
        <button class="c-btn" data-variant="ghost" id="cc-agents" style="flex:1">AGENTS</button>
        <button class="c-btn" data-variant="ghost" id="cc-caps" style="flex:1">CAPS</button>
      </div>
    </div></div>`;
  const sheet = createSheet(html);
  sheet.open();

  const tg = document.getElementById("cc-toggles");
  const mk = (icon, label, on, onTap) => {
    const n = el("div", "cc-toggle");
    n.dataset.on = on ? "1" : "0";
    const i = el("i", "icon f7-icons"); i.textContent = icon;
    n.appendChild(i); n.appendChild(el("span", "lb", label));
    n.addEventListener("click", async () => {
      const next = n.dataset.on !== "1";
      n.dataset.on = next ? "1" : "0";
      const ok = await onTap(next);
      if (!ok) n.dataset.on = next ? "0" : "1";
    });
    return n;
  };
  tg.appendChild(mk("flashlight_on_fill", "FENER", torchOn, async (on) => {
    const r = await ctx.dispatch({ type: "torch.set", payload: { on } });
    if (r.ok) torchOn = on;
    return r.ok;
  }));
  tg.appendChild(mk("bolt_fill", "UYANIK", true, async (on) =>
    (await ctx.dispatch({ type: on ? "wakelock.acquire" : "wakelock.release" })).ok));
  tg.appendChild(mk("waveform", "TİTREŞİM", false, async () => {
    await ctx.dispatch({ type: "vibrate", payload: { ms: 220 } }); return false;
  }));
  tg.appendChild(mk("location_fill", "KONUM", false, async () => {
    const r = await ctx.dispatch({ type: "sensor.location.read" });
    if (r.ok) toast("Konum okundu");
    return false;
  }));
  // Ag uzerinden ikon cekme - kullanici istedigi an kapatabilsin
  getJSON("/appicon-settings").then((s) => {
    const t = mk("photo_fill", "İKON/AĞ", !!(s && s.network), async (on) => {
      const r = await fetch("/appicon-settings", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ network: on }),
      }).then((x) => x.json()).catch(() => null);
      if (r && r.ok) {
        toast(on ? "İkonlar ağdan çekilecek" : "Ağ kapatıldı, yalnızca yerel");
        if (on) S.iconsRefresh = Date.now();
      }
      return !!(r && r.ok);
    });
    tg.appendChild(t);
  });

  // Ham prompt/yanit kaydi - GERCEK sigortali anahtar (2026-08-18, owner
  // istegi). Bilerek capability DEGIL, yalnizca buradan (insan dokunuşu)
  // acilir/kapanir - model/A2A/MCP bu anahtara erisemez.
  getJSON("/debug-trajectory").then((s) => {
    const t = mk("exclamationmark_triangle_fill", "HAM KAYIT", !!(s && s.on), async (on) => {
      const r = await fetch("/debug-trajectory", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ on }),
      }).then((x) => x.json()).catch(() => null);
      if (r && r.ok) {
        toast(on ? "Ham prompt/yanıt journal'a yazılacak — kalıcı, dikkatli aç" : "Ham kayıt kapatıldı, redaksiyon geri döndü");
      }
      return !!(r && r.ok);
    });
    tg.appendChild(t);
  });

  // B-13: risk:ask capability onaylari - HAM KAYIT ile AYNI ilke (insan-
  // tetikli duz HTTP uc, capability DEGIL - grant/deny/revoke MCP/A2A/model
  // tarafindan asla cagirilamaz, bkz. dispatcher.ts). Liste boot'ta yuklenen
  // capabilitiesWithRisk'ten (fetch YOK), durum GET /approvals'tan gelir.
  const askCaps = capabilitiesWithRisk.filter((c) => c.risk === "ask").map((c) => c.name).sort();
  if (askCaps.length) {
    document.getElementById("cc-approvals-label").hidden = false;
    const host = document.getElementById("cc-approvals");
    const TONE = { granted: ["ok", "ONAYLI"], denied: ["error", "REDDEDİLDİ"], revoked: ["warn", "GERİ ALINDI"] };
    getJSON("/approvals").then((approvals) => {
      const state = approvals || {};
      const list = el("div", "c-list");
      askCaps.forEach((cap) => {
        const row = el("div", "c-rowitem");
        row.dataset.tap = "1";
        const g = el("div", "c-grow");
        g.appendChild(el("div", "c-title", cap));
        g.appendChild(el("div", "c-sub", "risk: ask"));
        row.appendChild(g);
        const chip = el("span", "c-chip");
        const paint = () => {
          const rec = state[cap];
          const [tone, label] = (rec && TONE[rec.status]) || ["idle", "ONAY BEKLİYOR"];
          chip.dataset.tone = tone;
          chip.textContent = label;
        };
        paint();
        row.appendChild(chip);
        row.addEventListener("click", async () => {
          if (row.dataset.busy === "1") return;
          row.dataset.busy = "1";
          const granted = state[cap] && state[cap].status === "granted";
          const endpoint = granted ? "/approvals/revoke" : "/approvals/grant";
          const r = await postJSON(endpoint, { capability: cap }).catch(() => null);
          if (r && r.ok) {
            state[cap] = { capability: cap, status: granted ? "revoked" : "granted" };
            toast(granted ? `"${cap}" onayı geri alındı` : `"${cap}" onaylandı`);
          } else {
            toast("İşlem başarısız", true);
          }
          paint();
          row.dataset.busy = "0";
        });
        list.appendChild(row);
      });
      host.appendChild(list);
    });
  }

  const themeHost = document.getElementById("cc-themes");
  THEMES.forEach((t) => {
    const d = el("div", "theme-dot");
    d.style.background = t.bg;
    d.dataset.active = currentTheme() === t.id ? "1" : "0";
    const bar = el("i"); bar.style.background = t.primary; d.appendChild(bar);
    d.appendChild(el("span", null, t.short));
    d.addEventListener("click", () => {
      setTheme(t.id);
      themeHost.querySelectorAll(".theme-dot").forEach((x) => (x.dataset.active = "0"));
      d.dataset.active = "1";
    });
    themeHost.appendChild(d);
  });

  // Burada capability varligini "online" diye gostermek yanlisti. Canli
  // servis olcumu yalniz /runtime-status kullanan Yonetim Merkezi'ndedir.
  document.getElementById("cc-services").appendChild(render({
    type: "list",
    children: [{ type: "list-row", icon: "gauge", title: "Canlı servis durumu",
      subtitle: "HTTP/process ölçümü ile Yönetim Merkezi'nde gösterilir",
      action: { type: "ui.goto", payload: { screen: "management" } } }],
  }, ctx));

  const go = (s) => { sheet.close(); goSecondary(s); };
  document.getElementById("cc-device").onclick = () => go("device");
  document.getElementById("cc-agents").onclick = () => go("agents");
  document.getElementById("cc-caps").onclick = () => go("capabilities");
  sheet.on("closed", () => sheet.destroy());
}

/* ════════ APP CONTEXT SHEET ════════ */
function openAppSheet(payload) {
  const { pkg, name } = payload || {};
  const rows = [
    { type: "list-row", icon: "arrow_up_right_square", title: "Aç", action: { type: "app.open", payload: { pkg } } },
    { type: "list-row", icon: "doc_text", title: "Paket", subtitle: pkg },
  ];
  if (capabilityNames.includes("app.freeze")) {
    rows.push({ type: "list-row", icon: "snow", title: "Dondur", tone: "error", action: { type: "app.freeze", payload: { pkg } } });
    rows.push({ type: "list-row", icon: "sun_max", title: "Geri aç", action: { type: "app.unfreeze", payload: { pkg } } });
  }
  const sheet = createSheet(
    `<div class="sheet-modal" style="height:auto"><div class="sheet-modal-inner">
      <div style="padding:14px 16px 10px" class="hstack"><span class="k-micro">${(name || pkg || "").toUpperCase()}</span>
      <span style="flex:1"></span><a href="#" class="link sheet-close k-micro">KAPAT</a></div>
      <div style="padding:0 16px 22px" id="app-sheet-body"></div></div></div>`
  );
  sheet.open();
  document.getElementById("app-sheet-body").appendChild(render({ type: "list", children: rows }, ctx));
  sheet.on("closed", () => sheet.destroy());
}

async function testCapability(name) {
  if (!name) return { ok: false };
  const t0 = performance.now();
  const r = await read(name, {});
  const ms = Math.round(performance.now() - t0);
  chat.push({ role: "agent", spec: {
    type: "action-receipt", state: r.ok ? "success" : "error",
    steps: [{ name, ms }], executor: "capability/test",
  } });
  toast(name + (r.ok ? " ✓ " : " ✗ ") + ms + "ms", !r.ok);
  return r;
}

/* ════════ SES (composer icinde) ════════ */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, recording = false;
function toggleVoice() {
  if (!SR) { toast("Bu tarayıcı sesli girişi desteklemiyor", true); return; }
  if (!window.isSecureContext) { toast("Sesli giriş için http://localhost:9300 aç", true); return; }
  if (recording) { rec && rec.stop(); return; }
  rec = new SR();
  rec.lang = "tr-TR"; rec.interimResults = true; rec.continuous = false;
  let finalText = "";
  const mic = $("#mic"), inp = $("#input");
  rec.onstart = () => { recording = true; mic.classList.add("rec"); inp.placeholder = "dinleniyor…"; };
  rec.onresult = (ev) => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const t = ev.results[i][0].transcript;
      if (ev.results[i].isFinal) finalText += t; else interim += t;
    }
    inp.value = (finalText + interim).trim();
  };
  rec.onerror = (ev) => toast(ev.error === "not-allowed" ? "Mikrofon izni yok" : "Ses hatası: " + ev.error, true);
  rec.onend = () => {
    recording = false; mic.classList.remove("rec"); syncComposer();
    if (inp.value.trim()) submit();
  };
  rec.start();
}

/* ════════ TEK GIRIS: composer ════════ */
function focusComposer(text) {
  const inp = $("#input");
  if (text != null) inp.value = text;
  inp.focus();
}
function submit() {
  const inp = $("#input");
  const v = inp.value.trim();
  if (!v) return;
  inp.value = ""; inp.style.height = "";
  query = "";
  if (fillTarget) { fillWindow(fillTarget.id, v); return; }
  ask(v);
}

/* ════════ DURUM ════════ */
async function refresh() {
  const [b, w] = await Promise.all([read("sensor.battery.read"), read("wifi.info")]);
  if (b.ok) S.battery = b.data;
  if (w.ok) S.wifi = w.data;
  S.services.fabric = true;
  const st = await getJSON("/state");
  if (st && st.tasks) S.tasks = Object.values(st.tasks);
  if (st && st.recentEvents) S.activity = st.recentEvents;
  paintStatus(); updateBadges();
  if (["home", "activity"].includes(currentTab) || secondary === "device") paint();
}
function paintStatus() {
  const b = S.battery;
  const p = b ? (b.percentage ?? b.level ?? 0) : null;
  $("#st-clock").textContent = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  $("#st-bat").textContent = p == null ? "BAT —" : "BAT " + p + "%";
  $("#st-bat").style.color = p == null ? "" : p < 15 ? "var(--error)" : p < 35 ? "var(--warn)" : "";
  $("#st-fabric").textContent = S.services.fabric ? "● FABRIC" : "○ FABRIC";
  $("#st-fabric").style.color = S.services.fabric ? "var(--primary)" : "var(--error)";
}

/* ════════ SHARE TARGET / SHORTCUTS ════════ */
function handleEntry() {
  const u = new URL(location.href);
  const shared = [u.searchParams.get("title"), u.searchParams.get("text"), u.searchParams.get("url")]
    .filter(Boolean).join("\n");
  const tab = u.searchParams.get("tab");
  const screen = u.searchParams.get("screen");
  const voice = u.searchParams.get("voice");
  if (shared || tab || screen || voice) history.replaceState({}, "", "/");
  if (shared) { setTimeout(() => ask(shared), 400); return; }
  if (tab) goTab(tab === "apps" ? "komut" : tab);
  if (screen) goSecondary(screen);
  if (voice) setTimeout(toggleVoice, 500);
}

/* ════════ ACILIS ════════ */
export async function boot() {
  loadTheme(); loadRecent(); await loadArtifacts(); await loadApplications();
  requestPersistence(); // B-9 ile ayni riskin veri tarafi: Android baski altinda depoyu temizleyebilir
  // M-9: acilis senkronu artik loadArtifacts()'in kendi isi (sunucu birincil,
  // gerekirse onbellekten besler) - burada tekrar POST etmeye gerek yok.

  document.querySelectorAll(".aios-tab").forEach((b) =>
    b.addEventListener("click", () => goTab(b.dataset.tab)));
  window.addEventListener("popstate", (event) => {
    // Browser/Android geri hareketi yalnız bizim isimli state'imizi uygular;
    // başka origin ya da bozuk state fail-closed olarak HOME'a iner.
    applyNavigation(normalizeNavigation(event.state), null);
  });
  $("#cc-open").addEventListener("click", (e) => { e.stopPropagation(); openControlCenter(); });
  $("#mic").addEventListener("click", (e) => { e.preventDefault(); toggleVoice(); });
  $("#send").addEventListener("click", (e) => { e.preventDefault(); submit(); });

  const inp = $("#input");
  inp.addEventListener("input", () => {
    inp.style.height = "auto";
    inp.style.height = Math.min(inp.scrollHeight, 110) + "px";
    // KEŞFET sekmesinde yazmak = canlı deterministik filtre.
    if (currentTab === "komut") { query = inp.value; paint(); }
  });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  });
  inp.addEventListener("focus", () => {
    // Yazmaya baslayinca arama yuzeyine gec (tek giris, baglama duyarli).
    // BUG (2026-08-17, W6.C canli testinde bulundu): bu otomatik gecis
    // fillTarget (bos pencere doldurma modu) acikken de tetikleniyordu -
    // goTab("komut") fillTarget'i TEMIZLIYOR (bkz. goTab), kullanicinin
    // yazdigi sey yanlislikla normal Hermes sohbetine gidiyordu.
    if (!fillTarget && ["home", "artifacts", "activity"].includes(currentTab) && !inp.value) goTab("komut");
  });

  const caps = (await getJSON("/capabilities")) || [];
  capabilityNames = caps.map((c) => c.name);
  capabilitiesWithRisk = caps.map((c) => ({ name: c.name, risk: c.risk || "ask" }));
  ACTIONABLE = new Set(caps.filter((c) => c.class === "REFLEX" || c.class === "AGENT").map((c) => c.name));
  setAllowedActions([...capabilityNames, ...UI_META_ACTIONS]);
  capVersion = await capabilitySetVersion(capabilityNames);
  S.services.llm = capabilityNames.includes("llm.generate");
  S.services.gateway = true;
  S.peers = (await getJSON("/a2a/peers")) || [];

  goTab("home");
  await refresh();

  refreshAndroidApps();

  setInterval(paintStatus, 20000);
  setInterval(refresh, 45000);
  // W3.4/W3.5: SSE yalnizca CANLI goruntuleme - baglanti koptuysa (ekran
  // kilidi, ag kaybı) araya giren olaylar SSE'den asla tekrar gelmez. Onceden
  // yeniden baglanildiginda hicbir sey tetiklenmiyordu; en fazla 45sn'lik
  // periyodik refresh() dongusune guveniliyordu. Artik reconnect (online
  // false -> true) ANINDA /state'i tazeliyor - dogruluk kaynagi HER ZAMAN
  // journal/state, SSE yalnizca "bir sey degisti, bak" sinyali.
  let wasOnline = true;
  events((ev) => {
    S.activity.push(ev);
    if (S.activity.length > 120) S.activity.shift();
    if (currentTab === "activity") paint();
  }, (online) => {
    S.services.fabric = online;
    paintStatus();
    if (online && !wasOnline) refresh();
    wasOnline = online;
  });

  read("wakelock.acquire").catch((err) => logClientError("boot.wakelock", err));
  handleEntry();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch((err) => logClientError("boot.serviceWorkerRegister", err));
}
