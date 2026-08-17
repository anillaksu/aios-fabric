// Gercek uygulama ADLARI ("Instagram", "Whatsapp" degil "WhatsApp").
//
// SORUN: adlar simdiye kadar paket adindan turetiliyordu (deriveName):
//   ch.protonvpn.android -> "Protonvpn",  ai.x.grok -> "Grok",
//   com.miui.calculator  -> "Calculator" (Turkce arayuzde "Hesap Makinesi")
// Bu, uygulama izgarasinda kullanicinin gercekte gordugu adla uyusmuyordu.
//
// NEDEN ZOR: Android'in `pm`/`cmd package` komutlari etiketi DUZ METIN olarak
// vermiyor (olcudu: `pm dump` yalnizca "ApplicationInfo{... <pkg>}" yaziyor,
// etiket resources.arsc icinde ikili kaynak olarak duruyor). `aapt` Termux'ta
// yok, dumpsys izin istiyor. Yani root'suz cevrimdisi guvenilir yol YOK.
//
// COZUM (uc katman, ucuzdan pahaliya):
//   1) Yerel onbellek        - anlik
//   2) Gomulu tablo          - en sik kullanilan uygulamalar, cevrimdisi, kesin
//   3) Play Store og:title   - SADECE ag anahtari acikken; ikon icin zaten
//                              ayni sayfa cekiliyor, ek ifsa yok
//   4) deriveName() yedegi   - hicbiri olmazsa eski davranis
//
// Ag icin gecerli gerekce appicons.ts'teki notla ayni: Play, kurulu uygulama
// listesini guncelleme yonetimi icin ZATEN biliyor - marjinal ifsa ~sifir.

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { isNetworkIconsEnabled } from "./appicons.ts";
import { deriveName } from "./capabilities.ts";
import { logErr } from "./log.ts";

const CACHE = (process.env.HOME ?? "/data/data/com.termux/files/home") + "/.cache/aios-labels";
mkdirSync(CACHE, { recursive: true });

/** Cevrimdisi, kesin, sifir maliyet. Bu cihazda gercekten kurulu olanlar oncelikli. */
const BUILTIN: Record<string, string> = {
  "com.spotify.music": "Spotify",
  "com.whatsapp": "WhatsApp",
  "com.whatsapp.w4b": "WhatsApp Business",
  "com.instagram.android": "Instagram",
  "com.google.android.youtube": "YouTube",
  "com.google.android.apps.docs": "Google Drive",
  "com.google.android.gm": "Gmail",
  "com.google.android.apps.maps": "Google Haritalar",
  "com.google.android.apps.photos": "Google Fotoğraflar",
  "com.android.chrome": "Chrome",
  "com.termux": "Termux",
  "com.termux.api": "Termux:API",
  "moe.shizuku.privileged.api": "Shizuku",
  "com.miui.calculator": "Hesap Makinesi",
  "com.miui.gallery": "Galeri",
  "com.miui.notes": "Notlar",
  "com.android.settings": "Ayarlar",
  "com.telegram.messenger": "Telegram",
  "org.telegram.messenger": "Telegram",
  "ch.protonvpn.android": "Proton VPN",
  "com.tailscale.ipn": "Tailscale",
  "ai.x.grok": "Grok",
  "com.openai.chatgpt": "ChatGPT",
  "com.anthropic.claude": "Claude",
  "com.twitter.android": "X",
  "com.facebook.katana": "Facebook",
  "com.netflix.mediaclient": "Netflix",
  "com.zhiliaoapp.musically": "TikTok",
  "com.linkedin.android": "LinkedIn",
  "com.discord": "Discord",
  "com.microsoft.office.outlook": "Outlook",
  "com.dropbox.android": "Dropbox",
  "com.adobe.reader": "Acrobat Reader",
  "com.google.android.apps.translate": "Google Çeviri",
};

const memo = new Map<string, string>();

/** Uzun magaza adlarini izgara karesine sigacak hale getirir.
 *  KELIME SINIRINDA keser - "AnyDesk Uzak Masaustu Yazili" gibi yarim
 *  kelimeyle bitmesin diye (ilk surumde tam bu oluyordu). */
function tidy(name: string): string {
  const n = name.trim();
  if (n.length <= 22) return n;
  const cut = n.slice(0, 22);
  const sp = cut.lastIndexOf(" ");
  return (sp > 8 ? cut.slice(0, sp) : cut).trim();
}

function cachePath(pkg: string): string {
  return `${CACHE}/${pkg}.txt`;
}

// Play'de OLMAYAN paketler (sistem uygulamalari, yan yuklenenler, kaldirilmis
// olanlar) hicbir zaman cozulmeyecek. Bunlari isaretlemezsek "EKSIK ADLARI COZ"
// her basista ayni umutsuz paketleri yeniden sorar - olculdu: ikinci turda
// 15 istegin 10'u bosunaydi. Olumsuz sonuc da onbelleklenir.
function missPath(pkg: string): string {
  return `${CACHE}/${pkg}.miss`;
}

