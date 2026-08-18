// /read politikasi - MCP'deki isMcpExposed() deseniyle ayni ilke:
// route karari tek, saf ve test edilebilir bir fonksiyonda tutulur.
//
// /read dispatcher/journal yolunu bilerek kullanmaz; bu nedenle yalnizca
// acikca salt-okuma olarak damgalanmis risk:safe capability'lere izin verir.
// `risk:safe` tek basina yan etkisiz anlamina gelmez (torch.set vb.).

import { capabilityMap } from "./capabilities.ts";

export function isReadExposed(name: string): boolean {
  const cap = capabilityMap.get(name);
  return !!cap && (cap.risk ?? "ask") === "safe" && cap.readOnly === true;
}

export function readExposedNames(): string[] {
  return [...capabilityMap.keys()].filter(isReadExposed);
}
