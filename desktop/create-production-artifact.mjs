// AIOS Production Loop Artifact Script (Gate 15)
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { requestProductionLoopArtifact, produceProductionLoopArtifact } from "./production-loop.mjs";
import { defaultLedger } from "./observer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = resolve(__dirname, "artifacts");

async function main() {
  const attestationWitnessId = "attest-wit-d9b55fa5a77456e6421031141adf2e3549cffd790aaceef84cce8e95e1f019a7";
  const taskWitnessId = "task-wit-f4b949c263ee62b73088d147";
  const sourceRealityHash = "88f45466ee08f97d3f82cb3aa6a928e36ee2215c0e15481745db7d2f9d690a6e";
  const sourceNodes = [
    { node_id: "node-9bd0d97dd3c599c25e7fc6c557021343711e6bb0baaedaae2874066713421a0f", platform: "win32", version: "0.1.0" },
    { node_id: "node-e09887136f677275944a6b7ae72e8d814a941a274b836915eb47dd607fda21c4", platform: "android", version: "0.1.0" },
  ];

  // 1. Talep oluştur (REVIEW_REQUIRED)
  const req = requestProductionLoopArtifact(
    {
      sourceNodes,
      attestationWitnessId,
      taskWitnessId,
      sourceRealityHash,
      requestedBy: "operator-lead",
    },
    defaultLedger,
  );

  // 2. İnsan Operatör Onayıyla Üret (APPROVE)
  const res = produceProductionLoopArtifact(
    {
      requestId: req.requestId,
      decision: "APPROVE",
      operatorId: "operator-admin",
      sourceNodes,
      attestationWitnessId,
      taskWitnessId,
      sourceRealityHash,
    },
    defaultLedger,
  );

  if (!res.ok) {
    console.error("Production Loop creation failed:", res.error);
    process.exit(1);
  }

  if (!existsSync(ARTIFACT_DIR)) {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
  }

  const outPath = resolve(ARTIFACT_DIR, "first_production_loop_artifact.json");
  writeFileSync(outPath, JSON.stringify(res.artifact, null, 2), "utf8");

  const chain = defaultLedger.verifyChain();

  console.log("=== FIRST PRODUCTION LOOP ARTIFACT GENERATED ===");
  console.log(`ARTIFACT_ID: ${res.artifact.artifact_id}`);
  console.log(`ARTIFACT_SHA256: ${res.artifact.artifact_sha256}`);
  console.log(`SOURCE_REALITY_HASH: ${res.artifact.source_reality_hash}`);
  console.log(`ATTESTATION_WITNESS: ${res.artifact.attestation_witness}`);
  console.log(`TASK_WITNESS: ${res.artifact.task_witness}`);
  console.log(`HUMAN_APPROVAL: ${res.artifact.human_approval.status} (by ${res.artifact.human_approval.operator_id})`);
  console.log(`EVIDENCE_CHAIN: ${chain.status} (${chain.events} events)`);
}

main().catch((err) => {
  console.error("Execution failure:", err);
  process.exit(1);
});
