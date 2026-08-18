/* ═══════════════════════════════════════════════════════════════
   AI-OS · ARTIFACT PARSE (W6.K, 2026-08-18)
   ───────────────────────────────────────────────────────────────
   app.js'in eskiden kendi icinde tuttugu extractArtifacts()/
   actionableCount() SAF hesaplama mantigi buraya tasindi. DOM'a
   dokunmaz, capability.execute() cagirmaz - yalnizca metin ->
   JSON.parse -> validateScreen -> "gercekten calisabilir mi" filtresi.

   Bu saflik BILINCLI: parse-worker.js bu dosyayi Worker icinde
   import eder (izole, terminate() edilebilir - kacak/asili bir
   parse ana thread'i kilitlemez). ACTIONABLE seti artik modul-duzeyi
   mutable degil - cagiran (worker) her seferinde parametre olarak
   verir, boylece Worker'in kendi scope'unda stale state riski yok.
   ═══════════════════════════════════════════════════════════════ */

import { validateScreen } from "./renderer.js";

/** node altinda GERCEKTEN calisabilir (bilinen) action sayisi. */
export function actionableCount(node, actionable, depth = 0) {
  // Liste bos ise (capability henuz yuklenmedi) reddetmeyelim - bilgi
  // eksikken kapiyi kapatmak yanlis pozitifin en pahali turu (app.js'teki
  // orijinal gerekce, degismedi).
  if (actionable.size === 0) return 1;
  if (!node || typeof node !== "object" || depth > 8) return 0;
  let n = 0;
  for (const key of ["action", "tap", "longPress"]) {
    const a = node[key];
    if (a && typeof a.type === "string" && actionable.has(a.type)) n++;
  }
  if (Array.isArray(node.actions)) {
    node.actions.forEach((a) => { if (a && a.action && actionable.has(a.action.type)) n++; });
  }
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) v.forEach((c) => { n += actionableCount(c, actionable, depth + 1); });
    else if (v && typeof v === "object") n += actionableCount(v, actionable, depth + 1);
  }
  return n;
}

/** ```aios bloklarini ayikla - LLM HTML degil ScreenSpec uretir. */
export function extractArtifacts(raw, actionableTypes) {
  const actionable = actionableTypes instanceof Set ? actionableTypes : new Set(actionableTypes || []);
  const specs = [];
  const rejected = [];
  const re = /```aios\s*([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    try {
      const clean = validateScreen(JSON.parse(m[1].trim()));
      if (!clean || !clean.sections.length) continue;
      if (actionableCount(clean, actionable) === 0) {
        rejected.push(clean.title || "Artefakt");
        continue;
      }
      specs.push(clean);
    } catch (e) { /* bozuk JSON -> atla */ }
  }
  return { text: raw.replace(re, "").trim(), specs, rejected };
}
