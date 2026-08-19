/* Dock kendi pencere state'ini tutmaz. WindowManager kayitlarinin ve mevcut
 * artifact kimliklerinin saf bir projeksiyonudur; yatay overflow gorunumu
 * degistirir ama pencereyi listeden dusuremez. */
export function dockWindows(windows, artifactIds) {
  const known = artifactIds instanceof Set ? artifactIds : new Set(artifactIds || []);
  return [...(windows || [])].filter((win) => known.has(win.id)).reverse();
}
