// KIT DEFTERI - sistemin "yeni ihtiyac" mekanizmasi.
//
// ═══ NEDEN VAR (2026-08-16, kullanici itirazi uzerine) ═══
// Once `doc.pdf` diye bir capability yazildi. Kullanici hakli olarak itiraz
// etti: "bugun pdf, yarin md, obur gun baska sey olacak - bu senin her
// seferinde kod yazman degil, sistemin KENDI ozelligi olmali."
//
// Itirazin dogru okunusu su: sorun PDF degil, IRTIFA. Bu sistemde yeni bir
// ihtiyac cikinca simdiye kadar HER SEFERINDE ayni uc yer elle degisiyordu:
//     1) yeni capability yazilir     (capabilities.ts)
//     2) prompt'a elle satir eklenir (prompt.ts)
//     3) arayuze elle giris eklenir  (screens.js)
// Uc yerden biri unutulunca ozellik "var ama model bilmiyor" ya da "model
// biliyor ama buton yok" haline geliyordu - bu oturumda tam olarak bu oldu.
//
// KIT bunu tersine cevirir: bir ihtiyac artik VERIDIR, kod degil.
// Bir kit eklemek = bu defterе (ya da ~/fabric-kits.json'a) bir NESNE koymak.
// Capability, prompt ve dogrulama onu kendiliginden ogrenir; hicbir dosya
// degismez. Kullanici calisirken bile ekleyebilir (POST /kits).
//
// ═══ NEDEN SABLON, NEDEN KOD DEGIL ═══
// Kit'ler `{ad}` yer tutuculu SABLONLARDIR - JS ifadesi ya da kabuk komutu
// DEGIL. Cunku kit deposu diske yazilan ve arayuzden eklenebilen bir veri
// dosyasi; oraya calistirilabilir ifade koymak, bu sistemdeki en kolay ayak
// kaydirma noktasini acmak olurdu. Sablonun yetmedigi yerde (PDF gibi ikili
// bir cikti) kod-destekli render kullanilir ve o kod BURADA, gozden gecirilmis
// halde durur.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { textToPdf } from "./pdf.ts";

const STORE = (process.env.HOME ?? "/data/data/com.termux/files/home") + "/fabric-kits.json";

/** Kit turleri. Yeni bir TUR eklemek kod ister; yeni bir KIT eklemek istemez. */
export type KitKind =
  | "doc"     // dosya uretimi  -> doc.create
  | "link"    // URI/deeplink   -> link.open
  | "intent"; // Android intent -> intent.run

export interface Kit {
  kind: KitKind;
  /** Benzersiz ad, orn "pdf", "spotify.search", "maps.navigate" */
  id: string;
  /** Insan icin aciklama - prompt'a ve arayuze bu gider */
  label: string;
  /** Sablonlarda kullanilabilecek parametreler, orn ["q"] */
  params?: string[];

  // ── kind: "doc" ──
  ext?: string;
  mime?: string;
  /** `{title}` ve `{content}` yer tutuculu sablon. Yoksa `renderer` kullanilir. */
  template?: string;
  /** Kod-destekli render (ikili ciktilar icin). Sadece gomulu kit'lerde. */
  renderer?: (content: string, title: string) => Buffer | string;

  // ── kind: "link" ──
  /** `{q}` gibi yer tutuculu URI sablonu, orn "spotify:search:{q}" */
  uri?: string;
  pkg?: string;

  // ── kind: "intent" ──
  action?: string;
  data?: string;
  extras?: Record<string, string>;

  /** Gomulu mu, kullanici mi ekledi? */
  builtin?: boolean;
}

/* ─────────── GOMULU KITLER ─────────── */
const BUILTIN: Kit[] = [
  // ── belge formatlari ──
  { kind: "doc", id: "pdf", label: "A4 PDF belge", ext: "pdf", mime: "application/pdf",
    renderer: (c, t) => textToPdf(c, t), builtin: true },
  { kind: "doc", id: "md", label: "Markdown", ext: "md", mime: "text/markdown",
    template: "# {title}\n\n{content}\n", builtin: true },
  { kind: "doc", id: "txt", label: "Düz metin", ext: "txt", mime: "text/plain",
    template: "{content}", builtin: true },
  { kind: "doc", id: "csv", label: "CSV tablo", ext: "csv", mime: "text/csv",
    // BOM: Excel'in Turkce karakterleri dogru acmasi icin
    template: "﻿{content}", builtin: true },
  { kind: "doc", id: "json", label: "JSON", ext: "json", mime: "application/json",
    template: "{content}", builtin: true },
  { kind: "doc", id: "html", label: "HTML sayfa", ext: "html", mime: "text/html",
    template:
      '<!doctype html>\n<html lang="tr"><head><meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
      "<title>{title}</title>\n" +
      "<style>body{font:16px/1.6 system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem}" +
      "pre{white-space:pre-wrap}</style></head>\n" +
      "<body><h1>{title}</h1>\n<pre>{content}</pre></body></html>\n",
    builtin: true },

  // ── deeplink'ler ──
  { kind: "link", id: "spotify.search", label: "Spotify'da ara", uri: "spotify:search:{q}",
    pkg: "com.spotify.music", params: ["q"], builtin: true },
  { kind: "link", id: "youtube.search", label: "YouTube'da ara",
    uri: "https://www.youtube.com/results?search_query={q}", params: ["q"], builtin: true },
  { kind: "link", id: "maps.search", label: "Haritada yer ara", uri: "geo:0,0?q={q}",
    params: ["q"], builtin: true },
  { kind: "link", id: "web.search", label: "Webde ara",
    uri: "https://duckduckgo.com/?q={q}", params: ["q"], builtin: true },
  { kind: "link", id: "phone.call", label: "Numarayı ara", uri: "tel:{q}", params: ["q"], builtin: true },
  { kind: "link", id: "whatsapp.chat", label: "WhatsApp sohbeti aç",
    uri: "https://wa.me/{q}", pkg: "com.whatsapp", params: ["q"], builtin: true },

  // ── intent'ler ──
  { kind: "intent", id: "alarm.set", label: "Alarm kur",
    action: "android.intent.action.SET_ALARM", extras: { "android.intent.extra.alarm.MESSAGE": "{q}" },
    params: ["q"], builtin: true },
  { kind: "intent", id: "timer.set", label: "Sayaç başlat",
    action: "android.intent.action.SET_TIMER", extras: { "android.intent.extra.alarm.LENGTH": "{q}" },
    params: ["q"], builtin: true },
];

