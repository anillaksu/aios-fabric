// W6.K - Web Worker cekirdegi sozlesme testleri (2026-08-18).
//
// Karar: uretilen/ayiklanan icerigin parse/validate/contract adimlari izole
// bir Worker'da kosar (privileged capability CAGIRAMAZ), kacak/asili bir
// parse ana thread'i/telefonu KILITLEMEZ (terminate() ile). Bu dosya iki
// katmani ayri sinar:
//   1) artifact-parse.js - Worker'in icinde kosan SAF hesaplama (DOM yok,
//      gercek bir Worker/tarayici gerekmez, dogrudan Node'da test edilir -
//      windowmanager.test.ts'teki ayni desen).
//   2) parse-client.js - ana threadin Worker'i nasil yonettigi (enjekte
//      edilen sahte worker'la: round-trip, TIMEOUT + terminate(), worker
//      kendi coktugunde bekleyenlerin reddedilmesi).
//
// Calistirma: npm test (fabric/) - node:test, dis baglanti/dosya YOK.

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractArtifacts, actionableCount } from "../public/js/artifact-parse.js";
import { ParseClient } from "../public/js/parse-client.js";

const REFLEX = new Set(["sensor.battery.read", "wifi.info"]);

function aios(obj) {
  return "metin öncesi\n```aios\n" + JSON.stringify(obj) + "\n```\nmetin sonrası";
}

// ─── 1) artifact-parse.js: extractArtifacts/actionableCount ───

test("extractArtifacts: gecerli, en az bir gercek action iceren blok kabul edilir", () => {
  const raw = aios({
    id: "a1", title: "Pil", sections: [
      { type: "metric", value: "82", action: { type: "sensor.battery.read" } },
    ],
  });
  const { text, specs, rejected } = extractArtifacts(raw, REFLEX);
  assert.equal(text, "metin öncesi\n\nmetin sonrası");
  assert.equal(specs.length, 1);
  assert.equal(rejected.length, 0);
  assert.equal(specs[0].title, "Pil");
});

test("extractArtifacts: hicbir gercek action'a baglanmayan salt-bilgi karti REDDEDILIR", () => {
  const raw = aios({ id: "a2", title: "Bilgi", sections: [{ type: "text", body: "yalnizca metin" }] });
  const { specs, rejected } = extractArtifacts(raw, REFLEX);
  assert.equal(specs.length, 0);
  assert.deepEqual(rejected, ["Bilgi"]);
});

test("extractArtifacts: ACTIONABLE seti BOS ise (capability henuz yuklenmedi) fail-open - reddetmez", () => {
  const raw = aios({ id: "a3", title: "Bilgi", sections: [{ type: "text", body: "x" }] });
  const { specs, rejected } = extractArtifacts(raw, new Set());
  assert.equal(specs.length, 1, "bilgi eksikken kapiyi kapatmak yanlis pozitifin en pahali turu");
  assert.equal(rejected.length, 0);
});

test("extractArtifacts: bozuk JSON sessizce atlanir, cokme yok", () => {
  const raw = "```aios\n{ bozuk json ]\n```";
  const { specs, rejected } = extractArtifacts(raw, REFLEX);
  assert.equal(specs.length, 0);
  assert.equal(rejected.length, 0);
});

test("actionableCount: ic ice children'da derinlik 8'i asan dugum sayilmaz (sonsuz ic ice korumasi)", () => {
  let node = { type: "metric", action: { type: "sensor.battery.read" } };
  for (let i = 0; i < 10; i++) node = { type: "section", children: [node] };
  assert.equal(actionableCount(node, REFLEX), 0);
});

// ─── 2) parse-client.js: ParseClient + enjekte edilen sahte worker ───

function fakeWorkerFactory(onPost) {
  let terminated = false;
  const worker = {
    postMessage(msg) { onPost(worker, msg); },
    terminate() { terminated = true; },
    get terminated() { return terminated; },
  };
  return worker;
}

test("ParseClient: basarili round-trip - postMessage/onmessage id ile eslesir", async () => {
  const client = new ParseClient(() => fakeWorkerFactory((worker, msg) => {
    queueMicrotask(() => worker.onmessage({ data: { id: msg.id, ok: true, text: "t", admitted: [{ spec: { title: "X" }, contract: {} }], rejected: [], contractRejected: [] } }));
  }));
  const res = await client.parse("raw", { actionableTypes: REFLEX, knownCapabilities: [], versionStamp: "v1" });
  assert.equal(res.text, "t");
  assert.equal(res.admitted[0].spec.title, "X");
});

test("ParseClient: KACAK/ASILI worker - timeout icinde yanit gelmezse terminate() edilir, hata ile reddedilir", async () => {
  let created = null;
  const client = new ParseClient(() => { created = fakeWorkerFactory(() => { /* hic yanit verme - asili senaryo */ }); return created; }, { timeoutMs: 20 });
  await assert.rejects(() => client.parse("raw", { actionableTypes: REFLEX, knownCapabilities: [], versionStamp: "v1" }), /zaman aşımı/);
  assert.equal(created.terminated, true, "asili worker OLDURULMELI - telefonu kilitlememesi icin");
});

test("ParseClient: worker kendi coktugunde (onerror) bekleyen istek reddedilir ve worker terminate edilir", async () => {
  let created = null;
  let errHandler = null;
  const client = new ParseClient(() => {
    created = { postMessage() {}, terminate() { created.terminated = true; }, set onerror(fn) { errHandler = fn; }, set onmessage(_fn) {} };
    return created;
  });
  const p = client.parse("raw", { actionableTypes: REFLEX, knownCapabilities: [], versionStamp: "v1" });
  errHandler(new Error("worker cokmesi"));
  await assert.rejects(() => p, /worker cokmesi/);
  assert.equal(created.terminated, true);
});

test("ParseClient: timeout sonrasi terminate edilen worker, bir SONRAKI parse() cagrisinda YENIDEN kurulur (kalici bozulmaz)", async () => {
  let count = 0;
  let respond = false;
  const client = new ParseClient(() => {
    count++;
    return fakeWorkerFactory((worker, msg) => {
      if (!respond) return; // ilk worker: hic yanit verme (asili senaryo)
      queueMicrotask(() => worker.onmessage({ data: { id: msg.id, ok: true, text: "", admitted: [], rejected: [], contractRejected: [] } }));
    });
  }, { timeoutMs: 20 });
  await assert.rejects(() => client.parse("raw", {}));
  assert.equal(count, 1);
  respond = true;
  const res = await client.parse("raw", {});
  assert.equal(count, 2, "timeout sonrasi terminate edilen worker yeniden kuruldu");
  assert.equal(res.ok, true);
});
