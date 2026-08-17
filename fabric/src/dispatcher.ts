// Orchestration cekirdegi. Intent -> classify -> optimistic projection ->
// journal -> async execute -> reconciliation.
//
// Kullanici HICBIR ZAMAN burada bloklanmaz: dispatch() cagrisi, capability
// gercekten calismadan ONCE (optimistic event yazildiktan hemen sonra)
// donen bir Promise<{taskId}> dondurur. Gercek yurutme arka planda devam
// eder ve SSE uzerinden reconciliation event'i yayinlanir.

import { randomUUID } from "node:crypto";
import { Journal } from "./journal.ts";
import { reduce } from "./state.ts";
import { capabilityMap } from "./capabilities.ts";
import { UNDO } from "./undo.ts";
import { SseHub } from "./sse.ts";
import { isDebugTrajectoryEnabled } from "./debugtrajectory.ts";
import { logErr } from "./log.ts";
import type { FabricState, Intent, FabricEvent } from "./types.ts";

export class Dispatcher {
  private state: FabricState;
  private journal: Journal;
  private sse: SseHub;

  // IPTAL EDILENLER (2026-08-16'da eklendi).
  // DURUST SINIR: bir capability zaten calisiyorsa (orn. `script.run` bir
  // kabuk komutu baslatmissa) o komut kendi basina biter - Node'un execFile'i
  // disaridan kesilemiyor. Iptalin GERCEKTEN yaptigi sey: kalan denemeleri
  // engellemek, sonucu state'e islememek ve gorevi "cancelled" isaretlemek.
  // Yani kullanici asili bir isten kurtulur, ama yan etki geri alinmaz.
  private cancelled = new Set<string>();

  // Hassas geri-alma degerleri (orn. onceki pano icerigi) SADECE burada,
  // surec belleginde tutulur - journal a asla yazilmaz. Sunucu yeniden
  // baslarsa kaybolur ve o geri alma sunulmaz; bilincli takas.
  private sensitiveCaptures = new Map<string, unknown>();

  // Hassas capability CIKTILARI: journal a ozet duser, gercek deger burada.
  // Sinirli tutulur - bellek sizintisi olmasin.
  private liveResults = new Map<string, unknown>();

  // Hassas GIRDILER: journal a redakte yazilir, gercegi burada durur
  // (tekrar-dene ve geri-al bunu kullanir).
  private livePayloads = new Map<string, Record<string, unknown> | undefined>();

  /** Arayuzun bekledigi GERCEK sonuc (hassasa redakte edilmemis hali). */
  getLiveResult(taskId: string): unknown {
    return this.liveResults.has(taskId) ? this.liveResults.get(taskId) : undefined;
  }

  constructor(journal: Journal, initialState: FabricState, sse: SseHub) {
    this.journal = journal;
    this.sse = sse;
    this.state = initialState;
  }

  getState(): FabricState {
    return this.state;
  }

  private apply(eventInput: Omit<FabricEvent, "seq" | "id" | "ts">): FabricEvent {
    const event = this.journal.append(eventInput);
    this.state = reduce(this.state, event);
    this.sse.broadcast(event);
    return event;
  }

