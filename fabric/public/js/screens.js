/* ═══════════════════════════════════════════════════════════════
   AI-OS · Deterministik ekranlar
   ───────────────────────────────────────────────────────────────
   Bu ekranlar da AI'nin urettigiyle AYNI boru hattini kullanir:
     builder -> ScreenSpec -> validate -> renderer -> DOM
   Boylece "80% deterministic / 20% generative" ayrimi gorunumu
   DEGISTIRMEZ; sadece spec'i KIMIN urettigi degisir.
   ═══════════════════════════════════════════════════════════════ */

import { read, getJSON } from "./api.js";
import { WORKSPACE_CATEGORIES, entriesForCategory, foldWorkspaceText, searchWorkspaceEntries } from "./workspace-catalog.js";
import { recentApplications } from "./application-model.js";
import { continuityProjection } from "./continuity-projection.js";

/* ── paylasilan durum (shell tarafindan tazelenir) ── */
export const S = {
  battery: null,
  wifi: null,
  apps: [],
  appsLoadState: "loading", // yalniz Android uygulama listesinin veri durumu
  appsLoadError: null,
  recent: [],       // son acilan paketler (yerelde tutulur)
  tasks: [],        // Fabric task'lari
  activity: [],     // son olaylar
  peers: [],
  services: {},
};

const pct = (b) => (b ? (b.percentage ?? b.level ?? 0) : null);
const batTone = (p) => (p == null ? "idle" : p < 15 ? "error" : p < 35 ? "warn" : "ok");

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "İYİ GECELER";
  if (h < 12) return "GÜNAYDIN";
  if (h < 18) return "İYİ GÜNLER";
  return "İYİ AKŞAMLAR";
}

/* ══════════════ HOME / NOW ══════════════
   "Dashboard" degil "NOW": su an ne oluyor. Teknik metrikler en altta,
   ozet halinde; detay Device Center'da.                                */
