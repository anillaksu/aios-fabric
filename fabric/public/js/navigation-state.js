/* AI-OS · navigation state
   Browser history'ye yalnız aynı-belge, görünür AIOS yüzeyi yazılır.
   Tab seçimi history adımı değildir; secondary/artifact açılışı geri
   dönülebilir bir adımdır. Bu modül DOM'suzdur, contract testi doğrudan
   çalıştırabilir. */

export const NAVIGATION_KEY = "aios.navigation.v1";
const TABS = new Set(["home", "komut", "artifacts", "activity", "hermes"]);

export function normalizeNavigation(value) {
  const raw = value && value[NAVIGATION_KEY] ? value[NAVIGATION_KEY] : value;
  const tab = TABS.has(raw?.tab) ? raw.tab : "hermes";
  const screen = typeof raw?.screen === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(raw.screen) ? raw.screen : null;
  const arg = typeof raw?.arg === "string" && raw.arg.length <= 80 ? raw.arg : null;
  const artifactId = typeof raw?.artifactId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(raw.artifactId) ? raw.artifactId : null;
  const index = Number.isInteger(raw?.index) && raw.index >= 0 ? raw.index : 0;
  return { tab, screen: artifactId ? null : screen, arg: artifactId ? null : arg, artifactId, index };
}

export function toHistoryState(value) {
  return { [NAVIGATION_KEY]: normalizeNavigation(value) };
}

export function isSameNavigation(a, b) {
  const left = normalizeNavigation(a);
  const right = normalizeNavigation(b);
  return left.tab === right.tab && left.screen === right.screen && left.arg === right.arg && left.artifactId === right.artifactId;
}
