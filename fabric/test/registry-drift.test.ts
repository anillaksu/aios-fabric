// B-6 kapatma testi (2026-08-17): screenspec.ts (sunucu) ile registry.js/
// app.js (istemci) bilesen tipi ve UI meta-eylem listelerini AYRI dosyalarda
// elle senkron tutuyordu - MIMARI_TEMEL.md Bolum 8'deki "kesif yuzeyi ile
// yurutme yuzeyi ayni tekil gercege dayanmali" invaryantinin kodda bilinen
// tek ihlaliydi (W1.9/W1.10 deseni: bir yol duzeltilir, ikizi unutulur).
//
// Bu test tek kaynak yapmiyor (o daha buyuk bir refactor, W6'da
// degerlendirilebilir) - drift'i YAKALIYOR: iki liste birbirinden
// SAPARSA burada patlar, sessizce farkli seyi "gecerli" saymazlar.
//
// Calistirma: npm test (fabric/) - node:test, dis baglanti/dosya YOK.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_TYPES, UI_META_ACTIONS as SERVER_UI_META_ACTIONS } from "../src/screenspec.ts";
import { REGISTRY } from "../public/js/registry.js";
import { UI_META_ACTIONS as CLIENT_UI_META_ACTIONS } from "../public/js/ui-actions.js";

test("bilesen tipleri: screenspec.ts ALLOWED_TYPES == registry.js REGISTRY anahtarlari", () => {
  const server = [...ALLOWED_TYPES].sort();
  const client = Object.keys(REGISTRY).sort();
  assert.deepEqual(
    server,
    client,
    "screenspec.ts:ALLOWED_TYPES ile registry.js:REGISTRY birbirinden SAPTI - " +
      "biri guncellenip digeri unutuldu (B-6). Sunucu bir tipi gecerli sayip " +
      "istemci reddedebilir ya da tam tersi.",
  );
});

test("UI meta-eylemleri: screenspec.ts UI_META_ACTIONS == app.js UI_META_ACTIONS", () => {
  const server = [...SERVER_UI_META_ACTIONS].sort();
  const client = [...CLIENT_UI_META_ACTIONS].sort();
  assert.deepEqual(
    server,
    client,
    "screenspec.ts:UI_META_ACTIONS ile app.js:UI_META_ACTIONS birbirinden SAPTI (B-6). " +
      "Sunucu tarafi validateSpecNode() bir eylemi elerken istemci renderer.js onu " +
      "hala tiklanabilir gosterebilir (ya da tam tersi).",
  );
});
