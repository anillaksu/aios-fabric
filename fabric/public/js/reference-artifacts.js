/* Ilk ScreenSpec 2.0 referans artefakti. LLM uretimi degil; yeni contract'in
   gercek telefon kabulunde kullanilacak deterministik fixture'i. */
export const SOUND_PANEL_REQUIREMENTS = [
  "scroll-region", "range", "range-change-action", "capability:volume.set", "capability:media.control",
];

const DEFAULT_MUSIC_VOLUME = { value: 7, max: 15 };

/**
 * termux-volume'un gercek JSON cevabindan yalniz music stream'ini alir.
 * Bu bir medya metadata tahmini degildir: bilinmeyen/bozuk cevap null olur
 * ve renderer empty state gosterir.
 */
export function musicVolumeFromResponse(data) {
  if (!Array.isArray(data)) return null;
  const music = data.find((item) => item && String(item.stream || "").toLowerCase() === "music");
  const value = Number(music?.volume);
  const max = Number(music?.max_volume);
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value < 0 || value > max) return null;
  return { value: Math.round(value), max: Math.round(max) };
}

/** Referans artefact'in goruntusu; kalici artifact spec'ini degistirmez. */
export function soundPanelWithMusicVolume(volume) {
  const live = volume || DEFAULT_MUSIC_VOLUME;
  const hasLiveVolume = !!volume;
  const volumeNode = hasLiveVolume
    ? { type: "range", label: `Medya sesi · ${live.value} / ${live.max}`, min: 0, max: live.max, value: live.value, step: 1,
      valueKey: "value", action: { type: "volume.set", payload: { stream: "music" } } }
    : { type: "empty-state", icon: "speaker_slash", title: "Ses durumu okunamadı",
      detail: "Cihaz geçerli bir medya ses değeri döndürmedi. Kontroller dispatcher üzerinden kullanılabilir." };

  return {
  id: "reference-sound-panel-v1",
  title: "Kaydırılabilir Ses Paneli",
  subtitle: "Native range · change → dispatcher",
  sections: [{
    type: "section", title: "MEDYA SESİ", children: [{
      type: "scroll-region", title: "Ses paneli", maxHeight: 250, children: [{
      type: "stack", direction: "column", gap: 3, align: "stretch", children: [
          volumeNode,
          { type: "info-card", icon: hasLiveVolume ? "speaker_2" : "speaker_slash",
            title: hasLiveVolume ? "Cihazdan okunan ses" : "Cihaz durumu yok",
            body: hasLiveVolume
              ? `Müzik akışı ${live.value} / ${live.max}. Parmağınla kaydır; bırakışta tek cihaz eylemi gönderilir.`
              : "Ses değeri uydurulmaz; geçerli cevap gelirse native slider gösterilir." },
          { type: "button-row", children: [
            { type: "button", label: "ÖNCEKİ", variant: "ghost", action: { type: "media.control", payload: { action: "prev" } } },
            { type: "button", label: "OYNAT / DURAKLAT", variant: "ghost", action: { type: "media.control", payload: { action: "toggle" } } },
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
}

// Kalici referans artefact'i deterministiktir; acilis anindaki cihaz state'i
// yalniz render gorunumune uygulanir, artifact spec'ine yazilmaz.
export const SCROLLABLE_SOUND_PANEL = soundPanelWithMusicVolume(DEFAULT_MUSIC_VOLUME);
