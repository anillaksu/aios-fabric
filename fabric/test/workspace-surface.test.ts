import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_WORKSPACE_SURFACE, WORKSPACE_SURFACES, canvasPosition, loadWorkspaceSurface, normalizeWorkspaceSurface, saveWorkspaceSurface } from "../public/js/workspace-surface.js";

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
}

test("profil listesi AIOS yuzeyleridir; varsayilan mevcut calisma koridorudur", () => {
  assert.equal(DEFAULT_WORKSPACE_SURFACE, "rail");
  assert.deepEqual(WORKSPACE_SURFACES.map((surface) => surface.id), ["classic", "rail", "stack", "gesture", "cards", "canvas"]);
  assert.equal(normalizeWorkspaceSurface("bilinmeyen"), "rail");
});

test("profil tercihi sadece istemci tercihi olarak kalicilasir", () => {
  const mem = storage();
  assert.equal(loadWorkspaceSurface(mem), "rail");
  assert.equal(saveWorkspaceSurface("canvas", mem), "canvas");
  assert.equal(loadWorkspaceSurface(mem), "canvas");
});

test("kanvas ilk yerlesimi deterministiktir; kalici kullanici konumu onu ezer", () => {
  assert.deepEqual(canvasPosition({ id: "same" }, 2), canvasPosition({ id: "same" }, 2));
  assert.deepEqual(canvasPosition({ id: "same", layout: { canvas: { x: 61, y: 27 } } }, 2), { x: 61, y: 27 });
});
