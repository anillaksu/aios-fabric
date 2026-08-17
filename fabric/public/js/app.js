/* ═══════════════════════════════════════════════════════════════
   AI-OS · SHELL  (v0.3)
   ───────────────────────────────────────────────────────────────
   SERT KURALLAR (tasarim anayasasi):
     · 1 ekran = 1 ana amac
     · 1 ekran = 1 ana GIRIS yuzeyi   -> tek composer (alt), ust bar input DEGIL
     · 1 komut = 1 net durum akisi
     · 1 sonuc  = 1 birincil ARTEFAKT -> metin kisa, cikti artefakt
     · FAB yok  -> mic composer'in icinde
   Sekmeler: HOME · KOMUT · ARTEFAKT · AKTİF · HERMES
   (UYG ayri sekme degil: uygulamalar KOMUT icinde + HOME'da oneri)
   ═══════════════════════════════════════════════════════════════ */

import { read, getJSON, postJSON, sendIntent, events } from "./api.js";
import { render, el } from "./registry.js";
import { validateScreen, mount, setAllowedActions } from "./renderer.js";
import * as SC from "./screens.js";

const S = SC.S;
let app;
let currentTab = "home";
let secondary = null;
let secondaryArg = null;   // ikincil ekrana parametre (orn. journal tur filtresi)
let capabilityNames = [];
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

