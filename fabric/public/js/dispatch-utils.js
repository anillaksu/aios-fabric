/* ═══════════════════════════════════════════════════════════════
   AI-OS · DISPATCH YARDIMCILARI (B-12, 2026-08-18)
   ───────────────────────────────────────────────────────────────
   app.js:ctx.dispatch() DOM'a/window'a bagli oldugu icin Node'da
   dogrudan test edilemiyor (bkz. B-6 notu). Saf, DOM'suz karar mantigi
   buraya tasindi - windowmanager.js/artifact-parse.js ile ayni desen.
   ═══════════════════════════════════════════════════════════════ */

/**
 * "Anlamli veri" ayrimi. torch.set/vibrate/wakelock gibi salt yan-etki
 * capability'leri bos stdout dondurur (src/capabilities.ts:run() ->
 * data:""), sensor.location.read/app.list/wifi.info gibi veri-donduren
 * capability'ler gercek icerikli JSON dondurur. Bos string/bos obje/bos
 * dizi "gosterilecek bir sey yok" sayilir - fiziksel yan etki (titresim,
 * fener) zaten kullaniciya gorunur, ekstra bir kart eklemek gurultu olurdu.
 */
export function hasMeaningfulData(data) {
  if (data == null || data === "") return false;
  if (Array.isArray(data)) return data.length > 0;
  if (typeof data === "object") return Object.keys(data).length > 0;
  return true;
}