  /**
   * Bir intent'i kabul eder. Donen deger sadece taskId+durum - agent/model
   * sonucunu BEKLEMEZ. Idempotency: ayni idempotencyKey ile tekrar
   * cagrilirsa mevcut task'in id'sini dondurur, yeniden calistirmaz.
   */
  async dispatch(intent: Intent): Promise<{ taskId: string; class: string; deduped: boolean }> {
    if (intent.idempotencyKey) {
      const existing = this.journal.findByIdempotencyKey(intent.idempotencyKey);
      if (existing) {
        const p = existing.payload as { taskId?: string };
        if (p?.taskId) {
          return { taskId: p.taskId, class: "unknown", deduped: true };
        }
      }
    }

    const capability = capabilityMap.get(intent.type);
    const cls = capability?.class ?? "AGENT"; // taninmayan tip -> AGENT plane'e delege edilir
    const taskId = randomUUID();
    const correlationId = intent.correlationId ?? taskId;

    // GIRDI REDAKSIYONU: hassas alanlar journal'a "N karakter" olarak yazilir.
    // Gercek payload YALNIZCA yurutmeye ve bellege gider - "tekrar dene" onu
    // buradan okur, yoksa redakte edilmis veriyle calistirmaya kalkardi.
    //
    // SIGORTALI ISTISNA (2026-08-18, owner istegi): debug-trajectory anahtari
    // acikken redaksiyon ATLANIR, ham prompt/yanit/mesaj journal'a duz yazilir.
    // Anahtar yalnizca /debug-trajectory HTTP ucundan (insan) degistirilebilir -
    // capabilityMap'te YOK, LLM/A2A/MCP kendi karariyla acamaz.
    const journaledPayload = isDebugTrajectoryEnabled()
      ? intent.payload
      : redactFields(intent.payload, capability?.sensitiveFields);
    if (capability?.sensitiveFields?.length) {
      this.livePayloads.set(taskId, intent.payload);
      if (this.livePayloads.size > 50) {
        const oldest = this.livePayloads.keys().next().value;
        if (oldest) this.livePayloads.delete(oldest);
      }
    }

    const createdEvent = this.apply({
      type: "task.created",
      correlationId,
      causationId: intent.causationId ?? null,
      payload: { taskId, type: intent.type, class: cls, payload: journaledPayload, origin: intent.origin },
      idempotencyKey: intent.idempotencyKey ?? null,
    });

    // ─── RISK KAPISI (2026-08-17, W1.3) ───
    // Belirtilmemis risk de "ask" sayilir - kanitlanmadikca en kisitli.
    // Bugun (AETHER onay kuyrusu baglanana kadar) "ask" calisma zamaninda
    // KOSULSUZ reddedilir; sessizce izin verilmez, ama denenen is task.created
    // ile gorunur kalir (denetim izi kaybolmaz). UI/otomasyon/retry/undo hepsi
    // BURADAN gectigi icin kapi tek yerden ve merkezi.
    const risk = capability?.risk ?? "ask";
    if (risk === "ask") {
      this.apply({
        type: "task.failed",
        correlationId,
        causationId: null,
        payload: {
          taskId,
          error: `"${intent.type}" onay gerektirir (risk: ask) - onay kuyrugu henuz baglanmadi, is calistirilmadi`,
        },
        idempotencyKey: null,
      });
      return { taskId, class: cls, deduped: false };
    }

    // --- IYIMSER PROJEKSIYON: kullanici BEKLEMEDEN once state degisir ---
    this.applyOptimisticProjection(intent, taskId, correlationId, createdEvent.id);

    // --- Gercek yurutme ARKA PLANDA (await edilmiyor - dispatch() hemen doner) ---
    // 2026-08-17 DUZELTMESI: sinifa gore degil, executor'un VAR OLUP OLMADIGINA
    // gore dallan. Onceden "cls === AGENT" gorunce capability.execute() HIC
    // cagrilmadan placeholder'a dusuyordu - a2a.delegate gibi calisan bir
    // AGENT capability'si dahi hicbir zaman yurutulmuyordu. Placeholder artik
    // yalnizca GERCEKTEN karsiligi olmayan (taninmayan) intent tipleri icin.
    if (capability) {
      void this.executeCapability(taskId, correlationId, intent, capability);
    } else {
      void this.executeViaAgentPlaceholder(taskId, correlationId, intent);
    }

    return { taskId, class: cls, deduped: false };
  }

  /** Calisan/bekleyen bir gorevi iptal eder. Bkz. `cancelled` alanindaki sinir notu. */
  cancel(taskId: string): { ok: boolean; error?: string } {
    const task = this.state.tasks[taskId];
    if (!task) return { ok: false, error: "gorev bulunamadi" };
    if (!["pending", "optimistic", "running"].includes(task.status)) {
      return { ok: false, error: `gorev zaten ${task.status}` };
    }
    this.cancelled.add(taskId);
    this.apply({
      type: "task.cancelled",
      correlationId: task.correlationId,
      causationId: null,
      payload: { taskId },
      idempotencyKey: null,
    });
    return { ok: true };
  }

