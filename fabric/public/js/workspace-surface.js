/* AIOS Workspace Surface Profiles
 * WindowManager tek gercektir; profiller ayni pencere kayitlarini farkli
 * platform-esinli degil, AIOS'a ozgu kullanis bicimleriyle projekte eder. */

export const WORKSPACE_SURFACES = Object.freeze([
  { id: "classic", icon: "rectangle_grid_1x2", title: "Klasik Akış", subtitle: "Önceki sabit bölüm gezintisi" },
  { id: "rail", icon: "rectangle_split_3x1", title: "Çalışma Koridoru", subtitle: "Açık pencereler alttan akar" },
  { id: "stack", icon: "square_stack_3d_up_fill", title: "Katmanlı Pencereler", subtitle: "Yoğun işlerde güçlü pencere ayrımı" },
  { id: "gesture", icon: "hand_draw_fill", title: "Hareket Alanı", subtitle: "Başparmak odaklı kısa yol yüzeyi" },
  { id: "cards", icon: "rectangle_on_rectangle", title: "Kart Dizisi", subtitle: "Odaklanan pencere kartlarla görünür" },
  { id: "canvas", icon: "move", title: "Serbest Kanvas", subtitle: "Pencereleri taşı, çalışma alanını düzenle" },
]);

export const DEFAULT_WORKSPACE_SURFACE = "rail";
const STORAGE_KEY = "aios.workspace-surface.v1";

export function normalizeWorkspaceSurface(id) {
  return WORKSPACE_SURFACES.some((surface) => surface.id === id) ? id : DEFAULT_WORKSPACE_SURFACE;
}

export function loadWorkspaceSurface(storage = globalThis.localStorage) {
  try { return normalizeWorkspaceSurface(storage?.getItem(STORAGE_KEY)); } catch { return DEFAULT_WORKSPACE_SURFACE; }
}

export function saveWorkspaceSurface(id, storage = globalThis.localStorage) {
  const next = normalizeWorkspaceSurface(id);
  try { storage?.setItem(STORAGE_KEY, next); } catch { /* tercih kaydi yoksa varsayilan korunur */ }
  return next;
}

/** Eski pencereler de kimliklerinden deterministik bir ilk kanvas konumu alir. */
export function canvasPosition(windowRecord, index = 0) {
  const stored = windowRecord?.layout?.canvas;
  if (Number.isFinite(stored?.x) && Number.isFinite(stored?.y)) return { x: stored.x, y: stored.y };
  const ring = [
    [28, 22], [284, 46], [112, 168], [396, 182], [12, 310], [258, 334], [502, 74], [514, 298],
  ];
  const [x, y] = ring[index % ring.length];
  const cycle = Math.floor(index / ring.length);
  return { x: x + cycle * 38, y: y + cycle * 26 };
}
