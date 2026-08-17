// Capability registry - "agent-to-capability" duzlemi.
//
// 2026-08-16 MIMARI DUZELTMESI: Onceki surum neredeyse her seyi Shizuku
// (rish) uzerinden yapiyordu. Bu yanlisti:
//   - Shizuku *servisi* ADB/uid=shell gerektirir; oldugunde Termux onu
//     ASLA geri getiremez (watchdog bunu denerken her 30sn ekrani caliyordu)
//   - Oysa Termux'un KENDI `am` komutu ve Termux:API (80+ komut) bunlarin
//     buyuk cogunlugunu Shizuku'suz, ADB'siz, izinsiz yapiyor (test edildi)
//
// Yeni kural: TERMUX-NATIVE varsayilan, Shizuku sadece opsiyonel ayricalik
// katmani (pratikte yalnizca `pm disable-user` = uygulama dondurma).
// Shizuku olu oldugunda sistem calismaya DEVAM eder, sadece o birkac
// capability "unavailable" doner.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { findKit, kitsOf, allKits, fill, buildUri } from "./kits.ts";
import { buildSystemPrompt } from "./prompt.ts";
import { sanitizeAiosBlock } from "./screenspec.ts";
import { labelFor, hasRealLabel, resolveLabels, pendingLabels } from "./applabels.ts";
import { isNetworkIconsEnabled, setNetworkIcons } from "./appicons.ts";
import type { Capability, CapabilityResult } from "./types.ts";
import type { A2AHub } from "./a2a.ts";
import { logErr } from "./log.ts";

const execFileAsync = promisify(execFile);

// ─── A2A HUB ENJEKSIYONU (2026-08-17) ───
// a2a.delegate capability'si a2a.ts'teki A2AHub'i CAGIRMASI gerekiyor, ama
// a2a.ts zaten capabilityMap'i buradan import ediyor (capability: <ad> | <arg>
// bicimini calistirmak icin) - dogrudan import etseydik dongusel bagimlilik
// olurdu. Bunun yerine server.ts, iki nesneyi de kurduktan SONRA burayi
// setA2AHub ile doldurur. `import type` derleme zamaninda silinir, calisma
// zamaninda dongu olusturmaz.
let a2aHub: A2AHub | null = null;
export function setA2AHub(hub: A2AHub) {
  a2aHub = hub;
}

const BIN = "/data/data/com.termux/files/usr/bin";
const RISH = `${BIN}/rish`;
const RISH_ENV = { ...process.env, RISH_APPLICATION_ID: "com.termux" };

