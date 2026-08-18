import test from "node:test";
import assert from "node:assert/strict";

const nav = await import("../public/js/navigation-state.js");

test("navigation state yalniz bilinen tab ve sinirli secondary/artifact alanlarini tasir", () => {
  assert.deepEqual(nav.normalizeNavigation({ tab: "komut", screen: "discover", arg: "Cihaz", index: 3 }), {
    tab: "komut", screen: "discover", arg: "Cihaz", artifactId: null, index: 3,
  });
  assert.deepEqual(nav.normalizeNavigation({ tab: "bilinmeyen", screen: "../../x", arg: "x".repeat(81), artifactId: "bad/id", index: -1 }), {
    tab: "home", screen: null, arg: null, artifactId: null, index: 0,
  });
});

test("artifact odagi secondary filtreyi tasimaz; history state isimli ve deterministiktir", () => {
  const state = nav.toHistoryState({ tab: "komut", screen: "discover", arg: "Cihaz", artifactId: "reference-device-status-v1", index: 4 });
  assert.deepEqual(state, {
    [nav.NAVIGATION_KEY]: { tab: "komut", screen: null, arg: null, artifactId: "reference-device-status-v1", index: 4 },
  });
  assert.equal(nav.isSameNavigation(state, { tab: "komut", artifactId: "reference-device-status-v1", index: 9 }), true);
  assert.equal(nav.isSameNavigation(state, { tab: "home", artifactId: "reference-device-status-v1" }), false);
});
