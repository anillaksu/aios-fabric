/* ═══════════════════════════════════════════════════════════════
   AI-OS · PARSE CLIENT (W6.K, 2026-08-18)
   ───────────────────────────────────────────────────────────────
   parse-worker.js'i ana threadden yoneten kucuk sarmalayici.
   Worker olusturma bilincli olarak ENJEKTE EDILIR (createWorker
   parametresi) - windowmanager.js'nin storage enjeksiyonuyla AYNI
   desen (docs/CHECKLIST.md W6.B) - boylece bu sinif Node'da GERCEK
   bir Worker olmadan, sahte bir worker-benzeri nesneyle test edilebilir.

   "Izole + terminate() edilebilir" garantisi burada somutlasiyor:
   bir parse cagrisi timeoutMs icinde yanit vermezse worker OLDURULUR
   (terminate()) ve bir sonraki cagride yeniden kurulur - kacak/asili
   bir parse dongusu ana thread'i ya da telefonu KILITLEMEZ.
   ═══════════════════════════════════════════════════════════════ */

export class ParseClient {
  constructor(createWorker, { timeoutMs = 8000 } = {}) {
    this._createWorker = createWorker;
    this._timeoutMs = timeoutMs;
    this._worker = null;
    this._seq = 0;
    this._pending = new Map();
  }

  _ensureWorker() {
    if (this._worker) return this._worker;
    const w = this._createWorker();
    w.onmessage = (ev) => this._onMessage(ev.data);
    w.onerror = (err) => this._onWorkerError(err);
    this._worker = w;
    return w;
  }

  _onMessage(data) {
    const p = this._pending.get(data && data.id);
    if (!p) return;
    this._pending.delete(data.id);
    clearTimeout(p.timer);
    if (data.ok) p.resolve(data);
    else p.reject(new Error(data.error || "parse-worker hata"));
  }

  _onWorkerError(err) {
    // Worker'in kendisi coktu (syntax/runtime hatasi) - bekleyen HER
    // istegi reddet, worker'i oldur; bir sonraki parse() cagrisi
    // temiz bir worker'la yeniden kurar.
    for (const p of this._pending.values()) {
      clearTimeout(p.timer);
      p.reject(err instanceof Error ? err : new Error(String((err && err.message) || err || "worker hatasi")));
    }
    this._pending.clear();
    this.terminate();
  }

  /**
   * raw: LLM'in ham metni. actionableTypes: Set<string> ya da dizi
   * (hangi action tipleri "gercek is" sayilir). knownCapabilities/
   * versionStamp: admitArtifact icin (M-7 sozlesme kapisi).
   */
  parse(raw, { actionableTypes, knownCapabilities, versionStamp }) {
    const worker = this._ensureWorker();
    const id = ++this._seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        this.terminate(); // kacak/asili worker - oldur, telefonu kilitlemesin
        reject(new Error("parse-worker zaman aşımı"));
      }, this._timeoutMs);
      this._pending.set(id, { resolve, reject, timer });
      worker.postMessage({
        id, raw,
        actionableTypes: actionableTypes instanceof Set ? [...actionableTypes] : (actionableTypes || []),
        knownCapabilities, versionStamp,
      });
    });
  }

  terminate() {
    if (this._worker) {
      if (typeof this._worker.terminate === "function") this._worker.terminate();
      this._worker = null;
    }
  }
}