/** Kullanicinin ekledigi kit'ler (diskte, calisirken degistirilebilir). */
function loadUserKits(): Kit[] {
  try {
    if (!existsSync(STORE)) return [];
    const raw = JSON.parse(readFileSync(STORE, "utf8"));
    return Array.isArray(raw) ? raw.filter(isValidKit) : [];
  } catch {
    return [];
  }
}

function isValidKit(k: unknown): k is Kit {
  if (!k || typeof k !== "object") return false;
  const o = k as Record<string, unknown>;
  if (!["doc", "link", "intent"].includes(String(o.kind))) return false;
  if (typeof o.id !== "string" || !/^[a-z0-9._-]+$/i.test(o.id)) return false;
  if (typeof o.label !== "string") return false;
  // Kullanici kit'i KOD tasiyamaz - sadece sablon.
  if ("renderer" in o) return false;
  if (o.kind === "doc" && typeof o.template !== "string") return false;
  if (o.kind === "link" && typeof o.uri !== "string") return false;
  if (o.kind === "intent" && typeof o.action !== "string" && typeof o.data !== "string") return false;
  return true;
}

let userKits: Kit[] = loadUserKits();

export function allKits(): Kit[] {
  // Kullanici kit'i ayni id ile gomulunun yerini alabilir (ozellestirme).
  const map = new Map<string, Kit>();
  for (const k of BUILTIN) map.set(`${k.kind}:${k.id}`, k);
  for (const k of userKits) map.set(`${k.kind}:${k.id}`, { ...k, builtin: false });
  return [...map.values()];
}

export function kitsOf(kind: KitKind): Kit[] {
  return allKits().filter((k) => k.kind === kind);
}

export function findKit(kind: KitKind, id: string): Kit | undefined {
  return allKits().find((k) => k.kind === kind && k.id === id);
}

export function addKit(input: unknown): { ok: boolean; kit?: Kit; error?: string } {
  if (!isValidKit(input)) {
    return { ok: false, error: "gecersiz kit (kind/id/label ve ture uygun sablon gerekli; kod kabul edilmez)" };
  }
  userKits = [...userKits.filter((k) => !(k.kind === input.kind && k.id === input.id)), input];
  try { writeFileSync(STORE, JSON.stringify(userKits, null, 2)); } catch { /* yoksay */ }
  return { ok: true, kit: input };
}

export function removeKit(kind: string, id: string): { ok: boolean; error?: string } {
  const before = userKits.length;
  userKits = userKits.filter((k) => !(k.kind === kind && k.id === id));
  if (userKits.length === before) return { ok: false, error: "kullanici kiti bulunamadi (gomulu kitler silinemez)" };
  try { writeFileSync(STORE, JSON.stringify(userKits, null, 2)); } catch { /* yoksay */ }
  return { ok: true };
}

/**
 * `{ad}` yer tutucularini doldurur. SADECE degistirme yapar - hicbir sey
 * degerlendirilmez/calistirilmaz. Bilinmeyen yer tutucu bos string olur.
 *
 * `encode` verilirse deger URL-kodlanir.
 */
export function fill(template: string, vars: Record<string, unknown>, encode = false): string {
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    const v = vars[name];
    if (v === undefined || v === null) return "";
    const s = String(v);
    return encode ? encodeURIComponent(s) : s;
  });
}

/**
 * Bir link kit'inin URI'sini uretir.
 *
 * ─── 2026-08-17 DENETIMINDE BULUNDU ───
 * Kodlama kurali SEMAYA GORE DEGISIYOR ve ikisi birbirinin TERSI:
 *   · http(s)  -> deger URL-KODLANMALI. Kodlanmazsa "Mabel Matiz & X"
 *                 sorgusundaki bosluk URL'yi bozar, "&" ise fazladan
 *                 parametre enjekte eder.
 *   · spotify: -> deger HAM kalmali. Kodlanirsa Spotify "%20"yi birebir
 *                 arar ve hicbir sey bulamaz.
 * Bu ikinci hatanin ta kendisi bu projede zaten yasanmisti (artefakt #1/#2);
 * ilk sunumde ayni hatayi ters yonde tekrarlamisim - tek bir `fill()` her
 * semaya ayni muameleyi yapiyordu.
 */
export function buildUri(kit: Kit, vars: Record<string, unknown>): string {
  const tpl = kit.uri ?? "";
  const isWeb = /^https?:/i.test(tpl);
  return fill(tpl, vars, isWeb);
}

/** Prompt'a gomulen ozet - kit eklendiginde KENDILIGINDEN guncellenir. */
export function kitSummary(): string {
  const line = (kind: KitKind) =>
    kitsOf(kind).map((k) => `${k.id} (${k.label})`).join(", ");
  return [
    `  doc    : ${line("doc")}`,
    `  link   : ${line("link")}`,
    `  intent : ${line("intent")}`,
  ].join("\n");
}
