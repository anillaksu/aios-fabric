// W6.B - WindowManager cekirdek sozlesme testleri (2026-08-17).
//
// KARAR-1: cekirdek yuzeyden ayrik, DOM'a dokunmaz. Bu test dosyasi tam da
// bunu sinar: localStorage YERINE enjekte edilen bellek-ici depo kullanir -
// WindowManager Node'da, tarayici olmadan calisabiliyor demektir (yuzeyden
// gercekten ayrik oldugunun kaniti).
//
// Calistirma: npm test (fabric/) - node:test, dis baglanti/dosya YOK.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WindowManager } from "../public/js/windowmanager.js";

function memStorage() {
  let state = { windows: [] };
  return { load: () => state, save: (s: unknown) => { state = s as typeof state; } };
}

test("register: yeni pencere eklenir, ayni id tekrar eklenmez", () => {
  const wm = new WindowManager(memStorage());
  assert.equal(wm.register({ id: "w1", title: "Pil" }), true);
  assert.equal(wm.register({ id: "w1", title: "Baska" }), false);
  assert.equal(wm.list().length, 1);
  assert.equal(wm.get("w1")?.title, "Pil");
});

test("focus/unfocus: odaklanma durumu ve lastFocusedAt guncellenir, kayit silinmez", () => {
  const wm = new WindowManager(memStorage());
  wm.register({ id: "w1", title: "Pil" });
  assert.equal(wm.focusedId, null);
  assert.equal(wm.focus("w1"), true);
  assert.equal(wm.focusedId, "w1");
  assert.ok(wm.get("w1")!.lastFocusedAt > 0);
  assert.equal(wm.unfocus(), true);
  assert.equal(wm.focusedId, null);
  assert.equal(wm.list().length, 1, "unfocus penceреyi SILMEZ - izgaraya donus, kapatma degil");
});

test("remove: pencere kaydi silinir; odaklanmis pencere kaldirilirsa odak da temizlenir", () => {
  const wm = new WindowManager(memStorage());
  wm.register({ id: "w1", title: "Pil" });
  wm.focus("w1");
  assert.equal(wm.remove("w1"), true);
  assert.equal(wm.list().length, 0);
  assert.equal(wm.focusedId, null);
});

test("pin: sabitli pencereler once gelir, sonra son odaklanmaya gore en yeni once", () => {
  const wm = new WindowManager(memStorage());
  wm.register({ id: "a", title: "A" });
  wm.register({ id: "b", title: "B" });
  wm.register({ id: "c", title: "C" });
  wm.focus("a"); // a en eski odak
  wm.focus("b"); // b en yeni odak
  wm.pin("c", true);
  const order = wm.list().map((w) => w.id);
  assert.deepEqual(order, ["c", "b", "a"], "pinli once, sonra en yeni odaklanma once");
});

test("kalicilik: ayni depo ile yeni WindowManager onceki durumu geri yukler", () => {
  const storage = memStorage();
  const wm1 = new WindowManager(storage);
  wm1.register({ id: "w1", title: "Pil" });
  wm1.focus("w1");

  const wm2 = new WindowManager(storage);
  assert.equal(wm2.list().length, 1);
  assert.equal(wm2.get("w1")?.title, "Pil");
  // NOT: focusedId kalicilastirilmiyor (bilincli) - odak oturum-ici durumdur,
  // sayfa yeniden acildiginda izgaradan baslanir, kilitli tam ekrandan degil.
  assert.equal(wm2.focusedId, null);
});

test("onChange: her mutasyonda dinleyicilere GUNCEL izgara sirasi + odak bildirilir", () => {
  const wm = new WindowManager(memStorage());
  const seen: Array<{ ids: string[]; focusedId: string | null }> = [];
  wm.onChange((snap) => seen.push({ ids: snap.windows.map((w) => w.id), focusedId: snap.focusedId }));
  wm.register({ id: "w1", title: "Pil" });
  wm.focus("w1");
  wm.unfocus();
  assert.equal(seen.length, 3);
  assert.deepEqual(seen[1], { ids: ["w1"], focusedId: "w1" });
  assert.deepEqual(seen[2], { ids: ["w1"], focusedId: null });
});

test("agirlik: dosyada fetch/XHR/WebSocket cagrisi YOK - sifir-token gezinme yapisal olarak garanti (K7)", () => {
  const src = readFileSync(new URL("../public/js/windowmanager.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\bfetch\(|\bXMLHttpRequest\b|\bWebSocket\b/, "WindowManager herhangi bir ag cagrisi icermemeli");
});
