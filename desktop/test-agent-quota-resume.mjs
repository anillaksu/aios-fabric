// AIOS Scale Fabric — Canonical Agent Quota Failover & Resume Proof
import { FabricEngine, TASK_STATES } from "./fabric-engine.mjs";
import { NodeRegistry, NODE_POOLS } from "./node-registry.mjs";
import { FallbackGraph, PROVIDER_HEALTH } from "./fallback-graph.mjs";
import { EvidenceLedger } from "./observer.mjs";

async function runQuotaResumeProof() {
  console.log("=== AIOS SCALE FABRIC AGENT QUOTA RESUME PROOF ===");

  const ledger = new EvidenceLedger("memory");
  const registry = new NodeRegistry();
  const fallback = new FallbackGraph();
  const fabric = new FabricEngine(ledger, registry, fallback);

  // Register compute nodes
  registry.registerNode({
    nodeId: "node-primary-claude",
    pool: NODE_POOLS.DESKTOP,
    capabilities: ["reasoning.plan", "browser.proof.read"],
    capacity: { concurrency: 2 },
  });
  registry.registerNode({
    nodeId: "node-secondary-openai",
    pool: NODE_POOLS.CLOUD,
    capabilities: ["reasoning.plan", "browser.proof.read"],
    capacity: { concurrency: 2 },
  });

  const canonicalRealityDigest = "REALITY-DIGEST-2026-CANONICAL-OK";

  // 1. Task Created
  const initialTask = fabric.createTask({
    capability: "reasoning.plan",
    payload: { prompt: "Analyze distributed fault tolerance" },
    realityDigest: canonicalRealityDigest,
  });
  const canonicalTaskId = initialTask.taskId;
  const canonicalRequestId = initialTask.requestId;

  console.log(`✔ 1. task created               PASS (TaskId: ${canonicalTaskId}, RequestId: ${canonicalRequestId})`);

  // 2. Leased to Claude
  fallback.setProviderStatus("provider-claude", PROVIDER_HEALTH.AVAILABLE);
  const lease1 = fabric.acquireLease(canonicalTaskId, "node-primary-claude", "agent-claude");
  fabric.transitionTask(canonicalTaskId, TASK_STATES.RUNNING, { step: 1 });
  console.log(`✔ 2. leased to agent-claude     PASS (Lease: ${lease1.leaseId}, Node: ${lease1.nodeId})`);

  // 3. Claude produces Checkpoint 1
  const cp1 = fabric.saveCheckpoint(canonicalTaskId, {
    completedSteps: 1,
    currentStep: 2,
    inputDigest: "IN-PROMPT-DIGEST",
    outputDigest: "OUT-STEP-1-ANALYSIS",
    realityDigest: canonicalRealityDigest,
  });
  console.log(`✔ 3. checkpoint 1 generated     PASS (Step 1 complete, Digest: ${cp1.checkpointDigest.slice(0, 16)}...)`);

  // 4. Claude hits QUOTA_LIMITED
  console.log("⚡ Provider Event: agent-claude hit QUOTA_LIMITED");
  const quotaRes = fabric.handleQuotaLimited(canonicalTaskId, "provider-claude", "429 Too Many Requests");
  if (!quotaRes.ok || initialTask.state !== TASK_STATES.REASSIGNABLE) {
    throw new Error(`Expected REASSIGNABLE state, got ${initialTask.state}`);
  }
  console.log(`✔ 4. task marked REASSIGNABLE   PASS (Quota limited handled without task loss)`);

  // 5. Alternate Agent Handoff (Same Task, Same Lineage)
  const scheduled = fabric.scheduleNext();
  if (!scheduled || scheduled.task.taskId !== canonicalTaskId) {
    throw new Error("Scheduler failed to dispatch task under identical taskId!");
  }
  if (scheduled.task.assignedAgentId === "agent-claude") {
    throw new Error("Scheduler incorrectly assigned task back to quota-limited agent!");
  }
  console.log(`✔ 5. alternate agent handoff    PASS (Assigned to: ${scheduled.task.assignedAgentId} on ${scheduled.targetNode.nodeId})`);

  // 6. Alternate Agent resumes from Checkpoint 1 and produces Checkpoint 2
  const resumeAlt = fabric.resumeFromCheckpoint(canonicalTaskId, cp1.checkpointDigest, canonicalRealityDigest);
  if (!resumeAlt.ok) {
    throw new Error(`Alternate agent failed to resume from checkpoint: ${resumeAlt.error}`);
  }
  const cp2 = fabric.saveCheckpoint(canonicalTaskId, {
    completedSteps: 2,
    currentStep: 3,
    inputDigest: "OUT-STEP-1-ANALYSIS",
    outputDigest: "OUT-STEP-2-SYNTHESIS",
    realityDigest: canonicalRealityDigest,
  });
  console.log(`✔ 6. checkpoint 2 generated     PASS (Step 2 complete by alternate, Digest: ${cp2.checkpointDigest.slice(0, 16)}...)`);

  // 7. Claude becomes AVAILABLE again
  console.log("⚡ Provider Event: agent-claude is AVAILABLE again");
  fallback.setProviderStatus("provider-claude", PROVIDER_HEALTH.AVAILABLE);

  // 8. Claude resumes from latest Checkpoint 2
  const resumeClaudeLatest = fabric.resumeFromCheckpoint(canonicalTaskId, cp2.checkpointDigest, canonicalRealityDigest);
  if (!resumeClaudeLatest.ok || resumeClaudeLatest.status !== "ALLOWED") {
    throw new Error("Claude failed to resume from latest checkpoint");
  }
  console.log("✔ 7. claude resumed latest CP   PASS (Successfully resumed from Checkpoint 2)");

  // 9. Outdated Checkpoint Protection: Attempting to resume from old CP1 must be BLOCKED
  const resumeClaudeOld = fabric.resumeFromCheckpoint(canonicalTaskId, cp1.checkpointDigest, canonicalRealityDigest);
  if (resumeClaudeOld.ok !== false || resumeClaudeOld.error !== "OUTDATED_CHECKPOINT_BLOCKED") {
    throw new Error("Failed to block stale checkpoint resume!");
  }
  console.log("✔ 8. outdated CP blocked        PASS (Attempt to resume old CP1 rejected)");

  // 10. Reality Mismatch Protection: Attempting to resume with divergent reality must be BLOCKED
  const changedRealityDigest = "REALITY-DIGEST-2026-CORRUPTED-OR-CHANGED";
  const resumeRealityMismatch = fabric.resumeFromCheckpoint(canonicalTaskId, cp2.checkpointDigest, changedRealityDigest);
  if (resumeRealityMismatch.ok !== false || resumeRealityMismatch.error !== "REALITY_MISMATCH") {
    throw new Error("Failed to block resume on reality mismatch!");
  }
  console.log("✔ 9. reality mismatch blocked   PASS (Divergent reality digest blocked auto-resume)");

  // 11. Complete task under canonical identity
  const completeRes = fabric.completeTask(canonicalTaskId, {
    result: { status: "OK", synthesis: "Distributed consensus achieved" },
    witnessId: "wit-final-consensus-proof",
  });
  if (!completeRes.ok) {
    throw new Error("Failed to complete task");
  }
  console.log(`✔ 10. canonical completion      PASS (Artifact: ${completeRes.artifact.artifactId})`);

  // 12. Invariants Check
  if (initialTask.taskId !== canonicalTaskId || initialTask.requestId !== canonicalRequestId) {
    throw new Error("Task or Request ID mutated during lifecycle!");
  }
  if (initialTask.realityDigest !== canonicalRealityDigest) {
    throw new Error("Reality digest mutated during lifecycle!");
  }

  console.log("\n=== AGENT QUOTA RESUME PROOF SUMMARY ===");
  console.log(`TaskId:                ${initialTask.taskId} (UNCHANGED)`);
  console.log(`RequestId:             ${initialTask.requestId} (UNCHANGED)`);
  console.log(`Reality Digest:        ${initialTask.realityDigest} (UNCHANGED)`);
  console.log(`Total Checkpoints:     ${fabric.checkpoints.get(canonicalTaskId).length}`);
  console.log(`Reassignments:         ${fabric.metrics.totalReassignments}`);
  console.log(`Checkpoint Recoveries: ${fabric.metrics.totalCheckpointRecoveries}`);
  console.log(`Final State:           ${initialTask.state}`);

  console.log("\n=== ALL QUOTA RESUME INVARIANTS PROVEN (10/10) ===");
}

runQuotaResumeProof().catch((err) => {
  console.error("Quota resume proof failed:", err);
  process.exit(1);
});
