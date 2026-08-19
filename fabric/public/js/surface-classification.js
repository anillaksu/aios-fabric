/* AIOS nesneleri birbirine donusmez: bu modul yalniz mevcut kimlikleri
 * kullanici yuzeyinde acik siniflara cevirir. Execution veya authorization
 * sahibi degildir. */
export const SURFACE_KIND = Object.freeze({
  ARTIFACT: "artifact",
  APPLICATION_ENTRY: "application-entry",
  SYSTEM_SURFACE: "system-surface",
  ANDROID_PACKAGE: "android-package",
});

export function classifyArtifact(artifact) {
  return { kind: SURFACE_KIND.ARTIFACT, id: artifact?.id || null, provenance: artifact?.provenance || "unknown" };
}

export function classifyApplication(entry, artifact) {
  return {
    kind: SURFACE_KIND.APPLICATION_ENTRY,
    id: entry?.id || null,
    artifactId: entry?.artifactId || null,
    linked: Boolean(artifact?.id && entry?.artifactId === artifact.id),
  };
}

export function classifySystemSurface(id) {
  return { kind: SURFACE_KIND.SYSTEM_SURFACE, id: typeof id === "string" ? id : null };
}

export function classifyAndroidPackage(pkg) {
  return { kind: SURFACE_KIND.ANDROID_PACKAGE, packageName: typeof pkg === "string" ? pkg : null };
}
