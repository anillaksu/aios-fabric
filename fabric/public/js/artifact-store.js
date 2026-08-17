/* ═══════════════════════════════════════════════════════════════
   AI-OS · ARTIFACT STORE (W6.F, 2026-08-17)
   ───────────────────────────────────────────────────────────────
   localStorage -> IndexedDB. Neden: localStorage'da sabitlenmemis
   kayitlarda 30'luk elle konmus bir sinir vardi (app.js eski saveArtifacts) -
   IndexedDB'nin kotasi ~yuzlerce MB, bu sinira gerek birakmiyor.

   TASARIM KARARI: bu dosya "artifacts" dizisinin YERINE gecmiyor - app.js
   hala butun artefaktlari BELLEKTE, senkron bir dizide tutuyor (mevcut
   onlarca cagri sitesi degismesin diye). Bu dosya yalnizca o dizinin
   KALICILIK KATMANINI degistiriyor: getAll()/putAll() - saveArtifacts()
   her cagrildiginda TUM diziyi yazar (mevcut davranisla ayni semantik,
   yalnizca hedef degisti).
   ═══════════════════════════════════════════════════════════════ */

const DB_NAME = "aios-artifacts";
const DB_VERSION = 1;
const STORE = "artifacts";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** Depodaki tum kayitlari doner (bos dizi olabilir - "hic yazilmamis" ile "bos" ayni gorunur, cagiran migrate eder). */
export async function getAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/** Depoyu TAMAMEN verilen listeyle degistirir (saveArtifacts()'in her cagrida TUM diziyi yazma semantigiyle ayni). */
export async function putAll(list) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.clear();
    for (const item of list) store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Kalicilik talep eder (Android depoyu baski altinda TEMIZLEYEBILIR -
 * ayni B-9'un Termux surecleri oldurmesi gibi bir veri kaybi riski).
 * Tarayici destegi/karari garantili degil - basari/basarisizlik loglanir,
 * akisi ENGELLEMEZ.
 */
export async function requestPersistence() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return false;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
