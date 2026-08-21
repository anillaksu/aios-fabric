// AIOS Create First Human-Approved Artifact Script
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { requestHumanApprovedArtifact, produceHumanApprovedArtifact } from "./human-artifact.mjs";
import { defaultLedger } from "./observer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = resolve(__dirname, "artifacts");

async function main() {
  const attestationWitnessId = "attest-wit-d9b55fa5a77456e6421031141adf2e3549cffd790aaceef84cce8e95e1f019a7";
  const sourceNodes = [
    "node-9bd0d97dd3c599c25e7fc6c557021343711e6bb0baaedaae2874066713421a0f",
    "node-e09887136f677275944a6b7ae72e8d814a941a274b836915eb47dd607fda21c4",
  ];
  const intersectionHash = "6f0b10889cccac087656395eb2dd2f519825cc5750caedda081c763b7da47680";

  // 1. Talep oluştur (REVIEW_REQUIRED)
  const req = requestHumanApprovedArtifact(
    {
      sourceNodes,
      attestationWitnessId,
      intersectionHash,
      requestedBy: "operator-lead",
      purpose: "proof-only",
    },
    defaultLedger,
  );

  // 2. İnsan onayı ile üret (APPROVE)
  const res = produceHumanApprovedArtifact(
    {
      requestId: req.requestId,
      decision: "APPROVE",
      operatorId: "operator-admin",
      sourceNodes,
      attestationWitnessId,
      intersectionHash,
      purpose: "proof-only",
    },
    defaultLedger,
  );

  if (!res.ok) {
    console.error("Production failed:", res.error);
    process.exit(1);
  }

  if (!existsSync(ARTIFACT_DIR)) {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
  }

  const outPath = resolve(ARTIFACT_DIR, "first_human_approved_artifact.json");
  writeFileSync(outPath, JSON.stringify(res.artifact, null, 2), "utf8");

  const chain = defaultLedger.verifyChain();

  console.log("=== FIRST HUMAN-APPROVED ARTIFACT GENERATED ===");
  console.log(`ARTIFACT_ID: ${res.artifact.artifact_id}`);
  console.log(`ARTIFACT_SHA256: ${res.artifact.artifact_sha256}`);
  console.log(`ATTESTATION_WITNESS: ${res.artifact.attestation_witness}`);
  console.log(`INTERSECTION_HASH: ${res.artifact.intersection_hash}`);
  console.log(`HUMAN_APPROVAL: ${res.artifact.human_approval.status} (by ${res.artifact.human_approval.operator_id})`);
  console.log(`PURPOSE: ${res.artifact.purpose}`);
  console.log(`EVIDENCE_CHAIN: ${chain.status} (${chain.events} events)`);
}

main().catch((err) => {
  console.error("Execution error:", err);
  process.exit(1);
});
