/* AI-OS · W6.G APPLICATION ENTRY
   Application, artifact'in kopyasi ya da yeni execution sinifi DEGILDIR.
   Kalici launcher identity'si artifactId ile mevcut artefakta baglanir. */

export const DEFAULT_APPLICATION_ICON = "square_grid_2x2_fill";
export const APPLICATION_ENTRY_KIND = "application-entry";

/**
 * ApplicationEntry bir artefaktin kopyasi degildir. Ikon da modelin serbest
 * yorumu degil, artefaktin kayitli baslik/prompt/capability metadata'sindan
 * deterministik olarak turetilen bir launcher affordance'idir.
 */
const ICON_RULES = [
  { icon: "speaker_2_fill", match: (text, caps) => /ses|medya|müzik|music|volume|oynat/.test(text) || caps.some((name) => name.startsWith("volume.") || name.startsWith("media.")) },
  { icon: "battery_75", match: (text, caps) => /pil|batarya|battery|şarj/.test(text) || caps.includes("sensor.battery.read") },
  { icon: "wifi", match: (text, caps) => /ağ|wifi|wi-fi|internet|bağlantı/.test(text) || caps.includes("wifi.info") },
  { icon: "square_grid_2x2_fill", match: (text, caps) => /uygulama|app|launcher/.test(text) || caps.some((name) => name.startsWith("app.")) },
  { icon: "flashlight_on_fill", match: (text, caps) => /fener|ışık|torch/.test(text) || caps.includes("torch.set") },
  { icon: "wrench_and_screwdriver_fill", match: (text, caps) => /araç|sistem|ayar|titreşim/.test(text) || caps.some((name) => name === "vibrate" || name.startsWith("script.")) },
];

function artifactMetadata(artifact) {
  const text = [artifact?.title, artifact?.prompt].filter((value) => typeof value === "string").join(" ").toLocaleLowerCase("tr-TR");
  const capabilities = Array.isArray(artifact?.capabilities) ? artifact.capabilities.filter((name) => typeof name === "string") : [];
  return { text, capabilities };
}

export function deriveApplicationIcon(artifact) {
  const { text, capabilities } = artifactMetadata(artifact);
  return ICON_RULES.find((rule) => rule.match(text, capabilities))?.icon || DEFAULT_APPLICATION_ICON;
}

/** Legacy default ikonlar metadata ile iyilestirilir; kullanicinin secimi ezilmez. */
export function applicationIcon(entry, artifact) {
  if (entry?.iconSource === "custom" && typeof entry.icon === "string" && entry.icon) return entry.icon;
  if (entry?.iconSource === "artifact-derived") return entry.icon || deriveApplicationIcon(artifact);
  if (entry?.icon && entry.icon !== DEFAULT_APPLICATION_ICON) return entry.icon;
  return deriveApplicationIcon(artifact);
}

export function nextApplicationPosition(entries) {
  return entries.reduce((max, entry) => (
    Number.isInteger(entry?.position) ? Math.max(max, entry.position) : max
  ), -1) + 1;
}

export function createApplicationEntry({ id, artifact, position, icon = null }) {
  if (!id) throw new TypeError("application id zorunlu");
  if (!artifact?.id) throw new TypeError("artifactId zorunlu");
  const customIcon = typeof icon === "string" && icon.trim() ? icon.trim() : null;
  return {
    id,
    artifactId: artifact.id,
    title: artifact.title || "Artefakt",
    kind: APPLICATION_ENTRY_KIND,
    icon: customIcon || deriveApplicationIcon(artifact),
    iconSource: customIcon ? "custom" : "artifact-derived",
    position,
  };
}

export function applicationsForArtifact(entries, artifactId) {
  return entries.filter((entry) => entry?.artifactId === artifactId);
}

export function canDeleteArtifact(entries, artifactId) {
  return applicationsForArtifact(entries, artifactId).length === 0;
}

export function orderedApplications(entries) {
  return [...entries].sort((a, b) => (
    (Number.isInteger(a?.position) ? a.position : Number.MAX_SAFE_INTEGER) -
    (Number.isInteger(b?.position) ? b.position : Number.MAX_SAFE_INTEGER)
  ));
}

/** Launcher entry'nin kendi kullanim izi; artifact'e veya execution'a yazilmaz. */
export function recordApplicationOpen(entries, id, now = Date.now()) {
  if (!Number.isFinite(now)) throw new TypeError("acilis zamani gecersiz");
  let changed = false;
  const next = entries.map((entry) => {
    if (entry?.id !== id) return entry;
    changed = true;
    return { ...entry, lastOpenedAt: now };
  });
  return { changed, entries: next };
}

export function recentApplications(entries, limit = 4) {
  return entries
    .filter((entry) => Number.isFinite(entry?.lastOpenedAt) && entry.lastOpenedAt > 0)
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    .slice(0, Math.max(0, limit));
}

export function updateApplicationEntry(entries, id, { title, icon }) {
  let changed = false;
  const next = entries.map((entry) => {
    if (entry?.id !== id) return entry;
    changed = true;
    return {
      ...entry,
      title: typeof title === "string" && title.trim() ? title.trim() : entry.title,
      icon: typeof icon === "string" && icon.trim() ? icon.trim() : entry.icon,
      iconSource: typeof icon === "string" && icon.trim() ? "custom" : entry.iconSource,
    };
  });
  return { changed, entries: next };
}
