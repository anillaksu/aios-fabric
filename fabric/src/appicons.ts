// Gercek uygulama ikonlarini APK'dan cikarir.
//
// Android `pm` ikon vermez; `aapt` de Termux'ta yok. Ama:
//   pm path <pkg>  -> APK yolu
//   unzip -l/-p    -> APK bir ZIP'tir, ikon res/mipmap-*/ic_launcher*.(webp|png)
// Bu yolla gercek ikonlar cikarilip diske onbelleklenir (bir kez ~200ms,
// sonrasi anlik). Harf-avatar sadece cikarma basarisiz olursa kullanilir.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";

const execFileAsync = promisify(execFile);
const BIN = "/data/data/com.termux/files/usr/bin";
const CACHE = (process.env.HOME ?? "/data/data/com.termux/files/home") + "/.cache/aios-icons";

mkdirSync(CACHE, { recursive: true });

/** Yogunluk sirasi: en buyukten kucuge (kalite icin) */
const DENSITY = ["xxxhdpi", "xxhdpi", "xhdpi", "hdpi", "mdpi", "nodpi", "anydpi"];

function scoreEntry(path: string): number {
  const p = path.toLowerCase();
  let s = 0;
  const d = DENSITY.findIndex((x) => p.includes(x));
  s += d === -1 ? 0 : (DENSITY.length - d) * 10;
  // yuvarlak/adaptive yerine duz ikonu tercih et
  if (/ic_launcher\.(png|webp)$/.test(p)) s += 25;
  else if (/ic_launcher[^/]*\.(png|webp)$/.test(p)) s += 12;
  if (p.includes("round")) s -= 8;
  if (p.includes("foreground")) s -= 4;
  if (p.includes("background")) s -= 30;
  if (p.includes("monochrome")) s -= 20;
  if (p.endsWith(".xml")) s -= 1000;   // adaptive-icon XML'i ise yaramaz
  return s;
}

/* Es zamanlilik siniri: uygulama izgarasi 60+ ikonu AYNI ANDA istiyor ve her
   biri 3 surec (pm + unzip -l + unzip -p) doguruyor -> telefon boguluyordu.
   Ayni anda en fazla 3 cikarma calisir, digerleri sirada bekler. */
const MAX_PARALLEL = 3;
let active = 0;
const queue: (() => void)[] = [];
function acquire(): Promise<void> {
  if (active < MAX_PARALLEL) { active++; return Promise.resolve(); }
  return new Promise((resolve) => queue.push(() => { active++; resolve(); }));
}
function release() {
  active--;
  const next = queue.shift();
  if (next) next();
}

/* ─── Ag uzerinden ikon (Play Store) ───
   DURUST NOT (2026-08-16, kullanici bilgilendirilmis onayiyla acildi):
   Bu ISTEKLER ANONIM DEGILDIR. Hepsi ayni IP'den cikar; istekleri tek tek
   ve araliklarla gondermek korelasyonu ENGELLEMEZ, sadece yavaslatir.
   Bu cihazda kabul edilebilir olmasinin sebebi baska: telefonda Google Play
   Services var ve Play, guncellemeleri yonetmek icin kurulu uygulama
   listesini ZATEN biliyor - yani marjinal ifsa ~sifir.
   Yine de: once APK'dan (cevrimdisi) denenir, ag SON caredir, sonuc kalici
   onbelleklenir (uygulama basina EN FAZLA BIR istek) ve anahtar kapatilabilir. */
const NET_FLAG = `${CACHE}/.network-enabled`;
export const isNetworkIconsEnabled = () => existsSync(NET_FLAG);
export function setNetworkIcons(on: boolean) {
  try {
    if (on) writeFileSync(NET_FLAG, "1");
    else if (existsSync(NET_FLAG)) unlinkSync(NET_FLAG);
  } catch { /* yoksay */ }
}

