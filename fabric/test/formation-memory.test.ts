import test from "node:test";
import assert from "node:assert/strict";
import {
  createRootFormation, createDerivedFormation, discoverFormations,
  exportFormationMemory, importFormationMemory, joinFormationMemory,
  verifyFormation,
} from "../public/js/formation-memory.js";

const soundArtifact = {
  id: "rastgele-cihaz-kaydi", createdAt: 123, pinned: false,
  title: "Kaydırılabilir Ses Paneli",
  spec: { title: "Kaydırılabilir Ses Paneli", sections: [{ type: "range", min: 0, max: 15, value: 7, action: { type: "volume.set", payload: { stream: "music" } } }] },
  capabilities: ["volume.set", "volume.read"], version: "caps-v1", provenance: "reference",
};

const reorderedSoundArtifact = {
  ...soundArtifact, id: "baska-rastgele-id", createdAt: 999,
  capabilities: ["volume.read", "volume.set"],
  spec: { sections: [{ value: 7, action: { payload: { stream: "music" }, type: "volume.set" }, max: 15, min: 0, type: "range" }], title: "Kaydırılabilir Ses Paneli" },
};

test("A: ayni canonical artifact zaman/rastgele id ve anahtar sirasi degisse de ayni formation identity'yi verir", async () => {
  const left = await createRootFormation(soundArtifact);
  const right = await createRootFormation(reorderedSoundArtifact);
  assert.equal(left.id, right.id);
  assert.equal(left.contentId, right.contentId);
  assert.equal(await verifyFormation(left), true);
});

test("B/D: replay ve A ⊔ A duplicate formation yaratmaz", async () => {
  const formation = await createRootFormation(soundArtifact);
  const joined = await joinFormationMemory([formation], [formation], [formation]);
  assert.equal(joined.length, 1);
  assert.equal(joined[0].id, formation.id);
});

test("C/E/J: olay sirasi ve parantezleme deterministic JOIN sonucunu degistirmez", async () => {
  const a = await createRootFormation(soundArtifact);
  const b = await createRootFormation({ ...soundArtifact, title: "Pil", spec: { title: "Pil", sections: [] }, capabilities: ["sensor.battery.read"] });
  const c = await createRootFormation({ ...soundArtifact, title: "Wi-Fi", spec: { title: "Wi-Fi", sections: [] }, capabilities: ["wifi.info"] });
  const left = await joinFormationMemory(await joinFormationMemory([a], [b]), [c]);
  const right = await joinFormationMemory([c], await joinFormationMemory([b], [a]));
  assert.deepEqual(left.map((formation) => formation.id), right.map((formation) => formation.id));
});

test("F: baska ortama export/import edilen parent exact identity ile derived provenance kurar", async () => {
  const parent = await createRootFormation(soundArtifact);
  const imported = await importFormationMemory([], await exportFormationMemory([parent]));
  const child = await createDerivedFormation({
    artifact: { ...soundArtifact, title: "Ev Ses Paneli", spec: { ...soundArtifact.spec, title: "Ev Ses Paneli" } },
    parents: imported,
    execution: { kind: "dispatcher-execution", capability: "volume.set", result: { ok: true, stream: "music", value: 10 } },
  });
  assert.deepEqual(child.context.parents, [parent.id]);
  assert.equal(await verifyFormation(child), true);
});

test("G: witness veya exact parent olmadan derived iddiasi reddedilir", async () => {
  await assert.rejects(() => createDerivedFormation({ artifact: soundArtifact, parents: [], execution: null }), /parent/);
  const parent = await createRootFormation(soundArtifact);
  await assert.rejects(() => createDerivedFormation({ artifact: soundArtifact, parents: [parent], execution: null }), /witness/);
});

test("H: semantic similarity identity yerine gecemez; discovery exact capability ile sinirlidir", async () => {
  const sound = await createRootFormation(soundArtifact);
  const found = discoverFormations([sound], { capabilities: ["volume.set"] });
  assert.deepEqual(found.map((formation) => formation.id), [sound.id]);
  assert.throws(() => discoverFormations([sound], { similarity: "ses paneli" }), /similarity/);
});

test("I: portable paket canonical formation graph'i tasir ve replay sonrasi ayni sonucu verir", async () => {
  const root = await createRootFormation(soundArtifact);
  const child = await createDerivedFormation({
    artifact: { ...soundArtifact, title: "Tekrar Kullanilan Ses", spec: { ...soundArtifact.spec, title: "Tekrar Kullanilan Ses" } },
    parents: [root],
    execution: { kind: "dispatcher-execution", capability: "volume.read", result: [{ stream: "music", volume: 7, max_volume: 15 }] },
  });
  const portable = await exportFormationMemory([child, root, root]);
  const replayed = await importFormationMemory([], portable);
  assert.deepEqual(replayed.map((formation) => formation.id), portable.formations.map((formation) => formation.id));
});
