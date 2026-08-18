// B-12 - "anlamli veri" ayrimi sozlesme testleri (2026-08-18).
//
// Bulgu: veri donduren REFLEX capability'lerin (sensor.location.read,
// app.list, wifi.info...) sonucu, HERMES sohbeti disinda hicbir yerde
// gorunmuyordu - capability'ler basariyla tamamlaniyordu (journal kanitladi)
// ama app.js:ctx.dispatch() yalnizca script.run icin ozel bir gosterim
// koduna sahipti. hasMeaningfulData() bu ayrimi tasiyan saf fonksiyon:
// salt yan-etkili capability'ler (torch.set, vibrate, wakelock...) bos
// stdout dondurur, veri-donduren capability'ler gercek icerik dondurur.
//
// Calistirma: npm test (fabric/) - node:test, dis baglanti/dosya YOK.

import { test } from "node:test";
import assert from "node:assert/strict";
import { hasMeaningfulData } from "../public/js/dispatch-utils.js";

test("hasMeaningfulData: bos stdout (yan-etki capability'leri, orn. torch.set/vibrate) -> false", () => {
  assert.equal(hasMeaningfulData(""), false);
  assert.equal(hasMeaningfulData(null), false);
  assert.equal(hasMeaningfulData(undefined), false);
});

test("hasMeaningfulData: bos obje/dizi -> false (gosterilecek bir sey yok)", () => {
  assert.equal(hasMeaningfulData({}), false);
  assert.equal(hasMeaningfulData([]), false);
});

test("hasMeaningfulData: gercek icerikli obje (orn. sensor.location.read) -> true", () => {
  assert.equal(hasMeaningfulData({ latitude: 41.17, longitude: 29.61 }), true);
});

test("hasMeaningfulData: gercek icerikli dizi (orn. app.list) -> true", () => {
  assert.equal(hasMeaningfulData([{ pkg: "com.example", name: "Ornek" }]), true);
});

test("hasMeaningfulData: dolu metin (JSON olmayan stdout) -> true", () => {
  assert.equal(hasMeaningfulData("VODAFONE_435851"), true);
});
