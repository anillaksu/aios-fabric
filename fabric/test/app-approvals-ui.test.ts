// Premium audit bulgusu (2026-08-20, ucuncu iterasyon): Control Center'daki
// İZİNLER paneli `getJSON("/approvals")` ag hatasinda `null` donunce bunu
// `|| {}` ile "hic onay yok" a indirgiyordu. Kullanici DAHA ONCE onayladigi
// bir capability'yi "ONAY BEKLİYOR" (henuz onaylanmamis) olarak goruyordu -
// gercek dispatcher/approval durumu degismiyordu, yalniz burada YANLIS
// gorunuyordu (goal §5/§18 - guven sorunu; PG-025 ile ayni ilke, farkli
// yuzey). app.js Node'da calistirilamaz (top-level `window` baglama,
// B-6 notu); bu yuzden registry-drift.test.ts/formation-explorer.test.ts ile
// AYNI desen kullanilir: kaynak metin dogrudan okunup yapisal desen aranir.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../public/js/app.js", import.meta.url), "utf8");

test("İzinler paneli: getJSON(/approvals) null donunce (fetch hatasi) yanlislikla 'hic onay yok' gostermez", () => {
  assert.match(app, /const renderApprovals = \(\) => \{/, "yeniden cekilebilir renderApprovals fonksiyonu olmali");
  assert.match(app, /if \(approvals === null\) \{/, "fetch hatasi acikca null kontroluyle yakalanmali (sayi/heuristik degil)");
  // Hata dalinda ONAY BEKLİYOR/ONAYLI gibi capability durumu YAZILMAMALI -
  // yalniz genel bir "okunamadi" mesaji ve TEKRAR DENE olmali.
  const errBranchMatch = app.match(/if \(approvals === null\) \{([\s\S]*?)\n {8}\}\n/);
  assert.ok(errBranchMatch, "null dalinin govdesi bulunamadi");
  const branch = errBranchMatch![1];
  assert.doesNotMatch(branch, /ONAY BEKLİYOR/, "hata dalinda capability'ler yanlislikla 'onay bekliyor' gostermemeli");
  assert.match(branch, /retry\.addEventListener\("click", renderApprovals\)/, "TEKRAR DENE ayni fetch'i yeniden calistirmali");
});

test("İzinler paneli: gercek onay durumu (state[cap]) yalniz basarili fetch sonrasi okunur", () => {
  // `const state = approvals || {}` satiri, null-erken-donus BLOGUNDAN SONRA
  // olmali - yoksa null hala state={} olarak sessizce ilerler ve ayni hata
  // geri doner.
  const nullReturnIndex = app.indexOf("if (approvals === null) {");
  const stateLineIndex = app.indexOf("const state = approvals || {};");
  assert.ok(nullReturnIndex > -1 && stateLineIndex > -1);
  assert.ok(nullReturnIndex < stateLineIndex, "null kontrolu state okumasindan ONCE olmali");
});
