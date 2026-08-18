// B-13 - Approval Contract (2026-08-18).
//
// Yeni protokol/transport YOK - mevcut journal/reducer deseninin (state.ts)
// aynen tekrari. Bu dosya SAF fonksiyonlar icerir (yan etki yok), dispatcher.ts
// bunlari cagirip journal'a approval.granted/denied/revoked event'i yazar.
//
// Scope bugun CAPABILITY-DUZEYINDE (KARAR-2'nin "capability kapsami" kismi).
// Artefakt-duzeyi kapsam (ayni artefaktin FARKLI capability setleriyle ayri
// ayri onaylanmasi) Katman B/DAG gelene kadar TARGET - admitArtifact()'in
// urettigi capabilitySetVersion o zaman scope key'e eklenebilir.
//
// LLM/A2A/MCP grant/deny/revoke VEREMEZ - bu bir allowlist kontrolu degil,
// yapisal bir garanti: approval.granted/denied/revoked capabilityMap'te
// KAYITLI DEGIL, yani dispatcher.dispatch() (tools/call'un TEK giris noktasi)
// bu event'leri asla uretemez. Yalnizca Dispatcher.grantApproval/denyApproval/
// revokeApproval (server.ts'teki insan-tetikli HTTP uclarindan cagrilir) yazar.

import type { FabricState } from "./types.ts";

/**
 * Bir capability icin su an gecerli (granted, suresi dolmamis) bir onay var mi?
 * `now` parametreyle verilir (Date.now() cagiranin sorumlulugunda) - bu
 * fonksiyon saf kalsin, reducer'lar gibi test edilebilir olsun diye.
 */
export function isApproved(state: FabricState, capability: string, now: number): boolean {
  const rec = state.approvals[capability];
  if (!rec || rec.status !== "granted") return false;
  if (rec.expiresAt !== undefined && rec.expiresAt <= now) return false;
  return true;
}
