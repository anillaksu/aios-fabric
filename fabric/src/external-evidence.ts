import type { FabricEvent } from "./types.ts";

export interface ExternalEvidenceInput {
  schema: "aios.external-evidence.v1";
  source: string;
  evidenceHash: string;
  classification: "UNVERIFIED_MODEL_OUTPUT" | "VERIFIED_ARTIFACT";
  correlationId: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}

export function normalizeExternalEvidence(value: unknown): ExternalEvidenceInput {
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("external evidence body gerekli");
  const input = value as Record<string, unknown>;
  if (input.schema !== "aios.external-evidence.v1") throw new Error("external evidence schema gecersiz");
  if (typeof input.source !== "string" || !/^[a-z0-9._:-]{2,80}$/i.test(input.source)) throw new Error("external evidence source gecersiz");
  if (typeof input.evidenceHash !== "string" || !/^[a-f0-9]{64}$/.test(input.evidenceHash)) throw new Error("external evidence hash gecersiz");
  if (input.classification !== "UNVERIFIED_MODEL_OUTPUT" && input.classification !== "VERIFIED_ARTIFACT") throw new Error("external evidence classification gecersiz");
  if (typeof input.correlationId !== "string" || input.correlationId.length < 2 || input.correlationId.length > 160) throw new Error("external evidence correlationId gecersiz");
  if (input.summary !== undefined && (typeof input.summary !== "string" || input.summary.length > 500)) throw new Error("external evidence summary gecersiz");
  if (input.metadata !== undefined && (!input.metadata || Array.isArray(input.metadata) || typeof input.metadata !== "object")) throw new Error("external evidence metadata gecersiz");
  return input as unknown as ExternalEvidenceInput;
}

export function toExternalEvidenceEvent(input: ExternalEvidenceInput): Omit<FabricEvent, "seq" | "id" | "ts"> {
  return {
    type: "EXTERNAL_EVIDENCE_RECORDED",
    correlationId: input.correlationId,
    causationId: null,
    payload: {
      schema: input.schema,
      source: input.source,
      evidenceHash: input.evidenceHash,
      classification: input.classification,
      summary: input.summary ?? null,
      metadata: input.metadata ?? {},
    },
    idempotencyKey: `external-evidence:${input.evidenceHash}`,
  };
}
