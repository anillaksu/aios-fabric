// Deterministik reducer'lar: (state, event) -> yeni state.
// SAF fonksiyonlar - hicbir yan etki (network/disk) yok. Bu sayede journal'i
// bastan oynatarak (replay) her zaman ayni state'e ulasilabilir (crash
// recovery'nin temeli budur).

import type { FabricEvent, FabricState, TaskRecord } from "./types.ts";

const MAX_RECENT_EVENTS = 100;

export function initialState(): FabricState {
  return {
    tasks: {},
    apps: {},
    sensors: {},
    recentEvents: [],
    approvals: {},
  };
}

function pushRecent(state: FabricState, event: FabricEvent): FabricEvent[] {
  const next = [...state.recentEvents, event];
  if (next.length > MAX_RECENT_EVENTS) next.shift();
  return next;
}

function upsertTask(state: FabricState, id: string, patch: Partial<TaskRecord>): FabricState {
  const existing = state.tasks[id];
  if (!existing) return state; // reconcile edilecek task yoksa sessizce yok say
  return {
    ...state,
    tasks: {
      ...state.tasks,
      [id]: { ...existing, ...patch, updatedAt: Date.now() },
    },
  };
}

/**
 * Ana reducer. event.type'a gore state'i gunceller. Bilinmeyen event
 * tipleri sadece recentEvents'e eklenir (log), state'i etkilemez -
 * ileride yeni event tipleri eklemek eski journal'i BOZMAZ.
 */
export function reduce(state: FabricState, event: FabricEvent): FabricState {
  let next = state;

  switch (event.type) {
    case "task.created": {
      const p = event.payload as {
        taskId: string;
        type: string;
        class: TaskRecord["class"];
        payload?: Record<string, unknown>;
        origin?: { source: string; raw: string; by: string };
      };
      next = {
        ...next,
        tasks: {
          ...next.tasks,
          [p.taskId]: {
            id: p.taskId,
            correlationId: event.correlationId,
            class: p.class,
            type: p.type,
            payload: p.payload,
            status: "pending",
            // Zarftan gelen baglam - AKTIF sekmesi bunlari gosterir.
            goal: p.origin?.raw,
            source: p.origin?.source,
            interpretedBy: p.origin?.by,
            stage: "kabul edildi",
            createdAt: event.ts,
            updatedAt: event.ts,
            attempts: 0,
          },
        },
      };
      break;
    }

    case "task.optimistic": {
      const p = event.payload as { taskId: string };
      next = upsertTask(next, p.taskId, { status: "optimistic" });
      break;
    }

    case "task.running": {
      const p = event.payload as { taskId: string; attempt: number; stage?: string };
      next = upsertTask(next, p.taskId, { status: "running", attempts: p.attempt, stage: p.stage ?? "calisiyor" });
      break;
    }

    case "task.completed": {
      const p = event.payload as { taskId: string; result: unknown };
      next = upsertTask(next, p.taskId, { status: "completed", result: p.result, stage: "bitti" });
      break;
    }

    case "task.failed": {
      const p = event.payload as { taskId: string; error: string };
      next = upsertTask(next, p.taskId, { status: "failed", error: p.error, stage: "bitti" });
      break;
    }

    case "task.undoable": {
      const p = event.payload as { taskId: string; captured: unknown; undoLabel: string };
      next = upsertTask(next, p.taskId, { undoCaptured: p.captured, undoLabel: p.undoLabel });
      break;
    }

    case "task.cancelled": {
      const p = event.payload as { taskId: string };
      next = upsertTask(next, p.taskId, { status: "cancelled", error: "kullanici iptal etti" });
      break;
    }

    case "task.interrupted": {
      const p = event.payload as { taskId: string };
      next = upsertTask(next, p.taskId, { status: "interrupted", error: "crash-recovery: yarim kaldi" });
      break;
    }

    // --- capability-ozel projeksiyonlar ---

    case "app.freeze.optimistic": {
      const p = event.payload as { pkg: string };
      next = { ...next, apps: { ...next.apps, [p.pkg]: { frozen: true, lastAction: "freeze" } } };
      break;
    }
    case "app.freeze.confirmed": {
      const p = event.payload as { pkg: string; ok: boolean };
      next = {
        ...next,
        apps: { ...next.apps, [p.pkg]: { frozen: p.ok, lastAction: "freeze" } },
      };
      break;
    }
    case "app.unfreeze.optimistic": {
      const p = event.payload as { pkg: string };
      next = { ...next, apps: { ...next.apps, [p.pkg]: { frozen: false, lastAction: "unfreeze" } } };
      break;
    }
    case "app.unfreeze.confirmed": {
      const p = event.payload as { pkg: string; ok: boolean };
      next = {
        ...next,
        apps: { ...next.apps, [p.pkg]: { frozen: !p.ok, lastAction: "unfreeze" } },
      };
      break;
    }

    case "sensor.read.confirmed": {
      const p = event.payload as { key: string; value: unknown };
      next = { ...next, sensors: { ...next.sensors, [p.key]: p.value } };
      break;
    }

    // --- B-13: onay yasam dongusu (yalnizca dispatcher.grantApproval/
    // denyApproval/revokeApproval bu event'leri yazar - approval.grant/deny
    // capabilityMap'te YOK, MCP/A2A/otomasyon tools/call ile asla erisemez) ---
    case "approval.granted": {
      const p = event.payload as { capability: string; expiresAt?: number };
      next = {
        ...next,
        approvals: {
          ...next.approvals,
          [p.capability]: { capability: p.capability, status: "granted", decidedAt: event.ts, expiresAt: p.expiresAt },
        },
      };
      break;
    }
    case "approval.denied": {
      const p = event.payload as { capability: string };
      next = {
        ...next,
        approvals: {
          ...next.approvals,
          [p.capability]: { capability: p.capability, status: "denied", decidedAt: event.ts },
        },
      };
      break;
    }
    case "approval.revoked": {
      const p = event.payload as { capability: string };
      next = {
        ...next,
        approvals: {
          ...next.approvals,
          [p.capability]: { capability: p.capability, status: "revoked", decidedAt: event.ts },
        },
      };
      break;
    }

    default:
      // Bilinmeyen event - state degismez, sadece log'a duser.
      break;
  }

  return { ...next, recentEvents: pushRecent(next, event) };
}

/** Journal'daki tum event'leri bastan oynatarak state'i yeniden insa eder. */
export function replayToState(events: FabricEvent[]): FabricState {
  let state = initialState();
  for (const ev of events) state = reduce(state, ev);
  return state;
}

/**
 * Crash recovery: replay sonrasi hala "pending"/"optimistic"/"running"
 * durumunda kalmis task'lar var demektir ki - process onlar tamamlanmadan
 * once olmus. Bu task'lari guvenle "interrupted" isaretleriz (yan etkili
 * bir islemi korden yeniden calistirmak tehlikeli olabilir - kullanici/
 * cagiran taraf yeniden denemeli).
 */
export function markInterrupted(state: FabricState): { state: FabricState; interruptedIds: string[] } {
  const interruptedIds: string[] = [];
  let next = state;
  for (const task of Object.values(state.tasks)) {
    if (task.status === "pending" || task.status === "optimistic" || task.status === "running") {
      interruptedIds.push(task.id);
      next = upsertTask(next, task.id, { status: "interrupted", error: "crash-recovery: yarim kaldi" });
    }
  }
  return { state: next, interruptedIds };
}
