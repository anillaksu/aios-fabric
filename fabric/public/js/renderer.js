/* ═══════════════════════════════════════════════════════════════
   AI-OS · SCREEN SPEC + DETERMINISTIC RENDERER
   ───────────────────────────────────────────────────────────────
   EN ONEMLI MIMARI KARAR:
     LLM artik HTML URETMIYOR. LLM ScreenSpec (JSON) uretiyor.
     "LLM gorunumu tasarlamiyor, LLM KOMPOZISYON yapiyor."

     ONCE:  LLM -> HTML -> sanitize -> render     (tasarim dili dagilir)
     SIMDI: LLM -> ScreenSpec -> validate -> known components -> DOM

   Kazanim: daha az token, daha hizli uretim, sanitizer karmasasi yok,
   bozuk layout yok, responsive garanti, tasarim dili bozulmaz,
   action guvenligi (sadece izin verilen intent'ler), cache kolay.

   ScreenSpec sekli:
     { id, title, subtitle?, sections: [ {type:"section", ...} ] }
   ═══════════════════════════════════════════════════════════════ */

import { REGISTRY, render, el } from "./registry.js";

/** Beyaz liste: AI yalniz bunlari uretebilir. Disindaki her sey elenir. */
const ALLOWED_TYPES = new Set(Object.keys(REGISTRY));

/** Action beyaz listesi renderer'a disaridan verilir (capability listesi). */
let allowedActions = new Set();
export function setAllowedActions(list) {
  allowedActions = new Set(list || []);
}

/**
 * ScreenSpec dogrulama/temizleme.
 * - Bilinmeyen component tipi -> dugum atilir
 * - Bilinmeyen/izinsiz action -> action kaldirilir (component kalir ama tiklanmaz)
 * - Derinlik siniri -> sonsuz ic ice engellenir
 * Bu, HTML sanitizer'in yerini alir ama cok daha basit ve guvenli:
 * cikti zaten yapisal, serbest metin degil.
 */
export function validateSpec(spec, depth = 0) {
  if (!spec || typeof spec !== "object" || depth > 6) return null;
  if (!ALLOWED_TYPES.has(spec.type)) return null;

  const clean = { type: spec.type };
  const SCALARS = [
    "title", "subtitle", "name", "value", "unit", "meta", "label", "text", "body",
    "icon", "tone", "state", "status", "source", "role", "detail", "trailing",
    "pkg", "actionLabel", "variant", "layout", "executor", "elapsed", "height", "valueKey",
  ];
  SCALARS.forEach((k) => {
    if (spec[k] != null && (typeof spec[k] === "string" || typeof spec[k] === "number")) clean[k] = spec[k];
  });
  ["on", "online", "toggles", "pulse", "mono", "undo", "iconOnly"].forEach((k) => {
    if (typeof spec[k] === "boolean") clean[k] = spec[k];
  });
  ["progress", "rows", "min", "max", "step", "maxHeight", "gap"].forEach((k) => {
    if (typeof spec[k] === "number") clean[k] = spec[k];
  });

  const cleanAction = (a) => {
    if (!a || typeof a !== "object" || typeof a.type !== "string") return undefined;
    if (allowedActions.size && !allowedActions.has(a.type)) return undefined;
    const out = { type: a.type };
    if (a.payload && typeof a.payload === "object" && !Array.isArray(a.payload)) out.payload = a.payload;
    return out;
  };
  if (spec.type === "stack") {
    if (spec.direction != null && spec.direction !== "row" && spec.direction !== "column") return null;
    if (spec.gap != null && (!Number.isFinite(spec.gap) || spec.gap < 0 || spec.gap > 8)) return null;
    if (spec.align != null && !["start", "center", "end", "stretch"].includes(spec.align)) return null;
    clean.direction = spec.direction === "row" ? "row" : "column";
    clean.gap = spec.gap == null ? 2 : spec.gap;
    clean.align = spec.align || "stretch";
  }
  if (spec.type === "scroll-region") {
    if (!Number.isFinite(spec.maxHeight) || spec.maxHeight < 80 || spec.maxHeight > 960) return null;
    clean.maxHeight = spec.maxHeight;
  }
  if (spec.type === "range") {
    if (![spec.min, spec.max, spec.value, spec.step].every(Number.isFinite) || spec.min > spec.max || spec.value < spec.min || spec.value > spec.max || spec.step <= 0 || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(spec.valueKey || "")) return null;
    const a = cleanAction(spec.action);
    if (!a || String(a.type).startsWith("ui.")) return null;
    clean.min = spec.min; clean.max = spec.max; clean.value = spec.value; clean.step = spec.step; clean.valueKey = spec.valueKey; clean.action = a;
  }
  ["action", "tap", "longPress", "details"].forEach((k) => {
    if (spec.type === "range" && k === "action") return;
    const a = cleanAction(spec[k]);
    if (a) clean[k] = a;
  });
  if (spec.chip && typeof spec.chip === "object") {
    clean.chip = { label: String(spec.chip.label || ""), tone: String(spec.chip.tone || "idle") };
  }
  if (Array.isArray(spec.steps)) {
    clean.steps = spec.steps.slice(0, 12).map((s) => ({
      name: String(s.name || ""), change: s.change ? String(s.change) : undefined,
      ms: typeof s.ms === "number" ? s.ms : undefined,
    }));
  }
  if (Array.isArray(spec.actions)) {
    clean.actions = spec.actions.slice(0, 4).map((a) => {
      const act = cleanAction(a.action);
      return act ? { label: String(a.label || ""), variant: a.variant, action: act } : null;
    }).filter(Boolean);
  }
  const kids = spec.children || spec.rows || spec.buttons;
  if (Array.isArray(kids)) {
    clean.children = kids.slice(0, 40).map((c) => validateSpec(c, depth + 1)).filter(Boolean);
  }
  return clean;
}

/** Tam bir ScreenSpec'i dogrular (sayfa duzeyi). */
export function validateScreen(screen) {
  if (!screen || typeof screen !== "object") return null;
  const sections = Array.isArray(screen.sections) ? screen.sections : [];
  return {
    id: String(screen.id || "generated"),
    title: String(screen.title || "Ekran"),
    subtitle: screen.subtitle ? String(screen.subtitle) : undefined,
    sections: sections.slice(0, 12).map((s) => validateSpec(s)).filter(Boolean),
  };
}

/** ScreenSpec -> DOM. Deterministik: ayni spec her zaman ayni gorunum. */
export function renderScreen(screen, ctx) {
  const frag = document.createDocumentFragment();
  (screen.sections || []).forEach((s) => {
    const node = render(s, ctx);
    if (node) frag.appendChild(node);
  });
  if (!frag.childNodes.length) {
    frag.appendChild(render({ type: "empty-state", title: "İçerik yok" }, ctx));
  }
  return frag;
}

/** Bir kapsayiciyi verilen spec ile (hizli gecisle) doldurur. */
export function mount(container, screen, ctx) {
  container.innerHTML = "";
  container.appendChild(renderScreen(screen, ctx));
}

/** Yukleme iskeleti - LLM/uzun islem beklerken ANINDA gosterilir. */
export function mountSkeleton(container, ctx, rows = 3) {
  container.innerHTML = "";
  const wrap = el("div", "c-section");
  const body = el("div", "body");
  for (let i = 0; i < rows; i++) {
    const card = el("div", "c-card");
    card.appendChild(render({ type: "skeleton", rows: 2 }, ctx));
    body.appendChild(card);
  }
  wrap.appendChild(body);
  container.appendChild(wrap);
}