function loadArtifacts() {
  try { artifacts = JSON.parse(localStorage.getItem(ART_KEY) || "[]"); } catch (_) { artifacts = []; }
}
function saveArtifacts() {
  try {
    // sabitlenenler her zaman korunur; sabitsizlerden en yeni 30 tanesi
    const pinned = artifacts.filter((a) => a.pinned);
    const rest = artifacts.filter((a) => !a.pinned).slice(0, 30);
    artifacts = [...pinned, ...rest];
    localStorage.setItem(ART_KEY, JSON.stringify(artifacts));
  } catch (_) {}
  // Sunucuya da yaz: yedek + hata incelemesi icin gorunurluk
  fetch("/artifacts", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(artifacts),
  }).catch(() => {});
}
function addArtifact(spec, prompt) {
  const item = {
    id: "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: spec.title || "Artefakt", spec, prompt: prompt || "",
    createdAt: Date.now(), pinned: false,
  };
  artifacts.unshift(item);
  saveArtifacts();
  updateBadges();
  return item;
}
const findArtifact = (id) => artifacts.find((a) => a.id === id);

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
  try { localStorage.setItem("aios.theme", id); } catch (_) {}
}
function loadTheme() {
  let id = "phosphor";
  try { id = localStorage.getItem("aios.theme") || "phosphor"; } catch (_) {}
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
    if (type === "ui.back")      { goSecondary(null); return { ok: true }; }
    if (type === "ui.appsheet")  { openAppSheet(payload); return { ok: true }; }
    if (type === "ui.control")   { openControlCenter(); return { ok: true }; }
    // silent: soruyu sohbete TEKRAR yazma - "TEKRAR DENE" butonu icin gerekli,
    // yoksa ayni kullanici mesaji iki kez gorunuyor.
    if (type === "ui.ask")       { ask(payload && payload.q, { silent: !!(payload && payload.silent) }); return { ok: true }; }
    if (type === "ui.artifact")  { openArtifact(payload && payload.id); return { ok: true }; }
    if (type === "ui.compose")   { focusComposer(payload && payload.text); return { ok: true }; }
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

const toast = (text, err) =>
  app.toast.show({ text, position: "center", closeTimeout: 2100, cssClass: err ? "color-red" : "" });

/* ════════ SON KULLANILAN ════════ */
function rememberRecent(pkg) {
  const found = S.apps.find((a) => a.pkg === pkg) || { pkg, name: pkg };
  S.recent = [found, ...S.recent.filter((r) => r.pkg !== pkg)].slice(0, 8);
  try { localStorage.setItem("aios.recent", JSON.stringify(S.recent)); } catch (_) {}
}
function loadRecent() {
  try { S.recent = JSON.parse(localStorage.getItem("aios.recent") || "[]"); } catch (_) { S.recent = []; }
}

/* ════════ NAVIGASYON ════════ */
function goTab(tab) {
  currentTab = tab; secondary = null; secondaryArg = null;
  document.querySelectorAll(".aios-tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  syncComposer();
  paint();
}
function goSecondary(screen, arg = null) { secondary = screen; secondaryArg = arg; paint(); }

function syncComposer() {
  const inp = $("#input");
  inp.placeholder =
    currentTab === "hermes" ? "Hermes'e yaz…" :
    currentTab === "komut"  ? "Uygulama, komut veya soru ara…" :
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
  if (secondary === "device")   return mount(host, validateScreen(SC.deviceScreen()), ctx);
  if (secondary === "agents")   return mount(host, validateScreen(SC.agentsScreen()), ctx);
  if (secondary === "capabilities") return mount(host, validateScreen(await SC.capabilitiesScreen()), ctx);
  if (secondary === "journal")     return mount(host, validateScreen(await SC.journalScreen(secondaryArg)), ctx);
  if (secondary === "connections") return mount(host, validateScreen(await SC.connectionsScreen()), ctx);
  if (secondary === "settings")    return mount(host, validateScreen(await SC.settingsScreen()), ctx);
  if (secondary === "miniapps")    return mount(host, validateScreen(SC.miniAppsScreen(artifacts)), ctx);
  if (secondary === "automations") return mount(host, validateScreen(await SC.automationsScreen()), ctx);
  if (secondary === "history")     return mount(host, validateScreen(await SC.intentHistoryScreen(secondaryArg)), ctx);

  if (currentTab === "home")      return mount(host, validateScreen(SC.homeScreen(artifacts)), ctx);
  if (currentTab === "komut")     return mount(host, validateScreen(SC.komutScreen(query, capabilityNames)), ctx);
  if (currentTab === "activity")  return mount(host, validateScreen(SC.activityScreen()), ctx);
  if (currentTab === "artifacts") return paintArtifacts();
  if (currentTab === "hermes")    return paintHermes();
}

/* ════════ ARTEFAKT GALERISI ════════ */
function paintArtifacts() {
  const host = $("#screen");
  host.innerHTML = "";
  host.appendChild(pageHead("Artefakt", artifacts.length + " KAYIT"));

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
    await ask(a.prompt, { silent: true });
  }));
  acts.appendChild(mk(a.pinned ? "pin_fill" : "pin", a.pinned ? "SABİT" : "SABİTLE", a.pinned, () => {
    a.pinned = !a.pinned; saveArtifacts(); paint();
    toast(a.pinned ? "Sabitlendi" : "Sabit kaldırıldı");
  }));
  acts.appendChild(mk("trash", "SİL", false, () => {
    artifacts = artifacts.filter((x) => x.id !== a.id);
    saveArtifacts(); updateBadges(); paint(); toast("Silindi");
  }));
  b.appendChild(acts);
  return b;
}

