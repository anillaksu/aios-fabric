import { createHash } from "node:crypto";

export const MODEL_PACK_SELECTION_SCHEMA = "aios.model-pack-selection.v1" as const;
export const MODEL_PACK_SELECTION_CONTRACT = Object.freeze({
  schema: MODEL_PACK_SELECTION_SCHEMA,
  status: "READY_DETERMINISTIC_SELECTOR_LIVE_LOAD_NOT_BOUND",
  selectionInputs: ["GRAPH_HEAD_HASH", "GRAPH_PROJECTION_HASH", "POLICY_HASH", "RAM", "VRAM", "MAX_PACK_BYTES"],
  requiredPackIdentity: ["MANIFEST_SHA256", "WEIGHTS_SHA256", "TOKENIZER_SHA256", "EVIDENCE_SET_SHA256"],
  executionAuthority: "FABRIC_DISPATCHER_VIA_LLM_GENERATE_AIOS",
  liveBlocker: "CANONICAL_SERVER_SIDE_MODEL_PACK_REGISTRY_NOT_PRESENT",
  invariants: [
    "MODEL_NUMERICAL_WEIGHTS_ARE_NEVER_MUTATED_BY_OBSERVATIONS",
    "SELECTION_RECEIPT_IS_NOT_MODEL_OUTPUT_TRUTH",
    "PACK_LOAD_REQUIRES_SEPARATE_RUNTIME_ADMISSION",
  ],
});
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-z0-9][a-z0-9._:-]{1,119}$/i;

type Candidate = {
  modelId: string;
  manifestHash: string;
  weightsHash: string;
  tokenizerHash: string;
  packBytes: number;
  minRamBytes: number;
  minVramBytes: number;
  capabilities: string[];
  graphScoreMicros: number;
  evidenceSetHash: string;
};

type SelectionInput = {
  graphHeadHash: string;
  graphProjectionHash: string;
  policyHash: string;
  requiredCapabilities: string[];
  resources: { freeRamBytes: number; freeVramBytes: number; maxPackBytes: number };
  candidates: Candidate[];
};

const canonicalize = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`).join(",")}}`;
};
const sha256 = (value: unknown) => createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
const hash = (value: unknown, name: string) => {
  if (typeof value !== "string" || !HASH.test(value)) throw new TypeError(`${name}_HASH_INVALID`);
};
const bytes = (value: unknown, name: string) => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new TypeError(`${name}_BYTES_INVALID`);
};

export function selectContentAddressedModelPack(input: SelectionInput) {
  hash(input.graphHeadHash, "GRAPH_HEAD");
  hash(input.graphProjectionHash, "GRAPH_PROJECTION");
  hash(input.policyHash, "POLICY");
  if (!Array.isArray(input.requiredCapabilities) || !input.requiredCapabilities.length || input.requiredCapabilities.some((item) => !ID.test(item))) {
    throw new TypeError("REQUIRED_CAPABILITIES_INVALID");
  }
  bytes(input.resources?.freeRamBytes, "FREE_RAM");
  bytes(input.resources?.freeVramBytes, "FREE_VRAM");
  bytes(input.resources?.maxPackBytes, "MAX_PACK");
  if (!Array.isArray(input.candidates) || input.candidates.length > 1_000) throw new TypeError("MODEL_CANDIDATES_INVALID");

  const required = [...new Set(input.requiredCapabilities)].sort();
  const normalized = input.candidates.map((candidate) => {
    if (!ID.test(candidate.modelId)) throw new TypeError("MODEL_ID_INVALID");
    hash(candidate.manifestHash, "MANIFEST");
    hash(candidate.weightsHash, "WEIGHTS");
    hash(candidate.tokenizerHash, "TOKENIZER");
    hash(candidate.evidenceSetHash, "EVIDENCE_SET");
    bytes(candidate.packBytes, "PACK");
    bytes(candidate.minRamBytes, "MIN_RAM");
    bytes(candidate.minVramBytes, "MIN_VRAM");
    if (!Number.isSafeInteger(candidate.graphScoreMicros) || candidate.graphScoreMicros < 0 || candidate.graphScoreMicros > 1_000_000) throw new TypeError("GRAPH_SCORE_INVALID");
    if (!Array.isArray(candidate.capabilities) || candidate.capabilities.some((item) => !ID.test(item))) throw new TypeError("MODEL_CAPABILITIES_INVALID");
    return { ...candidate, capabilities: [...new Set(candidate.capabilities)].sort() };
  });

  const admitted = normalized
    .filter((candidate) => required.every((capability) => candidate.capabilities.includes(capability)))
    .filter((candidate) => candidate.packBytes <= input.resources.maxPackBytes
      && candidate.minRamBytes <= input.resources.freeRamBytes
      && candidate.minVramBytes <= input.resources.freeVramBytes)
    .sort((left, right) => right.graphScoreMicros - left.graphScoreMicros
      || left.packBytes - right.packBytes
      || left.modelId.localeCompare(right.modelId, "en"));

  const unsigned = {
    schema: MODEL_PACK_SELECTION_SCHEMA,
    status: admitted.length ? "ADMITTED" as const : "NOT_ADMITTED" as const,
    graphHeadHash: input.graphHeadHash,
    graphProjectionHash: input.graphProjectionHash,
    policyHash: input.policyHash,
    requiredCapabilities: required,
    resources: { ...input.resources },
    selected: admitted[0] ?? null,
    rejectedCount: normalized.length - (admitted.length ? 1 : 0),
    invariants: [
      "SELECTION_USES_ONLY_CONTENT_ADDRESSED_MODEL_PACKS",
      "MODEL_NUMERICAL_WEIGHTS_ARE_NEVER_MUTATED_BY_OBSERVATIONS",
      "GRAPH_SCORE_SELECTS_A_PACK_BUT_DOES_NOT_ASSERT_MODEL_OUTPUT_TRUTH",
      "RAM_VRAM_AND_MAX_PACK_BUDGETS_ARE_FAIL_CLOSED",
    ],
  };
  return Object.freeze({ ...unsigned, receiptHash: sha256(unsigned) });
}
