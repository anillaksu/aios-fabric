import { test } from "node:test";
import assert from "node:assert/strict";
import { dockWindows } from "../public/js/workspace-dock.js";

test("workspace dock WindowManager'in sinirsiz saf projeksiyonudur", () => {
  const windows = Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, title: `Pencere ${i}` }));
  const result = dockWindows(windows, new Set(windows.map((win) => win.id)));
  assert.equal(result.length, 8, "overflow pencere kaydini dusuremez");
  assert.deepEqual(result.map((win) => win.id), ["a7", "a6", "a5", "a4", "a3", "a2", "a1", "a0"]);
});
