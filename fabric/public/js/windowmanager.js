/* ═══════════════════════════════════════════════════════════════
   AI-OS · WINDOW MANAGER (W6.B, 2026-08-17)
   ───────────────────────────────────────────────────────────────
   KARAR-1'e gore: cekirdek YUZEYDEN AYRIK yazilir. Bu dosya hangi
   yuzeyde (bugun: telefon izgarasi + odaklanmis tam ekran; yarin:
   baska bir yuzey) cizildigini BILMEZ, hic DOM'a dokunmaz. Yalnizca
   acik/kapali/odakli durumu ve kalicligi yonetir. Yuzey katmani
   (app.js) onChange() ile dinler, kendi cizimini yapar.

   Bu ayrim ekstra is degil, sadece dogru modul siniri: gelecekte
   baska bir yuzey eklenirse (orn. PC istemcisi) bu dosya DEGISMEZ.
   ═══════════════════════════════════════════════════════════════ */

import { logClientError } from "./client-log.js";

const STORE_KEY = "aios.windows.v1";

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : { windows: [] };
  } catch (err) {
    logClientError("windowManager.loadState", err);
    return { windows: [] };
  }
}

function saveState(state) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (err) { logClientError("windowManager.saveState", err); }
}

export class WindowManager {
  constructor(storage = { load: loadState, save: saveState }) {
    this._storage = storage;
    this._windows = new Map();
    this._focusedId = null;
    this._listeners = new Set();
    this._focusSeq = 0;
    for (const w of storage.load().windows || []) {
      this._windows.set(w.id, w);
      if (typeof w.focusOrder === "number" && w.focusOrder > this._focusSeq) this._focusSeq = w.focusOrder;
    }
  }

  /** Yeni bir pencere kaydi olusturur (icerigi bos - W6.C doldurur). Var olan id sessizce yoksayilir. */
  register(win) {
    if (!win || typeof win.id !== "string" || !win.id) throw new TypeError("register: id zorunlu");
    if (this._windows.has(win.id)) return false;
    this._windows.set(win.id, { title: "", pinned: false, lastFocusedAt: 0, focusOrder: 0, ...win });
    this._persist();
    this._emit();
    return true;
  }

  /** Bir pencereyi odakli yapar (izgarada: "tam ekrana ac" karsiligi). */
  focus(id) {
    if (!this._windows.has(id)) return false;
    this._focusedId = id;
    const w = this._windows.get(id);
    w.lastFocusedAt = Date.now();
    // Siralama icin Date.now() DEGIL, ayri bir monoton sayac kullanilir -
    // hizli ardisik focus() cagrilarinda ayni milisaniyeye dusme (cakisma)
    // riski var, sayac cakismaz.
    w.focusOrder = ++this._focusSeq;
    this._persist();
    this._emit();
    return true;
  }

  /** Odagi birakir (izgaraya don). Pencere kaydi SILINMEZ. */
  unfocus() {
    if (this._focusedId === null) return false;
    this._focusedId = null;
    this._emit();
    return true;
  }

  /** Pencereyi tamamen kaldirir (kapat + kaydi sil). */
  remove(id) {
    if (!this._windows.has(id)) return false;
    this._windows.delete(id);
    if (this._focusedId === id) this._focusedId = null;
    this._persist();
    this._emit();
    return true;
  }

  pin(id, pinned = true) {
    const w = this._windows.get(id);
    if (!w) return false;
    w.pinned = !!pinned;
    this._persist();
    this._emit();
    return true;
  }

  /** Yuzey-ozel yerlesim ipucu. Execution degil, yalnizca kullanici tercihi. */
  setLayout(id, layout) {
    const w = this._windows.get(id);
    if (!w || !layout || typeof layout !== "object") return false;
    w.layout = { ...(w.layout || {}), ...layout };
    this._persist();
    this._emit();
    return true;
  }

  get focusedId() { return this._focusedId; }

  /** Izgara sirasi: sabitli once, sonra son odaklanma zamanina gore (en yeni once). */
  list() {
    return [...this._windows.values()].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.focusOrder - a.focusOrder;
    });
  }

  get(id) { return this._windows.get(id) ?? null; }

  onChange(cb) {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _persist() { this._storage.save({ windows: [...this._windows.values()] }); }
  _emit() {
    const snap = { windows: this.list(), focusedId: this._focusedId };
    for (const cb of this._listeners) cb(snap);
  }
}
