// /read politikasi - MCP'deki isMcpExposed() deseniyle ayni ilke:
// route karari tek, saf ve test edilebilir bir fonksiyonda tutulur.
//
// /read dispatcher/journal yolunu bilerek kullanmaz; bu nedenle yalnizca
// acikca salt-okuma olarak damgalanmis risk:safe capability'lere izin verir.
// `risk:safe` tek basina yan etkisiz anlamina gelmez (torch.set vb.).

import { capabilityMap } from "./capabilities.ts";
import type { CapabilityResult } from "./types.ts";

export function isReadExposed(name: string): boolean {
  const cap = capabilityMap.get(name);
  return !!cap && (cap.risk ?? "ask") === "safe" && cap.readOnly === true;
}

export function readExposedNames(): string[] {
  return [...capabilityMap.keys()].filter(isReadExposed);
}

/**
 * `/read` istisnasinin tek yurutme noktasi. Dispatcher yalniz mutasyonlarin
 * execution kapisidir; burada ise explicit `safe + readOnly` facade'nin
 * siniri merkezi olarak korunur. Cagiran capability nesnesine dogrudan
 * ulasamaz ve policy degismeden yeni bir okuma acilmaz.
 */
export async function executeReadOnly(
  name: string,
  payload?: Record<string, unknown>,
): Promise<CapabilityResult> {
  if (!isReadExposed(name)) {
    return { ok: false, error: `"${name}" /read uzerinden izinli degil` };
  }
  const cap = capabilityMap.get(name);
  if (!cap) return { ok: false, error: "read policy capability bulunamadi" };
  return cap.execute(payload);
}