  /** Basarisiz/iptal edilmis bir gorevi AYNI payload ile yeniden calistirir. */
  async retry(taskId: string): Promise<{ ok: boolean; taskId?: string; error?: string }> {
    const task = this.state.tasks[taskId];
    if (!task) return { ok: false, error: "gorev bulunamadi" };
    if (["pending", "optimistic", "running"].includes(task.status)) {
      return { ok: false, error: "gorev hala calisiyor" };
    }
    // Yeni bir task uretilir; eskisi gecmiste oldugu gibi kalir (journal
    // degistirilemez). correlationId paylasilir ki ikisi ayni ise ait olsun.
    //
    // 2026-08-17 DENETIMI: `origin` gecirilmiyordu. Sonuc: yeniden denenen is
    // AKTİF sekmesinde HEDEF'ini ve kaynagini kaybediyor, "ekrandan dokundugun
    // icin" yerine "sistem ici" yaziyordu - yani "ne/neden" dili tam da en cok
    // lazim oldugu yerde (basarisiz isi tekrar denerken) bosaliyordu.
    // Redakte edilmis payload la calistirmayalim: gercegi bellekten al.
    const realPayload = this.livePayloads.has(taskId) ? this.livePayloads.get(taskId) : task.payload;
    const r = await this.dispatch({
      type: task.type,
      payload: realPayload,
      correlationId: task.correlationId,
      origin: {
        source: task.source ?? "ui",
        raw: task.goal ?? task.type,
        by: task.interpretedBy ?? "deterministic",
        envelopeId: "retry:" + taskId,
      },
    } as Intent);
    return { ok: true, taskId: r.taskId };
  }

  /**
   * Tamamlanmis bir isi GERI ALIR: defterden ters intent'i uretip yeni bir
   * gorev olarak calistirir. Journal degistirilmez - geri alma da bir olaydir.
   */
  async undo(taskId: string): Promise<{ ok: boolean; taskId?: string; error?: string }> {
    const task = this.state.tasks[taskId];
    if (!task) return { ok: false, error: "gorev bulunamadi" };
    if (task.status !== "completed") return { ok: false, error: "yalnizca tamamlanmis isler geri alinabilir" };
    const spec = UNDO[task.type];
    if (!spec) return { ok: false, error: `"${task.type}" geri alinabilir degil` };

    // Hassas deger journal da degil, bellekte. Yoksa (yeniden baslatma sonrasi)
    // geri alma yapilamaz ve bunu acikca soyluyoruz.
    const captured = spec.sensitive ? this.sensitiveCaptures.get(taskId) : task.undoCaptured;
    if (spec.sensitive && captured === undefined) {
      return { ok: false, error: "onceki deger artik bellekte yok (sunucu yeniden baslamis) - geri alinamiyor" };
    }
    const undoPayload = this.livePayloads.has(taskId) ? this.livePayloads.get(taskId) : task.payload;
    const inverse = spec.invert(undoPayload, captured);
    if (!inverse) return { ok: false, error: "onceki durum bilinmedigi icin geri alinamiyor" };

    const r = await this.dispatch({
      type: inverse.type,
      payload: inverse.payload,
      correlationId: task.correlationId,
      origin: {
        source: "ui",
        raw: `geri al: ${task.goal || task.type}`,
        by: "deterministic",
        envelopeId: "undo:" + taskId,
      },
    } as Intent);
    return { ok: true, taskId: r.taskId };
  }

  private applyOptimisticProjection(
    intent: Intent,
    taskId: string,
    correlationId: string,
    causationId: string,
  ) {
    // Genel "optimistic" isaretleme
    this.apply({
      type: "task.optimistic",
      correlationId,
      causationId,
      payload: { taskId },
      idempotencyKey: null,
    });

    // Capability-ozel iyimser projeksiyonlar (UI'nin GERCEKTEN anlik
    // degismesi gereken alanlar icin ozel event'ler).
    switch (intent.type) {
      case "app.freeze": {
        this.apply({
          type: "app.freeze.optimistic",
          correlationId,
          causationId,
          payload: { pkg: intent.payload?.pkg },
          idempotencyKey: null,
        });
        break;
      }
      case "app.unfreeze": {
        this.apply({
          type: "app.unfreeze.optimistic",
          correlationId,
          causationId,
          payload: { pkg: intent.payload?.pkg },
          idempotencyKey: null,
        });
        break;
      }
    }
  }

