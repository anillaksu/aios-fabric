// PWA boot'ta wakelock yan-etki urettiği icin /read facade'ina degil,
// mevcut dispatcher/policy zincirine gitmelidir. Bu statik kontrat, ileride
// fark edilmeden direct-read bypass'i geri gelmesini engeller.

import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("PWA boot wakelock acquisition'i dispatcher uzerinden ister", () => {
  const source = readFileSync(new URL("../public/js/app.js", import.meta.url), "utf8");

  assert.doesNotMatch(source, /read\("wakelock\.acquire"\)/);
  assert.match(source, /ctx\.dispatch\(\{ type: "wakelock\.acquire" \}\)/);
});
