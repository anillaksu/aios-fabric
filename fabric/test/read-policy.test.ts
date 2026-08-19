// /read security contract: direct execution yalnizca explicit readOnly +
// risk:safe capability'ler icin mumkundur. Risk:safe, tek basina yeterli
// degildir; yan etkili safe capability'ler fail-closed kalmalidir.

import { test } from "node:test";
import assert from "node:assert/strict";
import { capabilityMap } from "../src/capabilities.ts";
import { executeReadOnly, isReadExposed, readExposedNames } from "../src/read-policy.ts";

test("/read yalniz explicit readOnly ve risk:safe capability'leri acar", () => {
  assert.equal(isReadExposed("sensor.battery.read"), true);
  assert.equal(isReadExposed("wifi.info"), true);
  assert.equal(isReadExposed("app.list"), true);
  assert.deepEqual(readExposedNames().sort(), ["app.list", "sensor.battery.read", "wifi.info"]);

  // safe olsa bile yan etkili capability /read'e acilamaz.
  assert.equal(capabilityMap.get("torch.set")?.risk, "safe");
  assert.equal(isReadExposed("torch.set"), false);

  // notify/ask ve bilinmeyen capability'ler fail-closed kalir.
  assert.equal(isReadExposed("sensor.location.read"), false);
  assert.equal(isReadExposed("script.run"), false);
  assert.equal(isReadExposed("boyle.bir.capability.yok"), false);
});

test("read facade policy disinda capability execute etmez", async () => {
  const blocked = await executeReadOnly("torch.set", { enabled: true });
  assert.equal(blocked.ok, false);
  assert.match(String(blocked.error), /izinli degil/);
});
