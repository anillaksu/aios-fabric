import { createHash } from "node:crypto";
import type { FabricEvent } from "./types.ts";

export const TESTER_OBSERVATION_SCHEMA = "aios.tester-observation.v1" as const;
export const TESTER_BUNDLE_SCHEMA = "aios.tester-observation-bundle.v1" as const;
export const LIBRARY_BUDGET_SCHEMA = "aios.library-budget-receipt.v1" as const;
export const TESTER_EVIDENCE_CONTRACT = Object.freeze({
  schema: "aios.tester-evidence-contract.v1",
  status: "READY_HASH_CHAIN_INGEST",
  observationSchema: TESTER_OBSERVATION_SCHEMA,
  bundleSchema: TESTER_BUNDLE_SCHEMA,
  ingest: { method: "POST", path: "/tester-observations", auth: "A2A_BEARER_SERVER_SIDE_EXPORT" },
  privacy: { rawUserContent: false, testerIdentity: "PSEUDONYMOUS_SHA256", consentReceiptRequired: true },
  truth: { integrity: "HASH_CHAIN_VERIFIED", claim: "TESTER_CLAIM_UNVERIFIED" },
  playEligibilityAuthority: "GOOGLE_PLAY_CONSOLE_OPT_IN_CONTINUITY_NOT_THIS_LEDGER",
});

const HASH = /^[a-f0-9]{64}$/;
const SAFE_TEXT = /^[^\u0000-\u001f\u007f]{1,160}$/;
const OBSERVATION_KINDS = new Set([
  "SESSION_STARTED",
  "SESSION_ENDED",
  "SURFACE_VIEWED",
  "USER_DECISION",
  "CAPABILITY_OUTCOME",
  "FEEDBACK_HASHED",
  "FAULT",
  "RESEARCH_ARTIFACT_HASHED",
]);

const canonicalize = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`).join(",")}}`;
};

const sha256 = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");

const assertExactKeys = (value: Record<string, unknown>, allowed: readonly string[], scope: string) => {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) throw new TypeError(`${scope}_UNKNOWN_FIELD:${unexpected.sort().join(",")}`);
};

const assertHash = (value: unknown, name: string): asserts value is string => {
  if (typeof value !== "string" || !HASH.test(value)) throw new TypeError(`${name}_HASH_INVALID`);
};

const assertText = (value: unknown, name: string, maximum = 160): asserts value is string => {
  if (typeof value !== "string" || value.length > maximum || !SAFE_TEXT.test(value)) throw new TypeError(`${name}_INVALID`);
};

const assertIso = (value: unknown): asserts value is string => {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new TypeError("OBSERVED_AT_INVALID");
  }
};

export interface TesterObservation {
  schema: typeof TESTER_OBSERVATION_SCHEMA;
  seq: number;
  observedAt: string;
  kind: string;
  subject: string;
  outcome: string;
  buildMarker: string;
  previousHash: "GENESIS" | string;
  observationHash: string;
}

type TesterObservationInput = Omit<TesterObservation, "schema" | "observationHash">;

export function createTesterObservation(value: TesterObservationInput): TesterObservation {
  const input = value as unknown as Record<string, unknown>;
  assertExactKeys(input, ["seq", "observedAt", "kind", "subject", "outcome", "buildMarker", "previousHash"], "TESTER_OBSERVATION");
  if (!Number.isSafeInteger(input.seq) || Number(input.seq) < 1) throw new TypeError("OBSERVATION_SEQ_INVALID");
  assertIso(input.observedAt);
  if (typeof input.kind !== "string" || !OBSERVATION_KINDS.has(input.kind)) throw new TypeError("OBSERVATION_KIND_INVALID");
  assertText(input.subject, "OBSERVATION_SUBJECT");
  assertText(input.outcome, "OBSERVATION_OUTCOME");
  assertText(input.buildMarker, "BUILD_MARKER", 128);
  if (input.previousHash !== "GENESIS") assertHash(input.previousHash, "PREVIOUS");
  const unsigned = {
    schema: TESTER_OBSERVATION_SCHEMA,
    seq: input.seq as number,
    observedAt: input.observedAt,
    kind: input.kind,
    subject: input.subject,
    outcome: input.outcome,
    buildMarker: input.buildMarker,
    previousHash: input.previousHash as string,
  };
  return Object.freeze({ ...unsigned, observationHash: sha256(canonicalize(unsigned)) });
}

