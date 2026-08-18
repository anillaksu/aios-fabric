// ScreenSpec dogrulamasi - SUNUCU TARAFI (W5.1/W5.2, 2026-08-17).
//
// ONCEDEN bu dogrulama YALNIZCA istemcide vardi (public/js/renderer.js
// validateSpec/validateScreen). Owner'in W5 notu haklı: "istemci dogrulamasi
// tek basina guven siniri olarak gorulmeyebilir" - bir tarayici DevTools'u
// acip fetch'i taklit eden ya da renderer.js'i atlayan HERHANGI bir istemci,
// dogrulanmamis bir ScreenSpec'i llm.generate'in HAM ciktisindan okuyabilirdi.
//
// Bu dosya renderer.js'teki AYNI kurallari (bilinmeyen tip -> elenir, izinsiz
// action -> kaldirilir, derinlik siniri) SUNUCUDA tekrarlar - boylece
// llm.generate'in DONDURDUGU metin, hangi istemci okursa okusun, zaten
// temizlenmis olur. Istemcideki kopya KALDIRILMADI (bkz. renderer.js) -
// iki katmanli savunma kasitli (defense in depth), TEK katman degil.
//
// NOT: bu yalnizca GORUNTULEME/YAPI guvenligi. Bir action'in GERCEKTEN
// CALISIP CALISAMAYACAGI (risk:ask mi, capability var mi) burada DEGIL,
// dispatcher.ts'teki risk kapisinda karar verilir - ikisi FARKLI sinirlar
// (bkz. docs/CHECKLIST.md W5.4).

import { capabilityMap } from "./capabilities.ts";
import { logErr } from "./log.ts";

// public/js/registry.js:REGISTRY ile BIREBIR ayni liste olmali - biri
// degisip digeri unutulursa istemci ve sunucu farkli seyi "gecerli" sayar.
// export: fabric/test/registry-drift.test.ts bu iki listeyi karsilastirir (B-6).
export const ALLOWED_TYPES = new Set([
  "section", "tile", "info-card", "action-card", "task-card", "agent-card",
  "app-tile", "list", "list-row", "status-chip", "metric", "progress",
  "action-receipt", "button", "button-row", "skeleton", "empty-state",
  "error-state", "text", "stack", "scroll-region", "range",
]);

// UI'nin kendi ic gezinme eylemleri (capability degil, capabilityMap'te yok)
// - client-side public/js/ui-actions.js:UI_META_ACTIONS ile BIREBIR ayni
// olmali. fabric/test/registry-drift.test.ts bu ikisini karsilastirir (B-6).
export const UI_META_ACTIONS = new Set([
  "ui.goto", "ui.back", "ui.appsheet", "ui.control", "ui.ask", "ui.artifact",
  "ui.compose", "cap.test", "ui.taskCancel", "ui.taskRetry", "ui.taskUndo",
  "ui.miniapp", "ui.application", "ui.ruleAdd", "ui.ruleToggle", "ui.ruleRemove",
  "ui.referenceSoundPanel",
]);

function actionAllowed(type: string): boolean {
  return capabilityMap.has(type) || UI_META_ACTIONS.has(type);
}

interface RawNode {
  [key: string]: unknown;
}
interface CleanNode {
  type: string;
  [key: string]: unknown;
}

const SCALAR_KEYS = [
  "title", "subtitle", "name", "value", "unit", "meta", "label", "text", "body",
  "icon", "tone", "state", "status", "source", "role", "detail", "trailing",
  "pkg", "actionLabel", "variant", "layout", "executor", "elapsed", "height",
];
const BOOL_KEYS = ["on", "online", "toggles", "pulse", "mono", "undo"];
const NUM_KEYS = ["progress", "rows"];

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validValueKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value);
}

function cleanAction(a: unknown): { type: string; payload?: Record<string, unknown> } | undefined {
  if (!a || typeof a !== "object" || typeof (a as RawNode).type !== "string") return undefined;
  const type = (a as RawNode).type as string;
  if (!actionAllowed(type)) return undefined;
  const out: { type: string; payload?: Record<string, unknown> } = { type };
  const payload = (a as RawNode).payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    out.payload = payload as Record<string, unknown>;
  }
  return out;
}