  private async executeCapability(
    taskId: string,
    correlationId: string,
    intent: Intent,
    capability: NonNullable<ReturnType<typeof capabilityMap.get>>,
  ) {
    const maxRetries = capability.maxRetries ?? 0;
    let attempt = 0;
    let lastError = "";

    while (attempt <= maxRetries) {
      // Iptal edildiyse yeni deneme BASLATMA.
      if (this.cancelled.has(taskId)) {
        this.cancelled.delete(taskId);
        return;
      }
      // GERI ALMA ICIN ONCEKI DURUMU YAKALA (yalnizca ilk denemede ve
      // yalnizca defterde tanimliysa). Eylem calistiktan SONRA onceki
      // deger okunamayacagi icin bu tam olarak burada yapilmali.
      if (attempt === 0 && UNDO[intent.type]?.capture) {
        try {
          const captured = await UNDO[intent.type].capture!(
            intent.payload,
            (t, p) => capabilityMap.get(t)!.execute(p),
          );
          // HASSAS yakalamalar journal'a YAZILMAZ - yalnizca bellekte durur.
          // (Pano icerigi parola/2FA tasiyabilir; journal diske yazilan,
          // budanmayan kalici bir dosya. Bkz. undo.ts'teki `sensitive` notu.)
          if (UNDO[intent.type].sensitive) {
            this.sensitiveCaptures.set(taskId, captured);
            this.apply({
              type: "task.undoable",
              correlationId,
              causationId: null,
              payload: { taskId, captured: null, sensitive: true, undoLabel: UNDO[intent.type].label },
              idempotencyKey: null,
            });
          } else {
            this.apply({
              type: "task.undoable",
              correlationId,
              causationId: null,
              payload: { taskId, captured, undoLabel: UNDO[intent.type].label },
              idempotencyKey: null,
            });
          }
        } catch (err) { logErr("dispatcher:undoCapture:" + intent.type, err); /* geri alma sunulmaz, is devam eder */ }
      } else if (attempt === 0 && UNDO[intent.type]) {
        this.apply({
          type: "task.undoable",
          correlationId,
          causationId: null,
          payload: { taskId, captured: null, undoLabel: UNDO[intent.type].label },
          idempotencyKey: null,
        });
      }

      attempt++;
      this.apply({
        type: "task.running",
        correlationId,
        causationId: null,
        payload: { taskId, attempt, stage: attempt > 1 ? "yeniden deniyor" : "calisiyor" },
        idempotencyKey: null,
      });

      const result = await capability.execute(intent.payload);

      // Calisirken iptal edilmis olabilir: sonucu state'e ISLEME, yoksa
      // kullanicinin iptal ettigi is "tamamlandi" diye geri gelir.
      if (this.cancelled.has(taskId)) {
        this.cancelled.delete(taskId);
        return;
      }

      if (result.ok) {
        // ─── HASSAS CIKTI REDAKSIYONU (2026-08-17 denetimi) ───
        // task.completed sonucu OLDUGU GIBI journal'a yaziyordu. Arayuz
        // eylemleri zarfa alininca (yani dispatcher'dan gecmeye baslayinca)
        // bu, pano icerigini / ses dokumunu / kabuk ciktisini diske KALICI
        // yazmak anlamina geldi - journal append-only ve budanmiyor.
        // Artik hassas sonuclar journal'a OZET olarak duser; gercek deger
        // bellekte kalir ve arayuze oradan verilir.
        const redactResult = capability.sensitiveResult && !isDebugTrajectoryEnabled();
        const journaled = redactResult ? redact(result.data) : result.data;
        if (capability.sensitiveResult) {
          this.liveResults.set(taskId, result.data);
          // Bellekte sinirsiz birikmesin: en eski kayitlari at.
          if (this.liveResults.size > 50) {
            const oldest = this.liveResults.keys().next().value;
            if (oldest) this.liveResults.delete(oldest);
          }
        }

        this.apply({
          type: "task.completed",
          correlationId,
          causationId: null,
          payload: { taskId, result: journaled },
          idempotencyKey: null,
        });
        this.reconcile(intent, taskId, correlationId, result.data);
        return;
      }
      lastError = result.error ?? "bilinmeyen hata";
      if (attempt <= maxRetries) {
        await sleep(300 * attempt); // basit lineer backoff
      }
    }

    this.apply({
      type: "task.failed",
      correlationId,
      causationId: null,
      payload: { taskId, error: lastError },
      idempotencyKey: null,
    });
    this.reconcileFailure(intent, taskId, correlationId, lastError);
  }

