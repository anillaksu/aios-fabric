/* Ilk ScreenSpec 2.0 referans artefakti. LLM uretimi degil; yeni contract'in
   gercek telefon kabulunde kullanilacak deterministik fixture'i. */
export const SOUND_PANEL_REQUIREMENTS = [
  "scroll-region", "range", "range-change-action", "capability:volume.set", "capability:media.control",
];

export const DEVICE_STATUS_PANEL_REQUIREMENTS = ["scroll-region"];
export const DEVICE_STATUS_PANEL_ID = "reference-device-status-v1";

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

function finite(value) { return typeof value === "number" && Number.isFinite(value); }
function rows(items) { return items.filter((item) => item.trailing !== "—"); }

/** Yalniz gercek dispatcher cevaplarini mevcut ScreenSpec alanlaryna map eder. */
export function deviceStatusWithLiveData({ battery = null, wifi = null, appCount = null, fabricReachable = false } = {}) {
  const batteryMetrics = [];
  if (finite(battery?.percentage)) batteryMetrics.push({ type: "metric", label: "PİL", value: battery.percentage, unit: "%", tone: battery.percentage < 15 ? "error" : battery.percentage < 35 ? "warn" : "ok", progress: battery.percentage });
  if (finite(battery?.temperature)) batteryMetrics.push({ type: "metric", label: "SICAKLIK", value: battery.temperature, unit: "°C", tone: battery.temperature > 42 ? "warn" : "ok" });
  if (finite(battery?.voltage)) batteryMetrics.push({ type: "metric", label: "VOLTAJ", value: (battery.voltage / 1000).toFixed(2), unit: "V" });
  if (finite(battery?.cycle)) batteryMetrics.push({ type: "metric", label: "DÖNGÜ", value: battery.cycle });
  if (finite(appCount)) batteryMetrics.push({ type: "metric", label: "UYG.", value: appCount });

  const sections = [{
    type: "section", title: "CİHAZ DURUM MERKEZİ", children: [{
      type: "scroll-region", title: "Cihaz durumu", maxHeight: 560, children: [{
        type: "stack", direction: "column", gap: 3, align: "stretch", children: [
          {
            type: "section", title: "SAĞLIK", layout: "grid-2",
            children: batteryMetrics.length ? batteryMetrics : [{ type: "empty-state", icon: "battery_slash", title: "Pil durumu okunamadı", detail: "Geçerli cihaz cevabı gelmedi." }],
          },
          {
            type: "section", title: "PİL DETAY", children: [{ type: "list", children: rows([
              { type: "list-row", title: "Durum", trailing: typeof battery?.status === "string" ? battery.status : "—" },
              { type: "list-row", title: "Sağlık", trailing: typeof battery?.health === "string" ? battery.health : "—" },
              { type: "list-row", title: "Bağlantı", trailing: typeof battery?.plugged === "string" ? battery.plugged : "—" },
              { type: "list-row", title: "Teknoloji", trailing: typeof battery?.technology === "string" ? battery.technology : "—" },
              { type: "list-row", title: "Akım", trailing: finite(battery?.current) ? String(battery.current) : "—" },
            ]) }],
          },
          {
            type: "section", title: "WI-FI", children: [{ type: "list", children: rows([
              { type: "list-row", icon: "wifi", title: "Ağ", subtitle: typeof wifi?.ssid === "string" ? wifi.ssid.replace(/\"/g, "") : "—", chip: { label: wifi ? "BAĞLI" : "YOK", tone: wifi ? "ok" : "idle" } },
              { type: "list-row", title: "IP", trailing: typeof wifi?.ip === "string" ? wifi.ip : "—" },
              { type: "list-row", title: "Sinyal", trailing: finite(wifi?.rssi) ? `${wifi.rssi} dBm` : "—" },
              { type: "list-row", title: "Frekans", trailing: finite(wifi?.frequency_mhz) ? `${wifi.frequency_mhz} MHz` : "—" },
              { type: "list-row", title: "Hız", trailing: finite(wifi?.link_speed_mbps) ? `${wifi.link_speed_mbps} Mbps` : "—" },
            ]) }],
          },
          {
            type: "section", title: "SERVİSLER", children: [
              { type: "list", children: [{ type: "list-row", icon: "cube_box", title: "Fabric", subtitle: "Bu panelin dispatcher okumaları", chip: { label: fabricReachable ? "ERİŞİLEBİLİR" : "ÖLÇÜLMEDİ", tone: fabricReachable ? "ok" : "idle" } }] },
              { type: "info-card", icon: "info_circle", title: "Hermes / Gateway", body: "Bu artefact için canlı sağlık kaynağı yok; durum uydurulmaz." },
            ],
          },
          { type: "button", label: "YENİLE", variant: "primary", action: { type: "ui.artifact", payload: { id: DEVICE_STATUS_PANEL_ID } } },
        ],
      }],
    }],
  }];
  return { id: DEVICE_STATUS_PANEL_ID, title: "Cihaz Durum Merkezi", subtitle: "Gerçek cihaz okumaları", sections };
}

export const DEVICE_STATUS_PANEL = deviceStatusWithLiveData();