export function homeScreen(artifacts = [], applications = []) {
  const b = S.battery, w = S.wifi;
  const p = pct(b);
  const sections = [];

  sections.push({
    type: "section",
    children: [{
      type: "info-card",
      title: greeting(),
      subtitle: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
        + (w && w.ssid ? " · " + String(w.ssid).replace(/"/g, "") : ""),
    }],
  });

  // Phone Workspace: HOME yalniz durum panosu degil, kullanıcının bildiği
  // işi adına bakmadan bulabildiği çalışma yüzeyidir. Bunlar catalog metadata
  // üzerinden saf istemci gezintisidir; capability çalıştırmaz.
  sections.push({
    type: "section", title: "ÇALIŞMA ALANI", layout: "grid-2",
    children: WORKSPACE_CATEGORIES.map((category) => ({
      type: "tile", name: category.id, value: category.icon === "iphone" ? "CİHAZ" : "AÇ",
      meta: category.subtitle, tap: { type: "ui.goto", payload: { screen: "discover", filter: category.id } },
    })),
  });

  const recentWorkspaceApps = recentApplications(applications, 4);
  if (recentWorkspaceApps.length) {
    sections.push({
      type: "section", title: "SON KULLANILAN UYGULAMALAR", layout: "grid-4",
      children: recentWorkspaceApps.map((app) => ({
        type: "app-tile", name: app.title || "Uygulama", icon: app.icon,
        action: { type: "ui.application", payload: { applicationId: app.id, artifactId: app.artifactId } },
      })),
    });
  }

  // NOW - calisan isler (yoksa bos birakma, oneriye cevir)
  const running = S.tasks.filter((t) => ["running", "optimistic", "pending"].includes(t.status));
  if (running.length) {
    sections.push({
      type: "section", title: "NOW", trailing: running.length + " AKTİF",
      children: running.slice(0, 3).map((t) => ({
        type: "task-card", title: t.type, source: t.class,
        status: t.status === "running" ? "WORKING" : "PENDING",
        tone: t.status === "running" ? "info" : "warn",
        state: t.status === "running" ? "loading" : "pending",
      })),
    });
  }

  // SABITLENEN canli paneller - home'a cikar
  const pinned = artifacts.filter((a) => a.pinned).slice(0, 2);
  if (pinned.length) {
    sections.push({
      type: "section", title: "SABİTLENEN",
      children: pinned.map((a) => ({
        type: "action-card", icon: "pin_fill", title: a.title,
        subtitle: a.prompt || "canlı panel",
        action: { type: "ui.artifact", payload: { id: a.id } },
      })),
    });
  }

  // W6.G: ApplicationEntry artifact'in kendisi DEGIL, onu acan kalici
  // launcher identity'sidir. Entry'nin kendi capability/execution'i yoktur.
  if (applications.length) {
    sections.push({
      type: "section", title: "UYGULAMALAR", trailing: String(applications.length), layout: "grid-4",
      children: applications.map((app) => ({
        type: "app-tile", name: app.title || "Uygulama", icon: app.icon,
        action: { type: "ui.application", payload: { applicationId: app.id, artifactId: app.artifactId } },
      })),
    });
  }

  if (S.recent.length) {
    sections.push({
      type: "section", title: "SON KULLANILAN", layout: "grid-4",
      children: S.recent.slice(0, 4).map((a) => ({
        type: "app-tile", name: a.name, pkg: a.pkg,
        action: { type: "app.open", payload: { pkg: a.pkg } },
        longPress: { type: "ui.appsheet", payload: { pkg: a.pkg, name: a.name } },
      })),
    });
  }

  // DURUMSAL ONERILER - saate/pile gore degisir
  sections.push({ type: "section", title: "ÖNERİLEN", children: suggestions(artifacts) });

  sections.push({
    type: "section", title: "CİHAZ", layout: "grid-2",
    children: [
      { type: "metric", label: "PİL", value: p == null ? "—" : p, unit: p == null ? "" : "%", tone: batTone(p), progress: p },
      { type: "metric", label: "AĞ", value: w && w.link_speed_mbps ? w.link_speed_mbps : "—",
        unit: w && w.link_speed_mbps ? "Mb" : "", tone: "ok" },
      { type: "metric", label: "SICAKLIK", value: b && b.temperature ? b.temperature : "—", unit: "°C",
        tone: b && b.temperature > 42 ? "warn" : "ok" },
      { type: "metric", label: "ARTEFAKT", value: artifacts.length, tone: artifacts.length ? "ok" : "idle" },
    ],
  });

  return { id: "home", title: "AI-OS", sections };
}

/** Durumsal oneriler: saat, pil ve gecmise gore degisir */
function suggestions(artifacts = []) {
  const out = [];
  const h = new Date().getHours();
  const p = pct(S.battery);

  if (p != null && p < 25 && S.battery && S.battery.status !== "CHARGING") {
    out.push({ type: "action-card", icon: "battery_25", title: "Pil azalıyor",
      subtitle: "Pil detayını gör", action: { type: "ui.referenceDeviceStatus" } });
  }
  if (S.battery && S.battery.temperature > 42) {
    out.push({ type: "action-card", icon: "thermometer", title: "Cihaz ısındı",
      subtitle: S.battery.temperature + "°C · çalışan işleri gör",
      action: { type: "ui.goto", payload: { tab: "activity" } } });
  }
  if (h >= 22 || h < 7) {
    out.push({ type: "action-card", icon: "moon_fill", title: "Gece modu",
      subtitle: "Sesi kıs", action: { type: "volume.set", payload: { stream: "music", value: 3 } } });
  }
  const lastArt = artifacts[0];
  if (lastArt) {
    out.push({ type: "action-card", icon: "square_stack_3d_up_fill", title: "Son artefakt: " + lastArt.title,
      subtitle: "aç ve devam et", action: { type: "ui.artifact", payload: { id: lastArt.id } } });
  }
  out.push({ type: "action-card", icon: "sparkles", title: "Hermes'e sor",
    subtitle: "Aşağıdan yaz veya mikrofona dokun",
    action: { type: "ui.goto", payload: { tab: "hermes" } } });
  return out.slice(0, 3);
}

/* ══════════════ KEŞFET ══════════════
   Phone Workspace'in deterministik discovery yüzeyi. LLM anlam çıkarmaz:
   built-in catalog metadata'sı + ad/prompt eşleşmesi ile bulur. */
export function discoverScreen(q, capabilityNames = [], artifacts = [], applications = [], category = null) {
  const query = (q || "").toLowerCase().trim();
  const sections = [];

  const card = (entry) => ({ type: "action-card", icon: entry.icon, title: entry.title, subtitle: entry.subtitle, action: entry.action });
  const categoryKnown = WORKSPACE_CATEGORIES.some((item) => item.id === category);
  if (categoryKnown) {
    sections.push({ type: "section", title: category.toUpperCase(), children: entriesForCategory(category).map(card) });
    if (category === "Uygulamalar") {
      sections.push({ type: "section", title: "TELEFONDAKİ UYGULAMALAR", layout: "grid-4", children: phoneAppsContent(12) });
    }
    if (category === "AIOS" && applications.length) {
      sections.push({ type: "section", title: "UYGULAMALARIM · " + applications.length, layout: "grid-4",
        children: applications.slice(0, 8).map((app) => ({ type: "app-tile", name: app.title || "Uygulama", icon: app.icon,
          action: { type: "ui.application", payload: { applicationId: app.id, artifactId: app.artifactId } } })) });
    }
    return { id: "discover:" + category, title: category, sections };
  }

  if (!query) {
    sections.push({
      type: "section", title: "KEŞFET", layout: "grid-2",
      children: WORKSPACE_CATEGORIES.map((item) => ({
        type: "tile", name: item.id, value: "AÇ", meta: item.subtitle,
        tap: { type: "ui.goto", payload: { screen: "discover", filter: item.id } },
      })),
    });
    if (applications.length) {
      sections.push({
        type: "section", title: "UYGULAMALARIM", layout: "grid-4",
        children: applications.slice(0, 8).map((app) => ({ type: "app-tile", name: app.title || "Uygulama", icon: app.icon,
          action: { type: "ui.application", payload: { applicationId: app.id, artifactId: app.artifactId } } })),
      });
    }
    sections.push({ type: "section", title: "TELEFON UYGULAMALARI" + (S.appsLoadState === "ready" ? " · " + S.apps.length : ""),
      children: [{ type: "action-card", icon: "square_grid_2x2_fill", title: "Tüm uygulamaları aç", subtitle: "Cihazda yüklü uygulamalar",
        action: { type: "ui.goto", payload: { screen: "androidApps" } } }] });
    return { id: "discover", title: "Keşfet", sections };
  }

  const needle = foldWorkspaceText(query);
  const catalog = searchWorkspaceEntries(query);
  const apps = S.apps.filter((app) => foldWorkspaceText(app.name).includes(needle) || foldWorkspaceText(app.pkg).includes(needle));
  const matchingApplications = applications.filter((app) => foldWorkspaceText(app.title).includes(needle));
  const matchingArtifacts = artifacts.filter((artifact) => foldWorkspaceText(artifact.title).includes(needle) || foldWorkspaceText(artifact.prompt).includes(needle));
  const caps = capabilityNames.filter((n) => n.toLowerCase().includes(query)).slice(0, 5);

  if (catalog.length) sections.push({ type: "section", title: "AIOS İŞLEVLERİ", children: catalog.map(card) });
  if (matchingApplications.length) sections.push({ type: "section", title: "UYGULAMALARIM", layout: "grid-4",
    children: matchingApplications.map((app) => ({ type: "app-tile", name: app.title || "Uygulama", icon: app.icon,
      action: { type: "ui.application", payload: { applicationId: app.id, artifactId: app.artifactId } } })) });
  if (matchingArtifacts.length) sections.push({ type: "section", title: "ARTEFAKTLAR", children: [{ type: "list", children: matchingArtifacts.slice(0, 8).map((artifact) => ({
    type: "list-row", icon: "square_stack_3d_up", title: artifact.title || "Artefakt", subtitle: artifact.prompt ? artifact.prompt.slice(0, 72) : "",
    action: { type: "ui.artifact", payload: { id: artifact.id } },
  })) }] });
  if (apps.length) {
    sections.push({
      type: "section", title: "UYGULAMA · " + apps.length, layout: "grid-4",
      children: apps.slice(0, 12).map((a) => ({
        type: "app-tile", name: a.name, pkg: a.pkg,
        action: { type: "app.open", payload: { pkg: a.pkg } },
        longPress: { type: "ui.appsheet", payload: { pkg: a.pkg, name: a.name } },
      })),
    });
  }
  if (!apps.length && S.appsLoadState === "loading") {
    sections.push({ type: "section", title: "TELEFON UYGULAMALARI", children: [{ type: "skeleton", rows: 2 }] });
  }
  if (!apps.length && S.appsLoadState === "error") {
    sections.push({ type: "section", title: "TELEFON UYGULAMALARI", children: [{ type: "error-state", icon: "wifi_exclamationmark", title: "Uygulama listesi alınamadı", detail: "Listeyi yeniden deneyebilirsin.", actionLabel: "TEKRAR DENE", action: { type: "ui.refreshApps" } }] });
  }
  if (!catalog.length && !matchingApplications.length && !matchingArtifacts.length && !apps.length && !caps.length) {
    sections.push({ type: "section", title: "SONUÇ", children: [{ type: "empty-state", icon: "magnifyingglass", title: "Eşleşme bulunamadı", detail: "Yerel katalogda bu adla bir işlev yok. İstersen Hermes'e sorabilirsin." }] });
  }
  if (caps.length) {
    sections.push({ type: "section", title: "CAPABILITY",
      children: [{ type: "list", children: caps.map((n) => ({
        type: "list-row", icon: "square_stack_3d_up", title: n,
        action: { type: "cap.test", payload: { name: n } } })) }] });
  }
  sections.push({
    type: "section", title: "HERMES",
    children: [{ type: "action-card", icon: "sparkles", title: "“" + q + "” diye sor",
      subtitle: "Gönder tuşuna bas veya buraya dokun",
      action: { type: "ui.ask", payload: { q } } }],
  });
  return { id: "discover-search", title: "Keşfet", sections };
}

/** Android launcher listesi ApplicationEntry'den ayrıdır: cihaz paketlerini açar. */
export function androidAppsScreen() {
  return {
    id: "android-apps", title: "Telefon Uygulamaları",
    sections: [{ type: "section", title: "UYGULAMALAR" + (S.appsLoadState === "ready" ? " · " + S.apps.length : ""), layout: "grid-4", children: phoneAppsContent() }],
  };
}

function phoneAppsContent(limit = Infinity) {
  if (S.appsLoadState === "loading") return [{ type: "skeleton", rows: 4 }];
  if (S.appsLoadState === "error") return [{ type: "error-state", icon: "wifi_exclamationmark", title: "Uygulama listesi alınamadı", detail: "Bağlantıyı kontrol edip yeniden deneyebilirsin.", actionLabel: "TEKRAR DENE", action: { type: "ui.refreshApps" } }];
  if (!S.apps.length) return [{ type: "empty-state", icon: "square_grid_2x2", title: "Uygulama yok", detail: "Cihaz uygulama listesi boş döndü.", actionLabel: "YENİLE", action: { type: "ui.refreshApps" } }];
  return S.apps.slice(0, limit).map((app) => ({ type: "app-tile", name: app.name, pkg: app.pkg,
    action: { type: "app.open", payload: { pkg: app.pkg } }, longPress: { type: "ui.appsheet", payload: { pkg: app.pkg, name: app.name } } }));
}

/** Yalnız gerçek, parametresi burada belirlenmiş günlük araçlar. */
export function toolsScreen() {
  return {
    id: "tools", title: "Hızlı Araçlar",
    sections: [
      { type: "section", title: "CİHAZ", children: [
        { type: "button-row", children: [
          { type: "button", label: "FENER AÇ", variant: "primary", action: { type: "torch.set", payload: { on: true } } },
          { type: "button", label: "FENER KAPAT", variant: "ghost", action: { type: "torch.set", payload: { on: false } } },
        ] },
        { type: "button", label: "TİTRET", variant: "ghost", action: { type: "vibrate", payload: { ms: 250 } } },
      ] },
      { type: "section", title: "SINIR", children: [{ type: "info-card", icon: "lock", title: "Policy korunur",
        body: "Her araç mevcut dispatcher ve capability risk politikasından geçer. Parametresi belirsiz capability'ler burada uygulama gibi gösterilmez." }] },
    ],
  };
}

/* ══════════════ HERMES BOŞ EKRANI ══════════════
   "Bos siyah alan" YOK: son artefaktlar + hizli komutlar + aktif isler.  */
export function hermesEmptyScreen(artifacts = [], applications = []) {
  const sections = [];
  const continuity = continuityProjection({ artifacts, applications, tasks: S.tasks });

  const continueWith = [];
  if (continuity.recentApplication) {
    const app = continuity.recentApplication;
    continueWith.push({ type: "action-card", icon: app.icon || "square_grid_2x2_fill",
      title: app.title || "Son uygulama", subtitle: "En son bunu açtın · kaldığın yerden devam et",
      action: { type: "ui.application", payload: { applicationId: app.id, artifactId: app.artifactId } } });
  }
  if (continuity.recentArtifact && (!continuity.recentApplication || continuity.recentArtifact.id !== continuity.recentApplication.artifactId)) {
    const artifact = continuity.recentArtifact;
    continueWith.push({ type: "action-card", icon: "square_stack_3d_up_fill", title: artifact.title || "Son artefakt",
      subtitle: "Son oluşturulan iş · aç ve sürdür", action: { type: "ui.artifact", payload: { id: artifact.id } } });
  }
  if (continueWith.length) {
    sections.push({
      type: "section", title: "NEREDEN DEVAM EDELİM?", children: continueWith.slice(0, 2),
    });
  }

  if (continuity.activeTasks.length || continuity.failedTasks.length) {
    sections.push({
      type: "section", title: "ŞU AN", children: [{ type: "list", children: [
        ...continuity.activeTasks.map((task) => ({ type: "list-row", icon: "circle_fill", title: task.type || "Görev",
          subtitle: "Devam ediyor", trailing: "AKTİF", action: { type: "ui.goto", payload: { tab: "activity" } } })),
        ...continuity.failedTasks.map((task) => ({ type: "list-row", icon: "xmark_circle", tone: "error", title: task.type || "Görev",
          subtitle: task.error ? String(task.error).slice(0, 70) : "Sonuç alınamadı", trailing: "HATA",
          action: { type: "ui.goto", payload: { tab: "activity" } } })),
      ] }],
    });
  }

  if (continuity.pinnedArtifacts.length) {
    sections.push({ type: "section", title: "SABİTLEDİKLERİN", children: [{ type: "list", children:
      continuity.pinnedArtifacts.map((artifact) => ({ type: "list-row", icon: "pin_fill", title: artifact.title || "Artefakt",
        subtitle: "Kalıcı iş", action: { type: "ui.artifact", payload: { id: artifact.id } } })) }] });
  }

  sections.push({
    type: "section", title: "BİRLİKTE OLUŞTUR",
    children: [{ type: "list", children: [
      { type: "list-row", icon: "magnifyingglass", title: "Mevcut bir işlevi bul", subtitle: "Önce Keşfet'te var olanı aç",
        action: { type: "ui.goto", payload: { tab: "komut" } } },
      { type: "list-row", icon: "square_pencil", title: "Yeni bir işlev iste", subtitle: "İhtiyacını yaz; oluşan artefakt kalıcılaşabilir",
        action: { type: "ui.ask", payload: { q: "Bana günlük kullanacağım yeni bir AIOS uygulaması oluştur" } } },
      { type: "list-row", icon: "gauge", title: "AIOS'un durumuna bak", subtitle: "Servisler, görevler ve izinler",
        action: { type: "ui.goto", payload: { screen: "management" } } },
    ] }],
  });
  return { id: "relationship-empty", title: "AIOS", subtitle: "oluştur, sürdür, birlikte ilerle", sections };
}

/* ══════════════ ACTIVITY CENTER ══════════════
   A2A/MCP mimarisinin GORUNUR yuzu. "Bir sey yaptim ama oldu mu?"
   sorusunu ortadan kaldirir.                                          */
/* AKTIF sekmesi = KONTROL MERKEZI.
   Onceden gorev karti sadece "app.open · REFLEX" yaziyordu; kullanicinin
   gercekten sordugu sorulara (bunu ben mi istedim? ne anladi? kim yapiyor?
   nerede takildi?) cevap vermiyordu. Kart artik zarftan gelen baglami
   gosteriyor: HEDEF / NE ANLADI / KIM YAPIYOR / SU AN NEREDE / SONUC.     */
const SOURCE_LABEL = {
  ui: "Ekran", hermes: "Hermes", voice: "Ses", share: "Paylaş",
  agent: "Uzak ajan", sensor: "Sensör", automation: "Otomasyon", schedule: "Zamanlayıcı",
};
const BY_LABEL = { deterministic: "kural", llm: "model", agent: "ajan" };

/* ── task.* olaylarini INSAN DILINE cevir ──
   Ham hali "sensor.battery.read · REFLEX · completed" idi; bu bir log
   satiri, cumle degil. Kullanicinin sordugu sey "ne oldu ve neden?" -
   ekran da o dili konusmali.
   Yeni bir capability eklendiginde buraya satir eklemek ZORUNLU DEGIL:
   eslesme yoksa okunabilir bir yedege dusuluyor.                        */
const VERB = {
  "sensor.battery.read": (r) => "Pil" + (r && r.percentage != null ? " %" + r.percentage : "") + " okundu",
  "sensor.location.read": () => "Konum okundu",
  "wifi.info": (r) => "Ağ bilgisi okundu" + (r && r.ssid ? " (" + String(r.ssid).replace(/"/g, "") + ")" : ""),
  "volume.read": () => "Ses seviyesi okundu",
  "volume.set": (r, p) => "Ses " + (p && p.value != null ? p.value : "") + " yapıldı",
  "torch.set": (r, p) => "Fener " + (p && (p.on === true || p.on === "true") ? "açıldı" : "kapatıldı"),
  "vibrate": () => "Telefon titretildi",
  "app.open": (r, p) => (p && p.pkg ? appLabel(p.pkg) : "Uygulama") + " açıldı",
  "app.freeze": (r, p) => (p && p.pkg ? appLabel(p.pkg) : "Uygulama") + " donduruldu",
  "app.unfreeze": (r, p) => (p && p.pkg ? appLabel(p.pkg) : "Uygulama") + " çözüldü",
  "app.list": (r) => "Uygulama listesi alındı" + (r && r.count ? " (" + r.count + ")" : ""),
  "clipboard.set": () => "Panoya yazıldı",
  "clipboard.get": () => "Pano okundu",
  "notification.send": () => "Bildirim gönderildi",
  "tts.speak": () => "Sesli okundu",
  "speech.listen": () => "Konuşma dinlendi",
  "media.play_search": (r, p) => "\"" + ((p && p.query) || "") + "\" çalındı",
  "media.control": (r, p) => "Medya: " + ((p && p.action) || "kontrol"),
  "script.run": (r, p) => "Betik çalıştı: " + String((p && p.cmd) || "").slice(0, 40),
  "doc.create": (r) => (r && r.format ? r.format.toUpperCase() : "Belge") + " oluşturuldu",
  "file.share": () => "Dosya paylaşıma açıldı",
  "share.text": () => "Metin paylaşıma açıldı",
  "whatsapp.send": () => "WhatsApp açıldı",
  "link.open": (r) => "Bağlantı açıldı" + (r && r.kit ? " (" + r.kit + ")" : ""),
  "intent.run": (r) => "Sistem eylemi çalıştı" + (r && r.kit ? " (" + r.kit + ")" : ""),
  "wakelock.acquire": () => "Uyku engellendi",
  "wakelock.release": () => "Uyku engeli kaldırıldı",
  "app.labels.resolve": (r) => (r && r.resolved != null ? r.resolved + " uygulama adı çözüldü" : "Adlar çözüldü"),
  "llm.generate": () => "Hermes düşündü",
};

function appLabel(pkg) {
  const a = S.apps.find((x) => x.pkg === pkg);
  return a ? a.name : pkg;
}

/** Bir gorevi tek cumleye cevirir: NE oldu. */
function whatHappened(t) {
  const fn = VERB[t.type];
  const base = fn ? fn(t.result, t.payload) : t.type.replace(/\./g, " ");
  if (t.status === "completed") return base;
  // Turkce fiil cekimini regex ile uretmeye calismak bozuk sonuc veriyordu
  // ("Fener açıılıyor"). Cekim yerine EK ifade: her fiilde dogru calisir.
  if (t.status === "running")   return base + "…";
  if (t.status === "failed")    return base + " — olmadı";
  if (t.status === "cancelled") return base + " — iptal edildi";
  if (t.status === "interrupted") return base + " — yarım kaldı";
  return base + " — bekliyor";
}

/** NEDEN yapildi: kaynak + yorumlayan. */
function whyHappened(t) {
  const who = SOURCE_LABEL[t.source] || t.source;
  if (!who) return "sistem içi";
  if (t.source === "automation") return "otomasyon kuralı tetikledi";
  if (t.source === "hermes") return "Hermes'e söylediğin için";
  if (t.source === "voice") return "sesli istediğin için";
  if (t.source === "share") return "paylaş menüsünden geldiği için";
  if (t.source === "agent") return "uzak ajan istediği için";
  if (t.source === "ui") return "ekrandan dokunduğun için";
  return who;
}

function taskCard(t, actions = []) {
  // BASLIK = NE oldu (insan dili). Alt satir = NEDEN + detay.
  const goal = whatHappened(t);
  const by = BY_LABEL[t.interpretedBy] || t.interpretedBy;

  const bits = [whyHappened(t)];
  // Ham ifade capability adindan farkliysa "ne dedim / ne anladi" degerlidir.
  if (t.goal && t.goal !== t.type) bits.push("\"" + String(t.goal) + "\" → " + t.type);
  if (by) bits.push(by + " yorumladı");
  if (t.stage && t.status === "running") bits.push(t.stage);
  if (t.attempts > 1) bits.push(t.attempts + ". deneme");
  if (t.error) bits.push("hata: " + String(t.error));

  // GERI AL: yalnizca tamamlanmis ve GERCEKTEN geri alinabilir isler icin.
  // Geri alinamayan bir ise sahte buton koymak guveni bozar.
  const acts = [...actions];
  if (t.status === "completed" && t.undoLabel) {
    acts.push({ label: "GERİ AL", variant: "ghost",
                action: { type: "ui.taskUndo", payload: { taskId: t.id } } });
  }

  const status =
    t.status === "running" ? "ÇALIŞIYOR" :
    t.status === "completed" ? "BİTTİ" :
    t.status === "cancelled" ? "İPTAL" :
    t.status === "failed" ? "HATA" :
    t.status === "interrupted" ? "YARIM" : "BEKLİYOR";

  return {
    type: "task-card",
    title: goal.slice(0, 70),
    source: bits.join(" · "),
    status,
    tone: ["failed", "cancelled", "interrupted"].includes(t.status) ? "error"
        : t.status === "completed" ? "ok"
        : t.status === "running" ? "info" : "warn",
    state: t.status === "running" ? "loading" : t.status === "completed" ? "success" : "pending",
    elapsed: t.updatedAt && t.createdAt ? ((t.updatedAt - t.createdAt) / 1000).toFixed(1) + "s" : undefined,
    actions: acts.length ? acts : undefined,
  };
}

export function activityScreen() {
  const sections = [];
  const running = S.tasks.filter((t) => ["running", "optimistic", "pending"].includes(t.status));
  const done = S.tasks.filter((t) => ["completed", "failed", "interrupted", "cancelled"].includes(t.status))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  sections.push({
    type: "section", title: "NOW", trailing: running.length ? String(running.length) : "",
    children: running.length
      ? running.map((t) => taskCard(t, [
          // Asili kalan is artik durdurulabilir - onceden tek care sunucuyu
          // yeniden baslatmakti.
          { label: "İPTAL", variant: "danger",
            action: { type: "ui.taskCancel", payload: { taskId: t.id } } },
        ]))
      : [{ type: "empty-state", icon: "moon_zzz", title: "Çalışan görev yok" }],
  });

  if (done.length) {
    const failed = done.filter((t) => t.status !== "completed");
    if (failed.length) {
      sections.push({
        type: "section", title: "BAŞARISIZ", trailing: String(failed.length),
        children: failed.slice(0, 6).map((t) => taskCard(t, [
          { label: "TEKRAR DENE", variant: "primary",
            action: { type: "ui.taskRetry", payload: { taskId: t.id } } },
        ])),
      });
    }
    // Tamamlananlar da KART: geri alinabilir olanlarda "GERİ AL" cikar.
    const completed = done.filter((t) => t.status === "completed");
    if (completed.length) {
      sections.push({
        type: "section", title: "AZ ÖNCE OLANLAR",
        children: completed.slice(0, 8).map((t) => taskCard(t)),
      });
    }
  }

  // BASARISIZ OKUMALAR - kullanicinin gordugu hatalar artik burada gorunur
  const fails = S.activity.filter((e) => e.type === "read.failed").slice(-8).reverse();
  if (fails.length) {
    sections.push({
      type: "section", title: "HATALAR", trailing: String(fails.length),
      children: [{ type: "list", children: fails.map((e) => ({
        type: "list-row", icon: "exclamationmark_triangle_fill", tone: "error",
        title: (e.payload && e.payload.intent) || "bilinmeyen",
        subtitle: String((e.payload && e.payload.error) || "").slice(0, 90),
        trailing: new Date(e.ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
      })) }],
    });
  }

  if (S.activity.length) {
    sections.push({
      type: "section", title: "OLAY AKIŞI",
      children: [{
        type: "list",
        children: S.activity.slice(-14).reverse().map((e) => ({
          type: "list-row",
          title: e.type,
          subtitle: e.correlationId ? "#" + String(e.correlationId).slice(0, 8) : "",
          trailing: new Date(e.ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
        })),
      }],
    });
  }
  return { id: "activity", title: "Aktivite", sections };
}

/* ══════════════ DEVICE CENTER ══════════════ */
export function deviceScreen() {
  const b = S.battery, w = S.wifi;
  const p = pct(b);
  return {
    id: "device", title: "Device Center",
    sections: [
      {
        type: "section", title: "SAĞLIK", layout: "grid-2",
        children: [
          { type: "metric", label: "PİL", value: p == null ? "—" : p, unit: "%", tone: batTone(p), progress: p },
          { type: "metric", label: "SICAKLIK", value: b && b.temperature ? b.temperature : "—", unit: "°C",
            tone: b && b.temperature > 42 ? "warn" : "ok" },
          { type: "metric", label: "VOLTAJ", value: b && b.voltage ? (b.voltage / 1000).toFixed(2) : "—", unit: "V" },
          { type: "metric", label: "DÖNGÜ", value: b && b.cycle != null ? b.cycle : "—" },
        ],
      },
      {
        type: "section", title: "PİL DETAY",
        children: [{
          type: "list",
          children: [
            { type: "list-row", title: "Durum", trailing: b ? b.status : "—" },
            { type: "list-row", title: "Sağlık", trailing: b ? b.health : "—" },
            { type: "list-row", title: "Bağlantı", trailing: b ? b.plugged : "—" },
            { type: "list-row", title: "Teknoloji", trailing: b ? b.technology : "—" },
          ],
        }],
      },
      {
        type: "section", title: "BAĞLANTI",
        children: [{
          type: "list",
          children: [
            { type: "list-row", icon: "wifi", title: "Wi-Fi", subtitle: w && w.ssid ? String(w.ssid).replace(/"/g, "") : "—",
              chip: { label: w ? "BAĞLI" : "YOK", tone: w ? "ok" : "idle" } },
            { type: "list-row", title: "IP", trailing: w ? w.ip : "—" },
            { type: "list-row", title: "Sinyal", trailing: w && w.rssi ? w.rssi + " dBm" : "—" },
            { type: "list-row", title: "Frekans", trailing: w && w.frequency_mhz ? (w.frequency_mhz > 3000 ? "5 GHz" : "2.4 GHz") : "—" },
          ],
        }],
      },
      {
        type: "section", title: "SERVİSLER",
        children: [{
          type: "list",
          children: [
            { type: "list-row", icon: "cube_box", title: "Fabric", subtitle: "TypeScript omurga · 9300",
              chip: { label: S.services.fabric ? "ONLINE" : "DOWN", tone: S.services.fabric ? "ok" : "error" } },
            { type: "list-row", icon: "sparkles", title: "Hermes LLM", subtitle: "llm_bridge · 9201",
              chip: { label: S.services.llm ? "READY" : "DOWN", tone: S.services.llm ? "ok" : "error" } },
            { type: "list-row", icon: "antenna_radiowaves_left_right", title: "Gateway", subtitle: "A2A · 8642",
              chip: { label: S.services.gateway ? "ONLINE" : "DOWN", tone: S.services.gateway ? "ok" : "error" } },
          ],
        }],
      },
      {
        type: "section", title: "CİHAZ",
        children: [{
          type: "list",
          children: [
            { type: "list-row", title: "Model", trailing: "Xiaomi 13 Lite" },
            { type: "list-row", title: "Android", trailing: "15" },
            { type: "list-row", title: "Uygulama", trailing: String(S.apps.length) },
          ],
        }],
      },
    ],
  };
}

/* ══════════════ AGENTS ══════════════ */
export function agentsScreen() {
  const children = [
    {
      type: "agent-card", name: "HERMES", online: !!S.services.llm,
      role: "reasoning · device", status: S.services.llm ? "READY" : "OFFLINE",
      detail: "gpt-5.6-luna",
      action: { type: "ui.goto", payload: { tab: "hermes" } }, actionLabel: "SOR",
    },
  ];
  S.peers.forEach((p) => {
    children.push({
      type: "agent-card", name: (p.name || "PEER").toUpperCase(), online: true,
      role: p.description || "A2A peer", status: "CONNECTED", detail: p.url,
    });
  });
  if (!S.peers.length) {
    children.push({ type: "agent-card", name: "PC-CODER", online: false, role: "coding · testing",
      status: "OFFLINE", detail: "peer eklenmedi" });
  }
  return {
    id: "agents", title: "Agents",
    sections: [
      { type: "section", title: "AJANLAR", children },
      { type: "section", title: "AÇIKLAMA", children: [{
        type: "info-card", icon: "info_circle",
        title: "A2A delegasyonu",
        body: "Uzak ajanlar Tailscale üzerinden Agent Card ile tanışır. Peer eklemek için Fabric paneli: /panel",
      }] },
    ],
  };
}

/* ══════════════ CAPABILITIES (MCP Explorer) ══════════════ */
export async function capabilitiesScreen() {
  const caps = (await getJSON("/capabilities")) || [];
  const groups = {};
  caps.forEach((c) => {
    const k = c.name.split(".")[0];
    (groups[k] = groups[k] || []).push(c);
  });
  const sections = [{
    type: "section", title: "ÖZET", layout: "grid-2",
    children: [
      { type: "metric", label: "CAPABILITY", value: caps.length, tone: "ok" },
      { type: "metric", label: "GRUP", value: Object.keys(groups).length },
    ],
  }];
  Object.keys(groups).sort().forEach((g) => {
    sections.push({
      type: "section", title: g.toUpperCase(),
      children: [{
        type: "list",
        children: groups[g].map((c) => ({
          type: "list-row", title: c.name,
          chip: { label: c.class, tone: c.class === "REFLEX" ? "ok" : c.class === "THOUGHT" ? "info" : "warn" },
          action: { type: "cap.test", payload: { name: c.name } },
        })),
      }],
    });
  });
  return { id: "capabilities", title: "Capabilities", sections };
}

/* ══════════════ EVENT JOURNAL ══════════════
   Journal sistemin tek dogruluk kaynagi; bu ekran onu OKUNABILIR kilar.
   Onceden yalnizca canli SSE akisi vardi, yani uygulamayi acmadan once
   olanlar gorulemiyordu - artefakt hatalarini kovalarken en cok eksigi
   hissedilen sey buydu.                                                  */
export async function journalScreen(filter) {
  const url = "/journal?limit=120" + (filter ? "&type=" + encodeURIComponent(filter) : "");
  const r = (await getJSON(url)) || { events: [], total: 0 };
  const events = r.events || [];
  const byType = {};
  events.forEach((e) => { byType[e.type] = (byType[e.type] || 0) + 1; });
  const failed = events.filter((e) => e.type === "read.failed" || /fail|error/i.test(e.type));

  const sections = [{
    type: "section", title: "ÖZET", layout: "grid-2",
    children: [
      { type: "metric", label: "OLAY", value: r.total || 0, tone: "ok" },
      { type: "metric", label: "HATA", value: failed.length, tone: failed.length ? "error" : "ok" },
    ],
  }];

  const chips = Object.keys(byType).sort((a, b) => byType[b] - byType[a]);
  if (chips.length) {
    sections.push({
      type: "section", title: "TÜRLER",
      children: [{ type: "button-row", children: [
        { type: "button", label: "TÜMÜ", variant: filter ? "ghost" : "primary",
          action: { type: "ui.goto", payload: { screen: "journal" } } },
        ...chips.slice(0, 5).map((t) => ({
          type: "button", label: t + " · " + byType[t],
          variant: filter === t ? "primary" : "ghost",
          action: { type: "ui.goto", payload: { screen: "journal", filter: t } },
        })),
      ] }],
    });
  }

  sections.push({
    type: "section", title: filter ? "OLAYLAR · " + filter : "SON OLAYLAR",
    children: events.length ? [{
      type: "list",
      children: events.slice(0, 60).map((e) => {
        const bad = e.type === "read.failed" || /fail|error/i.test(e.type);
        const p = e.payload || {};
        const detail = p.error ? String(p.error) : (p.intent || p.type || JSON.stringify(p).slice(0, 60));
        return {
          type: "list-row",
          icon: bad ? "xmark_circle" : "circle_fill",
          tone: bad ? "error" : undefined,
          title: e.type + (p.intent ? " · " + p.intent : ""),
          subtitle: String(detail),
          trailing: new Date(e.ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
        };
      }),
    }] : [{ type: "empty-state", icon: "tray", title: "Kayıt yok",
           detail: filter ? "Bu türde olay yok" : "Journal boş" }],
  });

  return { id: "journal", title: "Event Journal", sections };
}

/* ══════════════ CONNECTIONS ══════════════
   Servisler + A2A peer'lar tek yerde. "Neden calismiyor?" sorusunun
   cevabinin arandigi ilk ekran bu olmali.                                */
export async function connectionsScreen() {
  const [peers, runtime] = await Promise.all([getJSON("/a2a/peers"), getJSON("/runtime-status")]);
  const svc = (runtime && runtime.services) || [];

  const sections = [{
    type: "section", title: "SERVİSLER",
    children: svc.length ? [{ type: "list", children: svc.map((s) => ({
      type: "list-row",
      icon: s.status === "online" ? "checkmark_circle" : "xmark_circle",
      tone: s.status === "online" ? undefined : "error",
      title: s.label, subtitle: s.detail,
      trailing: s.status === "online" ? "ONLINE" : "DOWN",
    })) }] : [{ type: "error-state", icon: "wifi_exclamationmark", title: "Servis durumu okunamadı",
      detail: "AIOS runtime durumunu şu an doğrulayamadı.", actionLabel: "TEKRAR DENE",
      action: { type: "ui.goto", payload: { screen: "connections" } } }],
  }];

  sections.push({
    type: "section", title: "A2A PEER · " + peers.length,
    children: peers && peers.length ? [{ type: "list", children: peers.map((p) => ({
      type: "list-row", icon: "antenna_radiowaves_left_right",
      title: p.name || "peer", subtitle: p.description || "", trailing: p.url,
    })) }] : [{ type: "empty-state", icon: "antenna_radiowaves_left_right",
                title: "Peer yok", detail: "Peer eklemek için Fabric paneli: /panel" }],
  });

  sections.push({
    type: "section", title: "AĞ",
    children: [{
      type: "info-card", icon: "wifi", title: "Erişim",
      body: "Telefonda mutlaka http://localhost:9300 kullan. Tailscale IP'si (100.75.177.88) "
          + "güvenli bağlam sayılmaz: mikrofon çalışmaz ve PWA kurulamaz. Tailscale yalnızca PC'den bakmak için.",
    }],
  });

  return { id: "connections", title: "Bağlantılar", sections };
}

/* ══════════════ YÖNETİM MERKEZİ ══════════════
   Yeni bir state store ya da yönetim protokolü değil: mevcut gerçek ekranlara,
   approval deposuna, journal'a ve runtime ölçümüne tek giriş yüzeyi. */
export async function managementScreen(artifacts = [], applications = []) {
  const [runtime, approvals] = await Promise.all([getJSON("/runtime-status"), getJSON("/approvals")]);
  const services = (runtime && runtime.services) || [];
  const online = services.filter((service) => service.status === "online").length;
  const active = S.tasks.filter((task) => ["running", "optimistic", "pending"].includes(task.status)).length;
  const granted = Object.values(approvals || {}).filter((record) => record && record.status === "granted").length;

  const sections = [{
    type: "section", title: "YÖNETİM ÖZETİ", layout: "grid-2",
    children: [
      { type: "metric", label: "SERVİS", value: services.length ? `${online}/${services.length}` : "—", tone: services.length && online === services.length ? "ok" : "warn" },
      { type: "metric", label: "AKTİF İŞ", value: active, tone: active ? "info" : "idle" },
      { type: "metric", label: "ONAYLI", value: granted, tone: granted ? "warn" : "idle" },
      { type: "metric", label: "UYGULAMA", value: applications.length, tone: applications.length ? "ok" : "idle" },
    ],
  }];

  sections.push({
    type: "section", title: "CANLI RUNTIME",
    children: services.length ? [{ type: "list", children: services.map((service) => ({
      type: "list-row", icon: service.status === "online" ? "checkmark_circle" : "xmark_circle",
      tone: service.status === "online" ? undefined : "error", title: service.label,
      subtitle: service.detail, trailing: service.status === "online" ? "ONLINE" : "DOWN",
    })) }] : [{ type: "error-state", icon: "wifi_exclamationmark", title: "Runtime ölçümü alınamadı",
      detail: "Servis sağlığı varsayılmaz; yeniden deneyebilirsin.", actionLabel: "YENİLE",
      action: { type: "ui.goto", payload: { screen: "management" } } }],
  });

  sections.push({
    type: "section", title: "YÖNET", children: [{ type: "list", children: [
      { type: "list-row", icon: "list_bullet", title: "Görevler ve hatalar", subtitle: active ? `${active} aktif iş` : "Journal ve yeniden deneme", action: { type: "ui.goto", payload: { tab: "activity" } } },
      { type: "list-row", icon: "lock_fill", title: "İzinler", subtitle: `${granted} geçerli insan onayı`, action: { type: "ui.control" } },
      { type: "list-row", icon: "antenna_radiowaves_left_right", title: "Bağlantılar ve A2A", subtitle: "Servis ayrıntıları ve peer'lar", action: { type: "ui.goto", payload: { screen: "connections" } } },
      { type: "list-row", icon: "gear_alt_fill", title: "Sistem ayarları", subtitle: "Tema, Shizuku, wake-lock", action: { type: "ui.goto", payload: { screen: "settings" } } },
      { type: "list-row", icon: "square_stack_3d_up", title: "Capabilities", subtitle: "Risk sınıfları ve kullanılabilir yetenekler", action: { type: "ui.goto", payload: { screen: "capabilities" } } },
      { type: "list-row", icon: "square_stack_3d_up_fill", title: "Artefakt Galerisi", subtitle: `${artifacts.length} kalıcı artefakt`, action: { type: "ui.goto", payload: { tab: "artifacts" } } },
    ] }],
  });

  return { id: "management", title: "Yönetim Merkezi", subtitle: "AIOS'un gerçek çalışma ve kontrol yüzeyi", sections };
}

/* ══════════════ SETTINGS ══════════════ */
export async function settingsScreen() {
  const caps = (await getJSON("/capabilities")) || [];
  const net = (await getJSON("/appicon-settings")) || {};
  const sections = [];

  sections.push({
    type: "section", title: "GÖRÜNÜM",
    children: [{
      type: "info-card", icon: "paintbrush", title: "Tema",
      subtitle: "Kontrol merkezinden değiştirilir",
      action: { type: "ui.control" }, actionLabel: "AÇ",
    }],
  });

  sections.push({
    type: "section", title: "UYGULAMA ADLARI VE İKONLARI",
    children: [
      { type: "tile", name: "AĞDAN İKON", value: net.network ? "AÇIK" : "KAPALI",
        on: !!net.network, meta: "Play Store'dan ikon ve gerçek uygulama adı",
        action: { type: "appicons.network", payload: { on: !net.network } },
        actionLabel: net.network ? "KAPAT" : "AÇ", toggles: true },
      { type: "info-card", icon: "info_circle", title: "Bu ne yapar?",
        body: "Android, uygulama adını ve ikonunu düz metin/görsel olarak vermiyor; ikisi de APK içinde "
            + "ikili kaynak. Önce APK'dan çıkarılır (tamamen çevrimdışı). Bulunamazsa — modern uygulamaların "
            + "çoğu ikonu saf vektör tutuyor — Play sayfası okunur. İstekler anonim DEĞİLDİR; kabul edilebilir "
            + "olmasının sebebi Play'in kurulu uygulama listesini zaten biliyor olması. Sonuç kalıcı önbelleğe "
            + "yazılır: uygulama başına en fazla bir istek." },
      { type: "button-row", children: [{
        type: "button", label: "EKSİK ADLARI ÇÖZ", variant: "primary",
        action: { type: "app.labels.resolve", payload: { limit: 12 } } }] },
    ],
  });

  // Shizuku, telefon her yeniden başladığında ölüyor ve Termux onu kendi
  // başına geri getiremiyor (sandbox + root yok). Durumu burada gösteriyoruz
  // ki kullanıcı "neden çalışmıyor?" diye aramasın.
  const shz = (await read("shizuku.status")) || {};
  const sz = (shz.ok && shz.data) || { alive: false, hint: "durum okunamadı" };
  sections.push({
    type: "section", title: "SHIZUKU (ayrıcalıklı katman)",
    children: [
      { type: "tile", name: "SHIZUKU", value: sz.alive ? "AÇIK" : "KAPALI",
        on: !!sz.alive, meta: sz.alive ? "medya kumandası, dokunma, dondurma açık"
                                       : "bu yetenekler kapalı, diğerleri çalışıyor",
        action: { type: "shizuku.start" }, actionLabel: "BAŞLAT" },
      { type: "info-card", icon: "info_circle", title: "Durum", body: String(sz.hint || "") },
    ],
  });

  sections.push({
    type: "section", title: "SİSTEM",
    children: [{ type: "list", children: [
      { type: "list-row", icon: "square_stack_3d_up", title: "Capabilities",
        subtitle: caps.length + " capability", action: { type: "ui.goto", payload: { screen: "capabilities" } } },
      { type: "list-row", icon: "list_bullet_rectangle", title: "Event Journal",
        subtitle: "Tüm olaylar ve hatalar", action: { type: "ui.goto", payload: { screen: "journal" } } },
      { type: "list-row", icon: "antenna_radiowaves_left_right", title: "Bağlantılar",
        subtitle: "Servisler ve A2A peer'lar", action: { type: "ui.goto", payload: { screen: "connections" } } },
      { type: "list-row", icon: "gauge", title: "Cihaz Durum Merkezi",
        subtitle: "Gerçek pil, Wi-Fi ve uygulama sayısı", action: { type: "ui.referenceDeviceStatus" } },
    ] }],
  });

  sections.push({
    type: "section", title: "BAKIM",
    children: [{ type: "button-row", children: [
      { type: "button", label: "WAKE-LOCK AL", variant: "ghost", action: { type: "wakelock.acquire" } },
      { type: "button", label: "BIRAK", variant: "ghost", action: { type: "wakelock.release" } },
    ] }],
  });

  return { id: "settings", title: "Ayarlar", sections };
}

/* ══════════════ MINI APPS ══════════════
   Sabitlenen artefaktlar = mini uygulamalar. Ayri bir depo YOK: artefakt
   zaten calisabilir bir arayuz, "mini app" onun kalici hale getirilmisi.   */
export function miniAppsScreen(artifacts = []) {
  const pinned = artifacts.filter((a) => a.pinned);
  const sections = [];

  sections.push({
    type: "section", title: "MİNİ UYGULAMALAR · " + pinned.length,
    children: pinned.length ? [{ type: "list", children: pinned.map((a) => ({
      type: "list-row", icon: "square_grid_2x2_fill", title: a.title || "Artefakt",
      subtitle: a.prompt || "",
      trailing: new Date(a.createdAt).toLocaleDateString("tr-TR"),
      action: { type: "ui.artifact", payload: { id: a.id } },
    })) }] : [{ type: "empty-state", icon: "square_grid_2x2",
                title: "Henüz mini uygulama yok",
                detail: "Bir artefaktı sabitlediğinde burada kalıcı olarak durur." }],
  });

  // URETIM: dokununca Hermes'e sorar ve sonucu OTOMATIK sabitler.
  // Onceden uretim vardi ama "kalici hale getirme" adimi elle yapiliyordu.
  sections.push({
    type: "section", title: "YENİ MİNİ UYGULAMA",
    children: [
      { type: "list", children: [
        { type: "list-row", icon: "square_pencil", title: "Not kartı",
          subtitle: "Hızlı not al, panoya kopyala",
          action: { type: "ui.miniapp", payload: { what: "Bana bir not kartı mini uygulaması yap: yazdığım notu panoya kopyalayan ve bildirim olarak gösteren butonlar olsun" } } },
        { type: "list-row", icon: "bolt_fill", title: "Cihaz paneli",
          subtitle: "Pil, ağ, fener tek ekranda",
          action: { type: "ui.miniapp", payload: { what: "Bana bir cihaz kontrol paneli mini uygulaması yap: pil durumu, wifi bilgisi, fener aç/kapat ve ses seviyesi olsun" } } },
        { type: "list-row", icon: "music_note", title: "Müzik kumandası",
          subtitle: "Çal, duraklat, sonraki",
          action: { type: "ui.miniapp", payload: { what: "Bana bir müzik kumandası mini uygulaması yap: çal/duraklat, sonraki, önceki ve ses ayarı butonları olsun" } } },
        { type: "list-row", icon: "slider_horizontal_3", title: "Kaydırılabilir Ses Paneli",
          subtitle: "Referans · native range + dispatcher",
          action: { type: "ui.referenceSoundPanel" } },
      ] },
      { type: "button-row", children: [{
        type: "button", label: "KENDİM TARİF EDEYİM", variant: "primary",
        action: { type: "ui.miniapp", payload: {} } }] },
    ],
  });

  sections.push({
    type: "section", title: "NASIL ÇALIŞIR",
    children: [{
      type: "info-card", icon: "wand_and_stars", title: "Artefakt = mini uygulama",
      body: "Ayrı bir uygulama deposu yok. Hermes'in ürettiği artefakt zaten çalışabilir bir "
          + "arayüz; buradan istediğinde sonuç otomatik sabitlenir ve kalıcı olur. "
          + "Sohbette ürettiğin bir artefaktı da SABİTLE ile buraya taşıyabilirsin.",
    }],
  });

  return { id: "miniapps", title: "Mini Apps", sections };
}

/* ══════════════ AUTOMATIONS ══════════════
   DURUST DURUM: kural motoru HENUZ YOK. Bu ekran var olmayan bir seyi
   varmis gibi gostermez; ne oldugunu ve neyin eksik oldugunu soyler.      */
export async function automationsScreen() {
  const rules = (await getJSON("/automations")) || [];
  const sections = [];

  sections.push({
    type: "section", title: "ÖZET", layout: "grid-2",
    children: [
      { type: "metric", label: "KURAL", value: rules.length, tone: rules.length ? "ok" : "idle" },
      { type: "metric", label: "AKTİF", value: rules.filter((r) => r.enabled).length, tone: "ok" },
    ],
  });

  sections.push({
    type: "section", title: "KURALLAR",
    children: rules.length ? [{
      type: "list",
      children: rules.map((r) => ({
        type: "list-row",
        icon: r.enabled ? "bolt_fill" : "bolt_slash",
        tone: r.enabled ? undefined : "idle",
        title: r.name,
        subtitle: r.when + " → " + r.then.type + (r.runCount ? " · " + r.runCount + " kez çalıştı" : ""),
        trailing: r.enabled ? "AÇIK" : "KAPALI",
        action: { type: "ui.ruleToggle", payload: { id: r.id, enabled: !r.enabled } },
        longPress: { type: "ui.ruleRemove", payload: { id: r.id } },
      })),
    }] : [{ type: "empty-state", icon: "bolt_horizontal_circle", title: "Kural yok",
            detail: "Aşağıdan hazır bir kural ekleyebilirsin." }],
  });

  // HAZIR KURALLAR: hepsi GERCEK capability'lere baglidir, sahte degil.
  sections.push({
    type: "section", title: "HAZIR KURAL EKLE",
    children: [{ type: "list", children: [
      { type: "list-row", icon: "exclamationmark_triangle_fill", title: "Hata olunca titret",
        subtitle: "read.failed → vibrate",
        action: { type: "ui.ruleAdd", payload: { rule: {
          name: "Hata olunca titret", when: "read.failed",
          then: { type: "vibrate", payload: { ms: 300 } }, cooldownMs: 30000 } } } },
      { type: "list-row", icon: "xmark_circle", title: "Görev başarısız olunca bildir",
        subtitle: "task.failed → notification.send",
        action: { type: "ui.ruleAdd", payload: { rule: {
          name: "Görev başarısız bildirimi", when: "task.failed",
          then: { type: "notification.send", payload: { title: "AI-OS", content: "Bir görev başarısız oldu" } },
          cooldownMs: 60000 } } } },
      { type: "list-row", icon: "battery_25", title: "Pil %20 altına inince uyar",
        subtitle: "sensor.read.confirmed → notification.send",
        action: { type: "ui.ruleAdd", payload: { rule: {
          name: "Düşük pil uyarısı", when: "sensor.read.confirmed",
          condition: { path: "value.percentage", op: "<", value: 20 },
          then: { type: "notification.send", payload: { title: "Pil azaldı", content: "Şarj etmen iyi olur" } },
          cooldownMs: 900000 } } } },
    ] }],
  });

  sections.push({
    type: "section", title: "NASIL ÇALIŞIR",
    children: [{
      type: "info-card", icon: "info_circle", title: "Olay → koşul → eylem",
      body: "Kurallar journal akışını dinler. Bir olay geldiğinde tipi eşleşen ve koşulu tutan "
          + "kurallar tetiklenir ve bir capability çalıştırır. Sonsuz döngüyü iki şey engeller: "
          + "otomasyonun kendi olayları kural tetiklemez ve her kuralın bekleme süresi vardır. "
          + "Kuralın üstüne basılı tutarsan silinir.",
    }],
  });

  return { id: "automations", title: "Otomasyonlar", sections };
}

/* ══════════════ INTENT DEVTOOLS ══════════════
   Bu ekran "kullanici gecmisi" DEGIL, HATA AYIKLAYICIDIR.

   Sistemin tek dogruluk kaynagi journal; ama journal ham olay listesi olarak
   okunmuyordu. Burada olaylar correlationId uzerinden BIRLESTIRILIP tek bir
   zaman cizgisine donusturuluyor:

       NE SOYLENDI  ->  NE ANLADI  ->  KIM YAPTI  ->  NE URETTI

   Bu oturumda 30 artefaktin neden basarisiz oldugunu bulmak icin dosya dosya
   gezmek gerekti. Bu ekran tam olarak o isi ortadan kaldirmak icin var.      */
export async function intentHistoryScreen(query) {
  const [journal, arts] = await Promise.all([
    getJSON("/journal?limit=400"),
    getJSON("/artifacts"),
  ]);
  const events = (journal && journal.events) || [];
  const artifacts = Array.isArray(arts) ? arts : [];
  const q = (query || "").toLowerCase().trim();

  // correlationId -> akis. Journal en yeniden eskiye geliyor; ters cevirip
  // kronolojik isliyoruz ki "ilk olay" gercekten ilk olsun.
  const flows = new Map();
  [...events].reverse().forEach((e) => {
    const key = e.correlationId || e.id;
    if (!flows.has(key)) {
      flows.set(key, { id: key, ts: e.ts, raw: null, source: null, understood: null,
                       by: null, status: null, error: null, steps: [], rejected: null });
    }
    const f = flows.get(key);
    const p = e.payload || {};
    f.steps.push({ type: e.type, ts: e.ts });

    if (e.type === "intent.received")   { f.raw = p.raw; f.source = p.source; }
    if (e.type === "intent.understood" && p.understood) {
      f.understood = p.understood.type; f.by = p.understood.by;
    }
    if (e.type === "intent.rejected")   { f.rejected = p.rejected; f.status = "reddedildi"; }
    if (e.type === "task.created") {
      f.understood = f.understood || p.type;
      if (p.origin) { f.raw = f.raw || p.origin.raw; f.source = f.source || p.origin.source; f.by = f.by || p.origin.by; }
      f.status = f.status || "başladı";
    }
    if (e.type === "task.running")     f.status = "çalışıyor";
    if (e.type === "task.completed")   f.status = "tamam";
    if (e.type === "task.failed")      { f.status = "hata"; f.error = p.error; }
    if (e.type === "task.cancelled")   f.status = "iptal";
    if (e.type === "read.failed")      { f.status = "hata"; f.error = p.error; f.understood = f.understood || p.intent; }
    if (e.type === "automation.fired") { f.source = "automation"; f.raw = f.raw || ("kural: " + (p.name || "")); }
  });

  // Hermes uzerinden gelen artefaktlar journal'a girmiyor (LLM cagrisi /read
  // ile yapiliyor) - onlari da akis olarak ekle ki DevTools eksik kalmasin.
  artifacts.forEach((a) => {
    if (!a || !a.prompt) return;
    flows.set("art:" + a.id, {
      id: "art:" + a.id, ts: a.createdAt || 0, raw: a.prompt, source: "hermes",
      understood: "artefakt: " + (a.title || ""), by: "llm",
      status: "üretildi", error: null, steps: [], artifactId: a.id,
    });
  });

  let list = [...flows.values()]
    .filter((f) => f.raw || f.understood)
    .sort((a, b) => b.ts - a.ts);

  if (q === "hata") list = list.filter((f) => f.status === "hata" || f.status === "reddedildi");
  else if (q) list = list.filter((f) => (String(f.raw) + " " + String(f.understood)).toLowerCase().includes(q));

  const failed = [...flows.values()].filter((f) => f.status === "hata" || f.status === "reddedildi");

  const sections = [{
    type: "section", title: "ÖZET", layout: "grid-2",
    children: [
      { type: "metric", label: "AKIŞ", value: flows.size, tone: "ok" },
      { type: "metric", label: "HATALI", value: failed.length, tone: failed.length ? "error" : "ok" },
    ],
  }];

  sections.push({
    type: "section", title: "FİLTRE",
    children: [{ type: "button-row", children: [
      { type: "button", label: "TÜMÜ", variant: q ? "ghost" : "primary",
        action: { type: "ui.goto", payload: { screen: "history" } } },
      { type: "button", label: "SADECE HATA", variant: q === "hata" ? "primary" : "ghost",
        action: { type: "ui.goto", payload: { screen: "history", filter: "hata" } } },
    ] }],
  });

  const TONE = { hata: "error", reddedildi: "error", iptal: "warn", tamam: "ok", üretildi: "ok" };

  sections.push({
    type: "section", title: q === "hata" ? "HATALI AKIŞLAR" : "AKIŞLAR",
    children: list.length ? list.slice(0, 40).map((f) => {
      // NE SOYLENDI -> NE ANLADI -> KIM -> SONUC, tek satirda okunur halde
      const chain = [];
      if (f.source) chain.push(SOURCE_LABEL[f.source] || f.source);
      if (f.by) chain.push(BY_LABEL[f.by] || f.by);
      if (f.understood) chain.push("→ " + f.understood);
      const detail = f.error ? String(f.error).slice(0, 110)
                   : f.rejected ? String(f.rejected).slice(0, 110)
                   : chain.join(" · ");
      return {
        type: "task-card",
        title: (f.raw || f.understood || "?").slice(0, 70),
        source: detail,
        status: (f.status || "?").toUpperCase(),
        tone: TONE[f.status] || "info",
        elapsed: f.steps.length ? f.steps.length + " adım" : undefined,
        // Akistan DOGRUDAN eyleme: artefakti ac ya da ayni istegi tekrarla.
        actions: f.artifactId
          ? [{ label: "AÇ", variant: "primary", action: { type: "ui.artifact", payload: { id: f.artifactId } } },
             { label: "TEKRARLA", variant: "ghost", action: { type: "ui.ask", payload: { q: f.raw } } }]
          : (f.raw ? [{ label: "TEKRARLA", variant: "ghost", action: { type: "ui.ask", payload: { q: f.raw } } }] : undefined),
      };
    }) : [{ type: "empty-state", icon: "ant", title: "Kayıt yok",
            detail: q === "hata" ? "Hiç hatalı akış yok — iyi haber." : "Journal boş." }],
  });

  return { id: "history", title: "Intent DevTools", sections };
}