function openArtifact(id) {
  const a = findArtifact(id);
  if (!a) return;
  const host = $("#screen");
  host.innerHTML = "";
  const head = pageHead(a.title, when(a.createdAt), () => goTab("artifacts"));
  host.appendChild(head);
  const wrap = el("div", "c-section");
  const body = el("div", "body");
  body.appendChild(artifactBlock(a));
  wrap.appendChild(body);
  host.appendChild(wrap);
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

/* ARTEFAKT SOZLESMESI (2026-08-16, kullanici karari):
   "Uretilen her sema EN AZ BIR REFLEX/AGENT capability'sine baglanmak
   zorunda; salt-bilgi kartlari reddedilsin."

   Gerekcesi: artefakt bu sistemde bir SONUC degil, bir GIRIS YUZEYI.
   Icinde dokunulabilir hicbir is olmayan kart, sohbet metnini kutu icinde
   tekrar etmekten baska bir sey yapmiyor - kullaniciya yeni bir sey
   vermeden artefakt sayaci sisiriyor. (30 artefaktin bir kismi tam
   olarak boyleydi.)

   THOUGHT (llm.generate) ve ui.* eylemleri SAYILMAZ: birincisi yine
   modele geri donmek, ikincisi sadece gezinme. Sayilan sey cihazda
   GERCEKTEN bir sey yapan REFLEX/AGENT capability'leridir. */
function actionableCount(node, depth = 0) {
  // ─── FAIL-OPEN (2026-08-17 denetiminde bulundu) ───
  // ACTIONABLE listesi acilista /capabilities'ten doldurulur. O istek bir kez
  // basarisiz olursa (ag hiccup, sunucu yeni kalkiyor) liste BOS kalir ve bu
  // fonksiyon HER seye 0 doner -> kullanicinin urettigi HER artefakt "iş yok"
  // diye reddedilir. Sozlesmeyi degerlendiremiyorsak ihlal var diyemeyiz:
  // bilgi eksikken kapiyi kapatmak, yanlis pozitifin en pahali turu.
  if (ACTIONABLE.size === 0) return 1;
  if (!node || typeof node !== "object" || depth > 8) return 0;
  let n = 0;
  for (const key of ["action", "tap", "longPress"]) {
    const a = node[key];
    if (a && typeof a.type === "string" && ACTIONABLE.has(a.type)) n++;
  }
  if (Array.isArray(node.actions)) {
    node.actions.forEach((a) => { if (a && a.action && ACTIONABLE.has(a.action.type)) n++; });
  }
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) v.forEach((c) => { n += actionableCount(c, depth + 1); });
    else if (v && typeof v === "object") n += actionableCount(v, depth + 1);
  }
  return n;
}

