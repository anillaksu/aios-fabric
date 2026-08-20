// Premium audit bulgusu (2026-08-20): sw.js SHELL_FILES precache listesi
// public/js icindeki 30 dosyanin yalniz 5'ini sayiyordu. Fetch handler
// network-first oldugu icin ilk ONLINE oturum tamamlaninca eksik dosyalar
// firsatci onbelleklenir, ama SW kurulumu bitip ilk online oturum
// TAMAMLANMADAN cevrimdisiya gecen kullanici icin onbellekte olmayan bir
// modul import edilemez - kullanici bos/olu bir ekranla kalir (goal §12).
//
// Bu test SHELL_FILES'i tek dogruluk kaynagi (gercek dosya sistemi) ile
// karsilastirir; registry-drift.test.ts ile ayni desen - iki liste
// SAPARSA burada patlar, sessizce eksik kalmaz.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const swSource = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

function shellFiles(): string[] {
  const match = swSource.match(/const SHELL_FILES = \[([\s\S]*?)\];/);
  assert.ok(match, "sw.js icinde SHELL_FILES bulunamadi");
  return [...match![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

test("sw.js SHELL_FILES: public/js altindaki HER .js dosyasini precache eder", () => {
  const files = shellFiles();
  const realJs = readdirSync(new URL("../public/js/", import.meta.url))
    .filter((name) => name.endsWith(".js"));
  assert.ok(realJs.length > 0, "public/js bos gorunuyor - test kirik olabilir");
  const missing = realJs.filter((name) => !files.includes(`/js/${name}`));
  assert.deepEqual(missing, [], "SHELL_FILES bu gercek dosyalari eksik tasiyor - offline ilk oturumda olu ekran riski");
});

test("sw.js SHELL_FILES: public/css altindaki HER .css dosyasini precache eder", () => {
  const files = shellFiles();
  const realCss = readdirSync(new URL("../public/css/", import.meta.url))
    .filter((name) => name.endsWith(".css"));
  const missing = realCss.filter((name) => !files.includes(`/css/${name}`));
  assert.deepEqual(missing, [], "SHELL_FILES bu gercek CSS dosyalarini eksik tasiyor");
});

test("sw.js SHELL_FILES: listede olmayan / silinmis bir dosya kalmamis (ters sapma)", () => {
  const files = shellFiles();
  const realJs = new Set(readdirSync(new URL("../public/js/", import.meta.url)).filter((n) => n.endsWith(".js")));
  const realCss = new Set(readdirSync(new URL("../public/css/", import.meta.url)).filter((n) => n.endsWith(".css")));
  const stale = files.filter((f) => {
    if (f.startsWith("/js/")) return !realJs.has(f.slice(4));
    if (f.startsWith("/css/")) return !realCss.has(f.slice(5));
    return false;
  });
  assert.deepEqual(stale, [], "SHELL_FILES silinmis dosyalara referans veriyor - caches.addAll() install'da fail-closed patlar");
});

test("sw.js: onbellek versiyonu bu turda ilerletildi", () => {
  assert.match(swSource, /const SHELL = "aios-shell-v7"/);
});

test("sw.js: /read, /intent, /events, /a2a, /state hicbir zaman onbelleklenmez", () => {
  // Bu davranissal invaryant degismedi; premium audit veri tazeligini bozmaz.
  assert.match(swSource, /url\.pathname\.startsWith\("\/read"\)/);
  assert.match(swSource, /url\.pathname\.startsWith\("\/intent"\)/);
  assert.match(swSource, /url\.pathname\.startsWith\("\/events"\)/);
  assert.match(swSource, /url\.pathname\.startsWith\("\/a2a"\)/);
  assert.match(swSource, /url\.pathname\.startsWith\("\/state"\)/);
});
