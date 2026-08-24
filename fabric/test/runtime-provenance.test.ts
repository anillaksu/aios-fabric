import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalJson,
  createRootFormation,
  createRuntimeProvenanceEdge,
  createRuntimeWitness,
  exportFormationMemoryBundle,
  importFormationMemoryBundle,
  joinRuntimeProvenance,
  verifyRuntimeProvenanceEdge,
} from "../public/js/formation-memory.js";
import { captureRuntimeCheckpoint, verifyRuntimeLedgerText } from "../src/runtime-provenance.ts";

const hex = (text: string) => createHash("sha256").update(text).digest("hex");
const hid = (text: string) => `sha256:${text}`;

function row(previousHash: string, reason = "task-completed:t1") {
  const fields = [
    "2026-08-19T10:00:00Z", reason, "fabric", "stable", "41", "900",
    "a".repeat(64), "b".repeat(64), "c".repeat(64), previousHash,
  ];
  return [...fields, hex(fields.join("|"))].join("\t");
}

function checkpoint(previousHash = "GENESIS") {
  return {
    role: "fabric", status: "stable",
    eventHash: hid("d".repeat(64)), previousHash: previousHash === "GENESIS" ? "GENESIS" : hid(previousHash),
    processWitness: hid("c".repeat(64)), sourceHash: hid("b".repeat(64)),
  };
}

const artifact = {
  title: "Kanıtlı ses", spec: { title: "Kanıtlı ses", sections: [] },
  capabilities: ["volume.set"], version: "caps-v1", provenance: "reference",
};

async function edgeFor(parent: any | null = null, taskId = "task-1") {
  parent ||= await createRootFormation(artifact);
  const witness = await createRuntimeWitness({
    parentFormationId: parent.id,
    completion: { type: "task.completed", taskId, correlationId: "corr-1", capability: "volume.set", result: { value: 7 } },
    ledger: checkpoint(),
  });
  return { parent, edge: await createRuntimeProvenanceEdge({ parent, witness }) };
}

function semanticProjection(bundle: { formations: any[]; provenanceEdges: any[] }) {
  return {
    formations: bundle.formations.map((formation) => ({
      id: formation.id, contentId: formation.contentId, contextId: formation.contextId, witnessId: formation.witnessId,
    })),
    provenanceEdges: bundle.provenanceEdges.map((edge) => ({
      id: edge.id, parentId: edge.parent.id, witnessId: edge.witness.id, resultDigest: edge.witness.resultDigest,
    })),
  };
}

test("chain break rejection: GENESIS ve exact previous event hash zorunludur", () => {
  const first = row("GENESIS");
  const firstHash = first.split("\t")[10];
  assert.equal(verifyRuntimeLedgerText(`${first}\n${row(firstHash, "task-completed:t2")}\n`).length, 2);
  assert.throws(() => verifyRuntimeLedgerText(`${first}\n${row("GENESIS", "task-completed:t2")}\n`), /zinciri kirik/);
});

test("duplicate witness idempotence: ayni immutable edge JOIN'de tek kalir", async () => {
  const { edge } = await edgeFor();
  const joined = await joinRuntimeProvenance([edge], [edge], [edge]);
  assert.equal(joined.length, 1);
});

test("same witness duplicate delivery: ayni canonical completion yeniden islenirse ayni tek edge elde edilir", async () => {
  const parent = await createRootFormation(artifact);
  const first = (await edgeFor(parent, "task-same")).edge;
  const replay = (await edgeFor(parent, "task-same")).edge;
  assert.equal(first.witness.id, replay.witness.id);
  assert.equal(first.id, replay.id);
  assert.equal((await joinRuntimeProvenance([first], [replay])).length, 1);
});

