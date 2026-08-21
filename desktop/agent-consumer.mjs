// AIOS Agent Consumer Engine (Gate 18A)
import { processJsonRpc } from "./mcp-server.mjs";

let rpcCounter = 100;

export async function consumeAgentSnapshot() {
  const res = await processJsonRpc({
    jsonrpc: "2.0",
    id: ++rpcCounter,
    method: "tools/call",
    params: { name: "agent.reality_snapshot", arguments: {} },
  });
  if (res.error) throw new Error(res.error.message);
  return JSON.parse(res.result.content[0].text);
}

export async function executeAgentQuery(query) {
  const res = await processJsonRpc({
    jsonrpc: "2.0",
    id: ++rpcCounter,
    method: "tools/call",
    params: { name: "agent.query", arguments: { query } },
  });
  if (res.error) throw new Error(res.error.message);
  return JSON.parse(res.result.content[0].text);
}

export async function submitAgentProposal(proposalInput) {
  const res = await processJsonRpc({
    jsonrpc: "2.0",
    id: ++rpcCounter,
    method: "tools/call",
    params: { name: "agent.propose", arguments: proposalInput },
  });
  if (res.error) throw new Error(res.error.message);
  return JSON.parse(res.result.content[0].text);
}
