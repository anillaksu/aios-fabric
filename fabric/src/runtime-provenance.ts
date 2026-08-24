// Runtime Ledger -> Formation Memory koprusu.
//
// Bu modul execution yapmaz ve watchdog degildir. Dispatcher'in zaten
// tamamladigi bir task icin, dogrulanmis Ledger checkpoint'ini immutable
// provenance edge'e cevirir. Ledger veya exact parent belirsizse fail-closed
// kalir; task sonucu sonradan "derived" diye uydurulmaz.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import {
  createRuntimeProvenanceEdge,
  createRuntimeWitness,
  joinRuntimeProvenance,
  verifyFormation,
  verifyRuntimeProvenanceEdge,
} from "../public/js/formation-memory.js";

export type RuntimeLedgerEvent = {
  timestamp: string;
  reason: string;
  role: string;
  status: string;
  pid: string;
  start: string;
  commandHash: string;
  sourceHash: string;
  processWitness: string;
  previousHash: string;
  eventHash: string;
};

type CompletionEvidence = {
  type: "task.completed";
  taskId: string;
  correlationId: string;
  capability: string;
  result: unknown;
  formationId?: string;
};

const HASH = /^[0-9a-f]{64}$/;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const hashId = (value: string) => `sha256:${value}`;

/** TSV satirinin shell ile AYNI canonical payload'unu kurar. */
function eventPayload(event: RuntimeLedgerEvent) {
  return [
    event.timestamp, event.reason, event.role, event.status, event.pid, event.start,
    event.commandHash, event.sourceHash, event.processWitness, event.previousHash,
  ].join("|");
}

/**
 * Ledger'i fail-closed dogrular: GENESIS + exact previous event hash + kendi
 * event hash. Tek tek satir hash'i dogru olsa bile aradan satir silinmis ya
 * da sirasi degismisse bu fonksiyon reddeder.
 */
export function verifyRuntimeLedgerText(text: string): RuntimeLedgerEvent[] {
  const rows = String(text || "").split(/\r?\n/).filter(Boolean);
  if (!rows.length) throw new TypeError("runtime ledger bos");
  let expectedPrevious = "GENESIS";
  const out: RuntimeLedgerEvent[] = [];
  for (const [index, row] of rows.entries()) {
    const columns = row.split("\t");
    if (columns.length !== 11) throw new TypeError(`runtime ledger gecersiz sutun: ${index + 1}`);
    const [timestamp, reason, role, status, pid, start, commandHash, sourceHash, processWitness, previousHash, eventHash] = columns;
    // Yazicinin (scripts/aios-runtime-ledger.sh:process_witness) sozlesmesi:
    // surec bulunursa pid/start/commandHash/sourceHash/processWitness
    // alanlarinin BESINI birden gercek deger, bulunamazsa BESINI birden '-'
    // yazar (erken donus). Arada bir hal URETMEZ. Okuyucu bu esligi
    // dogrudan pid'den okur - status ETIKETINDEN degil.
    //
    // 2026-08-24 DUZELTMESI (PG-022 ikinci tur, canli olcumle bulundu).
    // Onceki hal gevsemeyi status === "missing" etiketine bagliyordu. Ama
    // yazicinin status'u bir DEGISIM etiketidir, canlilik etiketi degil:
    //     status="stable"
    //     if [ "$pid" = '-' ]; then
    //         [ -n "$old_pid" ] && [ "$old_pid" != '-' ] && status="missing"
    // Surec yok VE onceden de yoksa "degisiklik" olmadigi icin status
    // "stable" KALIR, alanlar yine '-' olur. Bu tamamen gecerli bir "surec
    // yok" satiridir ve etiket-tabanli gevseme onu reddediyordu.
    //
    // CANLI ETKI: telefondaki 323 satirlik ledger'da bu kalipta 6 satir
    // olustu (hepsi role=sshd; ilki satir 230, 2026-08-22T20:13:17Z). Dosyanin
    // tamami once dogrulandigi icin satir 230'dan sonraki 94 satir
    // reddediliyordu; o tarihten sonra HICBIR yeni provenance edge
    // yazilamadi (en yeni edge 2026-08-20T05:29:24Z'de donmustu).
    //
    // pid'e bakmak ayrica ters yondeki bir acigi da kapatir: eskiden
    // status="missing" yazan ama GERCEK bir pid tasiyan satirda hash'ler '-'
    // birakilabiliyordu (yazicinin hicbir kod yolunda uretmedigi bozuk kayit).
    // Artik eslik iki yonlu zorunlu. Zincir/event-hash dogrulamasi HIC
    // degismedi ve checkpointFrom() surec-yok satirini sourceHash === '-'
    // kapisiyla zaten witness adayi saymiyor.
    const processAbsent = pid === "-";
    const processHash = (value: string) => (processAbsent ? value === "-" : HASH.test(value));
    if (!timestamp || !reason || !role || !status || !pid || !start || !processHash(commandHash)
      || (sourceHash !== "-" && !HASH.test(sourceHash)) || !processHash(processWitness)
      || (previousHash !== "GENESIS" && !HASH.test(previousHash)) || !HASH.test(eventHash)) {
      throw new TypeError(`runtime ledger gecersiz alan: ${index + 1}`);
    }
    const event: RuntimeLedgerEvent = { timestamp, reason, role, status, pid, start, commandHash, sourceHash, processWitness, previousHash, eventHash };
    if (event.previousHash !== expectedPrevious) throw new TypeError(`runtime ledger zinciri kirik: ${index + 1}`);
    if (sha256(eventPayload(event)) !== event.eventHash) throw new TypeError(`runtime ledger event hash gecersiz: ${index + 1}`);
    expectedPrevious = event.eventHash;
    out.push(event);
  }
  return out;
}

