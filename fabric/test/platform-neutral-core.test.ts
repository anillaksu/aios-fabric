// AIOS Universal Runtime — platform-notrluk regresyon kapisi (2026-08-21).
//
// Owner direktifi §20'nin cekirdek iddiasi: "AIOS'un canonical artifact/
// formation/provenance cekirdegi platformdan bagimsiz calisir; Android ve
// Windows yalnizca farkli runtime/capability adapter'laridir."
//
// Bu iddia 2026-08-21'de CANLI olarak kanitlandi: ayni girdi, telefonun kendi
// cekirdek kopyasinda (android/arm64, Node v26.4.0) ve Windows'ta (win32/x64,
// Node v26.4.0) BAGIMSIZ hesaplandiginda formation/content/context/witness/
// runtime-witness/edge kimliklerinin HEPSI byte-ozdes cikti.
//
// Bu test o kanitin kalici kapisidir. Iki seyi birden korur:
//   1) Cekirdek, platform-ozel hicbir sey (Termux/Android/Shizuku/proot/
//      dosya sistemi/pencere/dogrudan ag) kullanmaz.
//   2) Kimlik yalnizca canonical icerikten turer; platform/mimari/zaman/
//      surec degerleri kimlige SIZAMAZ.
//
// Kirilirsa: bir platform detayi cekirdege sizmis demektir - taşinabilirlik
// iddiasi artik gecerli degildir ve FACT'ten dusurulmelidir.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  canonicalJson,
  createRootFormation,
  createRuntimeProvenanceEdge,
  createRuntimeWitness,
  exportFormationMemoryBundle,
  importFormationMemoryBundle,
  verifyFormation,
  verifyRuntimeProvenanceEdge,
} from "../public/js/formation-memory.js";

const CORE_PATH = new URL("../public/js/formation-memory.js", import.meta.url);
const coreSource = readFileSync(CORE_PATH, "utf8");

/** 2026-08-21'de iki platformda BAGIMSIZ hesaplanan gercek degerler. */
const CROSS_PLATFORM_IDENTITY = Object.freeze({
  formation: "formation:2d9590a65f575446d08f5db2e35d2d8c5d3db02153ffbd7bc53d37678395df65",
  contentId: "sha256:85af225f7afb9d12f64139a3c4f8e5c4ec05698ff1ed4163bb2cb74e9ecaff51",
  contextId: "sha256:542e0b0b5b5e502f6268815b501370bb15d1c28aceffe82f2a28b0402f2e7796",
  witnessId: "sha256:e63cb121195e57a9c84acbf5b4a994704310b00c076794b6952f4b6ec785476e",
  runtimeWitness: "runtime-witness:14624a25679f3ee58ddf92089cdff24bc267ca648bc0ff1b9cd65553d150a549",
  edge: "provenance-edge:bb454de3aafee853fb6fa6f8f61115eeeb86445d0f01b486677d41ac02d3bf13",
});

/** Kanitta kullanilan girdinin BIREBIR ayni olmasi sart - degisirse hash degisir. */
const PROBE_ARTIFACT = Object.freeze({
  id: "windows-node-portability-probe",
  title: "Windows Node Portability Probe",
  spec: {
    id: "win-probe",
    title: "Windows Node Portability Probe",
    sections: [{ type: "section", title: "PROBE", children: [{ type: "metric", label: "PLATFORM", value: "windows" }] }],
  },
  capabilities: ["volume.set"],
  version: "caps-v1",
  provenance: "reference",
});

const PROBE_LEDGER = Object.freeze({
  role: "fabric", status: "stable",
  eventHash: "sha256:" + "a".repeat(64), previousHash: "GENESIS",
  processWitness: "sha256:" + "b".repeat(64), sourceHash: "sha256:" + "c".repeat(64),
});

