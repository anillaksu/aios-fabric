/* AI-OS · native View Transition adapter
   Yeni animation/router katmani degil: destek varsa ayni-belge Web Platform
   API'sine yonlendirir, reduced-motion veya desteksiz tarayicida dogrudan
   render eder. */

export function prefersReducedMotion(win = globalThis) {
  return typeof win.matchMedia === "function" && win.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function runViewTransition({ document: doc = globalThis.document, window: win = globalThis, kind = "tab", render }) {
  if (typeof render !== "function") return null;
  const root = doc?.documentElement;
  if (!doc?.startViewTransition || prefersReducedMotion(win)) {
    render();
    return null;
  }
  root?.setAttribute("data-aios-transition", kind);
  const transition = doc.startViewTransition(render);
  Promise.resolve(transition.finished).then(
    () => root?.removeAttribute("data-aios-transition"),
    (error) => {
      root?.removeAttribute("data-aios-transition");
      // Geçiş kesilmesi render hatası değildir ama görünür tanı kaydı kalır.
      console.warn("[aios:view-transition] transition interrupted", error);
    },
  );
  return transition;
}
