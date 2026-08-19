// W6 - M-5/M-7: Artifact Contract kapisi sozlesme testleri (2026-08-17).
//
// Kapsam BILINCLI KUCUK TUTULDU (owner: "agir bir compiler onermiyorum,
// yalniz W6.C'nin ihtiyac duydugu minimum sinir"): DAG/terfi yasam dongusu/
// maliyet-tabanli reuse YOK (W6.5d'de zaten ertelendi, n=8 olcekte anlamsiz).
// Burada yalnizca sinanan: (1) kullanilan capability'ler bilinen sette mi,
// (2) capability seti surumu deterministik damgalaniyor mu, (3) basarisiz
// sozlesme artefagi PERSIST ETMIYOR mu (ephemeral/persistent'in en ucuz hali).
//
// Calistirma: npm test (fabric/) - node:test, dis baglanti/dosya YOK.

import { test } from "node:test";
import assert from "node:assert/strict";
import { usedActionTypes, capabilitySetVersion, admitArtifact, reconcileArtifactContract } from "../public/js/artifact-contract.js";

const KNOWN = ["sensor.battery.read", "wifi.info", "torch.set"];

test("usedActionTypes: sections + children + actions dizisi ic ice taranir", () => {
  const screen = {
    title: "T",
    sections: [
      { type: "section", children: [
        { type: "button", action: { type: "sensor.battery.read" } },
      ] },
      { type: "list", actions: [{ type: "wifi.info" }, { type: "ui.goto" }] },
    ],
  };
  const used = usedActionTypes(screen);
  assert.deepEqual([...used].sort(), ["sensor.battery.read", "ui.goto", "wifi.info"]);
});

test("usedActionTypes: action/tap/longPress/details ve tum container yollarini toplar", () => {
  const screen = {
    type: "section", action: { type: "sensor.battery.read" },
    children: [{ type: "list", rows: [{ type: "list-row", tap: { type: "wifi.info" }, longPress: { type: "torch.set" } }],
      buttons: [{ type: "button", details: { type: "ui.goto" } }] }],
    actions: [{ action: { type: "wifi.info" } }],
  };
  assert.deepEqual(usedActionTypes(screen).sort(), ["sensor.battery.read", "torch.set", "ui.goto", "wifi.info"]);
});

test("reconcileArtifactContract: eski eksik capability kaydini spec'ten deterministik turetir", () => {
  const artifact = {
    provenance: "seed", capabilities: [], version: "old",
    spec: { title: "Wi-Fi", sections: [{ type: "button", action: { type: "wifi.info" } }] },
  };
  const r = reconcileArtifactContract(artifact, { knownCapabilities: KNOWN, versionStamp: "new" });
  assert.equal(r.ok, true);
  assert.equal(r.changed, true);
  assert.deepEqual(r.contract.capabilities, ["wifi.info"]);
  assert.equal(r.contract.provenance, "seed");
});

test("admitArtifact: yalnizca bilinen capability + UI meta-eylem kullanan spec kabul edilir", () => {
  const screen = { title: "Pil", sections: [{ type: "metric", action: { type: "sensor.battery.read" } }] };
  const r = admitArtifact(screen, { knownCapabilities: KNOWN, versionStamp: "abc123" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.contract.capabilities, ["sensor.battery.read"]);
  assert.equal(r.contract.version, "abc123");
  assert.equal(r.contract.provenance, "hermes", "varsayilan provenance");
});

test("admitArtifact: bilinmeyen capability referansi REDDEDILIR (ephemeral kalir, persist edilmez)", () => {
  const screen = { title: "Kotu", sections: [{ type: "button", action: { type: "script.run.uydurma" } }] };
  const r = admitArtifact(screen, { knownCapabilities: KNOWN, versionStamp: "abc123" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /bilinmeyen capability/);
});

test("admitArtifact: UI meta-eylemler (ui.*, cap.test) capability listesine KARISMAZ", () => {
  const screen = { title: "Nav", sections: [{ type: "button", action: { type: "ui.goto" } }] };
  const r = admitArtifact(screen, { knownCapabilities: KNOWN, versionStamp: "v1" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.contract.capabilities, [], "ui.goto capability degil, kapsama girmemeli");
});

test("capabilitySetVersion: deterministik (ayni set -> ayni damga) ve sira-bagimsiz", async () => {
  const v1 = await capabilitySetVersion(["a", "b", "c"]);
  const v2 = await capabilitySetVersion(["c", "a", "b"]);
  const v3 = await capabilitySetVersion(["a", "b"]);
  assert.equal(v1, v2, "sira degismesi damgayi degistirmemeli");
  assert.notEqual(v1, v3, "kume degisince damga da degismeli - W6.L'nin 'capability surumu bump' invaryanti");
});
