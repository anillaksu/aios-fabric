#!/usr/bin/env node
// AIOS Read-Only Evidence & Observer Model Context Protocol (MCP) Server
import {
  defaultLedger,
  observeAgentCard,
  observeRuntimeStatus,
  observeCapabilities,
  observeBattery,
} from "./observer.mjs";
import { defaultRelay } from "./agent-relay.mjs";
import { buildSharedRealitySummary, querySystemReality } from "./shared-reality.mjs";

const PROTOCOL_VERSION = "2025-03-26";
const SERVER_NAME = "aios-evidence-observer";
const SERVER_VERSION = "0.1.0";

const TOOLS = [
  {
    name: "observer.latest",
    description: "Get the most recent observation from the AIOS Evidence Ledger along with its cryptographic witness hash.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "observer.history",
    description: "Get the last N observations from the SHA-256 chained Evidence Ledger.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maximum number of evidence records to retrieve (default: 10)" },
      },
    },
  },
  {
    name: "witness.latest",
    description: "Verify the SHA-256 Evidence Chain and return the latest witness hash and integrity status.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "runtime.status",
    description: "Perform a live read-only observation of Android Reference Node & Fabric services status.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "node.capabilities",
    description: "Read registered capabilities metadata from the Android Fabric node without executing them.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "observe.battery",
    description: "Read live battery hardware telemetry from the Android phone, chain the witness into Evidence Ledger, and return the result.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "shared_reality.snapshot",
    description: "Get the unified Shared Reality snapshot between Windows and Android nodes including 'What is Proven Now?' matrix.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "system.query",
    description: "Ask the system a question ('What is proven now?', 'Is phone online?', 'Latest artifact?'). Answers deterministically from evidence without hallucinations.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language query to match against proven evidence." },
      },
      required: ["query"],
    },
  },
];

async function handleToolCall(name, args = {}) {
  switch (name) {
    case "observer.latest": {
      const history = defaultLedger.getHistory(1);
      const latest = history[0] || null;
      return {
        content: [{ type: "text", text: JSON.stringify({ latest, witnessHash: defaultLedger.getLatestWitnessHash() }, null, 2) }],
      };
    }
    case "observer.history": {
      const limit = Number(args.limit) || 10;
      const history = defaultLedger.getHistory(limit);
      return {
        content: [{ type: "text", text: JSON.stringify({ count: history.length, history }, null, 2) }],
      };
    }
    case "witness.latest": {
      const verify = defaultLedger.verifyChain();
      return {
        content: [{ type: "text", text: JSON.stringify(verify, null, 2) }],
      };
    }
    case "runtime.status": {
      const res = await observeRuntimeStatus();
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: res.ok, evidence: res.evidence, services: res.data?.services }, null, 2) }],
      };
    }
    case "node.capabilities": {
      const res = await observeCapabilities();
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: res.ok, evidence: res.evidence, capabilitiesCount: res.data?.length }, null, 2) }],
      };
    }
    case "observe.battery": {
      const res = await observeBattery();
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: res.ok, evidence: res.evidence, battery: res.data?.data }, null, 2) }],
      };
    }
    case "shared_reality.snapshot": {
      const snap = await defaultRelay.getSystemSnapshot({ timeoutMs: 2500 });
      const summary = buildSharedRealitySummary(snap);
      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
    }
    case "system.query": {
      const snap = await defaultRelay.getSystemSnapshot({ timeoutMs: 2500 });
      const result = querySystemReality(String(args.query || ""), snap);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
    default:
      throw new Error(`Unknown read-only tool: ${name}`);
  }
}

// JSON-RPC Request Handler (Stdio)
export async function processJsonRpc(request) {
  const { id, method, params } = request;

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        capabilities: { tools: {} },
      },
    };
  }

  if (method === "notifications/initialized") {
    return null;
  }

  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: { tools: TOOLS },
    };
  }

  if (method === "tools/call") {
    const toolName = params?.name;
    const toolArgs = params?.arguments || {};
    try {
      const result = await handleToolCall(toolName, toolArgs);
      return { jsonrpc: "2.0", id, result };
    } catch (err) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32603, message: err instanceof Error ? err.message : String(err) },
      };
    }
  }

  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  };
}

// Stdio Server Interface
if (process.argv[1] && process.argv[1].endsWith("mcp-server.mjs")) {
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", async (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const req = JSON.parse(line);
        const res = await processJsonRpc(req);
        if (res) process.stdout.write(JSON.stringify(res) + "\n");
      } catch {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n");
      }
    }
  });
}