let lastNetFetch = 0;
async function fetchFromPlay(pkg: string): Promise<{ data: Buffer; type: string } | null> {
  // Kibarlik: istekler arasi en az 400ms
  const gap = Date.now() - lastNetFetch;
  if (gap < 400) await new Promise((r) => setTimeout(r, 400 - gap));
  lastNetFetch = Date.now();

  try {
    const page = await fetch(`https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}&hl=tr`, {
      headers: { "user-agent": "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/149.0 Mobile Safari/537.36" },
      signal: AbortSignal.timeout(12000),
    });
    if (!page.ok) return null;
    const html = await page.text();
    const m = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
      || html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i);
    if (!m) return null;

    // googleusercontent boyut ekini sadelestir: 192px yeter
    const url = m[1].replace(/=[-\w]+$/, "") + "=w192";
    const img = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!img.ok) return null;
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.length < 200) return null;
    const type = img.headers.get("content-type") || "image/png";
    return { data: buf, type: type.split(";")[0].trim() };
  } catch {
    return null;
  }
}

export async function getAppIcon(pkg: string): Promise<{ data: Buffer; type: string } | null> {
  if (!/^[a-zA-Z0-9_.]+$/.test(pkg)) return null;

  const metaPath = `${CACHE}/${pkg}.meta`;
  const binPath = `${CACHE}/${pkg}.bin`;
  const missPath = `${CACHE}/${pkg}.miss`;
  if (existsSync(binPath) && existsSync(metaPath)) {
    try {
      return { data: readFileSync(binPath), type: readFileSync(metaPath, "utf8").trim() };
    } catch { /* onbellek bozuk - yeniden cikar */ }
  }
  // Negatif sonuc da onbelleklenir: modern uygulamalarin cogu ikonu SAF VEKTOR
  // (adaptive icon XML) olarak tasiyor, APK'da hic raster yok (Claude boyle).
  // Bunlari her acilista yeniden aramak bosuna is.
  if (existsSync(missPath)) return null;

  await acquire();
  try {
    // 1) ONCE APK'dan (cevrimdisi, kesin, hicbir sey disari sizmaz)
    let found = await fromApk(pkg);

    // 2) Olmazsa ag (yalnizca anahtar acikken). Modern uygulamalarin cogu
    //    ikonu saf vektor tasidigi icin APK yolu ~%20'de kaliyor.
    if (!found && isNetworkIconsEnabled()) found = await fetchFromPlay(pkg);

    if (!found) {
      try { writeFileSync(missPath, "1"); } catch { /* yoksay */ }
      return null;
    }
    try {
      writeFileSync(binPath, found.data);
      writeFileSync(metaPath, found.type);
    } catch { /* onbellek yazilamadi - sorun degil */ }
    return found;
  } finally {
    release();
  }
}

/** APK icinden raster ikon cikarir. Ag yok, tamamen yerel. */
async function fromApk(pkg: string): Promise<{ data: Buffer; type: string } | null> {
  try {
    const { stdout: paths } = await execFileAsync(`${BIN}/pm`, ["path", pkg], { timeout: 12000 });
    const apk = paths.split("\n").map((l) => l.replace(/^package:/, "").trim())
      .filter(Boolean).find((p) => p.endsWith("base.apk")) ?? paths.split("\n")[0]?.replace(/^package:/, "").trim();
    if (!apk) return null;

    const { stdout: listing } = await execFileAsync(`${BIN}/unzip`, ["-l", apk], {
      timeout: 20000, maxBuffer: 32 * 1024 * 1024,
    });
    const all = listing.split("\n").map((l) => l.trim().split(/\s+/).slice(3).join(" "));
    // Genis arama: once acik launcher adlari, sonra mipmap altindaki HERHANGI
    // bir raster (bircok uygulama ikonu obfuske adla mipmap'te tutuyor).
    const named = all.filter((e) => /^res\/.*(ic_launcher|ic_app|app_icon|appicon)[^/]*\.(png|webp)$/i.test(e));
    const mipmaps = all.filter((e) => /^res\/mipmap[^/]*\/[^/]+\.(png|webp)$/i.test(e));
    const entries = named.length ? named : mipmaps;
    if (!entries.length) return null;

    const best = entries.sort((a, b) => scoreEntry(b) - scoreEntry(a))[0];
    // -p: stdout'a bas. Binary oldugu icin encoding: "buffer"
    const { stdout } = await execFileAsync(`${BIN}/unzip`, ["-p", apk, best], {
      timeout: 20000, maxBuffer: 8 * 1024 * 1024, encoding: "buffer" as never,
    });
    const data = stdout as unknown as Buffer;
    if (!data || data.length < 64) return null;
    return { data, type: best.toLowerCase().endsWith(".webp") ? "image/webp" : "image/png" };
  } catch {
    return null;
  }
}
