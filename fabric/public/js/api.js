/* AI-OS · Fabric API istemcisi
   Mimari cizgi (server.ts ile ayni): OKUMALAR /read (senkron, journal'siz),
   MUTASYONLAR /intent (journal + iyimser projeksiyon + SSE reconcile).      */

const API = location.origin;

/* ZAMAN ASIMI (2026-08-16).
   Onceden hicbir istekte timeout yoktu. LLM cagrisi takildiginda (proot
   duraklamasi, OOM, upstream stall) fetch ASLA sonuclanmiyordu: "Hermes
   calisiyor" karti sonsuza kadar donuyor, arayuz donmus gibi gorunuyordu.
   Kullanici "devam et" yazinca YENI bir istek basliyor ve o basarili
   oluyordu - "bir sey yazmam seni ayaga kaldiriyor" sikayetinin sebebi
   tam olarak buydu (artefakt #26/#27/#29). Artik istek belli bir sure
   sonra iptal edilir ve ekrana gercek bir hata duser. */
const DEFAULT_TIMEOUT = 25000;

export async function read(intent, payload, timeoutMs) {
  const ms = timeoutMs || DEFAULT_TIMEOUT;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(API + "/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent, payload }),
      signal: ctl.signal,
    });
    return await r.json();
  } catch (e) {
    if (e && e.name === "AbortError") {
      return { ok: false, timeout: true, error: `Yanıt ${Math.round(ms / 1000)} saniyede gelmedi` };
    }
    return { ok: false, error: "Fabric'e ulaşılamıyor" };
  } finally {
    clearTimeout(timer);
  }
}

export async function intent(type, payload, timeoutMs) {
  const ms = timeoutMs || DEFAULT_TIMEOUT;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(API + "/intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, payload }),
      signal: ctl.signal,
    });
    return await r.json();
  } catch (e) {
    if (e && e.name === "AbortError") {
      return { ok: false, timeout: true, error: `Yanıt ${Math.round(ms / 1000)} saniyede gelmedi` };
    }
    return { ok: false, error: "Fabric'e ulaşılamıyor" };
  } finally {
    clearTimeout(timer);
  }
}

/* TEK GIRIS KAPISI (2026-08-16).
   Onceden arayuz eylemleri dogrudan /read cagiriyordu; o yol dispatcher i
   ATLIYOR, yani gorev hic olusmuyor ve is ne AKTİF sekmesinde ne DevTools ta
   gorunuyordu. Artik her eylem zarf olarak gonderilir: kaynak (ui/voice/...)
   ve ham ifade kaydedilir, gorev olusur, sonuc yine ayni cagridan doner. */
export async function sendIntent(type, payload, opts = {}) {
  const ms = opts.timeoutMs || 30000;
  const r = await postJSON("/envelope", {
    source: opts.source || "ui",
    raw: opts.raw || type,
    understood: { type, payload, by: opts.by || "deterministic" },
    wait: true,
    timeoutMs: ms,
  }, ms + 5000);
  if (!r) return { ok: false, error: "Fabric'e ulaşılamıyor" };
  // Zaman asimi bayragini KORU: arayuz "Hermes yanıt vermedi" basligini ve
  // TEKRAR DENE butonunu buna gore gosteriyor. Zarfa gecerken bu bayrak
  // kaybolmustu (2026-08-17 denetimi).
  if (!r.ok && /zaman a[sş]/i.test(String(r.error || ""))) r.timeout = true;
  return r;
}

/** Basit POST yardimcisi (gorev iptal/yeniden dene gibi ucları icin). */
export async function postJSON(path, body, timeoutMs) {
  const ms = timeoutMs || DEFAULT_TIMEOUT;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(API + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
      signal: ctl.signal,
    });
    return await r.json();
  } catch (e) {
    if (e && e.name === "AbortError") return { ok: false, timeout: true, error: "zaman aşımı" };
    return { ok: false, error: "Fabric'e ulaşılamıyor" };
  } finally {
    clearTimeout(timer);
  }
}

export async function getJSON(path) {
  try {
    const r = await fetch(API + path);
    return await r.json();
  } catch (e) {
    return null;
  }
}

/** Canli olay akisi (Activity Center + durum gostergeleri buradan beslenir) */
export function events(onEvent, onState) {
  let es;
  const connect = () => {
    es = new EventSource(API + "/events");
    es.onopen = () => onState && onState(true);
    es.onerror = () => onState && onState(false);
    es.onmessage = (e) => {
      try { onEvent(JSON.parse(e.data)); } catch (_) {}
    };
  };
  connect();
  return () => es && es.close();
}
