// UNIVERSAL INTENT ENVELOPE - sistemin konustugu tek dil.
//
// ═══ SORUN ═══
// Girisler simdiye kadar AYRI YOLLARDAN geliyordu:
//   · UI butonu      -> ctx.dispatch -> POST /read      (journal'a girmiyor)
//   · Hermes cevabi  -> ayni yol, ama once LLM'den gecmis
//   · Paylas menusu  -> ?tab=... query string
//   · Ses            -> speech.listen -> metin -> ask()
//   · A2A peer       -> POST /a2a/tasks (bambaska bir govde)
//   · Otomasyon      -> dispatcher.dispatch (dogrudan)
// Sonuc: "ne istendi?" sorusunun cevabi her kaynakta baska yerde duruyordu,
// bazilarinda hic durmuyordu. Hata ayiklamak imkansizdi (bu oturumda 30
// artefaktin neden basarisiz oldugunu bulmak icin dosya dosya gezildi).
//
// ═══ COZUM ═══
// Kaynak ne olursa olsun once AYNI zarfa donusur:
//     ZARF -> (anlama) -> GOREV -> (yurutme) -> ARTEFAKT
// Zarfin her asamasi journal'a duser. Boylece "Spotify ac" (ses) ile
// "bunu PC ajani incelesin" (paylas) AYNI borudan gecer ve AYNI ekranda
// izlenir.

import { randomUUID } from "node:crypto";
import type { FabricEvent } from "./types.ts";

/** Girisin GELDIGI yer. Yeni bir kaynak eklemek = buraya bir deger eklemek. */
export type IntentSource =
  | "ui"         // ekrandaki bir butona dokunuldu
  | "hermes"     // sohbet (LLM'e sorulmus)
  | "voice"      // konusma
  | "share"      // Android paylas menusu
  | "agent"      // A2A peer (PC ajani vb.)
  | "sensor"     // cihaz olcumu
  | "automation" // kural motoru
  | "schedule";  // zamanlanmis

export interface IntentEnvelope {
  id: string;
  ts: number;
  source: IntentSource;
  /** Kullanicinin/kaynagin HAM ifadesi - "Spotify'da Mabel Matiz cal" */
  raw: string;
  /** Sistemin ne ANLADIGI. Deterministik yolda dogrudan, LLM yolunda modelden. */
  understood?: {
    type: string;
    payload?: Record<string, unknown>;
    /** Anlamayi KIM yapti - hata ayiklarken en kritik alan */
    by: "deterministic" | "llm" | "agent";
  };
  correlationId: string;
  taskId?: string;
  /** Zarf neden ilerlemedi? (anlasilamadi, capability yok, reddedildi...) */
  rejected?: string;
}

/** Yeni zarf uretir. Henuz ANLAMA yapilmamistir. */
export function createEnvelope(input: {
  source: IntentSource;
  raw: string;
  correlationId?: string;
}): IntentEnvelope {
  const id = randomUUID();
  return {
    id,
    ts: Date.now(),
    source: input.source,
    raw: String(input.raw ?? "").slice(0, 2000),
    correlationId: input.correlationId ?? id,
  };
}

/**
 * Zarfi journal'a yazan yardimci. `append` dispatcher/server tarafindan
 * verilir - bu modul journal'i dogrudan tanimaz (test edilebilir kalsin).
 */
export function makeEnvelopeRecorder(
  append: (e: Omit<FabricEvent, "seq" | "id" | "ts">) => FabricEvent,
  broadcast: (e: FabricEvent) => void,
) {
  const emit = (type: string, env: IntentEnvelope, extra?: Record<string, unknown>) => {
    const ev = append({
      type,
      correlationId: env.correlationId,
      causationId: null,
      payload: { ...env, ...extra },
      idempotencyKey: null,
    });
    broadcast(ev);
    return ev;
  };

  return {
    /** Giris alindi - HENUZ anlasilmadi. */
    received: (env: IntentEnvelope) => emit("intent.received", env),
    /** Ne anlasildi + kim anladi. */
    understood: (env: IntentEnvelope) => emit("intent.understood", env),
    /** Goreve baglandi. */
    dispatched: (env: IntentEnvelope) => emit("intent.dispatched", env),
    /** Ilerleyemedi ve NEDEN ilerleyemedigi. */
    rejected: (env: IntentEnvelope, reason: string) =>
      emit("intent.rejected", { ...env, rejected: reason }),
  };
}
