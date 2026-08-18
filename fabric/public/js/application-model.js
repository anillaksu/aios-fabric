/* AI-OS · W6.G APPLICATION ENTRY
   Application, artifact'in kopyasi ya da yeni execution sinifi DEGILDIR.
   Kalici launcher identity'si artifactId ile mevcut artefakta baglanir. */

export const DEFAULT_APPLICATION_ICON = "square_grid_2x2_fill";

export function nextApplicationPosition(entries) {
  return entries.reduce((max, entry) => (
    Number.isInteger(entry?.position) ? Math.max(max, entry.position) : max
  ), -1) + 1;
}

export function createApplicationEntry({ id, artifact, position, icon = DEFAULT_APPLICATION_ICON }) {
  if (!id) throw new TypeError("application id zorunlu");
  if (!artifact?.id) throw new TypeError("artifactId zorunlu");
  return {
    id,
    artifactId: artifact.id,
    title: artifact.title || "Artefakt",
    icon,
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
    };
  });
  return { changed, entries: next };
}