/** ```aios bloklarini ayikla - LLM HTML degil ScreenSpec uretir */
function extractArtifacts(raw) {
  const specs = [];
  const rejected = [];
  const re = /```aios\s*([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    try {
      const clean = validateScreen(JSON.parse(m[1].trim()));
      if (!clean || !clean.sections.length) continue;
      if (actionableCount(clean) === 0) {
        rejected.push(clean.title || "Artefakt");
        continue;
      }
      specs.push(clean);
    } catch (e) { /* bozuk JSON -> atla */ }
  }
  return { text: raw.replace(re, "").trim(), specs, rejected };
}

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
  goTab("hermes");
  if (!opts.silent) chat.push({ role: "user", text });
  chat.push({ role: "agent", spec: { type: "task-card", title: "Hermes çalışıyor",
    source: "gpt-5.6-luna", status: "WORKING", tone: "info", state: "loading" } });
  paintHermes();

  const history = chat.filter((m) => m.text).slice(-7)
    .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));

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
    const { text: reply, specs, rejected } = extractArtifacts(full);
    // 1 sonuc = 1 birincil artefakt: artefakt varsa metin KISA tutulur
    if (reply) {
      const short = specs.length ? reply.split(/\n\n/)[0].slice(0, 220) : reply;
      chat.push({ role: "agent", text: short });
    }
    specs.forEach((s) => {
      const item = addArtifact(s, text);
      // Mini-app olarak istendiyse kalici kil (opts.pin).
      if (opts.pin) { item.pinned = true; saveArtifacts(); }
      chat.push({ role: "agent", artifactId: item.id });
    });
    if (opts.pin && specs.length) toast("Mini uygulama sabitlendi");
    // Reddedilen sema sessizce kaybolmaz - kullanici NEDEN gormedigini bilsin.
    if (rejected && rejected.length) {
      chat.push({ role: "agent", spec: {
        type: "error-state", icon: "hand_raised", title: "Artefakt reddedildi",
        detail: rejected.join(", ") + " — içinde çalıştırılabilir bir iş yok. "
              + "Artefakt en az bir gerçek cihaz eylemine bağlanmalı.",
        actionLabel: "İŞ EKLEYEREK TEKRAR ÜRET",
        action: { type: "ui.ask", payload: { q: text + " (kartta gerçekten çalışan butonlar olsun)", silent: true } },
      } });
    }
    if (!reply && !specs.length && !(rejected && rejected.length)) chat.push({ role: "agent", text: "(boş yanıt)" });
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
  const sheet = app.sheet.create({ content: html, backdrop: true });
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

  document.getElementById("cc-services").appendChild(render({
    type: "list",
    children: [
      { type: "list-row", title: "Fabric", chip: { label: S.services.fabric ? "ONLINE" : "DOWN", tone: S.services.fabric ? "ok" : "error" } },
      { type: "list-row", title: "Hermes", chip: { label: S.services.llm ? "READY" : "DOWN", tone: S.services.llm ? "ok" : "error" } },
      { type: "list-row", title: "Gateway", chip: { label: S.services.gateway ? "ONLINE" : "DOWN", tone: S.services.gateway ? "ok" : "error" } },
      { type: "list-row", title: "Tailscale", chip: { label: "CONNECTED", tone: "info" } },
    ],
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
  const sheet = app.sheet.create({
    content: `<div class="sheet-modal" style="height:auto"><div class="sheet-modal-inner">
      <div style="padding:14px 16px 10px" class="hstack"><span class="k-micro">${(name || pkg || "").toUpperCase()}</span>
      <span style="flex:1"></span><a href="#" class="link sheet-close k-micro">KAPAT</a></div>
      <div style="padding:0 16px 22px" id="app-sheet-body"></div></div></div>`,
    backdrop: true,
  });
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
  const voice = u.searchParams.get("voice");
  if (shared || tab || voice) history.replaceState({}, "", "/");
  if (shared) { setTimeout(() => ask(shared), 400); return; }
  if (tab) goTab(tab === "apps" ? "komut" : tab);
  if (voice) setTimeout(toggleVoice, 500);
}

/* ════════ ACILIS ════════ */
export async function boot(framework7) {
  app = framework7;
  loadTheme(); loadRecent(); loadArtifacts();
  // Acilista da senkronla: tarayici deposundaki mevcut artefaktlar sunucuya
  // gecsin (yedek + inceleme). Sadece degisiklikte yazmak yetmiyordu.
  if (artifacts.length) {
    fetch("/artifacts", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(artifacts),
    }).catch(() => {});
  }

  document.querySelectorAll(".aios-tab").forEach((b) =>
    b.addEventListener("click", () => goTab(b.dataset.tab)));
  $("#cc-open").addEventListener("click", (e) => { e.stopPropagation(); openControlCenter(); });
  $("#mic").addEventListener("click", (e) => { e.preventDefault(); toggleVoice(); });
  $("#send").addEventListener("click", (e) => { e.preventDefault(); submit(); });

  const inp = $("#input");
  inp.addEventListener("input", () => {
    inp.style.height = "auto";
    inp.style.height = Math.min(inp.scrollHeight, 110) + "px";
    // KOMUT sekmesinde yazmak = canli filtre (ayri arama kutusu YOK)
    if (currentTab === "komut") { query = inp.value; paint(); }
  });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  });
  inp.addEventListener("focus", () => {
    // Yazmaya baslayinca arama yuzeyine gec (tek giris, baglama duyarli)
    if (["home", "artifacts", "activity"].includes(currentTab) && !inp.value) goTab("komut");
  });

  const caps = (await getJSON("/capabilities")) || [];
  capabilityNames = caps.map((c) => c.name);
  ACTIONABLE = new Set(caps.filter((c) => c.class === "REFLEX" || c.class === "AGENT").map((c) => c.name));
  setAllowedActions([...capabilityNames, "ui.goto", "ui.back", "ui.appsheet",
    "ui.control", "ui.ask", "ui.artifact", "ui.compose", "cap.test",
    "ui.taskCancel", "ui.taskRetry", "ui.taskUndo", "ui.miniapp",
    "ui.ruleAdd", "ui.ruleToggle", "ui.ruleRemove"]);
  S.services.llm = capabilityNames.includes("llm.generate");
  S.services.gateway = true;
  S.peers = (await getJSON("/a2a/peers")) || [];

  goTab("home");
  await refresh();

  read("app.list").then((r) => {
    if (r.ok && r.data && r.data.apps) {
      S.apps = r.data.apps;
      if (["komut", "home"].includes(currentTab)) paint();
    }
  });

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

  read("wakelock.acquire").catch(() => {});
  handleEntry();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}
