import test from "node:test";
import assert from "node:assert/strict";
import { readRuntimeStatus } from "../src/runtime-status.ts";

test("runtime status HTTP ve watchdog kanitlarini acik online/down durumuna cevirir", async () => {
  const result = await readRuntimeStatus({
    home: "/home/u",
    fetcher: async (url) => ({ ok: url.includes(9201), status: url.includes(9201) ? 200 : 503 }),
    processCheck: async (pattern) => pattern.includes("watchdog"),
  });

  assert.equal(result.services.find((service) => service.id === "fabric")?.status, "online");
  assert.deepEqual(result.services.slice(1).map((service) => service.status), ["online", "down", "online"]);
  assert.match(result.services.find((service) => service.id === "hermes_gateway")?.detail ?? "", /503/);
});

test("runtime status erisilemeyen servisleri online diye varsaymaz", async () => {
  const result = await readRuntimeStatus({
    fetcher: async () => { throw new Error("connection refused"); },
    processCheck: async () => false,
  });
  assert.deepEqual(result.services.slice(1).map((service) => service.status), ["down", "down", "down"]);
  assert.equal(result.services[1].detail, "yanit yok");
});
