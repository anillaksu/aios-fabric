// AIOS Evidence Bus & Deterministic Observer Engine
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEDGER_PATH = resolve(__dirname, "evidence-ledger.jsonl");
const ANDROID_HOST = process.env.AIOS_ANDROID_URL || "http://100.75.177.88:9300";
const SOURCE_NODE = `win32-x64:${process.env.COMPUTERNAME || "DESKTOP"}`;

export function sha256(text) {
  return createHash("sha256").update(typeof text === "string" ? text : JSON.stringify(text)).digest("hex");
}

export function canonicalJson(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalJson).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}

export class EvidenceLedger {
  constructor(ledgerPath = LEDGER_PATH) {
    this.ledgerPath = ledgerPath;
  }

  getLatestWitnessHash() {
    if (!existsSync(this.ledgerPath)) return "GENESIS";
    try {
      const lines = readFileSync(this.ledgerPath, "utf8").trim().split("\n").filter(Boolean);
      if (lines.length === 0) return "GENESIS";
      const last = JSON.parse(lines[lines.length - 1]);
      return last.current_witness_hash || "GENESIS";
    } catch {
      return "GENESIS";
    }
  }

  append(eventData) {
    const previousHash = this.getLatestWitnessHash();
    const timestampUtc = new Date().toISOString();
    const observationId = "obs-" + sha256(`${timestampUtc}:${eventData.operation}:${Math.random()}`).slice(0, 16);

    const payloadToHash = {
      timestamp_utc: timestampUtc,
      observation_id: observationId,
      source_node: SOURCE_NODE,
      target_endpoint: eventData.target_endpoint || ANDROID_HOST,
      operation: eventData.operation,
      http_status: eventData.http_status,
      success: Boolean(eventData.success),
      response_digest: eventData.response_digest || sha256(canonicalJson(eventData.response_data || {})),
      previous_witness_hash: previousHash,
    };

    const currentWitnessHash = sha256(canonicalJson(payloadToHash));
    const fullRecord = {
      ...payloadToHash,
      current_witness_hash: currentWitnessHash,
      metadata: eventData.metadata || {},
    };

    appendFileSync(this.ledgerPath, JSON.stringify(fullRecord) + "\n", "utf8");
    return fullRecord;
  }

  getHistory(limit = 20) {
    if (!existsSync(this.ledgerPath)) return [];
    try {
      const lines = readFileSync(this.ledgerPath, "utf8").trim().split("\n").filter(Boolean);
      return lines.slice(-limit).map((l) => JSON.parse(l)).reverse();
    } catch {
      return [];
    }
  }

  verifyChain() {
    if (!existsSync(this.ledgerPath)) return { ok: true, events: 0, status: "EMPTY_LEDGER" };
    try {
      const lines = readFileSync(this.ledgerPath, "utf8").trim().split("\n").filter(Boolean);
      let expectedPrev = "GENESIS";
      for (let i = 0; i < lines.length; i++) {
        const item = JSON.parse(lines[i]);
        if (item.previous_witness_hash !== expectedPrev) {
          return { ok: false, error: `Chain break at line ${i + 1}`, expectedPrev, actualPrev: item.previous_witness_hash };
        }
        const { current_witness_hash, metadata, ...payload } = item;
        const computedHash = sha256(canonicalJson(payload));
        if (computedHash !== current_witness_hash) {
          return { ok: false, error: `Hash mismatch at line ${i + 1}`, computedHash, recordedHash: current_witness_hash };
        }
        expectedPrev = current_witness_hash;
      }
      return { ok: true, events: lines.length, status: "CHAIN_VALID", latestHash: expectedPrev };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export const defaultLedger = new EvidenceLedger();

// Safe Read-only Observers
export async function observeAgentCard(host = ANDROID_HOST, ledger = defaultLedger) {
  const url = `${host}/.well-known/agent-card.json`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    const digest = sha256(canonicalJson(data));
    const evidence = ledger.append({
      target_endpoint: host,
      operation: "agent_card",
      http_status: res.status,
      success: res.ok,
      response_digest: digest,
      metadata: { name: data?.name, version: data?.version, skills_count: Array.isArray(data?.skills) ? data.skills.length : 0 },
    });
    return { ok: res.ok, evidence, data };
  } catch (err) {
    const evidence = ledger.append({
      target_endpoint: host,
      operation: "agent_card",
      http_status: 0,
      success: false,
      response_digest: sha256(String(err)),
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    return { ok: false, evidence, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function observeRuntimeStatus(host = ANDROID_HOST, ledger = defaultLedger) {
  const url = `${host}/runtime-status`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    const digest = sha256(canonicalJson(data));
    const services = Array.isArray(data?.services) ? data.services : [];
    const watchdogService = services.find((s) => s.id === "watchdog");
    const evidence = ledger.append({
      target_endpoint: host,
      operation: "runtime_status",
      http_status: res.status,
      success: res.ok,
      response_digest: digest,
      metadata: {
        services_online: services.filter((s) => s.status === "online").map((s) => s.id),
        watchdog_status: watchdogService?.status || "unknown",
        watchdog_detail: watchdogService?.detail || "no-detail",
      },
    });
    return { ok: res.ok, evidence, data };
  } catch (err) {
    const evidence = ledger.append({
      target_endpoint: host,
      operation: "runtime_status",
      http_status: 0,
      success: false,
      response_digest: sha256(String(err)),
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    return { ok: false, evidence, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function observeCapabilities(host = ANDROID_HOST, ledger = defaultLedger) {
  const url = `${host}/capabilities`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    const digest = sha256(canonicalJson(data));
    const count = Array.isArray(data) ? data.length : 0;
    const evidence = ledger.append({
      target_endpoint: host,
      operation: "capabilities",
      http_status: res.status,
      success: res.ok,
      response_digest: digest,
      metadata: { count, safe_count: Array.isArray(data) ? data.filter((c) => c.risk === "safe").length : 0 },
    });
    return { ok: res.ok, evidence, data };
  } catch (err) {
    const evidence = ledger.append({
      target_endpoint: host,
      operation: "capabilities",
      http_status: 0,
      success: false,
      response_digest: sha256(String(err)),
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    return { ok: false, evidence, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function observeBattery(host = ANDROID_HOST, ledger = defaultLedger) {
  const url = `${host}/read`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ intent: "sensor.battery.read" }),
      signal: AbortSignal.timeout(6000),
    });
    const data = await res.json();
    const digest = sha256(canonicalJson(data));
    const bat = data?.data || {};
    const evidence = ledger.append({
      target_endpoint: host,
      operation: "read_battery",
      http_status: res.status,
      success: res.ok && data?.ok,
      response_digest: digest,
      metadata: {
        percentage: bat.percentage ?? bat.level,
        status: bat.status,
        temperature: bat.temperature,
        voltage: bat.voltage,
      },
    });
    return { ok: res.ok && data?.ok, evidence, data };
  } catch (err) {
    const evidence = ledger.append({
      target_endpoint: host,
      operation: "read_battery",
      http_status: 0,
      success: false,
      response_digest: sha256(String(err)),
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    return { ok: false, evidence, error: err instanceof Error ? err.message : String(err) };
  }
}