/** Termux'un kendi binary'lerini calistirir - Shizuku/ADB gerekmez. */
async function run(bin: string, args: string[] = [], timeoutMs = 10000): Promise<CapabilityResult> {
  try {
    const { stdout } = await execFileAsync(bin.startsWith("/") ? bin : `${BIN}/${bin}`, args, {
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
    });
    const text = stdout.trim();
    try {
      return { ok: true, data: JSON.parse(text) };
    } catch {
      // BILINCLI istisna (sessiz catch denetimi, 2026-08-18): bu bir hata
      // DEGIL, format tespiti - komut ciktilarinin cogu JSON degil duz
      // metindir, "basarisiz JSON.parse" burada NORMAL/beklenen yoldur.
      // Loglamak her REFLEX cagrisinda gurultu uretir, gercek bir sinyal
      // tasimaz.
      return { ok: true, data: text };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Sadece GERCEKTEN ayricalik gerektiren komutlar icin (pm disable-user vb). */
async function runRish(cmd: string, timeoutMs = 15000): Promise<CapabilityResult> {
  try {
    const { stdout, stderr } = await execFileAsync(RISH, ["-c", cmd], {
      env: RISH_ENV,
      timeout: timeoutMs,
    });
    const out = stdout.trim();
    if (/Server is not running/i.test(out) || /Server is not running/i.test(stderr)) {
      return {
        ok: false,
        error:
          "Shizuku servisi calismiyor. Bu capability opsiyonel ayricalik katmanindadir - " +
          "PC'den ADB ile Shizuku baslatilmali. Diger tum capability'ler etkilenmez.",
      };
    }
    return { ok: true, data: { stdout: out, stderr: stderr.trim() } };
  } catch (err) {
    // 2026-08-17 DENETIMI: aciklayici mesaj yalnizca rish BASARIYLA calisip
    // "Server is not running" YAZDIRDIGINDA donuyordu. Gercekte rish sifirdan
    // farkli cikis kodu veriyor, yani hep BU dala dusuluyor ve kullaniciya
    // ham kabuk hatasi gosteriliyordu:
    //   "Command failed: .../rish -c input keyevent 85  Server is not running"
    // Ayni kontrol burada da olmali.
    const msg = err instanceof Error ? err.message : String(err);
    if (/Server is not running/i.test(msg)) {
      return {
        ok: false,
        error:
          "Shizuku servisi calismiyor. Bu capability opsiyonel ayricalik katmanindadir - " +
          "telefon her yeniden baslatildiginda Shizuku'nun elle baslatilmasi gerekir " +
          "(Shizuku uygulamasi -> kablosuz hata ayiklama ile baslat, ya da PC'den ADB). " +
          "Diger tum capability'ler etkilenmez.",
      };
    }
    return { ok: false, error: msg };
  }
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

/**
 * llm.generate icin cihaz baglamini SUNUCUNUN KENDISI, gercek capability
 * cagrilariyla okur (W5 nokta 8, 2026-08-17). `capabilityMap` bu dosyanin
 * sonunda tanimlanir ama burasi bir CLOSURE - yalnizca cagrildiginda okunur,
 * modul tamamen yuklendikten SONRA calisir, TDZ sorunu yok.
 * Herhangi bir okuma basarisiz olursa (izin yok, sensor kapali) o parca
 * sessizce atlanir - kismi baglam, uydurma baglamdan iyidir.
 */
async function readLiveDeviceContext(): Promise<string> {
  const parts: string[] = [];
  try {
    const b = await capabilityMap.get("sensor.battery.read")?.execute({});
    if (b?.ok && b.data && typeof b.data === "object") {
      const d = b.data as { percentage?: number; level?: number; status?: string; temperature?: number };
      const pct = d.percentage ?? d.level;
      if (typeof pct === "number") parts.push(`pil %${pct}${d.status === "CHARGING" ? " (sarjda)" : ""}`);
      if (typeof d.temperature === "number") parts.push(`${d.temperature}C`);
    }
  } catch (err) { logErr("readLiveDeviceContext:battery", err); }
  try {
    const w = await capabilityMap.get("wifi.info")?.execute({});
    if (w?.ok && w.data && typeof w.data === "object") {
      const ssid = (w.data as { ssid?: string }).ssid;
      if (ssid) parts.push(`wifi ${String(ssid).replace(/"/g, "")}`);
    }
  } catch (err) { logErr("readLiveDeviceContext:wifi", err); }
  return parts.join(", ");
}

// ─── Uygulama adi turetme ───
// Paket adlari ters-DNS: ch.protonvpn.android, com.spotify.music, ai.x.grok
// Bastaki TLD'yi at; son parca jenerikse bir oncekini kullan.
const TLDS = new Set(["com", "org", "net", "io", "ai", "me", "co", "ch", "de", "tr", "app", "dev", "xyz"]);
const GENERIC = new Set([
  "android", "app", "apps", "mobile", "client", "main", "music", "player",
  "free", "pro", "lite", "beta", "ui", "core", "release",
  "api", "service", "services", "activity", "launcher", "chat",
]);

export function deriveName(pkg: string): string {
  let parts = pkg.split(".").filter(Boolean);
  if (parts.length > 1 && TLDS.has(parts[0].toLowerCase())) parts = parts.slice(1);
  if (parts.length === 0) return pkg;
  let pick = parts[parts.length - 1];
  if (parts.length > 1 && GENERIC.has(pick.toLowerCase())) pick = parts[parts.length - 2];
  pick = pick.replace(/[_-]+/g, " ").trim();
  return pick.charAt(0).toUpperCase() + pick.slice(1);
}

// ─── Launcher aktivitesi cozumleme (onbellekli) ───
// `pm dump` yavas (~1sn) - cozulen bileseni sakliyoruz.
//
// TUM adaylari toplariz, TEK bir tane degil: bazi uygulamalar (Spotify gibi)
// birden fazla activity-alias tanimliyor (farkli uygulama ikonu varyantlari
// icin) ve bunlarin cogu DEVRE DISI. `pm dump` hepsini listeler ama `am start`
// devre disi olana "Activity class does not exist" der. O yuzden sirayla
// deneyip ilk calisani onbellege aliyoruz.
const launcherCache = new Map<string, string>();

async function resolveLauncherCandidates(pkg: string): Promise<string[]> {
  const r = await run("pm", ["dump", pkg], 15000);
  if (!r.ok) return [];
  const lines = String((r.data as { stdout?: string })?.stdout ?? r.data ?? "").split("\n");

  // pm dump'in "Activity Resolver Table" bolumu:
  //   <hash> <pkg>/<activity> filter <hash>
  //     Action: "android.intent.action.MAIN"
  //     Category: "android.intent.category.LAUNCHER"
  // Adayi tut, LAUNCHER kategorisini gorunce listeye ekle. Bu, DeepLinkActivity
  // gibi yanlis aktivitelerin secilmesini onluyor (Claude'da tam bu olmustu).
  const found: string[] = [];
  let candidate: string | null = null;
  const compRe = new RegExp(`(${pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[A-Za-z0-9_.$]+)`);
  for (const line of lines) {
    if (/^\s*[0-9a-f]{4,}\s/.test(line)) {
      const m = line.match(compRe);
      if (m) candidate = m[1];
    } else if (candidate && /android\.intent\.category\.LAUNCHER/.test(line)) {
      if (!found.includes(candidate)) found.push(candidate);
      candidate = null;
    }
  }
  return found;
}

/** Bileseni baslatir; "does not exist"/"Error:" ciktisini basarisizlik sayar. */
async function tryStart(component: string): Promise<boolean> {
  const r = await run("am", ["start", "-n", component], 9000);
  if (!r.ok) return false;
  const out = String((r.data as { stdout?: string })?.stdout ?? r.data ?? "");
  return !/Error/i.test(out);
}

export const capabilities: Capability[] = [
  // ═══════════ TERMUX-NATIVE (Shizuku GEREKMEZ) ═══════════

  {
    // ─── UYGULAMA BASLATMA (2026-08-16'da duzeltildi) ───
    // Onceki surumler calismiyordu:
    //   - `am start -n <pkg>/.MainActivity` : cogu uygulamada aktivite adi
    //     .MainActivity DEGIL; ustelik `am` basarisiz olsa da exit 0 donuyor,
    //     bu yuzden yedek yol hic tetiklenmiyordu.
    //   - `monkey -p ...` : /system/bin/monkey bir app_process sarmalayici,
    //     Termux PATH'inden calismiyor ("Unable to connect to window manager")
    //   - `am start -a MAIN -c LAUNCHER <pkg>` : intent cozulemiyor
    // CALISAN yol (test edildi): `pm dump <pkg>` ciktisinda MAIN+LAUNCHER
    // filtresine bagli GERCEK bileseni bul, sonra `am start -n <bilesen>`.
    name: "app.open",
    class: "REFLEX",
    risk: "safe",
    maxRetries: 1,
    execute: async (payload) => {
      const pkg = str(payload?.pkg);
      if (!pkg) return { ok: false, error: "pkg gerekli" };

      const cached = launcherCache.get(pkg);
      if (cached && (await tryStart(cached))) return { ok: true, data: { component: cached, cached: true } };

      const candidates = await resolveLauncherCandidates(pkg);
      if (candidates.length === 0) {
        return { ok: false, error: `${pkg} icin launcher aktivitesi bulunamadi` };
      }
      for (const c of candidates) {
        if (await tryStart(c)) {
          launcherCache.set(pkg, c);
          return { ok: true, data: { component: c, tried: candidates.length } };
        }
      }
      return { ok: false, error: `${pkg}: ${candidates.length} aday denendi, hicbiri acilmadi` };
    },
  },
  {
    name: "app.list",
    class: "REFLEX",
    risk: "safe",
    maxRetries: 1,
    execute: async () => {
      // `pm list packages -3` duz Termux'tan calisiyor (test edildi)
      const r = await run("pm", ["list", "packages", "-3"], 15000);
      if (!r.ok) return r;
      const apps = String(r.data)
        .split("\n")
        .map((l) => l.replace(/^package:/, "").trim())
        .filter(Boolean)
        // org.chromium.webapk.* = "ana ekrana ekle" ile kurulan PWA sarmalayicilari.
        // Gercek uygulama degiller, adlari da hash (a25fbbab84cc82641_v2) - listeyi kirletiyorlar.
        .filter((pkg) => !pkg.startsWith("org.chromium.webapk."))
        // Ad artik ONCE gercek etiketten gelir (gomulu tablo / onbellek),
        // yalnizca hicbiri yoksa paket adindan turetilir. labelFor() ag'a
        // CIKMAZ - liste hizli kalmali. Eksikler /applabels ile doldurulur.
        .map((pkg) => ({ pkg, name: labelFor(pkg), real: hasRealLabel(pkg) }))
        .sort((a, b) => a.name.localeCompare(b.name, "tr"));
      return { ok: true, data: { apps, count: apps.length, named: apps.filter((a) => a.real).length } };
    },
  },
  {
    // Ag uzerinden ikon/ad cekmeyi ac-kapa. Ayarlar ekranindaki anahtar
    // buna baglidir; onceden yalnizca /appicon-settings HTTP ucu vardi ve
    // arayuzden dokunarak degistirilemiyordu.
    name: "appicons.network",
    class: "REFLEX",
    risk: "safe",
    maxRetries: 1,
    execute: async (payload) => {
      const on = payload?.on === true || payload?.on === "true";
      setNetworkIcons(on);
      return { ok: true, data: { network: isNetworkIconsEnabled() } };
    },
  },
  {
    // Eksik uygulama adlarini Play'den cozer (ag anahtari acikken).
    // Kucuk partiler halinde calisir; her cagri en fazla `limit` kadar
    // uygulama coozer, sonuc kalici onbellege yazilir.
    name: "app.labels.resolve",
    class: "REFLEX",
    risk: "safe",
    maxRetries: 0,
    execute: async (payload) => {
      const r = await run("pm", ["list", "packages", "-3"], 15000);
      if (!r.ok) return r;
      const pkgs = String(r.data)
        .split("\n")
        .map((l) => l.replace(/^package:/, "").trim())
        .filter(Boolean)
        .filter((pkg) => !pkg.startsWith("org.chromium.webapk."));
      const limit = Number(payload?.limit ?? 12);
      const res = await resolveLabels(pkgs, Number.isFinite(limit) ? limit : 12);
      const remaining = pendingLabels(pkgs);
      return { ok: true, data: { ...res, remaining, total: pkgs.length } };
    },
  },
  {
    // TAM intent destegi (2026-08-16'da genisletildi).
    // Onceki surum SADECE `component` kabul ediyordu; Hermes "Spotify'da su
    // sarkiyi cal" icin dogru sekilde bir deep link intent'i (action=VIEW +
    // data=spotify:search:...) uretiyor ama capability "component gerekli"
    // diye reddediyordu. Model dogru dusunuyordu, capability dardi.
    name: "activity.start",
    class: "REFLEX",
    risk: "ask",
    maxRetries: 1,
    execute: async (payload) => {
      const args = ["start"];
      const action = str(payload?.action);
      const data = str(payload?.data);
      const component = str(payload?.component);
      const pkg = str(payload?.pkg) || str(payload?.package);
      const mime = str(payload?.mime);

      if (action) args.push("-a", action);
      if (data) args.push("-d", data);
      if (mime) args.push("-t", mime);
      if (component) args.push("-n", component);
      else if (pkg && !action) args.push("-n", pkg);   // sadece paket verildiyse
      if (pkg && action) args.push("-p", pkg);          // intent'i pakete daralt

      // Duz string ekstralar: {extras:{query:"..."}}
      const extras = payload?.extras;
      if (extras && typeof extras === "object" && !Array.isArray(extras)) {
        for (const [k, v] of Object.entries(extras as Record<string, unknown>)) {
          if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
            args.push("-e", k, String(v));
          }
        }
      }
      if (args.length === 1) {
        return { ok: false, error: "action, data veya component'ten en az biri gerekli" };
      }

      const r = await run("am", args, 10000);
      if (!r.ok) return r;
      const out = String((r.data as { stdout?: string })?.stdout ?? r.data ?? "");
      if (/Error/i.test(out)) return { ok: false, error: out.slice(0, 200) };
      return { ok: true, data: { started: args.join(" ") } };
    },
  },
  {
    // Deep link / URI acma - "Spotify'da su sarkiyi cal", "su haritayi ac",
    // "su numarayi ara" gibi istekler icin en dogal yol.
    name: "deeplink.open",
    class: "REFLEX",
    risk: "notify",
    maxRetries: 1,
    execute: async (payload) => {
      let uri = str(payload?.uri) || str(payload?.url) || str(payload?.data);
      if (!uri) return { ok: false, error: "uri gerekli (orn: spotify:search:..., https://..., tel:...)" };
      // spotify:search: bir URL degil, ozel bir sema - arama terimi DUZ metin
      // olmali. Yuzde-kodlanmis gelirse ("Mabel%20Matiz") Spotify onu birebir
      // arar ve hicbir sey bulamaz (artefakt #1/#2 bu yuzden calmadi).
      if (/^spotify:search:/i.test(uri) && /%[0-9A-Fa-f]{2}/.test(uri)) {
        try { uri = "spotify:search:" + decodeURIComponent(uri.slice("spotify:search:".length)); } catch (err) { logErr("link.open:spotifyDecode", err); /* bozuksa oldugu gibi birak */ }
      }
      const pkg = str(payload?.pkg);
      const args = ["start", "-a", "android.intent.action.VIEW", "-d", uri];
      if (pkg) args.push("-p", pkg);
      const r = await run("am", args, 10000);
      if (!r.ok) return r;
      const out = String((r.data as { stdout?: string })?.stdout ?? r.data ?? "");
      if (/Error/i.test(out)) return { ok: false, error: out.slice(0, 200) };
      return { ok: true, data: { uri } };
    },
  },
  {
    // ─── PAYLASIM (2026-08-16'da eklendi) ───
    // Artefakt #10 "konusmayi WhatsApp'tan gonder" ve #5 "A4 -> PDF -> WhatsApp"
    // yarim kalmisti: model metni panoya yazip (clipboard.set) WhatsApp'i
    // aciyordu, ama kullanici hala elle kisi secip yapistirmak zorundaydi -
    // yani istegin "direkt kisi secip gonderme ekranina yonlendir" kismi hic
    // olmuyordu. Eksik olan sey ACTION_SEND intent'iydi. Bu capability
    // Android'in gercek paylasim akisini acar: kisi secici dogrudan gelir,
    // metin zaten dolu olur.
    name: "share.text",
    class: "REFLEX",
    risk: "ask",
    maxRetries: 1,
    sensitiveFields: ["text"],
    execute: async (payload) => {
      const text = str(payload?.text);
      if (!text) return { ok: false, error: "text gerekli" };
      const pkg = str(payload?.pkg);
      const mime = str(payload?.mime, "text/plain");
      const args = ["start", "-a", "android.intent.action.SEND", "-t", mime, "-e", "android.intent.extra.TEXT", text];
      const subject = str(payload?.subject);
      if (subject) args.push("-e", "android.intent.extra.SUBJECT", subject);
      // pkg verilirse dogrudan o uygulamanin kisi seciciye gider (WhatsApp gibi);
      // verilmezse Android'in paylasim sayfasi acilir.
      if (pkg) args.push("-p", pkg);
      const r = await run("am", args, 10000);
      if (!r.ok) return r;
      const out = String((r.data as { stdout?: string })?.stdout ?? r.data ?? "");
      if (/Error/i.test(out)) return { ok: false, error: out.slice(0, 200) };
      return { ok: true, data: { shared: text.length + " karakter", pkg: pkg || "secici" } };
    },
  },
  {
    // ─── BELGE URETIMI (2026-08-16) ───
    // Artefakt #5 "A4 -> PDF -> WhatsApp" bu capability olmadigi icin
    // yarim kalmisti: paylasma tarafi vardi, URETME tarafi yoktu.
    //
    // FORMAT BURAYA GOMULU DEGIL: kits.ts'teki defterden gelir. Yeni bir
    // format (odt, ics, ne gerekiyorsa) eklemek icin BU DOSYA DEGISMEZ.
    name: "doc.create",
    class: "REFLEX",
    risk: "notify",
    maxRetries: 1,
    sensitiveFields: ["content", "text"],
    execute: async (payload) => {
      const content = str(payload?.content) || str(payload?.text);
      if (!content) return { ok: false, error: "content gerekli" };
      const format = str(payload?.format, "pdf").toLowerCase();
      const kit = findKit("doc", format);
      if (!kit) {
        return { ok: false, error: `bilinmeyen format: ${format} (mevcut: ${kitsOf("doc").map((k) => k.id).join(", ")})` };
      }
      const title = str(payload?.title, "Belge");
      // Dosya adi kullanicidan/modelden gelebilir - yol kacisini engelle.
      const safe = (str(payload?.filename) || title)
        .replace(/[^\p{L}\p{N} ._-]/gu, "").replace(/\s+/g, "_").slice(0, 60) || "belge";
      const dir = `${process.env.HOME}/belgeler`;
      const path = `${dir}/${safe}.${kit.ext ?? "txt"}`;
      try {
        mkdirSync(dir, { recursive: true });
        const out = kit.renderer
          ? kit.renderer(content, title)
          : fill(kit.template ?? "{content}", { content, title });
        const buf = Buffer.isBuffer(out) ? out : Buffer.from(out, "utf8");
        writeFileSync(path, buf);
        return { ok: true, data: { path, format, mime: kit.mime, bytes: buf.length, title } };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  },
  {
    // Defterdeki bir LINK kit'ini calistirir: "spotify.search" + {q} -> URI -> ac.
    // Yeni bir hedef (baska bir uygulama, baska bir arama motoru) eklemek
    // icin kod degil, kit gerekir.
    name: "link.open",
    class: "REFLEX",
    risk: "notify",
    maxRetries: 1,
    // W1.7 (denetim B6): "q" arama terimi/telefon numarasi tasiyabilir ve
    // eskiden redaksiyonsuzdu. Sonuctaki "uri" de ayni degeri gomulu tasir -
    // sensitiveResult onu da redakte eder.
    sensitiveFields: ["q"],
    sensitiveResult: true,
    execute: async (payload) => {
      const id = str(payload?.kit);
      if (!id) return { ok: false, error: `kit gerekli (mevcut: ${kitsOf("link").map((k) => k.id).join(", ")})` };
      const kit = findKit("link", id);
      if (!kit || !kit.uri) return { ok: false, error: `bilinmeyen link kiti: ${id}` };
      const vars = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
      const uri = buildUri(kit, vars);
      if (/\{\w+\}/.test(uri)) return { ok: false, error: `eksik parametre: ${kit.params?.join(", ") ?? "?"}` };
      const args = ["start", "-a", "android.intent.action.VIEW", "-d", uri];
      const pkg = str(payload?.pkg) || kit.pkg || "";
      if (pkg) args.push("-p", pkg);
      const r = await run("am", args, 10000);
      if (!r.ok) return r;
      const out = String((r.data as { stdout?: string })?.stdout ?? r.data ?? "");
      if (/Error/i.test(out)) return { ok: false, error: out.slice(0, 200) };
      return { ok: true, data: { kit: id, uri } };
    },
  },
  {
    // Defterdeki bir INTENT kit'ini calistirir (alarm kur, sayac baslat...).
    name: "intent.run",
    class: "REFLEX",
    risk: "notify",
    maxRetries: 1,
    sensitiveFields: ["q"],
    sensitiveResult: true,
    execute: async (payload) => {
      const id = str(payload?.kit);
      if (!id) return { ok: false, error: `kit gerekli (mevcut: ${kitsOf("intent").map((k) => k.id).join(", ")})` };
      const kit = findKit("intent", id);
      if (!kit) return { ok: false, error: `bilinmeyen intent kiti: ${id}` };
      const vars = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
      const args = ["start"];
      if (kit.action) args.push("-a", kit.action);
      if (kit.data) args.push("-d", fill(kit.data, vars));
      if (kit.mime) args.push("-t", kit.mime);
      for (const [k, v] of Object.entries(kit.extras ?? {})) {
        const filled = fill(v, vars);
        // Sayisal ekstralar (orn sayac suresi) --ei ister
        if (/^\d+$/.test(filled)) args.push("--ei", k, filled);
        else args.push("-e", k, filled);
      }
      if (kit.pkg) args.push("-p", kit.pkg);
      const r = await run("am", args, 10000);
      if (!r.ok) return r;
      const out = String((r.data as { stdout?: string })?.stdout ?? r.data ?? "");
      if (/Error/i.test(out)) return { ok: false, error: out.slice(0, 200) };
      return { ok: true, data: { kit: id } };
    },
  },
  {
    // Kesif: hangi kit'ler var? Model ve arayuz bunu okuyup kendini gunceller.
    name: "kit.list",
    class: "REFLEX",
    risk: "safe",
    maxRetries: 1,
    execute: async (payload) => {
      const kind = str(payload?.kind);
      const list = (kind ? kitsOf(kind as never) : allKits())
        .map(({ renderer, ...k }) => k);   // kod alanini disari verme
      return { ok: true, data: { kits: list, count: list.length } };
    },
  },
  {
    // Bir DOSYAYI paylasir (share.text metin paylasir, bu dosya paylasir).
    // termux-open --send Android'in paylasim akisini acar; WhatsApp, Drive,
    // e-posta gibi hedefler burada cikar.
    name: "file.share",
    class: "REFLEX",
    risk: "ask",
    maxRetries: 1,
    execute: async (payload) => {
      const path = str(payload?.path);
      if (!path) return { ok: false, error: "path gerekli" };
      if (!existsSync(path)) return { ok: false, error: `dosya yok: ${path}` };
      const args = ["--send"];
      // MIME de format defterinden turetilir - burada uzanti listesi TUTULMAZ.
      const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
      const known = kitsOf("doc").find((f) => f.ext === ext);
      const mime = str(payload?.mime) || known?.mime || "";
      if (mime) args.push("--content-type", mime);
      args.push(path);
      const r = await run("termux-open", args, 12000);
      if (!r.ok) return r;
      return { ok: true, data: { shared: path, mime: mime || "otomatik" } };
    },
  },
  {
    // Belirli bir numaraya WhatsApp mesaji - kisi secmeye bile gerek yok.
    // wa.me deep link'i WhatsApp tarafindan resmen desteklenir.
    name: "whatsapp.send",
    class: "REFLEX",
    risk: "ask",
    maxRetries: 1,
    sensitiveFields: ["text", "phone"],
    execute: async (payload) => {
      const text = str(payload?.text);
      const phone = str(payload?.phone).replace(/[^\d]/g, "");
      if (!text) return { ok: false, error: "text gerekli" };
      // Numara yoksa kisi seciciye dus - yine de metin dolu gelir.
      if (!phone) {
        const args = ["start", "-a", "android.intent.action.SEND", "-t", "text/plain",
                      "-e", "android.intent.extra.TEXT", text, "-p", "com.whatsapp"];
        const r = await run("am", args, 10000);
        if (!r.ok) return r;
        return { ok: true, data: { mode: "kisi secici" } };
      }
      const uri = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
      const r = await run("am", ["start", "-a", "android.intent.action.VIEW", "-d", uri, "-p", "com.whatsapp"], 10000);
      if (!r.ok) return r;
      const out = String((r.data as { stdout?: string })?.stdout ?? r.data ?? "");
      if (/Error/i.test(out)) return { ok: false, error: out.slice(0, 200) };
      return { ok: true, data: { phone, chars: text.length } };
    },
  },
  {
    // ─── A2A DELEGASYONU (2026-08-17, self-fetch kaldirildi) ───
    // A2A altyapisi vardi ama YALNIZCA HTTP ucu olarak (/a2a/delegate).
    // Yani Hermes bir artefakt icinden baska cihaza is veremiyordu - eylem
    // sozlugunde karsiligi yoktu. Capability olunca "PC'de sunu calistir"
    // artik normal bir buton eylemi.
    //
    // ONCEKI SURUM kendi sunucusuna HTTP ile geri fetch atiyordu
    // (127.0.0.1:PORT/a2a/delegate + tasks pollama) - gereksiz bir ag
    // sicramasiydi VE peer auth eklendiginde (W1) kendi kendini 401'e
    // dusurecekti (bu istek de disaridan gelen bir istek gibi gorunurdu).
    // Artik A2AHub'a SURC ICI cagiriliyor - delegateToPeer zaten sonucu
    // BEKLEYIP donuyor, ayrica pollamaya gerek yok.
    name: "a2a.delegate",
    class: "AGENT",
    risk: "ask",
    maxRetries: 0,
    execute: async (payload) => {
      const peer = str(payload?.peer, "pc");
      const text = str(payload?.text);
      if (!text) return { ok: false, error: "text gerekli (orn: \"skill: system.info\")" };
      if (!a2aHub) return { ok: false, error: "A2A hub henuz hazir degil" };
      try {
        const task = await a2aHub.delegateToPeer(peer, text);
        const last = task.history[task.history.length - 1];
        const reply = last?.parts?.[0]?.text ?? "";
        return task.state === "failed"
          ? { ok: false, error: task.error ?? reply.slice(0, 200) }
          : { ok: true, data: { peer, reply } };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  },
  {
    // ─── SHIZUKU DURUMU / BASLATMA (2026-08-17) ───
    // Shizuku, telefon yeniden baslayinca olur ve Termux onu KENDI BASINA geri
    // getiremez: sandbox'ta `setprop service.adb.tcp.port` de,
    // `settings put global adb_wifi_enabled` de reddediliyor (cihaz rootlu degil).
    // Ama ADB TCP dinleyicisi bir kez acikken geri kalan TAMAMEN otomatik.
    // Bu capability durumu gorunur kilar ve baslatmayi arayuze tasir - boylece
    // kullanicinin Termux'a girip betik calistirmasi gerekmez.
    name: "shizuku.status",
    class: "REFLEX",
    risk: "safe",
    maxRetries: 0,
    execute: async () => {
      const alive = await runRish("id", 8000);
      const tcp = await run("getprop", ["service.adb.tcp.port"], 5000);
      const tls = await run("getprop", ["service.adb.tls.port"], 5000);
      const port = String(tcp.data ?? "").trim() || String(tls.data ?? "").trim();
      return {
        ok: true,
        data: {
          alive: alive.ok,
          adbPort: port || null,
          // Ne yapilmasi gerektigini ACIKCA soyle - kullanici tahmin etmesin.
          hint: alive.ok
            ? "Shizuku calisiyor, ayricalikli capability'ler acik."
            : port
              ? `ADB ${port} portunda dinliyor - "Shizuku'yu baslat" ile aciabilirsin.`
              : "ADB TCP dinlemiyor. Geliştirici Seçenekleri > Kablosuz hata ayıklama'yı aç; gerisi otomatik.",
        },
      };
    },
  },
  {
    name: "shizuku.start",
    class: "REFLEX",
    risk: "notify",
    maxRetries: 0,
    execute: async () => {
      const already = await runRish("id", 8000);
      if (already.ok) return { ok: true, data: { alive: true, note: "zaten calisiyordu" } };

      const tcp = await run("getprop", ["service.adb.tcp.port"], 5000);
      const tls = await run("getprop", ["service.adb.tls.port"], 5000);
      const port = String(tcp.data ?? "").trim() || String(tls.data ?? "").trim();
      if (!port) {
        return {
          ok: false,
          error: "ADB TCP dinlemiyor. Geliştirici Seçenekleri > Kablosuz hata ayıklama'yı " +
                 "açman gerekiyor - bu adim sandbox icinden yapilamiyor (cihaz rootlu degil). " +
                 "Actiktan sonra bu dugme calisir.",
        };
      }
      // Boot betigiyle AYNI mantik; tek fark bunu kullanici istedigi an tetikliyor.
      const r = await run("bash", [`${process.env.HOME}/.termux/boot/02-shizuku.sh`], 60000);
      const now = await runRish("id", 8000);
      return now.ok
        ? { ok: true, data: { alive: true, port } }
        : { ok: false, error: `Baslatma denendi (port ${port}) ama servis gelmedi: ${String(r.error ?? "").slice(0, 120)}` };
    },
  },
  {
    name: "sensor.battery.read",
    class: "REFLEX",
    risk: "safe",
    maxRetries: 1,
    execute: async () => run("termux-battery-status", [], 8000),
  },
  {
    name: "sensor.location.read",
    class: "REFLEX",
    risk: "notify",
    maxRetries: 0,
    execute: async () => run("termux-location", ["-p", "network", "-r", "last"], 12000),
  },
  {
    name: "wifi.info",
    class: "REFLEX",
    risk: "safe",
    maxRetries: 1,
    execute: async () => run("termux-wifi-connectioninfo", [], 8000),
  },
  {
    name: "volume.read",
    class: "REFLEX",
    risk: "safe",
    maxRetries: 1,
    execute: async () => run("termux-volume", [], 8000),
  },
  {
    name: "volume.set",
    class: "REFLEX",
    risk: "safe",
    maxRetries: 1,
    execute: async (payload) => {
      const stream = str(payload?.stream, "music");
      const value = Number(payload?.value ?? NaN);
      if (!Number.isFinite(value)) return { ok: false, error: "value gerekli" };
      return run("termux-volume", [stream, String(Math.round(value))], 8000);
    },
  },
  {
    name: "torch.set",
    class: "REFLEX",
    risk: "safe",
    maxRetries: 1,
    execute: async (payload) => {
      const on = payload?.on === true || payload?.on === "true";
      return run("termux-torch", [on ? "on" : "off"], 8000);
    },
  },
  {
    name: "vibrate",
    class: "REFLEX",
    risk: "safe",
    maxRetries: 1,
    execute: async (payload) => {
      const ms = Number(payload?.ms ?? 200);
      return run("termux-vibrate", ["-d", String(Math.round(ms))], 8000);
    },
  },
  {
    name: "notification.send",
    class: "REFLEX",
    risk: "notify",
    maxRetries: 1,
    sensitiveFields: ["content"],
    execute: async (payload) =>
      run("termux-notification", ["-t", str(payload?.title, "AI-OS"), "-c", str(payload?.content)], 8000),
  },
  {
    name: "tts.speak",
    class: "REFLEX",
    risk: "notify",
    maxRetries: 1,
    sensitiveFields: ["text"],
    execute: async (payload) => {
      const text = str(payload?.text);
      if (!text) return { ok: false, error: "text gerekli" };
      return run("termux-tts-speak", [text], 20000);
    },
  },
  {
    // Sesli komut girisi - AI-OS'un "dokunmadan kullanim" yolu
    name: "speech.listen",
    class: "REFLEX",
    risk: "ask",
    maxRetries: 0,
    sensitiveResult: true,   // ses dokumu
    execute: async () => run("termux-speech-to-text", [], 30000),
  },
  {
    name: "clipboard.get",
    class: "REFLEX",
    risk: "ask",
    maxRetries: 1,
    sensitiveResult: true,   // pano parola/2FA tasiyabilir
    execute: async () => run("termux-clipboard-get", [], 8000),
  },
  {
    name: "clipboard.set",
    class: "REFLEX",
    risk: "ask",
    maxRetries: 1,
    sensitiveFields: ["text"],   // panoya yazilan sey parola olabilir
    execute: async (payload) => run("termux-clipboard-set", [str(payload?.text)], 8000),
  },
  {
    // Android'in surecleri oldurmesini engellemeye yardim eder - tekrarlayan
    // OOM/cokme dongusunun (bu oturumda defalarca yasandi) hafifletmesi
    name: "wakelock.acquire",
    class: "REFLEX",
    risk: "safe",
    maxRetries: 1,
    execute: async () => run("termux-wake-lock", [], 8000),
  },
  {
    name: "wakelock.release",
    class: "REFLEX",
    risk: "safe",
    maxRetries: 1,
    execute: async () => run("termux-wake-unlock", [], 8000),
  },

  // ═══════════ MEDYA ═══════════
  {
    // "Su sarkiyi cal" - Android'in resmi ara-ve-cal intent'i.
    // TEK BASINA YETMIYOR: Spotify bu intent'i sadece ARAMA olarak yorumluyor,
    // calmiyor (2026-08-16'da olculdu). Gercekten calmasi icin arama sonucuna
    // dokunmak gerekiyor -> autoTap ile Shizuku uzerinden ilk sonuca basilir.
    name: "media.play_search",
    class: "REFLEX",
    risk: "notify",
    maxRetries: 0,
    execute: async (payload) => {
      const query = str(payload?.query);
      if (!query) return { ok: false, error: "query gerekli" };
      const pkg = str(payload?.pkg, "com.spotify.music");
      const args = ["start", "-a", "android.media.action.MEDIA_PLAY_FROM_SEARCH", "-e", "query", query];
      if (pkg) args.push("-p", pkg);
      const r = await run("am", args, 10000);
      if (!r.ok) return r;

      if (payload?.autoTap === false) return { ok: true, data: { searched: query, played: false } };

      // Arama sonuclarinin cizilmesini bekle.
      await new Promise((res) => setTimeout(res, Number(payload?.waitMs ?? 3500)));

      // ─── KOORDINAT KIRILGANLIGI DUZELTMESI (2026-08-16) ───
      // Onceki surum DOGRUDAN sabit bir noktaya dokunuyordu (360,471 =
      // 1080x2400 ekranda ilk sonuc satiri). Bu yalnizca Spotify'da, yalnizca
      // bu cozunurlukte ve yalnizca arayuz degismedigi surece calisir -
      // uc kirilgan varsayim.
      //
      // Once KOORDINATSIZ yolu dene: MEDIA_PLAY tus olayi. Arama ekrani acikken
      // cogu oynatici bunu "ilk sonucu cal" diye yorumlar ve bu tus HER
      // uygulamada, HER cozunurlukte aynidir. Ise yaramazsa dokunmaya duseriz.
      const key = await runRish("input keyevent 126", 10000);   // KEYCODE_MEDIA_PLAY
      if (key.ok) {
        return { ok: true, data: { searched: query, played: true, via: "media tusu (koordinatsiz)" } };
      }

      // Yedek: sabit koordinata dokun. Cozunurluk payload'dan gecilebilir.
      const x = Number(payload?.x ?? 360);
      const y = Number(payload?.y ?? 471);
      const tap = await runRish(`input tap ${x} ${y}`, 10000);
      if (!tap.ok) {
        return { ok: true, data: { searched: query, played: false, note: "arama acildi; calmak icin Shizuku gerekli: " + tap.error } };
      }
      return { ok: true, data: { searched: query, played: true, via: "dokunma (yedek)" } };
    },
  },
  {
    // Medya tuslari. Termux'tan `input` DOGRUDAN calismaz (SecurityException);
    // `am broadcast MEDIA_BUTTON` de Spotify tarafindan yok sayiliyor.
    // Calisan tek yol Shizuku uzerinden gercek tus olayi.
    name: "media.control",
    class: "REFLEX",
    risk: "safe",
    maxRetries: 1,
    execute: async (payload) => {
      const KEYS: Record<string, number> = {
        play: 126, pause: 127, toggle: 85, next: 87, prev: 88, previous: 88, stop: 86,
      };
      const action = str(payload?.action, "toggle").toLowerCase();
      const code = KEYS[action];
      if (!code) return { ok: false, error: `bilinmeyen eylem: ${action} (play|pause|toggle|next|prev|stop)` };
      const r = await runRish(`input keyevent ${code}`, 10000);
      return r.ok ? { ok: true, data: { action } } : r;
    },
  },
  {
    // Genel amacli dokunma - Shizuku gerekir. Otomasyon icin guclu bir arac:
    // herhangi bir uygulamada bir butona basmayi mumkun kilar.
    name: "ui.tap",
    class: "REFLEX",
    risk: "ask",
    maxRetries: 0,
    execute: async (payload) => {
      const x = Number(payload?.x), y = Number(payload?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, error: "x ve y gerekli" };
      const r = await runRish(`input tap ${Math.round(x)} ${Math.round(y)}`, 10000);
      return r.ok ? { ok: true, data: { x, y } } : r;
    },
  },

  // ═══════════ OPSIYONEL AYRICALIK KATMANI (Shizuku gerekir) ═══════════
  // Shizuku olu ise bunlar aciklayici bir hata doner, sistem calismaya devam eder.

  {
    name: "app.freeze",
    class: "REFLEX",
    risk: "ask",
    maxRetries: 1,
    execute: async (payload) => {
      const pkg = str(payload?.pkg);
      if (!pkg) return { ok: false, error: "pkg gerekli" };
      return runRish(`pm disable-user --user 0 ${pkg}`);
    },
  },
  {
    name: "app.unfreeze",
    class: "REFLEX",
    risk: "notify",
    maxRetries: 1,
    execute: async (payload) => {
      const pkg = str(payload?.pkg);
      if (!pkg) return { ok: false, error: "pkg gerekli" };
      return runRish(`pm enable ${pkg}`);
    },
  },
  {
    // termux-brightness WRITE_SETTINGS istiyor ve bu izin "role-managed" -
    // ADB'den verilemiyor, kullanicinin Ayarlar'dan elle acmasi gerek.
    // Once native dene, olmazsa Shizuku'ya dus.
    name: "brightness.set",
    class: "REFLEX",
    risk: "safe",
    maxRetries: 1,
    execute: async (payload) => {
      const value = Number(payload?.value ?? NaN);
      if (!Number.isFinite(value) || value < 0 || value > 255) {
        return { ok: false, error: "value 0-255 araliginda olmali" };
      }
      const v = Math.round(value);
      const native = await run("termux-brightness", [String(v)], 8000);
      const failed =
        !native.ok || (typeof native.data === "object" && native.data !== null && "error" in (native.data as object));
      if (!failed) return native;
      return runRish(`settings put system screen_brightness ${v}`);
    },
  },

  {
    // AI'nin urettigi artefaktlarin "calistirilabilir" olmasini saglar:
    // artefakt icindeki bir butona basinca burada bir kabuk komutu kosar.
    // Kullanicinin KENDI cihazi ve acik istegi (2026-08-16); yine de
    // yikici kaliplar reddedilir ve her cagri journal'a duser.
    name: "script.run",
    class: "REFLEX",
    risk: "ask",
    maxRetries: 0,
    sensitiveResult: true,   // kabuk ciktisi (env, dosya icerigi, token...)
    execute: async (payload) => {
      const cmd = str(payload?.cmd);
      if (!cmd) return { ok: false, error: "cmd gerekli" };
      const DANGEROUS = [
        /\brm\s+-rf\s+\/(?!data\/data\/com\.termux\/files\/home\/\.cache)/,
        /\bmkfs\b/, /\bdd\s+if=.*of=\/dev\//, /\b(reboot|shutdown)\b/,
        /\bpm\s+uninstall\b/, /\brm\s+-rf\s+~\s*$/,
      ];
      if (DANGEROUS.some((re) => re.test(cmd))) {
        return { ok: false, error: "Bu komut guvenlik kalibina takildi ve calistirilmadi: " + cmd.slice(0, 80) };
      }

      // ─── KENDINI OLDURME KORUMASI (2026-08-16) ───
      // Artefakt #17/#18/#19: model 9300'u "temizlemek" icin once o portu
      // dinleyen sureci oldurup sonra `npm start` diyordu. Ama 9300 bu
      // arayuzun TA KENDISI - komut basarili olsa bile kullanicinin ekrani
      // olurdu ve geriye sadece "Script run failed" kaliyordu. Bu tur
      // komutlari calistirmak yerine NEDEN yapilmadigini anlatiyoruz.
      const SUICIDE = [
        /\b(kill|pkill|killall)\b[^|;&]*\b(node|server\.ts|fabric)\b/,
        /\bfuser\b[^|;&]*-k[^|;&]*9300/,
        /\bkill\b[^|;&]*\$\(\s*(lsof|ss|fuser)[^)]*9300/,
      ];
      if (SUICIDE.some((re) => re.test(cmd))) {
        return {
          ok: false,
          error:
            "Reddedildi: bu komut 9300 portundaki Fabric sunucusunu (yani su an bakmakta " +
            "oldugun arayuzu) oldururdu. Sunucuyu yeniden baslatmak gerekiyorsa Termux'tan " +
            "elle yap; artefakt icinden yapilamaz.",
        };
      }

      // ─── CALISMA DIZINI (2026-08-16) ───
      // Onceden komutlar HOME'da kosuyordu. `npm start` / `npm run build`
      // gibi komutlar bu yuzden "package.json yok" ya da yanlis proje
      // hatasi veriyordu (artefakt #19/#20/#21). Varsayilan artik proje kokü.
      const cwd = str(payload?.cwd) || `${process.env.HOME}/fabric`;

      // ─── SOZDIZIMI ON KONTROLU (2026-08-16) ───
      // Artefakt #12/#13'te model `http://127.0.0. $p` gibi bozuk bir komut
      // uretti ve bu sessizce calisip anlamsiz sonuc verdi. `bash -n`
      // calistirmadan ayristirir; bozuksa sebebi modele geri donuyor.
      try {
        await execFileAsync(`${BIN}/bash`, ["-n", "-c", cmd], { timeout: 5000 });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: "Kabuk sozdizimi hatali, komut calistirilmadi: " + msg.slice(0, 200) };
      }

      // `bash -n` sadece SOZDIZIMINI dogrular. `"http://127.0.0. $p"` gecerli
      // kabuk sozdizimidir ama anlamsiz bir URL'dir - artefakt #13'te tam olarak
      // bu kacti ve komut "basarili" olup bos sonuc verdi. Bozuk adresi ayrica
      // yakala; sessiz basarisizlik yerine modele acik hata don.
      const BROKEN_URL = /https?:\/\/[0-9.]*[0-9]\.\s|https?:\/\/[^\s"']*\s+\$/;
      if (BROKEN_URL.test(cmd)) {
        return {
          ok: false,
          error:
            "Komuttaki URL bozuk gorunuyor (adres ile port arasinda bosluk var, orn. " +
            "'http://127.0.0. $p'). Dogrusu: \"http://127.0.0.1:$p\". Komut calistirilmadi.",
        };
      }

      try {
        const { stdout, stderr } = await execFileAsync(`${BIN}/bash`, ["-lc", cmd], {
          cwd,
          timeout: Number(payload?.timeout ?? 20000),
          maxBuffer: 2 * 1024 * 1024,
        });
        return { ok: true, data: { cwd, stdout: stdout.trim().slice(0, 4000), stderr: stderr.trim().slice(0, 1000) } };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message.slice(0, 300) : String(err) };
      }
    },
  },

  // ═══════════ THOUGHT: LLM (llm_bridge.py uzerinden) ═══════════

  {
    name: "llm.generate",
    class: "THOUGHT",
    risk: "safe",
    maxRetries: 1,
    // prompt/history journal a yazilmaz: zarfin `raw` alani zaten kullanicinin
    // ne dedigini tasiyor (DevTools icin gereken o), history ise tum sohbeti
    // her mesajda tekrar diske yazardi. "context" artik hic OKUNMUYOR (W5
    // nokta 8 - asagidaki execute'a bak) ama istemci hala gonderebilir;
    // redaksiyonda birakildi, zararsiz.
    sensitiveFields: ["prompt", "history", "context"],
    sensitiveResult: true,   // model yaniti kullanicinin ozel metnini tasiyabilir
    execute: async (payload) => {
      const prompt = str(payload?.prompt);
      if (!prompt) return { ok: false, error: "prompt gerekli" };
      // Sistem promptu HER ZAMAN gonderilir - yoksa model kendini "ChatGPT"
      // sanip oyle cevapliyor ve artefakt uretemiyordu (2026-08-16 hatasi).
      //
      // ─── W5 nokta 8 (2026-08-17, sonradan bulundu) ───
      // ONCEDEN cagiranin gonderdigi payload.context DOGRUDAN sistem
      // promptuna gomuluyordu. Bu capability risk:"safe" oldugu icin MCP'den
      // de cagrilabiliyor (W4) - yani DISARIDAN bir istemci
      // {"context":"pil %999, sarj tam"} gibi UYDURMA bir cihaz durumunu
      // modelin "gercek" sandigi baglama enjekte edebilirdi. "Modelin
      // urettigi cihaz iddialari yerine RUNTIME'DAN gercek state okunmasi"
      // ilkesi burada CAGIRANIN iddiasi icin de gecerli - baglam yalnizca
      // SUNUCUNUN kendi capability cagrisiyla okudugu GERCEK degerden gelir,
      // hicbir cagiranin soylediginden degil.
      const system = str(payload?.system) || buildSystemPrompt(
        capabilities.map((c) => c.name),
        await readLiveDeviceContext(),
      );
      const history = Array.isArray(payload?.history) ? (payload.history as { role: string; content: string }[]) : [];
      const messages = [
        { role: "system", content: system },
        ...history.slice(-8).filter((m) => m && typeof m.content === "string")
          .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })),
        { role: "user", content: prompt },
      ];
      try {
        // 2026-08-17 W0.3: bu fetch'te timeout YOKTU - llm_bridge takilirsa
        // sunucu tarafi SONSUZA dek asili kalirdi (B4). UI bu cagriyi 90sn
        // ile sariyor (app.js LLM_TIMEOUT); burasi ondan KISA olmali ki
        // gercek hata donsun, UI'nin sessiz vazgecmesi degil.
        const res = await fetch("http://127.0.0.1:9201/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages, max_tokens: Number(payload?.max_tokens ?? 800) }),
          signal: AbortSignal.timeout(80000),
        });
        const data = (await res.json()) as {
          text?: string; error?: string; finish_reason?: string;
          truncated?: boolean; attempts?: number;
        };
        // Hata GOVDESI de okunur: onceden sadece "llm_bridge 500" donuyordu,
        // gercek sebep (rate limit? token? timeout?) hicbir yerde gorunmuyordu.
        if (!res.ok) return { ok: false, error: data?.error ? `llm_bridge ${res.status}: ${data.error}` : `llm_bridge ${res.status}` };
        if (data.error) return { ok: false, error: data.error };
        // W5.1/W5.2: model ciktisi SUNUCUDA da dogrulanir/temizlenir - istemci
        // dogrulamasi (renderer.js) tek basina guven siniri sayilmiyor artik.
        // Bozuk/izinsiz bir yapi (bilinmeyen bilesen, izinsiz action) hicbir
        // istemciye HAM ulasmaz; gecersizse blok tamamen silinir.
        return {
          ok: true,
          data: {
            text: sanitizeAiosBlock(data.text ?? ""),
            finishReason: data.finish_reason ?? "stop",
            truncated: data.truncated === true,
          },
        };
      } catch (err) {
        if (err instanceof Error && err.name === "TimeoutError") {
          return { ok: false, error: "llm_bridge 80sn icinde yanit vermedi" };
        }
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  },
];

export const capabilityMap: Map<string, Capability> = new Map(capabilities.map((c) => [c.name, c]));
