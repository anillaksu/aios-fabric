// system.health capability'sinin saf mantigi (health.ts) icin sozlesme
// testleri. Calistirma: npm test (fabric/) - node:test, dis baglanti/
// dosya YOK (computeHealth tamamen senkron/sentetik girdilerle calisir).

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeHealth, type HealthInputs } from "../src/health.ts";

function baseInputs(overrides: Partial<HealthInputs> = {}): HealthInputs {
  return {
    nodeVersion: "v26.4.0",
    requiredNodeMajor: 22,
    requiredNodeMinor: 6,
    fabricDirWritable: true,
    memUsedPercent: 40,
    cpuLoadRatio: 0.2,
    diskAvailableMB: 5000,
    ...overrides,
  };
}

test("computeHealth: her sey tutarli/normalse HEALTHY", () => {
  const result = computeHealth(baseInputs());
  assert.equal(result.status, "HEALTHY");
  assert.equal(result.checks.node_version_ok, true);
});

test("computeHealth: node surumu README asgarisinin (22.6) altindaysa DEGRADED", () => {
  const result = computeHealth(baseInputs({ nodeVersion: "v20.11.0" }));
  assert.equal(result.status, "DEGRADED");
  assert.equal(result.checks.node_version_ok, false);
});

test("computeHealth: 22.6.0 tam asgari surum -> saglikli (esik dahil)", () => {
  const result = computeHealth(baseInputs({ nodeVersion: "v22.6.0" }));
  assert.equal(result.checks.node_version_ok, true);
});

test("computeHealth: fabric dizini yazilamiyorsa UNHEALTHY (journal/state yazamaz)", () => {
  const result = computeHealth(baseInputs({ fabricDirWritable: false }));
  assert.equal(result.status, "UNHEALTHY");
  assert.match(result.error ?? "", /yazilabilir degil/);
});

test("computeHealth: bellek kullanimi %95'i asarsa DEGRADED", () => {
  assert.equal(computeHealth(baseInputs({ memUsedPercent: 96 })).status, "DEGRADED");
});

test("computeHealth: cpu yuku 0.9 orani asarsa DEGRADED", () => {
  assert.equal(computeHealth(baseInputs({ cpuLoadRatio: 0.95 })).status, "DEGRADED");
});

test("computeHealth: disk 100MB altindaysa UNHEALTHY (DEGRADED'i EZER)", () => {
  const result = computeHealth(baseInputs({ memUsedPercent: 96, diskAvailableMB: 50 }));
  assert.equal(result.status, "UNHEALTHY");
  assert.match(result.error ?? "", /dusuk disk alani/);
});

test("computeHealth: disk bilgisi alinamadiginda ('unknown') UNHEALTHY tetiklenmez", () => {
  const result = computeHealth(baseInputs({ diskAvailableMB: undefined }));
  assert.equal(result.status, "HEALTHY");
  assert.equal(result.checks.disk_available, "unknown");
});
