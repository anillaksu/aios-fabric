/* ═══════════════════════════════════════════════════════════════
   AI-OS · ARTIFACT CONTRACT (W6 - M-5/M-7, 2026-08-17)
   ───────────────────────────────────────────────────────────────
   MIMARI_TEMEL.md SS4'un "sozlesme yalnizca alan degil, kapi olsun"
   (M-7) kuralinin ilk gercek uygulamasi. Agir bir "compiler" DEGIL -
   W6.C'nin bos pencere akisinin ihtiyac duydugu MINIMUM sinir:

     1. Bir artefaktin GERCEKTEN hangi capability'leri kullandigini
        cikar (W6.W: minimal closure - "bildirdigi" degil "kullandigi")
     2. Bunlarin hepsinin BILINEN capability'ler oldugunu dogrula
     3. Hangi capability SETI SURUMUNE karsi uretildigini damgala -
        surum degisince (yeni capability eklenince/cikarilinca) eski
        damga artik GECERSIZ sayilabilir (W6.L'nin planladigi hash
        formulunun erken/kucuk bir kullanimi)

   Bu dosya ScreenSpec'in ICERIK guvenligini DOGRULAMAZ - o zaten
   renderer.js:validateScreen'de var (W5.1/W5.2). Burasi yalnizca
   ARTEFAKT KAYDININ SOZLESMESini (capabilities/version/provenance)
   dogrular - ayri bir sinir (screenspec.ts'teki yorumla ayni ilke:
   "ikisi FARKLI sinirlar").

   Ephemeral/persistent ayrimi (M-8) burada EN UCUZ haliyle var:
   admitArtifact() basarisiz olursa artefakt HIC persist edilmez
   (addArtifact() cagrilmaz) - "olcume dayali terfi" DEGIL (o, W6.5d'de
   bilincli ertelendi, n=8 olcekte anlamsiz), ama "dogrulanmadan
   kalicilasmaz" invaryanti şimdiden gercek.
   ═══════════════════════════════════════════════════════════════ */

import { UI_META_ACTIONS } from "./ui-actions.js";

const META = new Set(UI_META_ACTIONS);

/** Bir ScreenSpec agacinda GERCEKTEN kullanilan action tiplerini toplar. */
export function usedActionTypes(screen) {
  const out = new Set();
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.action && typeof node.action.type === "string") out.add(node.action.type);
    if (Array.isArray(node.actions)) {
      node.actions.forEach((a) => { if (a && typeof a.type === "string") out.add(a.type); });
    }
    if (Array.isArray(node.sections)) node.sections.forEach(walk);
    if (Array.isArray(node.children)) node.children.forEach(walk);
  };
  walk(screen);
  return [...out];
}

/** capability adi kumesinin deterministik surum damgasi (SHA-256, ilk 16 hex). */
export async function capabilitySetVersion(capabilityNames) {
  const sorted = [...new Set(capabilityNames)].sort().join(",");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sorted));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

/**
 * Aday bir ScreenSpec'i sozlesmeye karsi dogrular (kapi - M-7).
 * screen: renderer.js:validateScreen'den GECMIS, TEMIZLENMIS olmali -
 * icerik guvenligi burada TEKRARLANMAZ.
 * knownCapabilities: capabilityNames (sunucudan /capabilities ile gelen).
 * versionStamp: capabilitySetVersion(knownCapabilities)'in onceden hesaplanmis hali.
 */
export function admitArtifact(screen, { knownCapabilities, versionStamp, provenance = "hermes" }) {
  if (!screen || !Array.isArray(screen.sections)) {
    return { ok: false, reason: "geçersiz ScreenSpec" };
  }
  const known = new Set(knownCapabilities);
  const used = usedActionTypes(screen);
  const unknown = used.filter((t) => !known.has(t) && !META.has(t));
  if (unknown.length) {
    return { ok: false, reason: "bilinmeyen capability referansı: " + unknown.join(", ") };
  }
  return {
    ok: true,
    contract: {
      capabilities: used.filter((t) => known.has(t)),
      version: versionStamp,
      provenance,
    },
  };
}