/** Tek bir dugumu dogrular/temizler. Bilinmeyen tip -> null (dugum atilir). */
export function validateSpecNode(spec: unknown, depth = 0): CleanNode | null {
  if (!spec || typeof spec !== "object" || depth > 6) return null;
  const raw = spec as RawNode;
  if (typeof raw.type !== "string" || !ALLOWED_TYPES.has(raw.type)) return null;

  // ScreenSpec 2.0'in ilk davranissal dilimi: serbest CSS/JS degil, native
  // HTML control'lerinin sinirli declarative karsiligi. Gecersiz control
  // kismen "iyilestirilmez"; node fail-closed elenir.
  if (raw.type === "stack") {
    if (raw.direction != null && raw.direction !== "row" && raw.direction !== "column") return null;
    if (raw.gap != null && (!finiteNumber(raw.gap) || raw.gap < 0 || raw.gap > 8)) return null;
    if (raw.align != null && !["start", "center", "end", "stretch"].includes(String(raw.align))) return null;
  }
  if (raw.type === "scroll-region") {
    if (!finiteNumber(raw.maxHeight) || raw.maxHeight < 80 || raw.maxHeight > 960) return null;
  }
  if (raw.type === "range") {
    if (!finiteNumber(raw.min) || !finiteNumber(raw.max) || !finiteNumber(raw.value) || !finiteNumber(raw.step)) return null;
    if (raw.min > raw.max || raw.value < raw.min || raw.value > raw.max || raw.step <= 0) return null;
    if (!validValueKey(raw.valueKey)) return null;
    const action = cleanAction(raw.action);
    // Range'in degisen degeri UI meta-action'a degil, mevcut capability
    // action'inin payload'ina gider. Policy yine dispatcher'dadir.
    if (!action || !capabilityMap.has(action.type)) return null;
  }

  const clean: CleanNode = { type: raw.type };
  for (const k of SCALAR_KEYS) {
    const v = raw[k];
    if (v != null && (typeof v === "string" || typeof v === "number")) clean[k] = v;
  }
  for (const k of BOOL_KEYS) if (typeof raw[k] === "boolean") clean[k] = raw[k];
  for (const k of NUM_KEYS) if (typeof raw[k] === "number") clean[k] = raw[k];

  if (raw.type === "stack") {
    clean.direction = raw.direction === "row" ? "row" : "column";
    clean.gap = raw.gap ?? 2;
    clean.align = raw.align ?? "stretch";
  }
  if (raw.type === "scroll-region") clean.maxHeight = raw.maxHeight;
  if (raw.type === "range") {
    clean.min = raw.min; clean.max = raw.max; clean.value = raw.value; clean.step = raw.step;
    clean.valueKey = raw.valueKey;
  }

  for (const k of ["action", "tap", "longPress", "details"]) {
    const a = cleanAction(raw[k]);
    if (a) clean[k] = a;
  }
  if (raw.chip && typeof raw.chip === "object") {
    const chip = raw.chip as RawNode;
    clean.chip = { label: String(chip.label ?? ""), tone: String(chip.tone ?? "idle") };
  }
  if (Array.isArray(raw.steps)) {
    clean.steps = raw.steps.slice(0, 12).map((s: RawNode) => ({
      name: String(s?.name ?? ""),
      change: s?.change != null ? String(s.change) : undefined,
      ms: typeof s?.ms === "number" ? s.ms : undefined,
    }));
  }
  if (Array.isArray(raw.actions)) {
    clean.actions = raw.actions.slice(0, 4).map((a: RawNode) => {
      const act = cleanAction(a?.action);
      return act ? { label: String(a?.label ?? ""), variant: a?.variant, action: act } : null;
    }).filter(Boolean);
  }
  const kids = raw.children ?? raw.rows ?? raw.buttons;
  if (Array.isArray(kids)) {
    clean.children = kids.map((c) => validateSpecNode(c, depth + 1)).filter(Boolean);
  }
  return clean;
}

export interface CleanScreen {
  id: string;
  title: string;
  subtitle?: string;
  sections: CleanNode[];
}

export function validateScreen(screen: unknown): CleanScreen | null {
  if (!screen || typeof screen !== "object") return null;
  const raw = screen as RawNode;
  const sections = Array.isArray(raw.sections) ? raw.sections : [];
  return {
    id: String(raw.id ?? "generated"),
    title: String(raw.title ?? "Ekran"),
    subtitle: raw.subtitle != null ? String(raw.subtitle) : undefined,
    sections: sections.slice(0, 12).map((s) => validateSpecNode(s)).filter((n): n is CleanNode => n !== null),
  };
}

/**
 * llm.generate'in ham metninden ```aios kod blogunu bulur, JSON parse eder,
 * DOGRULAR ve blogu temizlenmis haliyle GERI YAZAR. JSON gecersizse ya da
 * dogrulama sonucu bos cikarsa (sections=[]), blok metinden tamamen SILINIR -
 * dogrulanmamis/bozuk bir yapi hicbir istemciye ulasmaz.
 */
export function sanitizeAiosBlock(text: string): string {
  const m = text.match(/```aios\s*([\s\S]*?)```/);
  if (!m) return text;
  let clean: CleanScreen | null = null;
  try {
    clean = validateScreen(JSON.parse(m[1].trim()));
  } catch (err) {
    // Model bozuk JSON uretti - bu tamamen olasi (LLM hallucination), ama
    // ne siklikta oldugunu bilmek kalite sinyali (prompt.ts ayarlamasi icin).
    logErr("screenspec:sanitizeAiosBlock", err);
    clean = null;
  }
  if (!clean || !clean.sections.length) {
    // Bozuk/bos artefakt: bloğu SIL, geri kalan duz metni koru.
    return text.slice(0, m.index) + text.slice(m.index! + m[0].length);
  }
  const replacement = "```aios\n" + JSON.stringify(clean) + "\n```";
  return text.slice(0, m.index) + replacement + text.slice(m.index! + m[0].length);
}
