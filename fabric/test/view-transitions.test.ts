import test from "node:test";
import assert from "node:assert/strict";

const view = await import("../public/js/view-transitions.js");

function fakeDocument() {
  const attrs = new Map<string, string>();
  return {
    documentElement: {
      setAttribute: (key: string, value: string) => attrs.set(key, value),
      removeAttribute: (key: string) => attrs.delete(key),
      getAttribute: (key: string) => attrs.get(key) || null,
    },
    startViewTransition(render: () => void) { render(); return { finished: Promise.resolve() }; },
  };
}

test("View Transition destekliyse native API renderi sarar ve turu isaretler", async () => {
  const document = fakeDocument();
  let rendered = 0;
  const transition = view.runViewTransition({ document, window: { matchMedia: () => ({ matches: false }) }, kind: "push", render: () => { rendered++; } });
  assert.equal(rendered, 1);
  assert.ok(transition);
  await transition.finished;
  await Promise.resolve();
  assert.equal(document.documentElement.getAttribute("data-aios-transition"), null);
});

test("reduced-motion veya API eksigi dogrudan render eder", () => {
  let rendered = 0;
  const document = fakeDocument();
  const transition = view.runViewTransition({ document, window: { matchMedia: () => ({ matches: true }) }, render: () => { rendered++; } });
  assert.equal(transition, null);
  assert.equal(rendered, 1);
});
