import { test } from "node:test";
import assert from "node:assert/strict";
import { dockWindows } from "../public/js/workspace-dock.js";

test("workspace dock WindowManager'in sinirsiz saf projeksiyonudur; en yeni pencere once gorunur", () => {
  const windows = Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, title: `Pencere ${i}` }));
  const result = dockWindows(windows, new Set(windows.map((win) => win.id)));
  assert.equal(result.length, 8, "overflow pencere kaydini dusuremez");
  assert.deepEqual(result.map((win) => win.id), ["a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7"]);
});
