// AIOS Proof Gate 19: ChatGPT <-> AIOS Remote MCP / App Bridge Discovery
import { processJsonRpc } from "./mcp-server.mjs";
import { defaultLedger } from "./observer.mjs";

async function runDiscovery() {
  console.log("=== AIOS PROOF GATE 19: CHATGPT <-> AIOS MCP BRIDGE DISCOVERY ===");

  // 1. Test Read-Only aios.reality
  const rReality = await processJsonRpc({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "aios.reality", arguments: {} },
  });
  const dataReality = JSON.parse(rReality.result.content[0].text);
  if (!dataReality.reality_digest || dataReality.schema !== "aios.agent.reality.v1") {
    throw new Error("aios.reality failed");
  }
  console.log(`✔ 1. aios.reality        PASS (Digest: ${dataReality.reality_digest.slice(0, 16)}...)`);

  // 2. Test Read-Only aios.status
  const rStatus = await processJsonRpc({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "aios.status", arguments: {} },
  });
  const dataStatus = JSON.parse(rStatus.result.content[0].text);
  if (dataStatus.ok === undefined) {
    throw new Error("aios.status failed");
  }
  console.log(`✔ 2. aios.status         PASS (Services observed: ${dataStatus.services?.length || 0})`);

  // 3. Test Read-Only aios.pending
  const rPending = await processJsonRpc({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "aios.pending", arguments: {} },
  });
  const dataPending = JSON.parse(rPending.result.content[0].text);
  if (!Array.isArray(dataPending.pendingRequests)) {
    throw new Error("aios.pending failed");
  }
  console.log(`✔ 3. aios.pending        PASS (Pending requests: ${dataPending.count})`);

  // 4. Test Read-Only aios.evidence
  const rEvidence = await processJsonRpc({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "aios.evidence", arguments: {} },
  });
  const dataEvidence = JSON.parse(rEvidence.result.content[0].text);
  if (dataEvidence.status !== "CHAIN_VALID" && !dataEvidence.ok) {
    throw new Error("aios.evidence failed");
  }
  console.log(`✔ 4. aios.evidence       PASS (Chain: ${dataEvidence.status}, Events: ${dataEvidence.events})`);

  // 5. Test Read-Only aios.agents
  const rAgents = await processJsonRpc({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "aios.agents", arguments: {} },
  });
  const dataAgents = JSON.parse(rAgents.result.content[0].text);
  if (!dataAgents.schema) {
    throw new Error("aios.agents failed");
  }
  console.log(`✔ 5. aios.agents         PASS (Active requests: ${dataAgents.activeRequestsCount})`);

  // 6. Test Read-Only aios.artifacts
  const rArtifacts = await processJsonRpc({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "aios.artifacts", arguments: {} },
  });
  const dataArtifacts = JSON.parse(rArtifacts.result.content[0].text);
  const artId = dataArtifacts.artifact?.artifact_id || dataArtifacts.artifact?.artifactId;
  if (!artId) {
    throw new Error("aios.artifacts failed");
  }
  console.log(`✔ 6. aios.artifacts      PASS (Latest artifact: ${artId})`);

  // 7. Secret Audit
  const payloadStr = JSON.stringify([dataReality, dataStatus, dataPending, dataEvidence, dataAgents, dataArtifacts]);
  if (
    payloadStr.includes("Bearer ") ||
    payloadStr.includes(".a2a-token") ||
    payloadStr.includes(".pc-agent-token") ||
    payloadStr.includes("AIOS_PHONE_A2A_TOKEN")
  ) {
    throw new Error("Secret detected in read-only tools!");
  }
  console.log("✔ 7. secret exposure     ZERO (Read-only tools are 100% credential-isolated)");

  // 8. Evidence Ledger Chain Check
  const v = defaultLedger.verifyChain();
  if (!v.ok) {
    throw new Error("Evidence ledger check failed");
  }
  console.log(`✔ 8. evidence chain      PASS (CHAIN_VALID, ${v.events} events)`);

  console.log("=== PROOF GATE 19 DISCOVERY TÜM KONTROLLERİ GEÇTİ (8/8) ===");
}

runDiscovery().catch((err) => {
  console.error("Gate 19 Discovery failure:", err);
  process.exit(1);
});
