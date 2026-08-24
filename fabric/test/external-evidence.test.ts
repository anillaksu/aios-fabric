import test from "node:test";
import assert from "node:assert/strict";
import { normalizeExternalEvidence, toExternalEvidenceEvent } from "../src/external-evidence.ts";

const evidence = {
  schema: "aios.external-evidence.v1" as const,
  source: "aios-cli-chat",
  evidenceHash: "a".repeat(64),
  classification: "UNVERIFIED_MODEL_OUTPUT" as const,
  correlationId: "chat:session-1",
  summary: "model output",
};

test("external evidence model ciktisini dogrulanmis gercege yukseltmez", () => {
  const normalized = normalizeExternalEvidence(evidence);
  const event = toExternalEvidenceEvent(normalized);
  assert.equal(event.type, "EXTERNAL_EVIDENCE_RECORDED");
  assert.equal((event.payload as Record<string, unknown>).classification, "UNVERIFIED_MODEL_OUTPUT");
  assert.equal(event.idempotencyKey, `external-evidence:${evidence.evidenceHash}`);
});

test("external evidence hatali hash ve sinifta fail-closed durur", () => {
  assert.throws(() => normalizeExternalEvidence({ ...evidence, evidenceHash: "abc" }), /hash gecersiz/);
  assert.throws(() => normalizeExternalEvidence({ ...evidence, classification: "VERIFIED_TRUTH" }), /classification gecersiz/);
});
