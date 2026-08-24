import test from "node:test";
import assert from "node:assert/strict";
import { selectContentAddressedModelPack } from "../src/model-pack-selection.ts";

const hash = (char: string) => char.repeat(64);

test("graph puani yalniz hashli ve kaynak butcesine sigan degismez model paketini secer", () => {
  const receipt = selectContentAddressedModelPack({
    graphHeadHash: hash("a"),
    graphProjectionHash: hash("b"),
    policyHash: hash("c"),
    requiredCapabilities: ["code", "tool-use"],
    resources: { freeRamBytes: 3_000_000_000, freeVramBytes: 2_000_000_000, maxPackBytes: 1_100_000_000 },
    candidates: [
      { modelId: "qwen-low", manifestHash: hash("d"), weightsHash: hash("e"), tokenizerHash: hash("f"), packBytes: 986_000_000, minRamBytes: 2_000_000_000, minVramBytes: 1_000_000_000, capabilities: ["code", "tool-use"], graphScoreMicros: 100_000, evidenceSetHash: hash("1") },
      { modelId: "qwen-evidence-fit", manifestHash: hash("2"), weightsHash: hash("3"), tokenizerHash: hash("4"), packBytes: 986_000_000, minRamBytes: 2_000_000_000, minVramBytes: 1_000_000_000, capabilities: ["code", "tool-use"], graphScoreMicros: 900_000, evidenceSetHash: hash("5") },
      { modelId: "too-large", manifestHash: hash("6"), weightsHash: hash("7"), tokenizerHash: hash("8"), packBytes: 1_500_000_000, minRamBytes: 4_000_000_000, minVramBytes: 3_000_000_000, capabilities: ["code", "tool-use"], graphScoreMicros: 1_000_000, evidenceSetHash: hash("9") },
    ],
  });
  assert.equal(receipt.status, "ADMITTED");
  assert.equal(receipt.selected?.modelId, "qwen-evidence-fit");
  assert.equal(receipt.invariants.includes("MODEL_NUMERICAL_WEIGHTS_ARE_NEVER_MUTATED_BY_OBSERVATIONS"), true);
  assert.match(receipt.receiptHash, /^[a-f0-9]{64}$/);
});

test("hashsiz aday ve kaynak yetersizligi model cagrisini fail closed durdurur", () => {
  assert.throws(() => selectContentAddressedModelPack({
    graphHeadHash: hash("a"), graphProjectionHash: hash("b"), policyHash: hash("c"), requiredCapabilities: ["code"],
    resources: { freeRamBytes: 100, freeVramBytes: 100, maxPackBytes: 100 },
    candidates: [{ modelId: "bad", manifestHash: "no", weightsHash: hash("e"), tokenizerHash: hash("f"), packBytes: 50, minRamBytes: 50, minVramBytes: 50, capabilities: ["code"], graphScoreMicros: 1, evidenceSetHash: hash("1") }],
  }), /HASH_INVALID/);

  const receipt = selectContentAddressedModelPack({
    graphHeadHash: hash("a"), graphProjectionHash: hash("b"), policyHash: hash("c"), requiredCapabilities: ["code"],
    resources: { freeRamBytes: 100, freeVramBytes: 100, maxPackBytes: 100 },
    candidates: [{ modelId: "valid-but-large", manifestHash: hash("d"), weightsHash: hash("e"), tokenizerHash: hash("f"), packBytes: 500, minRamBytes: 500, minVramBytes: 500, capabilities: ["code"], graphScoreMicros: 1, evidenceSetHash: hash("1") }],
  });
  assert.equal(receipt.status, "NOT_ADMITTED");
  assert.equal(receipt.selected, null);
});
