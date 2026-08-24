import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLibraryBudgetReceipt,
  buildTesterObservationBundle,
  createTesterObservation,
  toTesterObservationEvent,
  verifyTesterObservationBundle,
} from "../src/tester-evidence.ts";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

test("tester gozlemleri ham icerik tasimadan deterministik hash zinciri kurar", () => {
  const first = createTesterObservation({
    seq: 1,
    observedAt: "2026-08-24T08:00:00.000Z",
    kind: "SESSION_STARTED",
    subject: "aios.frontend",
    outcome: "USER_PRODUCT_SURFACE",
    buildMarker: "play:3:0.4.0-fabric-surface",
    previousHash: "GENESIS",
  });
  const second = createTesterObservation({
    seq: 2,
    observedAt: "2026-08-24T08:01:00.000Z",
    kind: "USER_DECISION",
    subject: "launcher.role",
    outcome: "SKIPPED",
    buildMarker: "play:3:0.4.0-fabric-surface",
    previousHash: first.observationHash,
  });
  const bundle = buildTesterObservationBundle({
    testerPseudonymHash: HASH_A,
    consentReceiptHash: HASH_B,
    packageName: "com.aios.nodeagent",
    versionCode: 3,
    versionName: "0.4.0-fabric-surface",
    buildMarker: "play:3:0.4.0-fabric-surface",
    observations: [first, second],
  });
  assert.equal(verifyTesterObservationBundle(bundle).bundleHash, bundle.bundleHash);
  const event = toTesterObservationEvent(bundle);
  assert.equal(event.type, "TESTER_OBSERVATION_BUNDLE_RECORDED");
  assert.equal((event.payload as any).integrity, "HASH_CHAIN_VERIFIED");
  assert.equal((event.payload as any).truth, "TESTER_CLAIM_UNVERIFIED");
  assert.equal((event.payload as any).rawUserContent, "NOT_COLLECTED_BY_CONTRACT");
  assert.equal(Object.hasOwn(event.payload as object, "rawText"), false);
});

test("tester zinciri degistirilen sonuc ve ham icerikte fail closed durur", () => {
  const observation = createTesterObservation({
    seq: 1,
    observedAt: "2026-08-24T08:00:00.000Z",
    kind: "SURFACE_VIEWED",
    subject: "aios.frontend",
    outcome: "READY",
    buildMarker: "build-1",
    previousHash: "GENESIS",
  });
  assert.throws(() => createTesterObservation({ ...(observation as any), rawText: "secret" }), /UNKNOWN_FIELD/);
  assert.throws(() => verifyTesterObservationBundle({
    schema: "aios.tester-observation-bundle.v1",
    testerPseudonymHash: HASH_A,
    consentReceiptHash: HASH_B,
    packageName: "com.aios.nodeagent",
    versionCode: 3,
    versionName: "0.4.0",
    buildMarker: "build-1",
    observations: [{ ...observation, outcome: "TAMPERED" }],
    headHash: observation.observationHash,
    bundleHash: HASH_A,
  }), /HASH_MISMATCH/);
});

test("100 MiB Rust ve 250 MiB kanit degerleri olcum degil ayri butce kalir", () => {
  const receipt = buildLibraryBudgetReceipt({
    declared: { windowsRustBytes: 100 * 1024 * 1024, evidenceLibraryBytes: 250 * 1024 * 1024 },
    observed: {
      windowsRustDllBytes: 107_008,
      androidRustSoBytes: 625_920,
      fabricFrontendBytes: 653_309,
      evidenceLedgerBytes: 948_784,
      apkBytes: 9_514_748,
    },
  });
  assert.equal(receipt.classification, "DECLARED_BUDGET_WITH_OBSERVED_MEASUREMENTS");
  assert.equal(receipt.declared.windowsRustBytes, 104_857_600);
  assert.equal(receipt.observed.windowsRustDllBytes, 107_008);
  assert.notEqual(receipt.declared.windowsRustBytes, receipt.observed.windowsRustDllBytes);
  assert.match(receipt.receiptHash, /^[a-f0-9]{64}$/);
});
