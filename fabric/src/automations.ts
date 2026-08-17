// Otomasyon kural motoru:  OLAY -> KOSUL -> EYLEM
//
// NEDEN SIMDI YAZILABILDI: iki ucu da zaten vardi ve calisiyordu -
//   · olay kaynagi : journal (her sey buraya duser, SseHub'dan yayilir)
//   · eylem tarafi : dispatcher + capability kayit defteri
// Eksik olan tek parca, kurallari saklayip olaylari dinleyen bu katmandi.
//
// TASARIM SINIRI (bilerek dar tutuldu): kurallar TEK olay tipine bakar ve
// istege bagli TEK bir sayisal esik kontrolu yapar. Genel bir ifade dili
// (JS eval, JSONLogic vb.) KASITLI OLARAK YOK - kullanicinin cihazinda
// keyfi kod calistiran bir kural deposu, bu sistemdeki en kolay ayak
// kaydirma noktasi olurdu. Yetmedigi yerde yeni bir capability yazmak
// dogru cozum.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { FabricEvent } from "./types.ts";
import { logErr } from "./log.ts";

const STORE = (process.env.HOME ?? "/data/data/com.termux/files/home") + "/fabric-automations.json";

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  /** Tetikleyen olay tipi, orn "read.failed", "task.failed", "sensor.read.confirmed" */
  when: string;
  /** Istege bagli esik: payload icindeki sayisal bir alani karsilastirir. */
  condition?: { path: string; op: "<" | ">" | "==" | "!="; value: number | string };
  /** Calistirilacak capability. */
  then: { type: string; payload?: Record<string, unknown> };
  /** Ayni kural en fazla bu sıklıkla calisir (ms). Varsayilan 60sn. */
  cooldownMs?: number;
  lastRunAt?: number;
  runCount?: number;
}

function load(): AutomationRule[] {
  try {
    if (!existsSync(STORE)) return [];
    const raw = JSON.parse(readFileSync(STORE, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch (err) {
    logErr("automations:load", err);
    return [];
  }
}

function save(rules: AutomationRule[]) {
  // Kullanicinin otomasyon kurallari - sessiz yazma hatasi demek "kullanici
  // kural ekledi sandi ama kaybetti" demek, kucumsenecek bir sey degil.
  try { writeFileSync(STORE, JSON.stringify(rules, null, 2)); } catch (err) { logErr("automations:save", err); }
}

let rules: AutomationRule[] = load();

export function listRules(): AutomationRule[] {
  return rules;
}

export function addRule(input: Partial<AutomationRule>): { ok: boolean; rule?: AutomationRule; error?: string } {
  if (!input.when || typeof input.when !== "string") return { ok: false, error: "when (olay tipi) gerekli" };
  if (!input.then || typeof input.then.type !== "string") return { ok: false, error: "then.type (capability) gerekli" };
  const rule: AutomationRule = {
    id: randomUUID(),
    name: String(input.name || `${input.when} → ${input.then.type}`),
    enabled: input.enabled !== false,
    when: input.when,
    condition: input.condition,
    then: { type: input.then.type, payload: input.then.payload ?? {} },
    cooldownMs: Number(input.cooldownMs ?? 60000),
    runCount: 0,
  };
  rules = [...rules, rule];
  save(rules);
  return { ok: true, rule };
}

export function removeRule(id: string): { ok: boolean; error?: string } {
  const before = rules.length;
  rules = rules.filter((r) => r.id !== id);
  if (rules.length === before) return { ok: false, error: "kural bulunamadi" };
  save(rules);
  return { ok: true };
}

export function toggleRule(id: string, enabled: boolean): { ok: boolean; error?: string } {
  const r = rules.find((x) => x.id === id);
  if (!r) return { ok: false, error: "kural bulunamadi" };
  r.enabled = enabled;
  save(rules);
  return { ok: true };
}

/** payload icinde "a.b.c" yolunu okur. */
function pick(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object" && k in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[k];
    }
    return undefined;
  }, obj);
}

function conditionHolds(rule: AutomationRule, event: FabricEvent): boolean {
  const c = rule.condition;
  if (!c) return true;
  const actual = pick(event.payload, c.path);
  if (actual === undefined) return false;
  const a = typeof actual === "string" && typeof c.value === "number" ? Number(actual) : actual;
  switch (c.op) {
    case "<":  return Number(a) < Number(c.value);
    case ">":  return Number(a) > Number(c.value);
    case "==": return String(a) === String(c.value);
    case "!=": return String(a) !== String(c.value);
    default:   return false;
  }
}

// ─── ZINCIR DERINLIGI KESICISI (2026-08-17, W1.4 / denetim #2) ───
// Cooldown, ayni kuralin en fazla 60sn'de bir calismasini garanti eder ama
// A -> capability -> event -> B -> capability -> event -> A gibi bir CAPRAZ
// dongu kurmayi ENGELLEMEZ - yalnizca yavaslatir (60sn'de bir dönen sonsuz
// döngü). Derinlik, dispatcher.ts'in her intent icin oldugu gibi TASIDIGI
// correlationId'ye kodlanir: bir otomasyonun tetikledigi is
// "automation-chain:<derinlik>:<uuid>" correlationId'siyle gonderilir;
// dispatcher bu id'yi task.created/completed/failed olaylarina AYNEN
// tasir, o yuzden zincirdeki bir sonraki olay derinligini buradan okuyabiliriz.
const MAX_CHAIN_DEPTH = 3;

function chainDepth(correlationId: string): number {
  const m = /^automation-chain:(\d+):/.exec(correlationId);
  return m ? Number(m[1]) : 0;
}

/**
 * Olay dinleyicisi. `run` = bir intent'i calistiran fonksiyon (dispatcher).
 *
 * SONSUZ DONGU KORUMASI: otomasyonun tetikledigi is de journal'a event
 * yazar; onlemezsek kural kendi sonucuyla yeniden tetiklenip cihazi kilitler.
 * Uc katman: (1) `automation.*` event'leri hicbir kurali tetiklemez,
 * (2) her kuralin cooldown'u var (varsayilan 60sn), (3) zincir derinligi
 * MAX_CHAIN_DEPTH'i asarsa (farkli kurallar CAPRAZ tetiklese bile) kesilir.
 */
export function makeAutomationListener(
  run: (type: string, payload: Record<string, unknown> | undefined, ruleName: string, depth: number) => void,
  log: (type: string, payload: Record<string, unknown>) => void,
) {
  return (event: FabricEvent) => {
    if (event.type.startsWith("automation.")) return;
    if (!rules.length) return;

    const depth = chainDepth(event.correlationId);
    const now = Date.now();
    for (const rule of rules) {
      if (!rule.enabled || rule.when !== event.type) continue;
      const cooldown = rule.cooldownMs ?? 60000;
      if (rule.lastRunAt && now - rule.lastRunAt < cooldown) continue;
      if (!conditionHolds(rule, event)) continue;
      if (depth >= MAX_CHAIN_DEPTH) {
        log("automation.chain_capped", { ruleId: rule.id, name: rule.name, trigger: event.type, depth });
        continue;
      }

      rule.lastRunAt = now;
      rule.runCount = (rule.runCount ?? 0) + 1;
      save(rules);
      log("automation.fired", { ruleId: rule.id, name: rule.name, trigger: event.type, then: rule.then.type, depth: depth + 1 });
      try {
        run(rule.then.type, rule.then.payload, rule.name, depth + 1);
      } catch (err) {
        log("automation.failed", { ruleId: rule.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  };
}