test("reuse derived degildir: ayni exact root farkli execution baglamlarinda yeniden kullanilir, child formation uretilmez", async () => {
  const parent = await createRootFormation(artifact);
  const first = (await edgeFor(parent, "task-reuse-a")).edge;
  const second = (await edgeFor(parent, "task-reuse-b")).edge;
  const bundle = await exportFormationMemoryBundle([parent], [first, second]);
  assert.equal(bundle.formations.length, 1);
  assert.equal(bundle.formations[0].id, parent.id);
  assert.equal(bundle.provenanceEdges.length, 2);
  assert.notEqual(first.id, second.id);
  assert.equal(first.parent.id, second.parent.id);
});

test("order independence: provenance edge JOIN siradan ve parantezlemeden bagimsizdir", async () => {
  const parent = await createRootFormation(artifact);
  const a = (await edgeFor(parent, "task-a")).edge;
  const b = (await edgeFor(parent, "task-b")).edge;
  const left = await joinRuntimeProvenance(await joinRuntimeProvenance([a], [b]), [a]);
  const right = await joinRuntimeProvenance([b], await joinRuntimeProvenance([a], [a]));
  assert.deepEqual(left.map((edge) => edge.id), right.map((edge) => edge.id));
});

test("exact-parent rejection: baska formation veya contract disi capability provenance olusturamaz", async () => {
  const parent = await createRootFormation(artifact);
  const other = await createRootFormation({ ...artifact, title: "Başka panel" });
  const witness = await createRuntimeWitness({
    parentFormationId: parent.id,
    completion: { type: "task.completed", taskId: "t", correlationId: "c", capability: "volume.set", result: {} },
    ledger: checkpoint(),
  });
  await assert.rejects(() => createRuntimeProvenanceEdge({ parent: other, witness }), /exact parent/);
  const badCapability = await createRuntimeWitness({
    parentFormationId: parent.id,
    completion: { type: "task.completed", taskId: "t2", correlationId: "c", capability: "wifi.info", result: {} },
    ledger: checkpoint(),
  });
  await assert.rejects(() => createRuntimeProvenanceEdge({ parent, witness: badCapability }), /sozlesmesinde/);
});

test("completed -> witness -> immutable provenance: ham sonuc degil digest saklanir", async () => {
  const { parent, edge } = await edgeFor();
  assert.equal(await verifyRuntimeProvenanceEdge(edge, parent), true);
  assert.equal(JSON.stringify(edge).includes('"value":7'), false);
  assert.match(edge.witness.resultDigest, /^sha256:/);
});

test("failed/missing olaylari witness ve provenance uretemez", async () => {
  const parent = await createRootFormation(artifact);
  await assert.rejects(() => createRuntimeWitness({
    parentFormationId: parent.id,
    completion: { type: "task.failed", taskId: "t", correlationId: "c", capability: "volume.set", result: {} },
    ledger: checkpoint(),
  }), /task.completed/);
  await assert.rejects(() => createRuntimeWitness({
    parentFormationId: parent.id,
    completion: { type: "task.completed", taskId: "t", correlationId: "c", capability: "volume.set", result: {} },
    ledger: { ...checkpoint(), status: "missing" },
  }), /checkpoint/);
});

test("replay/export-import determinism: formation ve edge paketi exact parent ile ayni kalir", async () => {
  const { parent, edge } = await edgeFor();
  const portable = await exportFormationMemoryBundle([parent, parent], [edge, edge]);
  const replayed = await importFormationMemoryBundle([], [], portable);
  assert.deepEqual(replayed, { formations: portable.formations, provenanceEdges: portable.provenanceEdges });
});

test("iki replica harness: X→Y, Y→X, X duplicate ve Y duplicate ayni semantic projection verir", async () => {
  const parent = await createRootFormation(artifact);
  const x = (await edgeFor(parent, "task-x")).edge;
  const y = (await edgeFor(parent, "task-y")).edge;
  const replicaX = await exportFormationMemoryBundle([parent], [x]);
  const replicaY = await exportFormationMemoryBundle([parent], [y]);

  const xy = await importFormationMemoryBundle(replicaX.formations, replicaX.provenanceEdges, replicaY);
  const yx = await importFormationMemoryBundle(replicaY.formations, replicaY.provenanceEdges, replicaX);
  const xDuplicate = await importFormationMemoryBundle(xy.formations, xy.provenanceEdges, replicaX);
  const yDuplicate = await importFormationMemoryBundle(yx.formations, yx.provenanceEdges, replicaY);

  const expected = semanticProjection(xy);
  assert.deepEqual(semanticProjection(yx), expected);
  assert.deepEqual(semanticProjection(xDuplicate), expected);
  assert.deepEqual(semanticProjection(yDuplicate), expected);
});

