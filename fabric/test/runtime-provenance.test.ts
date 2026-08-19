import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
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
import { verifyRuntimeLedgerText } from "../src/runtime-provenance.ts";

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
