/* ═══════════════════════════════════════════════════════════════
   AI-OS · PROMPT -> ARTEFAKT ONBELLEGI (W6.L, 2026-08-18)
   ───────────────────────────────────────────────────────────────
   Ayni/kanonik-esdeger istek ikinci kez gelirse LLM'e HIC gidilmez,
   onceki uretim dogrudan kullanilir - sifir token, sifir gecikme.

   TASARIM KARARI (owner, K8 disipliniyle): ilk surum YALNIZCA GUVENLI
   canonicalization yapar - kucuk harf + Unicode normalize + bosluk
   sadelestirme. Dolgu kelimesi silme (“bana”, “lutfen”, “yapar misin”)
   BILINCLI OLARAK YOK - yanlis pozitif riski (farkli niyetli iki istegin
   ayni hash'e dusup YANLIS artefakti dogrudan sunmasi) simdilik kabul
   edilemez. Gercek kullanim verisi tekrar eden pattern'leri kanitlarsa
   normalizasyon KONTROLLU bicimde genisletilebilir (L2).

   CACHE ANAHTARI TEK BASINA PROMPT DEGIL (owner'in uyarisi): ayni istek
   farkli sema/katalog/risk/model surumunde FARKLI sonuc verebilir.
   Anahtar dort bilesenden olusur:
     normalizedPrompt · capabilitySetVersion (ad+risk) · registryVersion
     (bilesen katalogu) · modelProfile
   Bunlardan biri degisirse ONCEKI hash artik ESLESMEZ - eski, olasi
   gecersiz bir uretim asla yanlislikla geri donmez.
   ═══════════════════════════════════════════════════════════════ */

import { REGISTRY } from "./registry.js";

// Bugun tek model yolu var (KARAR-3, MIMARI_TEMEL.md): Hermes gateway'in
// Codex OAuth uzerinden gittigi sabit profil. Degisirse (OmniRoute'a
// gecince, aether://project/omniroute) burasi guncellenir - eski
// onbellek girdileri o an dogal olarak eslesmemeye baslar (istenen sey bu).
const MODEL_PROFILE = "gpt-5.6-luna";

/** Yalnizca GUVENLI canonicalization - anlam degistirebilecek kelime silme YOK. */
export function normalizePrompt(text) {
  return String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Bilesen katalogunun (REGISTRY anahtarlari) surum damgasi - sema/katalog degisince degisir. */
export async function registryVersion() {
  return sha256Hex([...Object.keys(REGISTRY)].sort().join(","));
}

/**
 * Tam onbellek anahtari. capabilities: [{name, risk}] - yalnizca ad degil,
 * RISK SEVIYESI de damgaya girer (owner'in uyarisi: bir capability'nin
 * risk'i safe->ask olursa isim kumesi degismese de eski onbellek artik
 * gecersiz sayilmali).
 */
export async function cacheKey(prompt, capabilitiesWithRisk) {
  const capSig = [...capabilitiesWithRisk]
    .map((c) => `${c.name}:${c.risk || "ask"}`)
    .sort()
    .join(",");
  const regVer = await registryVersion();
  const raw = [normalizePrompt(prompt), capSig, regVer, MODEL_PROFILE].join("|");
  return sha256Hex(raw);
}

const DB_NAME = "aios-prompt-cache";
const DB_VERSION = 1;
const STORE = "entries";
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** key'e karsilik gelen kayitli {spec, title, prompt, contract} - yoksa null. */
export async function getCached(key) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch { return null; }
}

/** Basarili bir uretimi anahtarla kaydeder. */
export async function putCached(key, entry) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ key, ...entry, cachedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* IndexedDB yoksa/reddedildiyse onbelleklemeden devam - kritik degil */ }
}
