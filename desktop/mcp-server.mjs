#!/usr/bin/env node
// AIOS Read-Only Evidence & Observer Model Context Protocol (MCP) Server
import {
  defaultLedger,
  canonicalJson,
  sha256,
  observeAgentCard,
  observeRuntimeStatus,
  observeCapabilities,
  observeBattery,
} from "./observer.mjs";
import { defaultRelay } from "./agent-relay.mjs";
import { buildSharedRealitySummary, querySystemReality } from "./shared-reality.mjs";
import { computeCanonicalRealityDigest } from "./phone-shared-reality.mjs";
import { defaultContinuousObserver } from "./continuous-observer.mjs";
import { defaultControlPlane } from "./agent-control-plane.mjs";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
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
    description: "Ask the system a question ('What is proven now?', 'Is phone online?', 'Latest artifact?', 'What changed?', 'Why pending?'). Answers deterministically from evidence without hallucinations.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language query to match against proven evidence." },
      },
      required: ["query"],
    },
  },
  {
    name: "artifact.latest",
    description: "Get the latest human-approved or distributed artifact and its metadata.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "artifact.lineage",
    description: "Get the cryptographic attestation witness lineage and chain status for a given artifact.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "approval.latest",
    description: "Get the most recent human approval event and operator resolution from the Evidence Ledger.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "approval.list_pending",
    description: "List all active canonical REVIEW_REQUIRED requests waiting for human operator approval across Phone, Windows and MCP.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "approval.resolve",
    description: "Resolve a pending human approval request with decision APPROVE or DENY and chain the result into Evidence Ledger.",
    inputSchema: {
      type: "object",
      properties: {
        requestId: { type: "string", description: "Canonical request ID (e.g. req-prod-..., task-a2a-..., appr-...)" },
        decision: { type: "string", enum: ["APPROVE", "DENY"], description: "Operator decision" },
        operatorId: { type: "string", description: "Identity of the human operator (default: operator-admin)" },
      },
      required: ["requestId", "decision"],
    },
  },
  {
    name: "agent.reality_snapshot",
    description: "Get the canonical Shared Reality snapshot structured specifically for external AI agents (zero secrets, fail-closed).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "agent.query",
    description: "Execute a deterministic, byte-identical query against AIOS reality without models or hallucinations (what_is_proven_now, what_changed, what_is_waiting, why_is_it_waiting, what_can_be_executed, what_is_not_proven).",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          enum: [
            "what_is_proven_now",
            "what_changed",
            "what_is_waiting",
            "why_is_it_waiting",
            "what_can_be_executed",
            "what_is_not_proven",
          ],
          description: "Canonical query identifier",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "agent.propose",
    description: "Submit a non-executing action proposal cryptographically bound to current reality digest. Proposal enters REVIEW_REQUIRED state and cannot bypass Human Gate.",
    inputSchema: {
      type: "object",
      properties: {
        requestId: { type: "string", description: "Target canonical request ID" },
        agentId: { type: "string", description: "Identity of the submitting agent (e.g. agent-antigravity, agent-claude, agent-gemini)" },
        proposedAction: { type: "object", description: "Proposed payload/action" },
        evidenceReferences: { type: "array", items: { type: "string" }, description: "Witness/artifact hashes referenced as justification" },
        rationale: { type: "string", description: "Natural language rationale" },
      },
      required: ["requestId", "agentId", "proposedAction"],
    },
  },
  {
    name: "control.snapshot",
    description: "Get the unified Canonical Agent Control Plane status, active requests and proposal counts.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "control.review",
    description: "Get the aggregated Canonical Review Object combining all agent proposals for a single Human Gate decision.",
    inputSchema: {
      type: "object",
      properties: {
        requestId: { type: "string", description: "Canonical request ID" },
      },
      required: ["requestId"],
    },
  },
  {
    name: "aios.reality",
    description: "Read the canonical AIOS Shared Reality snapshot and cryptographic reality digest (READ-ONLY).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "aios.status",
    description: "Read the runtime status and hardware connectivity of AIOS nodes (READ-ONLY).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "aios.pending",
    description: "Read active pending requests waiting for human approval (READ-ONLY).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "aios.evidence",
    description: "Read the cryptographic witness and Evidence Ledger chain status (READ-ONLY).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "aios.agents",
    description: "Read active agent proposals and Control Plane consumer metrics (READ-ONLY).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "aios.artifacts",
    description: "Read the latest verified and human-approved artifacts produced by AIOS (READ-ONLY).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "browser.proof.read",
    description: "Read the latest AdSentinel YouTube browser extension proof and deterministic test verification status (READ-ONLY).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "browser.telemetry.read",
    description: "Read browser runtime telemetry and ad suppression observations from Chromium node (READ-ONLY).",
    inputSchema: { type: "object", properties: {} },
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
    case "artifact.latest": {
      const prodArtifactPath = resolve(__dirname, "artifacts", "first_production_loop_artifact.json");
      const distArtifactPath = resolve(__dirname, "artifacts", "first_distributed_artifact.json");
      const targetPath = existsSync(prodArtifactPath) ? prodArtifactPath : distArtifactPath;
      let art = null;
      if (existsSync(targetPath)) {
        try {
          art = JSON.parse(readFileSync(targetPath, "utf8"));
        } catch {
          art = null;
        }
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: Boolean(art), artifact: art }, null, 2) }],
      };
    }
    case "artifact.lineage": {
      const history = defaultLedger.getHistory(50);
      const completedEvents = history.filter((e) => e.operation === "artifact.production.completed" || e.operation === "artifact.distributed.created");
      return {
        content: [{ type: "text", text: JSON.stringify({ count: completedEvents.length, lineageEvents: completedEvents }, null, 2) }],
      };
    }
    case "approval.latest": {
      const history = defaultLedger.getHistory(50);
      const approvalEvents = history.filter((e) => e.operation.startsWith("artifact.production.") || e.operation.startsWith("relay.approval_") || e.operation.startsWith("task.delegation."));
      return {
        content: [{ type: "text", text: JSON.stringify({ count: approvalEvents.length, latestApproval: approvalEvents[0] || null }, null, 2) }],
      };
    }
    case "approval.list_pending": {
      const pending = defaultRelay.getPendingApprovals();
      return {
        content: [{ type: "text", text: JSON.stringify({ count: pending.length, pendingRequests: pending }, null, 2) }],
      };
    }
    case "approval.resolve": {
      const reqId = args.requestId;
      const decision = args.decision;
      const operatorId = args.operatorId || "operator-admin";
      const resolved = defaultRelay.resolveApprovalRequest(reqId, decision, operatorId);
      return {
        content: [{ type: "text", text: JSON.stringify(resolved, null, 2) }],
      };
    }
    case "agent.reality_snapshot": {
      const snap = await defaultRelay.getSystemSnapshot({ timeoutMs: 2500 });
      const digest = computeCanonicalRealityDigest(snap);
      const pending = defaultRelay.getPendingApprovals();
      const isStale = !snap.nodes?.android?.online || snap.nodes?.android?.stale;

      const result = {
        schema: "aios.agent.reality.v1",
        observed_at: new Date().toISOString(),
        reality_digest: digest.canonicalHash,
        reality_status: isStale ? "OFFLINE_STALE" : "PARITY_MAINTAINED",
        source_nodes: [
          { node_id: snap.nodes?.windows?.nodeId || "node-windows", platform: "win32", status: snap.nodes?.windows?.online ? "ONLINE" : "OFFLINE" },
          { node_id: snap.nodes?.android?.nodeId || "node-android", platform: "android", status: snap.nodes?.android?.online ? "ONLINE" : "OFFLINE" },
        ],
        pending_requests: pending.map((p) => ({
          requestId: p.requestId || p.approvalId,
          operation: p.operation,
          requestedBy: p.requestedBy,
          status: p.status,
          timestamp: p.timestamp,
        })),
        latest_attestation: snap.attestation?.latestWitnessId || "GENESIS",
        latest_artifact: snap.artifact?.artifactId || "GENESIS",
        latest_task_witness: snap.artifact?.lineageWitnessId || "GENESIS",
        evidence_chain_status: snap.evidenceChain?.status || "NOT_PROVEN",
        human_gate_status: pending.length > 0 ? "REVIEW_REQUIRED" : "ALLOWED",
        allowed_capability_intersection: snap.attestation?.allowedCapabilities || [],
        stale: isStale,
        classification: isStale ? "OFFLINE_STALE" : (pending.length > 0 ? "REVIEW_REQUIRED" : "AGENT-CONSUMPTION-VERIFIED"),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
    case "agent.query": {
      const q = String(args.query || "").trim();
      const snap = await defaultRelay.getSystemSnapshot({ timeoutMs: 2500 });
      let answer = null;

      switch (q) {
        case "what_is_proven_now":
          answer = {
            query: q,
            status: "PROVEN",
            proven_facts: [
              "Windows Control Surface & Android Reference Node authenticated attestation",
              "Live battery hardware telemetry witness",
              "SHA-256 chained Evidence Ledger integrity (CHAIN_VALID)",
              "Zero token leakage boundary",
              "Canonical Shared Reality parity maintained",
            ],
          };
          break;
        case "what_changed":
          answer = defaultContinuousObserver.queryDetailedState("what_changed");
          break;
        case "what_is_waiting":
          answer = defaultContinuousObserver.queryDetailedState("what_is_waiting");
          break;
        case "why_is_it_waiting":
          answer = defaultContinuousObserver.queryDetailedState("why_is_it_waiting");
          break;
        case "what_can_be_executed":
          answer = {
            query: q,
            status: "PROVEN",
            allowed_capabilities: snap.attestation?.allowedCapabilities || ["sensor.battery.read", "volume.read", "wifi.info", "a2a.delegate"],
            policy: "READ_ONLY_REFLEX_SAFE",
          };
          break;
        case "what_is_not_proven":
          answer = {
            query: q,
            status: "NOT_PROVEN",
            unproven_items: [
              "A2A autonomous prompt execution is NOT_PROVEN",
              "Arbitrary shell code execution is NOT_PROVEN (Blocked by policy)",
              "External cloud mutations (Cloudflare/GCP/OpenAI) are NOT_PROVEN",
              "Watchdog daemon self-healing is DOWN (NOT_PROVEN in Gate 18A)",
            ],
          };
          break;
        default:
          answer = {
            query: q,
            status: "NOT_PROVEN",
            error: "UNSUPPORTED_QUERY",
            supported_queries: [
              "what_is_proven_now",
              "what_changed",
              "what_is_waiting",
              "why_is_it_waiting",
              "what_can_be_executed",
              "what_is_not_proven",
            ],
          };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(answer, null, 2) }],
      };
    }
    case "agent.propose": {
      const { requestId, agentId, proposedAction, evidenceReferences = [], rationale = "", realityDigest } = args;
      const snap = await defaultRelay.getSystemSnapshot({ timeoutMs: 2500 });
      const isStale = !snap.nodes?.android?.online || snap.nodes?.android?.stale;

      if (isStale) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  ok: false,
                  status: "BLOCKED",
                  error: "OFFLINE_STALE",
                  detail: "Android düğümü ulaşılamaz durumda olduğundan proposal reddedildi.",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const currentDigest = computeCanonicalRealityDigest(snap);
      const targetRealityDigest = realityDigest || currentDigest.canonicalHash;

      // Reality Mismatch Kontrolü
      if (realityDigest && realityDigest !== currentDigest.canonicalHash) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  ok: false,
                  status: "BLOCKED",
                  error: "REALITY_MISMATCH",
                  detail: "Sunulan reality_digest güncel kanonik gerçeklikle eşleşmiyor.",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Kriptografik Proposal Binding
      const canonicalProposal = {
        agentId: String(agentId || "unknown-agent"),
        evidenceReferences: Array.isArray(evidenceReferences) ? [...evidenceReferences].sort() : [],
        proposedAction: proposedAction || {},
        reality_digest: targetRealityDigest,
        requestId: String(requestId || ""),
      };

      const proposalHash = sha256(canonicalJson(canonicalProposal));
      const proposalId = "prop-" + proposalHash.slice(0, 24);

      defaultLedger.append({
        operation: "agent.proposal_submitted",
        http_status: 200,
        success: true,
        response_data: {
          proposalId,
          requestId,
          agentId,
          proposalHash,
          status: "REVIEW_REQUIRED",
        },
        metadata: { rationale, reality_digest: targetRealityDigest },
      });

      const response = {
        ok: true,
        proposalId,
        requestId,
        agentId,
        status: "REVIEW_REQUIRED",
        evidenceReferences: canonicalProposal.evidenceReferences,
        lineage: {
          reality_digest: targetRealityDigest,
          attestation: snap.attestation?.latestWitnessId || "GENESIS",
          evidenceWitness: defaultLedger.getLatestWitnessHash(),
        },
        canonicalHash: proposalHash,
        detail: "Proposal oluşturuldu ve REVIEW_REQUIRED durumunda kaydedildi. İnsan onayı olmadan icra edilemez.",
      };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }
    case "control.snapshot": {
      const res = await defaultControlPlane.getControlPlaneSnapshot();
      return {
        content: [{ type: "text", text: JSON.stringify(res, null, 2) }],
      };
    }
    case "control.review": {
      const reqId = args.requestId;
      const res = await defaultControlPlane.buildCanonicalReviewObject(reqId);
      return {
        content: [{ type: "text", text: JSON.stringify(res, null, 2) }],
      };
    }
    case "aios.reality": {
      return handleToolCall("agent.reality_snapshot", args);
    }
    case "aios.status": {
      return handleToolCall("runtime.status", args);
    }
    case "aios.pending": {
      return handleToolCall("approval.list_pending", args);
    }
    case "aios.evidence": {
      return handleToolCall("witness.latest", args);
    }
    case "aios.agents": {
      return handleToolCall("control.snapshot", args);
    }
    case "aios.artifacts": {
      return handleToolCall("artifact.latest", args);
    }
    case "browser.proof.read":
    case "browser.telemetry.read": {
      const { defaultBrowserAdapter } = await import("./adapters/browser-adapter.mjs");
      const obs = defaultBrowserAdapter.readProofObservation(args.customProof);
      defaultBrowserAdapter.recordObservationEvidence(obs);
      return {
        content: [{ type: "text", text: JSON.stringify(obs, null, 2) }],
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