test("semantic projection esitligi ile canonical serialization hash esitligi ayri kanitlanir", async () => {
  const parent = await createRootFormation(artifact);
  const x = (await edgeFor(parent, "task-hash-x")).edge;
  const y = (await edgeFor(parent, "task-hash-y")).edge;
  const xy = await exportFormationMemoryBundle([parent], await joinRuntimeProvenance([x], [y]));
  const yx = await exportFormationMemoryBundle([parent], await joinRuntimeProvenance([y], [x]));
  const left = semanticProjection(xy);
  const right = semanticProjection(yx);
  assert.deepEqual(left, right);
  assert.equal(hex(canonicalJson(left)), hex(canonicalJson(right)));
});

test("ayni immutable edge kimligiyle celiskili provenance iddiasi resolve edilmez, fail-closed reddedilir", async () => {
  const { edge } = await edgeFor();
  const conflicting = structuredClone(edge);
  conflicting.witness.resultDigest = "sha256:" + "f".repeat(64);
  await assert.rejects(() => joinRuntimeProvenance([edge], [conflicting]), /gecersiz runtime provenance edge/);
});

test("production call-site artifact context, dispatcher completion ve fail-closed shell verify zincirini tasir", () => {
  const app = readFileSync(new URL("../public/js/app.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
  // Depoda scripts/ altinda, telefonda ise kanonik ~/aios-runtime-ledger.sh
  // konumunda calisir. Test, ikisini de ayni contract olarak kabul eder.
  const repoLedger = new URL("../../scripts/aios-runtime-ledger.sh", import.meta.url);
  const phoneLedger = join(process.env.HOME || "", "aios-runtime-ledger.sh");
  const ledger = readFileSync(existsSync(repoLedger) ? repoLedger : phoneLedger, "utf8");
  assert.match(app, /function artifactCtx\(artifact\)/);
  assert.match(app, /formationId: formation\.id/);
  assert.match(server, /onTaskCompleted/);
  assert.match(server, /recordCompletedRuntimeProvenance/);
  assert.match(ledger, /LEDGER_CHAIN_BREAK/);
  assert.match(ledger, /expected_previous=\"\$event\"/);
});

/* ══════════ PG-022 — yazici/okuyucu sozlesme hizalamasi (T1-T6) ══════════
   scripts/aios-runtime-ledger.sh:process_witness bir surec bulunamadiginda
   pid/start/commandHash/sourceHash/processWitness alanlarinin BESINI birden
   '-' yazar ve satiri status="missing" olarak kapatir. Okuyucu bunu kabul
   etmezse tek bir missing satiri sonraki TUM provenance yazimlarini
   fail-closed dusurur (2026-08-20'de canli telefonda gozlendi).

   Bu paketin korudugu sinir: gevseme YALNIZ status="missing" icindir,
   zincir/event-hash dogrulamasi hic degismez ve bir missing satiri hicbir
   kosulda RuntimeWitness checkpoint'i olamaz. */

// Yazicinin gercek "missing" cikti sekli.
const WRITER_MISSING = Object.freeze({
  status: "missing", pid: "-", start: "-", commandHash: "-", sourceHash: "-", processWitness: "-",
});

function ledgerLine(previousHash: string, overrides: Record<string, string> = {}) {
  const field = {
    timestamp: "2026-08-20T00:42:42Z", reason: "task-completed:pg022", role: "fabric",
    status: "stable", pid: "41", start: "900",
    commandHash: "a".repeat(64), sourceHash: "b".repeat(64), processWitness: "c".repeat(64),
    ...overrides,
  };
  const fields = [
    field.timestamp, field.reason, field.role, field.status, field.pid, field.start,
    field.commandHash, field.sourceHash, field.processWitness, previousHash,
  ];
  return [...fields, hex(fields.join("|"))].join("\t");
}

/** Satirlari gercek yazici gibi GENESIS'ten baslayarak zincirler. */
function ledgerText(specs: Record<string, string>[]) {
  let previous = "GENESIS";
  const lines: string[] = [];
  for (const spec of specs) {
    const line = ledgerLine(previous, spec);
    lines.push(line);
    previous = line.split("\t")[10];
  }
  return `${lines.join("\n")}\n`;
}

/** captureRuntimeCheckpoint icin izole ledger + yazmayan stub snapshot betigi. */
async function withStubLedger<T>(text: string, fn: (paths: { scriptPath: string; ledgerPath: string }) => T | Promise<T>) {
  const dir = mkdtempSync(join(tmpdir(), "aios-pg022-"));
  const scriptPath = join(dir, "stub-runtime-ledger.sh");
  const ledgerPath = join(dir, "aios-runtime-ledger.tsv");
  // Stub bilerek hicbir sey yazmaz: test, ledger icerigi TAM olarak
  // kurdugumuz hali kalsin diye gercek betigi calistirmaz.
  writeFileSync(scriptPath, "#!/usr/bin/env bash\nexit 0\n", "utf8");
  writeFileSync(ledgerPath, text, "utf8");
  try {
    return await fn({ scriptPath, ledgerPath });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("PG-022 T1: yazicinin status=missing satiri okuyucudan gecer", () => {
  const events = verifyRuntimeLedgerText(ledgerText([
    {},
    { ...WRITER_MISSING, role: "gateway", reason: "connectivity-bridge" },
  ]));
  assert.equal(events.length, 2);
  assert.equal(events[1].status, "missing");
  assert.equal(events[1].commandHash, "-");
  assert.equal(events[1].processWitness, "-");
});

test("PG-022 T2: canli surec IDDIA EDEN satir (gercek pid) '-' hash ile reddedilir", () => {
  // 2026-08-24'te daraltildi. Eski hali gevsemeyi status="missing" ETIKETINE
  // bagliyordu; bu iki yonlu yanlisti:
  //   (a) yazicinin GERCEKTEN urettigi pid='-' + status='stable' satirini
  //       reddediyordu (bkz. T7),
  //   (b) status="missing" yazan ama GERCEK bir pid tasiyan satirda hash'lerin
  //       '-' olmasina IZIN veriyordu - yazicinin hicbir kod yolunda
  //       uretmedigi, bozuk/sahte bir kayit.
  // Dogru invaryant pid'den okunur: process_witness() ya bes alani birden
  // gercek deger, ya bes alani birden '-' yazar. Gercek pid tasiyan satir
  // hash'lerini bos birakamaz - status ne olursa olsun.
  for (const status of ["stable", "started", "replaced", "missing"]) {
    assert.throws(
      () => verifyRuntimeLedgerText(ledgerText([
        { status, pid: "41", start: "900", commandHash: "-", sourceHash: "-", processWitness: "-" },
      ])),
      /gecersiz alan/,
      `${status} + gercek pid + '-' hash kabul edilmemeli`,
    );
  }
});

test("PG-022 T7 (2026-08-24 canli regresyon): pid='-' + status='stable' satiri okuyucudan gecer", () => {
  // Yazicinin GERCEK sozlesmesi (scripts/aios-runtime-ledger.sh):
  //     status="stable"
  //     if [ "$pid" = '-' ]; then
  //         [ -n "$old_pid" ] && [ "$old_pid" != '-' ] && status="missing"
  // Yani surec YOK **ve onceden de yoktu** ise status "stable" KALIR, ama
  // process_witness() yine bes alani birden '-' yazar. Okuyucu gevsemeyi
  // status etiketine bagladigi icin bu satiri reddediyordu.
  //
  // CANLI ETKI (2026-08-24 olcumu): telefondaki 323 satirlik ledger'da bu
  // kalipta 6 satir var (hepsi role=sshd; ilki satir 230,
  // 2026-08-22T20:13:17Z). Okuyucu dosyanin TAMAMINI once dogruladigi icin
  // satir 230'dan sonraki 94 satir reddediliyordu -> o tarihten beri hicbir
  // yeni provenance edge yazilamadi (en yeni edge 2026-08-20T05:29:24Z).
  const events = verifyRuntimeLedgerText(ledgerText([
    {},
    { ...WRITER_MISSING, status: "stable", role: "sshd", reason: "boot-complete" },
  ]));
  assert.equal(events.length, 2);
  assert.equal(events[1].status, "stable");
  assert.equal(events[1].pid, "-");
  assert.equal(events[1].processWitness, "-");
});

test("PG-022 T3: missing satiri hicbir kosulda RuntimeWitness checkpoint'i olamaz", async () => {
  const reason = "task-completed:pg022";
  const text = ledgerText([{}, { ...WRITER_MISSING, reason }]);
  await withStubLedger(text, ({ scriptPath, ledgerPath }) => {
    assert.throws(
      () => captureRuntimeCheckpoint({ scriptPath, ledgerPath, reason }),
      /witness olmaya uygun degil/,
    );
  });
});

test("PG-022 T4: missing satirindan SONRA gelen gecerli fabric checkpoint'i witness uretir", async () => {
  const reason = "task-completed:pg022";
  const text = ledgerText([{ ...WRITER_MISSING, reason }, { reason, status: "stable" }]);
  await withStubLedger(text, async ({ scriptPath, ledgerPath }) => {
    const ledger = captureRuntimeCheckpoint({ scriptPath, ledgerPath, reason });
    assert.equal(ledger.role, "fabric");
    assert.equal(ledger.status, "stable");
    const parent = await createRootFormation(artifact);
    const witness = await createRuntimeWitness({
      parentFormationId: parent.id,
      completion: { type: "task.completed", taskId: "pg022", correlationId: "corr-pg022", capability: "volume.set", result: {} },
      ledger,
    });
    const edge = await createRuntimeProvenanceEdge({ parent, witness });
    assert.equal(await verifyRuntimeProvenanceEdge(edge, parent), true);
  });
});

test("PG-022 T5: bozuk event hash missing satirinda da reddedilir", () => {
  const columns = ledgerText([{ ...WRITER_MISSING }]).trim().split("\t");
  columns[10] = "f".repeat(64);
  assert.throws(() => verifyRuntimeLedgerText(`${columns.join("\t")}\n`), /event hash gecersiz/);
});

test("PG-022 T6: gercek ledger regresyonu - her satir eksiksiz parse edilir", () => {
  // Depoda 2026-08-20'nin dondurulmus anlik goruntusu; telefonda kanonik canli
  // ledger. Ayni dosya iki konumda aranir (production call-site testindeki
  // desenle ayni), cunku fixture telefona dagitilmaz.
  const fixture = new URL("./fixtures/runtime-ledger-2026-08-20.tsv", import.meta.url);
  const liveLedger = join(process.env.HOME || "", "aios-runtime-ledger.tsv");
  const usingFixture = existsSync(fixture);
  assert.ok(usingFixture || existsSync(liveLedger), "gercek ledger regresyonu icin fixture ya da canli ledger gerekli");

  const text = readFileSync(usingFixture ? fixture : liveLedger, "utf8");
  const rows = text.split(/\r?\n/).filter(Boolean);
  const events = verifyRuntimeLedgerText(text);

  assert.equal(events.length, rows.length, "gercek ledger'in her satiri parse edilmeli");
  assert.ok(events.some((event) => event.status === "missing"), "regresyon ancak gercek missing satiriyla anlamlidir");
  // Dondurulmus anlik goruntu tam olarak 145 satirdir; canli ledger buyudugu
  // icin orada yalniz eksiksiz parse ve missing varligi aranir.
  if (usingFixture) assert.equal(rows.length, 145);
});