export interface TesterObservationBundle {
  schema: typeof TESTER_BUNDLE_SCHEMA;
  testerPseudonymHash: string;
  consentReceiptHash: string;
  packageName: string;
  versionCode: number;
  versionName: string;
  buildMarker: string;
  observations: TesterObservation[];
  headHash: string;
  bundleHash: string;
}

type TesterObservationBundleInput = Omit<TesterObservationBundle, "schema" | "headHash" | "bundleHash">;

export function buildTesterObservationBundle(value: TesterObservationBundleInput): TesterObservationBundle {
  const observations = value.observations.map((observation) => verifyObservation(observation));
  if (!observations.length || observations.length > 10_000) throw new TypeError("OBSERVATION_COUNT_INVALID");
  const headHash = observations.at(-1)!.observationHash;
  const unsigned = normalizeBundleHeader({ ...value, observations, headHash });
  return Object.freeze({ ...unsigned, bundleHash: sha256(canonicalize(unsigned)) });
}

export function verifyTesterObservationBundle(value: unknown): TesterObservationBundle {
  if (!value || Array.isArray(value) || typeof value !== "object") throw new TypeError("TESTER_BUNDLE_REQUIRED");
  const input = value as Record<string, unknown>;
  assertExactKeys(input, ["schema", "testerPseudonymHash", "consentReceiptHash", "packageName", "versionCode", "versionName", "buildMarker", "observations", "headHash", "bundleHash"], "TESTER_BUNDLE");
  if (input.schema !== TESTER_BUNDLE_SCHEMA) throw new TypeError("TESTER_BUNDLE_SCHEMA_INVALID");
  assertHash(input.bundleHash, "BUNDLE");
  if (!Array.isArray(input.observations) || !input.observations.length || input.observations.length > 10_000) throw new TypeError("OBSERVATION_COUNT_INVALID");
  const observations = input.observations.map((item) => verifyObservation(item));
  const unsigned = normalizeBundleHeader({ ...input, observations, headHash: input.headHash });
  if (unsigned.headHash !== observations.at(-1)!.observationHash) throw new TypeError("BUNDLE_HEAD_HASH_MISMATCH");
  if (sha256(canonicalize(unsigned)) !== input.bundleHash) throw new TypeError("BUNDLE_HASH_MISMATCH");
  return Object.freeze({ ...unsigned, bundleHash: input.bundleHash }) as TesterObservationBundle;
}

function verifyObservation(value: unknown): TesterObservation {
  if (!value || Array.isArray(value) || typeof value !== "object") throw new TypeError("TESTER_OBSERVATION_REQUIRED");
  const input = value as Record<string, unknown>;
  assertExactKeys(input, ["schema", "seq", "observedAt", "kind", "subject", "outcome", "buildMarker", "previousHash", "observationHash"], "TESTER_OBSERVATION");
  if (input.schema !== TESTER_OBSERVATION_SCHEMA) throw new TypeError("OBSERVATION_SCHEMA_INVALID");
  assertHash(input.observationHash, "OBSERVATION");
  const rebuilt = createTesterObservation({
    seq: input.seq as number,
    observedAt: input.observedAt as string,
    kind: input.kind as string,
    subject: input.subject as string,
    outcome: input.outcome as string,
    buildMarker: input.buildMarker as string,
    previousHash: input.previousHash as string,
  });
  if (rebuilt.observationHash !== input.observationHash) throw new TypeError("OBSERVATION_HASH_MISMATCH");
  return rebuilt;
}

