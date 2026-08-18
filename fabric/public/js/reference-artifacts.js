/* Ilk ScreenSpec 2.0 referans artefakti. LLM uretimi degil; yeni contract'in
   gercek telefon kabulunde kullanilacak deterministik fixture'i. */
export const SOUND_PANEL_REQUIREMENTS = [
  "scroll-region", "range", "range-change-action", "capability:volume.set",
];

export const SCROLLABLE_SOUND_PANEL = {
  id: "reference-sound-panel-v1",
  title: "Kaydırılabilir Ses Paneli",
  subtitle: "Native range · change → dispatcher",
  sections: [{
    type: "section", title: "MEDYA SESİ", children: [{
      type: "scroll-region", title: "Ses paneli", maxHeight: 250, children: [{
        type: "stack", direction: "column", gap: 3, align: "stretch", children: [
          { type: "range", label: "Müzik", min: 0, max: 15, value: 7, step: 1,
            valueKey: "value", action: { type: "volume.set", payload: { stream: "music" } } },
          { type: "info-card", icon: "hand_draw", title: "Parmağınla kaydır",
            body: "Değer anında bu panelde değişir. Parmağını bıraktığında tek bir cihaz eylemi gönderilir." },
          { type: "button-row", children: [
            { type: "button", label: "ÖNCEKİ", variant: "ghost", action: { type: "media.control", payload: { action: "prev" } } },
            { type: "button", label: "DURAKLAT", variant: "ghost", action: { type: "media.control", payload: { action: "pause" } } },
            { type: "button", label: "SONRAKİ", variant: "ghost", action: { type: "media.control", payload: { action: "next" } } },
          ] },
          { type: "text", text: "Bu alan kasıtlı olarak kendi sınırı içinde kayar. Ses değeri artefaktın davranışını değiştirmez; yeniden açıldığında aynı native range ve dispatcher binding yeniden kurulur." },
          { type: "info-card", icon: "lock", title: "Policy korunur",
            body: "Range doğrudan cihaz komutu çalıştırmaz. Değişen değer mevcut volume.set intent'ine eklenir ve dispatcher üzerinden yürür." },
        ],
      }],
    }],
  }],
};