function checkpointFrom(events: RuntimeLedgerEvent[], reason: string) {
  const entry = [...events].reverse().find((event) => event.reason === reason && event.role === "fabric");
  if (!entry) throw new TypeError("fabric runtime checkpoint bulunamadi");
  if (!['started', 'replaced', 'stable'].includes(entry.status) || entry.sourceHash === "-") {
    throw new TypeError("fabric runtime checkpoint witness olmaya uygun degil");
  }
  return {
    role: entry.role,
    status: entry.status,
    eventHash: hashId(entry.eventHash),
    previousHash: entry.previousHash === "GENESIS" ? "GENESIS" : hashId(entry.previousHash),
    processWitness: hashId(entry.processWitness),
    sourceHash: hashId(entry.sourceHash),
  };
}

/** Task tamamlaninca o ana ait yeni, dogrulanabilir Fabric checkpoint'i alir. */
export function captureRuntimeCheckpoint({ scriptPath, ledgerPath, reason }: { scriptPath: string; ledgerPath: string; reason: string }) {
  if (!existsSync(scriptPath)) throw new TypeError("runtime ledger script bulunamadi");
  execFileSync("bash", [scriptPath, "snapshot", reason], { stdio: "pipe", timeout: 8000 });
  if (!existsSync(ledgerPath)) throw new TypeError("runtime ledger yazilmadi");
  return checkpointFrom(verifyRuntimeLedgerText(readFileSync(ledgerPath, "utf8")), reason);
}

function readJsonList(path: string): unknown[] {
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed)) throw new TypeError("runtime provenance deposu dizi olmali");
  return parsed;
}

function writeJsonAtomic(path: string, value: unknown) {
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(value, null, 1), "utf8");
  renameSync(tmp, path);
}

/**
 * Production call-site'in tek yazma yolu. formationId istemciden gelse bile
 * artifact deposundaki exact, dogrulanmis parent tekrar okunur; baslik/prompt
 * veya similarity ile eslestirme yoktur.
 */
export async function recordCompletedRuntimeProvenance({
  completion, artifactsPath, provenancePath, ledgerScriptPath, ledgerPath,
}: {
  completion: CompletionEvidence;
  artifactsPath: string;
  provenancePath: string;
  ledgerScriptPath: string;
  ledgerPath: string;
}) {
  if (completion.type !== "task.completed" || !completion.formationId) return { recorded: false, reason: "formation-parent-yok" };
  const artifacts = readJsonList(artifactsPath);
  const matches = artifacts.filter((artifact: any) => artifact?.formation?.id === completion.formationId);
  if (matches.length !== 1) throw new TypeError("exact formation parent tekil olarak bulunamadi");
  const parent = (matches[0] as any).formation;
  if (!(await verifyFormation(parent))) throw new TypeError("exact formation parent dogrulanamadi");
  if (!parent.context.capabilities.includes(completion.capability)) {
    throw new TypeError("completed capability parent formation sozlesmesinde degil");
  }

  const checkpoint = captureRuntimeCheckpoint({
    scriptPath: ledgerScriptPath,
    ledgerPath,
    reason: `task-completed:${completion.taskId}`,
  });
  const witness = await createRuntimeWitness({ parentFormationId: parent.id, completion, ledger: checkpoint });
  const edge = await createRuntimeProvenanceEdge({ parent, witness });

  const existing = readJsonList(provenancePath);
  const parents = new Map(artifacts.map((artifact: any) => [artifact?.formation?.id, artifact?.formation]));
  for (const knownEdge of existing) {
    const knownParent = parents.get((knownEdge as any)?.parent?.id);
    if (!(await verifyRuntimeProvenanceEdge(knownEdge, knownParent))) {
      throw new TypeError("mevcut runtime provenance deposu dogrulanamadi");
    }
  }
  const joined = await joinRuntimeProvenance(existing, [edge]);
  writeJsonAtomic(provenancePath, joined);
  return { recorded: true, duplicate: joined.length === existing.length, edge };
}