  /** Gercek sonuc geldiginde iyimser tahmini duzeltir (reconciliation). */
  private reconcile(intent: Intent, taskId: string, correlationId: string, data: unknown) {
    switch (intent.type) {
      case "app.freeze": {
        this.apply({
          type: "app.freeze.confirmed",
          correlationId,
          causationId: null,
          payload: { pkg: intent.payload?.pkg, ok: true },
          idempotencyKey: null,
        });
        break;
      }
      case "app.unfreeze": {
        this.apply({
          type: "app.unfreeze.confirmed",
          correlationId,
          causationId: null,
          payload: { pkg: intent.payload?.pkg, ok: true },
          idempotencyKey: null,
        });
        break;
      }
      case "sensor.battery.read":
      case "sensor.location.read": {
        this.apply({
          type: "sensor.read.confirmed",
          correlationId,
          causationId: null,
          payload: { key: intent.type, value: data },
          idempotencyKey: null,
        });
        break;
      }
    }
  }

  private reconcileFailure(intent: Intent, taskId: string, correlationId: string, error: string) {
    // Iyimser tahmin yanlis ciktiysa geri al.
    if (intent.type === "app.freeze") {
      this.apply({
        type: "app.freeze.confirmed",
        correlationId,
        causationId: null,
        payload: { pkg: intent.payload?.pkg, ok: false },
        idempotencyKey: null,
      });
    }
    if (intent.type === "app.unfreeze") {
      this.apply({
        type: "app.unfreeze.confirmed",
        correlationId,
        causationId: null,
        payload: { pkg: intent.payload?.pkg, ok: false },
        idempotencyKey: null,
      });
    }
  }

  private async executeViaAgentPlaceholder(taskId: string, correlationId: string, intent: Intent) {
    this.apply({
      type: "task.failed",
      correlationId,
      causationId: null,
      payload: {
        taskId,
        error: `"${intent.type}" icin yerel capability yok. A2A peer'a delege etmek icin POST /a2a/delegate kullanin.`,
      },
      idempotencyKey: null,
    });
  }
}

/**
 * Hassas bir sonucu journal a yazilabilir OZETE cevirir. Degerin KENDISI
 * hicbir zaman diske gitmez; yalnizca "ne kadar sey vardi" bilgisi kalir ki
 * AKTİF sekmesi ve DevTools bos gorunmesin.
 */
/** Payload icindeki adi gecen alanlari "N karakter" ile degistirir. */
function redactFields(
  payload: Record<string, unknown> | undefined,
  fields: string[] | undefined,
): Record<string, unknown> | undefined {
  if (!payload || !fields || !fields.length) return payload;
  const out: Record<string, unknown> = { ...payload };
  for (const f of fields) {
    if (!(f in out)) continue;
    const v = out[f];
    out[f] = typeof v === "string" ? v.length + " karakter"
           : Array.isArray(v) ? v.length + " kayit"
           : v == null ? v : "…";
  }
  return out;
}

function redact(data: unknown): unknown {
  if (data == null) return { redacted: true };
  if (typeof data === "string") return { redacted: true, chars: data.length };
  if (typeof data === "object") {
    const out: Record<string, unknown> = { redacted: true };
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      out[k] = typeof v === "string" ? v.length + " karakter"
             : typeof v === "number" || typeof v === "boolean" ? v
             : "…";
    }
    return out;
  }
  return { redacted: true };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
