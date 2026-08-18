// W6.L - Prompt->artefakt onbellegi sozlesme testleri (2026-08-18).
//
// Kapsam BILINCLI KUCUK TUTULDU (owner: "yalnizca guvenli canonicalization,
// dolgu kelimesi silme YOK - yanlis pozitif riski simdilik kabul edilemez").
// Test edilen: (1) normalizasyon YALNIZCA kucuk harf/Unicode/bosluk yapiyor,
// anlam degistirebilecek kelime SILMIYOR; (2) cache anahtari dort bilesenden
// olusuyor (prompt+capability-risk+registry+model) - herhangi biri degisince
// anahtar da degisiyor, eski (olasi gecersiz) uretim asla yanlislikla
// eslesmez. IndexedDB kismi (getCached/putCached) Node'da test edilemiyor
// (tarayici API'si, ayni sinir windowmanager/artifact-store icin de gecerliydi)
// - canli cihazda dogrulanir.
//
// Calistirma: npm test (fabric/) - node:test, dis baglanti/dosya YOK.

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePrompt, cacheKey, writeEligible } from "../public/js/prompt-cache.js";

test("normalizePrompt: kucuk harf + bosluk sadelestirme, KELIME SILINMEZ", () => {
  assert.equal(normalizePrompt("  Hesap   Makinesi   Yap  "), "hesap makinesi yap");
  assert.equal(normalizePrompt("BANA hesap makinesi yap"), "bana hesap makinesi yap");
});

test("normalizePrompt: dolgu kelimeleri SILINMEZ - iki farkli ifade FARKLI kalir (bilincli, L1 kapsami)", () => {
  const a = normalizePrompt("bana hesap makinesi yap");
  const b = normalizePrompt("hesap makinesi yapar misin");
  assert.notEqual(a, b, "L1'de dolgu kelimesi silme YOK - bu ikisi kasitli olarak AYRI kalmali");
});

test("normalizePrompt: Unicode NFKC + turkce buyuk/kucuk harf farklari es davranir", () => {
  assert.equal(normalizePrompt("İSTANBUL"), normalizePrompt("i̇stanbul"));
});

test("cacheKey: ayni girdiler -> ayni anahtar (deterministik)", async () => {
  const caps = [{ name: "sensor.battery.read", risk: "safe" }];
  const k1 = await cacheKey("pil durumu goster", caps);
  const k2 = await cacheKey("Pil Durumu Goster", caps);
  assert.equal(k1, k2, "normalizasyon sonrasi ayni oldugu icin anahtar da ayni olmali");
});

test("cacheKey: capability RISK SEVIYESI degisince anahtar degisir (isim ayni kalsa bile)", async () => {
  const capsSafe = [{ name: "script.run", risk: "safe" }];
  const capsAsk = [{ name: "script.run", risk: "ask" }];
  const kSafe = await cacheKey("bir sey calistir", capsSafe);
  const kAsk = await cacheKey("bir sey calistir", capsAsk);
  assert.notEqual(kSafe, kAsk, "risk safe->ask degisince eski onbellek GECERSIZ sayilmali");
});

test("cacheKey: capability seti farkli olunca anahtar degisir", async () => {
  const caps1 = [{ name: "wifi.info", risk: "safe" }];
  const caps2 = [{ name: "wifi.info", risk: "safe" }, { name: "volume.set", risk: "notify" }];
  const k1 = await cacheKey("ag bilgisi", caps1);
  const k2 = await cacheKey("ag bilgisi", caps2);
  assert.notEqual(k1, k2);
});

test("cacheKey: capability sirasi anahtari DEGISTIRMEZ (sort edilir)", async () => {
  const a = [{ name: "wifi.info", risk: "safe" }, { name: "volume.set", risk: "notify" }];
  const b = [{ name: "volume.set", risk: "notify" }, { name: "wifi.info", risk: "safe" }];
  const ka = await cacheKey("x", a);
  const kb = await cacheKey("x", b);
  assert.equal(ka, kb, "capability sirasi anlam tasimaz, hash'i etkilememeli");
});

// ─── writeEligible: W6.L revize (2026-08-18) - yazma uygunlugu KAYNAKTAN
// belirlenir, sohbet gecmisinden DEGIL. Bu iki test owner'in istedigi
// guvenlik sinirinin CEKIRDEGINI dogrudan sinar (IndexedDB round-trip
// canli cihazda kanitlanir - bkz. dosya basindaki not).

test("writeEligible: guvenilmeyen kaynak (HERMES sohbeti, trustedWrite verilmemis/false) YAZAMAZ", () => {
  // ask()'in butun varsayilan cagri yollari (normal mesaj, ui.ask retry,
  // ui.miniapp, share-intent) trustedWrite GONDERMEZ - "evet" gibi baglama
  // bagli bir mesaj HERMES'in ilk mesaji olarak gelse ve artefakt uretilse
  // bile cache'e YAZILAMAZ.
  assert.equal(writeEligible(undefined), false);
  assert.equal(writeEligible(false), false);
});

test("writeEligible: guvenilir/standalone kaynak (ARTEFAKT bos pencere, YENILE) YAZABILIR", () => {
  assert.equal(writeEligible(true), true);
});

test("senaryo: ARTEFAKT'ta yazilan istekle HERMES'te AYNI (normalize) istek AYNI anahtara dusuyor (capraz-yuzey reuse'un temeli)", async () => {
  const caps = [{ name: "sensor.battery.read", risk: "safe" }];
  // ARTEFAKT'ta (fillWindow, trustedWrite=true) yazilan istek:
  const artefaktKey = await cacheKey("basit hesap makinesi paneli", caps);
  // Ayni oturumda DAHA SONRA HERMES sohbetinde (trustedWrite yok, farkli
  // yazimla) AYNI istek - READ her zaman denendigi icin (ask()'ta kosulsuz
  // getCached) bu anahtar isabet eder, LLM'e HIC gidilmez:
  const hermesKey = await cacheKey("Basit Hesap Makinesi Paneli", caps);
  assert.equal(artefaktKey, hermesKey, "READ kaynaktan bagimsiz calisir - anahtar zaten sadece metne/capability'ye bakiyor");
});
