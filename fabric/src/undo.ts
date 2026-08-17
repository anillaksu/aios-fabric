// GERI ALMA DEFTERI.
//
// "Tamamlanan REFLEX islerinin yanina geri al aksiyonu ekle" derken islenmesi
// gereken zor kisim su: bir eylemin tersi HER ZAMAN kendinden belli degil.
//   · torch.set {on:true}      -> tersi bellidir: {on:false}
//   · volume.set {value:12}    -> tersi ONCEKI SES SEVIYESIDIR, ve o deger
//                                 eylem calistiktan SONRA artik okunamaz.
// Bu yuzden defterde iki alan var:
//   capture : eylem CALISMADAN ONCE onceki durumu okur (gerekiyorsa)
//   invert  : orijinal payload + yakalanan durumdan TERS intent'i uretir
//
// DURUST SINIR: geri alinabilir olanlar yalnizca burada TANIMLI olanlardir.
// `app.open`, `script.run`, `share.text` gibi disari acilan/yan etkisi
// geri alinamaz isler icin buton HIC GOSTERILMEZ - sahte bir "geri al"
// sunmaktansa sunmamak dogru.

import type { CapabilityResult } from "./types.ts";

export interface UndoSpec {
  /** Eylem oncesi durumu okur. Donen deger `invert`e verilir. */
  capture?: (payload: Record<string, unknown> | undefined,
             run: (type: string, payload?: Record<string, unknown>) => Promise<CapabilityResult>)
             => Promise<unknown>;
  /** Ters intent'i uretir. null donerse geri alinamaz. */
  invert: (payload: Record<string, unknown> | undefined, captured: unknown)
          => { type: string; payload?: Record<string, unknown> } | null;
  /** Kullaniciya gosterilecek kisa aciklama */
  label: string;
  /**
   * Yakalanan deger HASSAS mi? (2026-08-17 denetiminde eklendi)
   * true ise deger journal a YAZILMAZ, yalnizca surec belleginde tutulur.
   * Gerekcesi: journal diske yazilan, budanmayan, kalici bir dosya. Pano
   * icerigi rutin olarak parola, 2FA kodu ve token tasir - "geri alabilmek"
   * icin bunlari suresiz saklamak kabul edilebilir bir takas degil.
   * Takas: sunucu yeniden baslarsa o geri alma kaybolur. Dogru takas bu.
   */
  sensitive?: boolean;
}

export const UNDO: Record<string, UndoSpec> = {
  "torch.set": {
    label: "Feneri eski haline getir",
    invert: (p) => ({ type: "torch.set", payload: { on: !(p?.on === true || p?.on === "true") } }),
  },
  "wakelock.acquire": {
    label: "Wake-lock'u bırak",
    invert: () => ({ type: "wakelock.release" }),
  },
  "wakelock.release": {
    label: "Wake-lock'u tekrar al",
    invert: () => ({ type: "wakelock.acquire" }),
  },
  "app.freeze": {
    label: "Uygulamayı çöz",
    invert: (p) => (p?.pkg ? { type: "app.unfreeze", payload: { pkg: p.pkg } } : null),
  },
  "app.unfreeze": {
    label: "Uygulamayı tekrar dondur",
    invert: (p) => (p?.pkg ? { type: "app.freeze", payload: { pkg: p.pkg } } : null),
  },
  "volume.set": {
    label: "Önceki ses seviyesine dön",
    capture: async (p, run) => {
      const r = await run("volume.read");
      if (!r.ok) return null;
      const stream = typeof p?.stream === "string" ? p.stream : "music";
      // termux-volume bir dizi doner: [{stream, volume, max_volume}, ...]
      const rows = Array.isArray(r.data) ? (r.data as Record<string, unknown>[]) : [];
      const row = rows.find((x) => String(x.stream) === stream);
      return row ? { stream, value: Number(row.volume) } : null;
    },
    invert: (_p, c) => {
      const prev = c as { stream?: string; value?: number } | null;
      if (!prev || !Number.isFinite(prev.value)) return null;
      return { type: "volume.set", payload: { stream: prev.stream ?? "music", value: prev.value } };
    },
  },
  "clipboard.set": {
    label: "Panoyu eski içeriğine döndür",
    sensitive: true,
    capture: async (_p, run) => {
      const r = await run("clipboard.get");
      return r.ok ? String(r.data ?? "") : null;
    },
    invert: (_p, c) => (typeof c === "string" ? { type: "clipboard.set", payload: { text: c } } : null),
  },
  "brightness.set": {
    label: "Önceki parlaklığa dön",
    // Parlaklik OKUNAMIYOR (termux-brightness yalnizca yazar, settings get
    // icin de izin yok). Yakalama yapilamadigi icin geri alma da yapilamaz -
    // bunu gizlemek yerine acikca null donuyoruz.
    invert: () => null,
  },
};

export const isUndoable = (type: string): boolean => type in UNDO;