async function buildProbe() {
  const formation = await createRootFormation(PROBE_ARTIFACT);
  const witness = await createRuntimeWitness({
    parentFormationId: formation.id,
    completion: {
      type: "task.completed", taskId: "win-probe-task",
      correlationId: "win-probe-corr", capability: "volume.set", result: "",
    },
    ledger: PROBE_LEDGER,
  });
  const edge = await createRuntimeProvenanceEdge({ parent: formation, witness });
  return { formation, witness, edge };
}

const hash = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");

test("cekirdek kimlik platformdan bagimsizdir: bu makine 2026-08-21 cross-platform degerlerini yeniden uretir", async () => {
  const { formation, witness, edge } = await buildProbe();
  // Bu degerler android/arm64 uzerinde de BIREBIR ayni cikti (canli kanit).
  assert.equal(formation.id, CROSS_PLATFORM_IDENTITY.formation);
  assert.equal(formation.contentId, CROSS_PLATFORM_IDENTITY.contentId);
  assert.equal(formation.contextId, CROSS_PLATFORM_IDENTITY.contextId);
  assert.equal(formation.witnessId, CROSS_PLATFORM_IDENTITY.witnessId);
  assert.equal(witness.id, CROSS_PLATFORM_IDENTITY.runtimeWitness);
  assert.equal(edge.id, CROSS_PLATFORM_IDENTITY.edge);
});

test("cekirdek kaynagi hicbir platform-ozel API'ye bagimli degildir", () => {
  // Android/Termux sizintisi: canli kanitta 0 idi, 0 kalmali.
  assert.doesNotMatch(coreSource, /termux|shizuku|proot|\/data\/data|am start|pm list/i,
    "formation-memory.js'e platforma ozel bir referans sizmis");
  // Cekirdek hicbir modul import etmez - tasinabilirligin yapisal garantisi.
  assert.doesNotMatch(coreSource, /^\s*import\s/m, "cekirdek modul import etmeye baslamis");
  assert.doesNotMatch(coreSource, /require\s*\(/, "cekirdek CommonJS require kullanmaya baslamis");
  // Dosya sistemi / ag / DOM / surec: cekirdekte olamaz.
  for (const forbidden of [/\bnode:fs\b/, /\bfetch\s*\(/, /\bdocument\./, /\bwindow\./, /\blocalStorage\b/, /\bprocess\.(env|platform|arch)\b/]) {
    assert.doesNotMatch(coreSource, forbidden, `cekirdege platform bagimliligi girdi: ${forbidden}`);
  }
});

test("kimlik yalnizca canonical icerikten turer: platform/zaman/surec degeri kimlige sizmaz", async () => {
  const { formation } = await buildProbe();
  const serialized = canonicalJson(formation);
  // Bu makinenin gercek degerleri kimlik kaydinda GORUNMEMELI.
  for (const leak of [process.platform, process.arch, process.version]) {
    assert.ok(!serialized.includes(leak), `platform degeri kimlige sizmis: ${leak}`);
  }
  // Zaman damgasi benzeri alan da olmamali (witness semasi zaman tasimaz).
  assert.doesNotMatch(serialized, /"(createdAt|timestamp|observedAt|ts)"/, "kimlik kaydina zaman alani girmis");
});

test("tasinabilirlik: export -> import -> re-export ayni canonical paketi verir (her iki yon icin gecerli kapi)", async () => {
  const { formation, edge } = await buildProbe();
  const exported = await exportFormationMemoryBundle([formation], [edge]);
  const imported = await importFormationMemoryBundle([], [], exported);
  const reexported = await exportFormationMemoryBundle(imported.formations, imported.provenanceEdges);
  assert.equal(hash(exported), hash(reexported), "import/re-export canonical paketi degistirdi");
  assert.equal(imported.formations[0].id, formation.id, "tasima sirasinda kimlik degisti");
  // Karsi platformda dogrulanabilirligin ayni fonksiyonlari:
  assert.equal(await verifyFormation(imported.formations[0]), true);
  assert.equal(await verifyRuntimeProvenanceEdge(imported.provenanceEdges[0], imported.formations[0]), true);
});