function normalizeBundleHeader(value: Record<string, unknown>) {
  assertHash(value.testerPseudonymHash, "TESTER_PSEUDONYM");
  assertHash(value.consentReceiptHash, "CONSENT_RECEIPT");
  assertText(value.packageName, "PACKAGE_NAME", 160);
  if (!Number.isSafeInteger(value.versionCode) || Number(value.versionCode) < 1) throw new TypeError("VERSION_CODE_INVALID");
  assertText(value.versionName, "VERSION_NAME", 100);
  assertText(value.buildMarker, "BUILD_MARKER", 128);
  assertHash(value.headHash, "HEAD");
  const observations = value.observations as TesterObservation[];
  let previous: string = "GENESIS";
  let previousTime = -Infinity;
  for (const [index, observation] of observations.entries()) {
    if (observation.seq !== index + 1) throw new TypeError("OBSERVATION_SEQUENCE_GAP");
    if (observation.previousHash !== previous) throw new TypeError("OBSERVATION_PREVIOUS_HASH_MISMATCH");
    if (observation.buildMarker !== value.buildMarker) throw new TypeError("OBSERVATION_BUILD_MARKER_MISMATCH");
    const observedMs = Date.parse(observation.observedAt);
    if (observedMs < previousTime) throw new TypeError("OBSERVATION_TIME_REVERSED");
    previousTime = observedMs;
    previous = observation.observationHash;
  }
  return {
    schema: TESTER_BUNDLE_SCHEMA,
    testerPseudonymHash: value.testerPseudonymHash as string,
    consentReceiptHash: value.consentReceiptHash as string,
    packageName: value.packageName as string,
    versionCode: value.versionCode as number,
    versionName: value.versionName as string,
    buildMarker: value.buildMarker as string,
    observations,
    headHash: value.headHash as string,
  };
}

export function toTesterObservationEvent(bundleValue: unknown): Omit<FabricEvent, "seq" | "id" | "ts"> {
  const bundle = verifyTesterObservationBundle(bundleValue);
  return {
    type: "TESTER_OBSERVATION_BUNDLE_RECORDED",
    correlationId: `tester:${bundle.testerPseudonymHash.slice(0, 16)}:${bundle.headHash.slice(0, 16)}`,
    causationId: null,
    payload: {
      schema: bundle.schema,
      testerPseudonymHash: bundle.testerPseudonymHash,
      consentReceiptHash: bundle.consentReceiptHash,
      packageName: bundle.packageName,
      versionCode: bundle.versionCode,
      versionName: bundle.versionName,
      buildMarker: bundle.buildMarker,
      observationCount: bundle.observations.length,
      headHash: bundle.headHash,
      bundleHash: bundle.bundleHash,
      firstObservedAt: bundle.observations[0].observedAt,
      lastObservedAt: bundle.observations.at(-1)!.observedAt,
      integrity: "HASH_CHAIN_VERIFIED",
      truth: "TESTER_CLAIM_UNVERIFIED",
      rawUserContent: "NOT_COLLECTED_BY_CONTRACT",
    },
    idempotencyKey: `tester-observation:${bundle.bundleHash}`,
  };
}

type LibraryBudgetInput = {
  declared: { windowsRustBytes: number; evidenceLibraryBytes: number };
  observed: {
    windowsRustDllBytes: number;
    androidRustSoBytes: number;
    fabricFrontendBytes: number;
    evidenceLedgerBytes: number;
    apkBytes: number;
  };
};

export function buildLibraryBudgetReceipt(input: LibraryBudgetInput) {
  for (const [name, value] of Object.entries({ ...input.declared, ...input.observed })) {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`LIBRARY_BYTES_INVALID:${name}`);
  }
  const unsigned = {
    schema: LIBRARY_BUDGET_SCHEMA,
    classification: "DECLARED_BUDGET_WITH_OBSERVED_MEASUREMENTS" as const,
    declared: { ...input.declared },
    observed: { ...input.observed },
    invariants: [
      "DECLARED_BUDGET_IS_NOT_AN_OBSERVED_SIZE",
      "MODEL_WEIGHT_PACKS_ARE_ACCOUNTED_SEPARATELY",
      "EVIDENCE_BODY_IS_CONTENT_ADDRESSED_AND_NOT_BUNDLED_IN_BASE_APK",
    ],
  };
  return Object.freeze({ ...unsigned, receiptHash: sha256(canonicalize(unsigned)) });
}