/** ANLIK etiket - ag'a CIKMAZ. Uygulama listesi bunu kullanir (60+ paket, hizli olmali). */
export function labelFor(pkg: string): string {
  const m = memo.get(pkg);
  if (m) return m;
  if (BUILTIN[pkg]) {
    memo.set(pkg, BUILTIN[pkg]);
    return BUILTIN[pkg];
  }
  try {
    const p = cachePath(pkg);
    if (existsSync(p)) {
      const v = tidy(readFileSync(p, "utf8"));
      if (v) {
        memo.set(pkg, v);
        return v;
      }
    }
  } catch (err) { logErr("labelFor:cacheRead:" + pkg, err); /* onbellek okunamadi - turetmeye dus */ }
  return deriveName(pkg);
}

/** Etiketi GERCEKTEN cozulmus mu (turetilmis degil)? */
export function hasRealLabel(pkg: string): boolean {
  if (BUILTIN[pkg] || memo.has(pkg)) return true;
  try { return existsSync(cachePath(pkg)); } catch (err) { logErr("hasRealLabel:" + pkg, err); return false; }
}

/** Cozulebilir ama henuz cozulmemis paketler. "Kalan" sayisi bunu kullanir -
 *  Play'de olmayanlari sayarsak sayac hicbir zaman sifirlanmaz. */
export function pendingLabels(pkgs: string[]): number {
  return pkgs.filter((p) => !hasRealLabel(p) && !existsSync(missPath(p))).length;
}

let lastFetch = 0;

/** Play sayfasindan gercek adi ceker. Yalnizca ag anahtari acikken. */
async function fetchLabel(pkg: string): Promise<string | null> {
  const gap = Date.now() - lastFetch;
  if (gap < 400) await new Promise((r) => setTimeout(r, 400 - gap));
  lastFetch = Date.now();
  try {
    const res = await fetch(`https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}&hl=tr`, {
      headers: { "user-agent": "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/149.0 Mobile Safari/537.36" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
      || html.match(/<meta\s+content="([^"]+)"\s+property="og:title"/i);
    if (!m) return null;
    // og:title genelde "Spotify: Müzik ve Podcast'ler - Google Play'de Uygulamalar"
    // Once magaza ekini at, sonra alt basligi (":" veya " - " sonrasi) at.
    // og:title genelde tanitim metniyle sisirilmis olur:
    //   "WPS Office-PDF,Word,Sheet,PPT - Google Play'de Uygulamalar"
    // Once magaza ekini at, sonra ilk ayirici isarete kadar kirp. Tireyi
    // SADECE bosluklu haliyle ("A - B") ayirici sayariz; yoksa "e-Devlet
    // Kapisi" gibi tirenin adin PARCASI oldugu adlar bozulur.
    let name = m[1]
      .replace(/\s*[-–]\s*(Google Play|Apps on Google Play).*$/i, "")
      .replace(/\s+[-–]\s+.*$/, "")
      .split(/\s*[:|–]\s*/)[0]
      .split(",")[0]
      .trim();
    if (name.length > 28) name = name.slice(0, 28).trim();
    return name || null;
  } catch (err) {
    logErr("fetchLabel:" + pkg, err);
    return null;
  }
}

/**
 * Etiketi eksik paketleri toplu cozer ve onbellege yazar.
 * Kasitli olarak KUCUK partiler halinde: 60 uygulamalik bir izgara icin
 * 60 es zamanli istek telefonu bogar (ikon cikarmada tam bu yasandi).
 */
export async function resolveLabels(pkgs: string[], limit = 12): Promise<{ resolved: number; skipped: number }> {
  if (!isNetworkIconsEnabled()) return { resolved: 0, skipped: pkgs.length };
  let resolved = 0;
  let skipped = 0;
  const missing = pkgs
    .filter((p) => /^[a-zA-Z0-9_.]+$/.test(p) && !hasRealLabel(p) && !existsSync(missPath(p)))
    .slice(0, limit);
  for (const pkg of missing) {
    const name = await fetchLabel(pkg);
    if (!name) {
      // Bir daha sorma - bu paket Play'de yok.
      try { writeFileSync(missPath(pkg), "1"); } catch (err) { logErr("resolveLabels:missWrite:" + pkg, err); }
      skipped++;
      continue;
    }
    memo.set(pkg, tidy(name));
    // Diske TAM adi yaz (bilgi kaybolmasin), gosterimde tidy() uygulanir.
    try { writeFileSync(cachePath(pkg), name); } catch (err) { logErr("resolveLabels:cacheWrite:" + pkg, err); }
    resolved++;
  }
  return { resolved, skipped };
}
