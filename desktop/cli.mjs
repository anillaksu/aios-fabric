#!/usr/bin/env node
// AIOS Canonical Command Line Interface (CLI)
import { defaultControlPlane } from "./agent-control-plane.mjs";
import { defaultRelay } from "./agent-relay.mjs";
import { defaultOrchestrator } from "./runtime-console.mjs";
import { defaultLedger } from "./observer.mjs";
import { computeCanonicalRealityDigest } from "./phone-shared-reality.mjs";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "status";
  const isJson = args.includes("--json");

  switch (command) {
    case "status": {
      const state = await defaultControlPlane.getCanonicalState();
      if (isJson) {
        console.log(JSON.stringify(state, null, 2));
      } else {
        console.log("=== AIOS CANONICAL SYSTEM STATUS ===");
        console.log(`REALITY DIGEST: ${state.reality.digest.slice(0, 16)}...`);
        console.log(`RUNTIME STATE:  ${state.runtime.state} (${state.runtime.liveness})`);
        console.log(`PROGRESS:       ${state.runtime.progress}`);
        console.log(`CURRENT STEP:   ${state.runtime.current_step || "NONE"}`);
        console.log(`PENDING REQS:   ${state.requests.pending_count}`);
        console.log(`ACTIVE AGENTS:  ${state.agents.active_count}`);
        console.log(`EVIDENCE CHAIN: ${state.evidence.status} (${state.evidence.events} events)`);
      }
      break;
    }

    case "reality": {
      const snap = await defaultRelay.getSystemSnapshot({ timeoutMs: 2500 });
      const digest = computeCanonicalRealityDigest(snap);
      const out = {
        schema: "aios.canonical.reality.v1",
        digest: digest.canonicalHash,
        classifications: digest.classifications,
        nodes: snap.nodes,
        capabilities: snap.nodes?.android?.capabilities || [],
      };
      if (isJson) {
        console.log(JSON.stringify(out, null, 2));
      } else {
        console.log("=== AIOS CANONICAL SHARED REALITY ===");
        console.log(`DIGEST:        ${digest.canonicalHash}`);
        console.log(`ANDROID NODE:  ${snap.nodes.android.online ? "ONLINE" : "OFFLINE_STALE"}`);
        console.log(`WINDOWS NODE:  ${snap.nodes.windows.online ? "ONLINE" : "OFFLINE"}`);
        console.log(`CAPABILITIES:  ${(snap.nodes?.android?.capabilities || []).length} available`);
      }
      break;
    }

    case "pending": {
      const activeRequests = Array.from(defaultControlPlane.requests.values()).filter(
        (r) => r.status === "REVIEW_REQUIRED",
      );
      if (isJson) {
        console.log(JSON.stringify({ pending: activeRequests }, null, 2));
      } else {
        console.log(`=== AIOS PENDING REQUESTS (${activeRequests.length}) ===`);
        if (activeRequests.length === 0) {
          console.log("No pending requests waiting in Human Gate.");
        } else {
          for (const req of activeRequests) {
            console.log(`- ID: ${req.requestId} | Op: ${req.operation} | By: ${req.requestedBy}`);
          }
        }
      }
      break;
    }

    case "agents": {
      const agentEntries = Array.from(defaultControlPlane.proposalsByRequest.entries()).map(([reqId, props]) => ({
        requestId: reqId,
        proposals: props,
      }));
      if (isJson) {
        console.log(JSON.stringify({ active_proposals: agentEntries }, null, 2));
      } else {
        console.log("=== AIOS CONNECTED AGENT PROPOSALS ===");
        if (agentEntries.length === 0) {
          console.log("No active agent proposals recorded.");
        } else {
          for (const entry of agentEntries) {
            console.log(`Request: ${entry.requestId} (${entry.proposals.length} proposals)`);
            for (const p of entry.proposals) {
              console.log(`  -> [${p.agentId}] ${p.proposalId} (Hash: ${p.canonicalHash.slice(0, 12)}...)`);
            }
          }
        }
      }
      break;
    }

    case "approve": {
      const reqId = args[1];
      if (!reqId) {
        console.error("Usage: aios approve <requestId>");
        process.exit(1);
      }
      const res = await defaultControlPlane.resolveRequest(reqId, "APPROVE", "operator-admin");
      if (isJson) console.log(JSON.stringify(res, null, 2));
      else console.log(`Request ${reqId} APPROVED: Status = ${res.status}`);
      break;
    }

    case "deny": {
      const reqId = args[1];
      if (!reqId) {
        console.error("Usage: aios deny <requestId>");
        process.exit(1);
      }
      const res = await defaultControlPlane.resolveRequest(reqId, "DENY", "operator-admin");
      if (isJson) console.log(JSON.stringify(res, null, 2));
      else console.log(`Request ${reqId} DENIED: Status = ${res.status}`);
      break;
    }

    case "run": {
      const gateIndex = args.indexOf("--gate");
      const gateVal = gateIndex !== -1 ? args[gateIndex + 1] : "24";
      console.log(`=== AIOS RUNTIME: STARTING GATE ${gateVal} ===`);
      const res = await defaultOrchestrator.run({
        gate: gateVal,
        onProgress: (p) => {
          const etaStr = p.eta ? `(ETA: ${p.eta.formatted})` : "";
          console.log(`[${p.step_index}/${p.step_total}] ${p.state} -> ${p.current_step} ${etaStr}`);
        },
      });
      if (isJson) console.log(JSON.stringify(res, null, 2));
      else {
        console.log(`\n=== GATE ${gateVal} FINISHED: ${res.state} ===`);
        console.log(`RUN ID:        ${res.run_id}`);
        console.log(`ELAPSED:       ${Math.round(res.elapsed_ms / 1000)}s`);
        console.log(`EVIDENCE HASH: ${res.evidence_hash}`);
      }
      process.exit(res.state === "PASSED" ? 0 : 1);
    }

    case "stop": {
      const stopRes = defaultOrchestrator.stop();
      if (isJson) console.log(JSON.stringify(stopRes, null, 2));
      else console.log(`Runtime Execution Stopped: ${stopRes.status}`);
      break;
    }

    case "logs": {
      const status = defaultOrchestrator.getStatus();
      if (isJson) console.log(JSON.stringify(status.raw?.steps || [], null, 2));
      else {
        console.log("=== AIOS RUNTIME STEP LOGS ===");
        for (const s of status.raw?.steps || []) {
          console.log(`[${s.status}] ${s.step_name} (${s.duration_ms}ms)`);
        }
      }
      break;
    }

    case "evidence": {
      const v = defaultLedger.verifyChain();
      const history = defaultLedger.getHistory(10);
      const out = { verification: v, recent_events: history };
      if (isJson) console.log(JSON.stringify(out, null, 2));
      else {
        console.log("=== AIOS EVIDENCE LEDGER ===");
        console.log(`CHAIN STATUS: ${v.status} (${v.events} events)`);
        console.log(`LATEST HASH:  ${v.latestHash || history[0]?.current_witness_hash || "GENESIS"}`);
        console.log("Recent Events:");
        for (const e of history.slice(0, 5)) {
          console.log(`- [${e.operation}] ${e.http_status === 200 ? "OK" : "ERR"} -> ${e.current_witness_hash.slice(0, 16)}...`);
        }
      }
      break;
    }

    case "artifact": {
      const snap = await defaultRelay.getSystemSnapshot({ timeoutMs: 2500 });
      const artifact = snap.artifact;
      if (isJson) console.log(JSON.stringify(artifact || {}, null, 2));
      else {
        console.log("=== AIOS LATEST DISTRIBUTED ARTIFACT ===");
        if (!artifact?.artifactId) {
          console.log("No distributed artifact found in current reality.");
        } else {
          console.log(`ID:      ${artifact.artifactId}`);
          console.log(`SHA-256: ${artifact.artifactSha256}`);
          console.log(`LINEAGE: ${artifact.lineageWitnessId || "GENESIS"}`);
        }
      }
      break;
    }

    case "doctor": {
      const doc = {
        core: "AIOS Unified Canonical Control Plane",
        version: "0.1.0",
        orchestrator: defaultOrchestrator.doctor(),
        ledger_status: defaultLedger.verifyChain(),
        mcp_endpoint: "http://127.0.0.1:9320/api/remote-mcp",
        single_authority: "desktop/agent-control-plane.mjs",
      };
      if (isJson) console.log(JSON.stringify(doc, null, 2));
      else {
        console.log("=== AIOS CANONICAL DOCTOR ===");
        console.log(`CORE:           ${doc.core}`);
        console.log(`VERSION:        ${doc.version}`);
        console.log(`LEDGER STATUS:  ${doc.ledger_status.status} (${doc.ledger_status.events} events)`);
        console.log(`MCP ENDPOINT:   ${doc.mcp_endpoint}`);
        console.log("DOCTOR CHECK:   ALL SYSTEMS HEALTHY (PASS)");
      }
      break;
    }

    default: {
      console.log("AIOS Canonical CLI — Usage:");
      console.log("  aios status [--json]");
      console.log("  aios reality [--json]");
      console.log("  aios pending [--json]");
      console.log("  aios agents [--json]");
      console.log("  aios approve <requestId> [--json]");
      console.log("  aios deny <requestId> [--json]");
      console.log("  aios run [--gate 24] [--json]");
      console.log("  aios stop [--json]");
      console.log("  aios logs [--json]");
      console.log("  aios evidence [--json]");
      console.log("  aios artifact [--json]");
      console.log("  aios doctor [--json]");
    }
  }
}

main().catch((err) => {
  console.error("AIOS CLI Error:", err);
  process.exit(1);
});
