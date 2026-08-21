// AIOS Canonical Runtime Execution Console & Orchestrator
import { spawn } from "node:child_process";
import { existsSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultLedger, EvidenceLedger, canonicalJson, sha256 } from "./observer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = resolve(__dirname, ".runtime");
const CURRENT_RUN_STATE_PATH = join(STATE_DIR, "current-run.json");
const RUN_LOGS_DIR = join(STATE_DIR, "logs");

if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
if (!existsSync(RUN_LOGS_DIR)) mkdirSync(RUN_LOGS_DIR, { recursive: true });

export const ALLOWED_STATES = [
  "QUEUED",
  "RUNNING",
  "BLOCKED",
  "FAILED",
  "PASSED",
  "STALE",
  "CANCELLED",
  "WAITING_HUMAN",
];

export const CANONICAL_GATE_PLANS = {
  "24": [
    "desktop/test-single-operations-surface.mjs",
    "desktop/test-live-node-discovery.mjs",
    "desktop/test-agent-quota-resume.mjs",
    "desktop/test-scale-fabric.mjs",
    "desktop/test-adaptive-surface.mjs",
    "desktop/test-browser-node-integration.mjs",
    "desktop/test-aios-operational-surface.mjs",
    "desktop/test-canonical-consolidation.mjs",
    "desktop/test-runtime-console.mjs",
    "desktop/test-gate24-discovery.mjs",
    "desktop/test-gate23-chatgpt-reachability.mjs",
    "desktop/tunnel-control/test-tunnel-control.mjs",
    "desktop/test-gate22-openai-tunnel.mjs",
    "desktop/test-gate21-remote-mcp.mjs",
    "desktop/test-gate20-chatgpt-bridge.mjs",
    "desktop/test-gate19-discovery.mjs",
    "desktop/test-agent-control-plane.mjs",
    "desktop/test-live-agent-consumption.mjs",
    "desktop/test-agent-consumer.mjs",
    "desktop/test-canonical-approval-bridge.mjs",
    "desktop/test-continuous-observer.mjs",
    "desktop/test-production-loop.mjs",
    "desktop/test-live-task-delegation.mjs",
    "desktop/test-phone-shared-reality.mjs",
    "desktop/test-first-human-artifact.mjs",
    "desktop/test-shared-reality.mjs",
    "desktop/test-agent-relay.mjs",
    "desktop/test-distributed-artifact.mjs",
    "desktop/test-attestation.mjs",
    "desktop/test-a2a-client.mjs",
    "desktop/test-evidence-bus.mjs",
    "desktop/test-desktop.mjs",
    "fabric/test/platform-neutral-core.test.ts",
    "fabric/test/setup-doctor.test.ts",
    "fabric/test/agent-surface-audit.test.ts",
  ],
  "canonical": [
    "desktop/test-single-operations-surface.mjs",
    "desktop/test-live-node-discovery.mjs",
    "desktop/test-agent-quota-resume.mjs",
    "desktop/test-scale-fabric.mjs",
    "desktop/test-adaptive-surface.mjs",
    "desktop/test-browser-node-integration.mjs",
    "desktop/test-aios-operational-surface.mjs",
    "desktop/test-canonical-consolidation.mjs",
    "desktop/test-runtime-console.mjs",
    "desktop/test-gate24-discovery.mjs",
    "desktop/test-gate23-chatgpt-reachability.mjs",
    "desktop/tunnel-control/test-tunnel-control.mjs",
    "desktop/test-gate22-openai-tunnel.mjs",
    "desktop/test-gate21-remote-mcp.mjs",
    "desktop/test-gate20-chatgpt-bridge.mjs",
    "desktop/test-gate19-discovery.mjs",
    "desktop/test-agent-control-plane.mjs",
    "desktop/test-live-agent-consumption.mjs",
    "desktop/test-agent-consumer.mjs",
    "desktop/test-canonical-approval-bridge.mjs",
    "desktop/test-continuous-observer.mjs",
    "desktop/test-production-loop.mjs",
    "desktop/test-live-task-delegation.mjs",
    "desktop/test-phone-shared-reality.mjs",
    "desktop/test-first-human-artifact.mjs",
    "desktop/test-shared-reality.mjs",
    "desktop/test-agent-relay.mjs",
    "desktop/test-distributed-artifact.mjs",
    "desktop/test-attestation.mjs",
    "desktop/test-a2a-client.mjs",
    "desktop/test-evidence-bus.mjs",
    "desktop/test-desktop.mjs",
    "fabric/test/platform-neutral-core.test.ts",
    "fabric/test/setup-doctor.test.ts",
    "fabric/test/agent-surface-audit.test.ts",
  ],
};

export function computePlanHash(plan = []) {
  return sha256(canonicalJson(plan));
}

export function generateRunId(gate = "24") {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  const rand = sha256(Math.random().toString() + Date.now().toString()).slice(0, 8);
  return `gate${gate}-${y}${m}${d}-${hh}${mm}${ss}-${rand}`;
}

export function redactSecrets(text = "") {
  return text
    .replace(/(Bearer\s+)[A-Za-z0-9_\-\.]{8,}/gi, "$1••••••••")
    .replace(/(control_plane_key|api_key|token|password|auth)[:=]\s*["']?[A-Za-z0-9_\-\.]{8,}["']?/gi, "$1=••••••••")
    .replace(/node-key-[a-f0-9]{32,}/gi, "node-key-••••••••");
}

export class RuntimeOrchestrator {
  constructor(ledger = defaultLedger, statePath = CURRENT_RUN_STATE_PATH) {
    this.ledger = ledger;
    this.statePath = statePath;
    this.activeChildProcess = null;
    this.heartbeatTimer = null;
    this.currentRun = null;
  }

  saveState() {
    if (!this.currentRun) return;
    try {
      writeFileSync(this.statePath, JSON.stringify(this.currentRun, null, 2), "utf-8");
    } catch {
      // ignore
    }
  }

  loadState() {
    try {
      if (existsSync(this.statePath)) {
        const raw = readFileSync(this.statePath, "utf-8");
        return JSON.parse(raw);
      }
    } catch {
      // ignore
    }
    return null;
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.currentRun && this.currentRun.state === "RUNNING") {
        this.currentRun.last_heartbeat = new Date().toISOString();
        this.currentRun.elapsed_ms = Date.now() - new Date(this.currentRun.started_at).getTime();
        this.saveState();
      }
    }, 1000);
    if (this.heartbeatTimer && typeof this.heartbeatTimer.unref === "function") {
      this.heartbeatTimer.unref();
    }
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  calculateObservationalEta(stepIndex, stepTotal, completedStepDurations = []) {
    if (completedStepDurations.length === 0 || stepIndex === 0) {
      return { eta_ms: null, type: "OBSERVATIONAL", formatted: "ESTIMATING" };
    }
    const sum = completedStepDurations.reduce((a, b) => a + b, 0);
    const avgPerStep = sum / completedStepDurations.length;
    const remainingSteps = stepTotal - stepIndex;
    const etaMs = Math.round(avgPerStep * remainingSteps);
    const sec = Math.floor((etaMs / 1000) % 60);
    const min = Math.floor((etaMs / (1000 * 60)) % 60);
    const formatted = `~${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return { eta_ms: etaMs, type: "OBSERVATIONAL", formatted };
  }

  async run(options = {}) {
    const {
      gate = "24",
      plan = null,
      workingDir = dirname(__dirname),
      onProgress = null,
    } = options;

    // Duplicate Run Protection: Attach to existing active run
    const currentStatus = this.getStatus();
    if (currentStatus.raw && currentStatus.state === "RUNNING" && currentStatus.liveness === "ALIVE") {
      this.currentRun = currentStatus.raw;
      if (typeof onProgress === "function") {
        onProgress({ ...this.currentRun });
      }
      return {
        ok: true,
        status: "ATTACHED_EXISTING",
        run_id: this.currentRun.run_id,
        state: this.currentRun.state,
        current_step: this.currentRun.current_step,
        step_index: this.currentRun.step_index,
        step_total: this.currentRun.step_total,
        elapsed_ms: this.currentRun.elapsed_ms,
        evidence_hash: this.currentRun.evidence_hash,
      };
    }

    // Archive previous run if exists
    if (currentStatus.raw && currentStatus.raw.run_id) {
      try {
        const historyDir = join(STATE_DIR, "history");
        if (!existsSync(historyDir)) mkdirSync(historyDir, { recursive: true });
        writeFileSync(join(historyDir, `${currentStatus.raw.run_id}.json`), JSON.stringify(currentStatus.raw, null, 2), "utf-8");
      } catch {
        // ignore
      }
    }

    const activePlan = plan || CANONICAL_GATE_PLANS[String(gate)] || CANONICAL_GATE_PLANS["24"];
    const planHash = computePlanHash(activePlan);
    const runId = generateRunId(gate);
    const startedAt = new Date().toISOString();

    const runMeta = {
      run_id: runId,
      gate: String(gate),
      started_at: startedAt,
      ended_at: null,
      state: "RUNNING",
      pid: process.pid,
      current_step: null,
      step_index: 0,
      step_total: activePlan.length,
      elapsed_ms: 0,
      last_heartbeat: startedAt,
      last_event: "RUN_INITIALIZED",
      evidence_hash: null,
      plan_hash: planHash,
      plan: activePlan,
      steps: [],
      error: null,
    };

    this.currentRun = runMeta;
    this.saveState();
    this.startHeartbeat();

    // Evidence Ledger Bind
    const startEvent = this.ledger.append({
      operation: "relay.task_executed",
      http_status: 200,
      success: true,
      response_data: { run_id: runId, gate: String(gate), plan_hash: planHash, state: "RUNNING" },
      metadata: { event: "RUN_INITIALIZED", orchestrator: true },
    });
    this.currentRun.evidence_hash = startEvent.current_witness_hash;
    this.saveState();

    const durations = [];

    for (let i = 0; i < activePlan.length; i++) {
      if (this.currentRun.state === "CANCELLED") {
        break;
      }

      const stepTarget = activePlan[i];
      const stepId = `step-${i + 1}-${sha256(stepTarget).slice(0, 6)}`;
      const stepStartTime = Date.now();
      const stepStartIso = new Date(stepStartTime).toISOString();

      this.currentRun.step_index = i + 1;
      this.currentRun.current_step = stepTarget;
      this.currentRun.last_event = `STEP_STARTED: ${stepTarget}`;
      this.currentRun.last_heartbeat = new Date().toISOString();
      this.currentRun.elapsed_ms = Date.now() - new Date(this.currentRun.started_at).getTime();

      const stepEta = this.calculateObservationalEta(i, activePlan.length, durations);
      this.currentRun.eta = stepEta;

      const stepEntry = {
        step_id: stepId,
        step_name: stepTarget,
        started_at: stepStartIso,
        ended_at: null,
        duration_ms: 0,
        status: "RUNNING",
        exit_code: null,
        stdout_digest: null,
        stderr_digest: null,
        evidence_hash: null,
      };
      this.currentRun.steps[i] = stepEntry;
      this.saveState();

      if (typeof onProgress === "function") {
        onProgress({ ...this.currentRun, eta: stepEta });
      }

      // Execute Step Child Process
      const stepResult = await this.executeStepChild(stepTarget, workingDir);
      const stepEndTime = Date.now();
      const stepDuration = stepEndTime - stepStartTime;
      durations.push(stepDuration);

      stepEntry.ended_at = new Date(stepEndTime).toISOString();
      stepEntry.duration_ms = stepDuration;
      stepEntry.exit_code = stepResult.exitCode;
      stepEntry.stdout_digest = sha256(stepResult.stdout);
      stepEntry.stderr_digest = sha256(stepResult.stderr);

      if (stepResult.exitCode === 0) {
        stepEntry.status = "PASSED";
        this.currentRun.last_event = `STEP_PASSED: ${stepTarget}`;
      } else {
        stepEntry.status = "FAILED";
        stepEntry.error = stepResult.stderr || stepResult.stdout;
        this.currentRun.state = "FAILED";
        this.currentRun.error = `Step failed: ${stepTarget} (exit code ${stepResult.exitCode})`;
        this.currentRun.last_event = `STEP_FAILED: ${stepTarget}`;
        this.saveState();

        if (typeof onProgress === "function") {
          onProgress({ ...this.currentRun });
        }
        break;
      }
      this.saveState();
    }

    this.stopHeartbeat();
    this.currentRun.ended_at = new Date().toISOString();
    this.currentRun.elapsed_ms = Date.now() - new Date(this.currentRun.started_at).getTime();
    if (this.currentRun.state === "RUNNING") {
      this.currentRun.state = "PASSED";
      this.currentRun.last_event = "RUN_COMPLETED_PASSED";
    }

    const endEvent = this.ledger.append({
      operation: "relay.task_executed",
      http_status: this.currentRun.state === "PASSED" ? 200 : 500,
      success: this.currentRun.state === "PASSED",
      response_data: { run_id: runId, state: this.currentRun.state, elapsed_ms: this.currentRun.elapsed_ms },
      metadata: { event: this.currentRun.last_event, orchestrator: true },
    });
    this.currentRun.evidence_hash = endEvent.current_witness_hash;
    this.saveState();

    if (typeof onProgress === "function") {
      onProgress({ ...this.currentRun });
    }

    return this.currentRun;
  }

  async executeStepChild(stepTarget, workingDir) {
    return new Promise((resolvePromise) => {
      let cmd = "node";
      let args = [];

      if (stepTarget.endsWith(".test.ts")) {
        args = ["--experimental-strip-types", "--test", stepTarget];
      } else if (stepTarget.endsWith(".mjs") || stepTarget.endsWith(".js")) {
        args = [stepTarget];
      } else {
        args = [stepTarget];
      }

      let stdout = "";
      let stderr = "";

      const child = spawn(cmd, args, {
        cwd: workingDir,
        env: { ...process.env, AIOS_RUNTIME_RUN: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      });

      this.activeChildProcess = child;

      child.stdout.on("data", (chunk) => {
        const str = chunk.toString();
        stdout += redactSecrets(str);
      });

      child.stderr.on("data", (chunk) => {
        const str = chunk.toString();
        stderr += redactSecrets(str);
      });

      child.on("close", (code) => {
        this.activeChildProcess = null;
        resolvePromise({ exitCode: code ?? 0, stdout, stderr });
      });

      child.on("error", (err) => {
        this.activeChildProcess = null;
        resolvePromise({ exitCode: 1, stdout, stderr: err.message });
      });
    });
  }

  stop() {
    if (this.currentRun && this.currentRun.state === "RUNNING") {
      this.currentRun.state = "CANCELLED";
      this.currentRun.last_event = "RUN_CANCELLED_BY_OPERATOR";
      this.currentRun.ended_at = new Date().toISOString();
      this.saveState();
    }
    if (this.activeChildProcess) {
      try {
        this.activeChildProcess.kill("SIGTERM");
      } catch {
        // ignore
      }
      this.activeChildProcess = null;
    }
    this.stopHeartbeat();
    return { ok: true, status: "CANCELLED" };
  }

  getStatus() {
    const state = this.loadState();
    if (!state) {
      return { ok: true, status: "NO_RUN_FOUND", run: null };
    }

    const now = Date.now();
    const lastHeartbeatTime = state.last_heartbeat ? new Date(state.last_heartbeat).getTime() : 0;
    const heartbeatAgeSec = Math.round((now - lastHeartbeatTime) / 1000);

    let liveness = "ALIVE";
    if (state.state === "RUNNING") {
      if (heartbeatAgeSec > 10) {
        state.state = "STALE";
        liveness = "NO_HEARTBEAT";
      }
      if (state.pid) {
        try {
          process.kill(state.pid, 0);
        } catch {
          state.state = "STALE";
          liveness = "PROCESS_GONE";
        }
      }
    }

    return {
      ok: true,
      run_id: state.run_id,
      gate: state.gate,
      state: state.state,
      liveness,
      heartbeat_age_sec: heartbeatAgeSec,
      current_step: state.current_step,
      step_index: state.step_index,
      step_total: state.step_total,
      elapsed_ms: state.elapsed_ms,
      last_heartbeat: state.last_heartbeat,
      last_event: state.last_event,
      evidence_hash: state.evidence_hash,
      plan_hash: state.plan_hash,
      eta: state.eta || null,
      error: state.error || null,
      raw: state,
    };
  }

  attach() {
    const status = this.getStatus();
    if (!status.raw) {
      return { ok: false, error: "NO_ACTIVE_RUN", status: "IDLE" };
    }
    this.currentRun = status.raw;
    return { ok: true, status: "ATTACHED", run: this.currentRun };
  }

  pause() {
    if (this.currentRun && this.currentRun.state === "RUNNING") {
      this.currentRun.state = "PAUSED";
      this.currentRun.last_event = "RUN_PAUSED_BY_OPERATOR";
      this.saveState();
      this.stopHeartbeat();
      this.ledger.append({
        operation: "runtime.paused",
        http_status: 200,
        success: true,
        response_data: { run_id: this.currentRun.run_id, step: this.currentRun.current_step },
        metadata: { paused: true },
      });
      return { ok: true, status: "PAUSED", run_id: this.currentRun.run_id };
    }
    return { ok: false, error: "NOT_RUNNING" };
  }

  resume() {
    if (this.currentRun && this.currentRun.state === "PAUSED") {
      this.currentRun.state = "RUNNING";
      this.currentRun.last_event = "RUN_RESUMED_BY_OPERATOR";
      this.saveState();
      this.startHeartbeat();
      this.ledger.append({
        operation: "runtime.resumed",
        http_status: 200,
        success: true,
        response_data: { run_id: this.currentRun.run_id, step: this.currentRun.current_step },
        metadata: { resumed: true },
      });
      return { ok: true, status: "RUNNING", run_id: this.currentRun.run_id };
    }
    return { ok: false, error: "NOT_PAUSED" };
  }

  getCurrentRun() {
    const status = this.getStatus();
    return status.raw || null;
  }

  doctor() {
    return {
      ok: true,
      orchestrator: "AIOS Canonical Runtime Orchestrator",
      state_dir: STATE_DIR,
      state_file: CURRENT_RUN_STATE_PATH,
      allowed_states: ALLOWED_STATES,
      supported_gates: Object.keys(CANONICAL_GATE_PLANS),
      heartbeat_interval_ms: 1000,
      stale_threshold_sec: 10,
    };
  }
}

export const defaultOrchestrator = new RuntimeOrchestrator();

// CLI Entrypoint
const isDirectEntry = process.argv[1] && (process.argv[1].endsWith("runtime-console.mjs") || process.argv[1].endsWith("runtime-console"));
if (isDirectEntry && !process.argv[1].includes("test-runtime-console")) {
  const args = process.argv.slice(2);
  const command = args[0] || "status";
  const isJson = args.includes("--json");

  if (command === "doctor") {
    const doc = defaultOrchestrator.doctor();
    if (isJson) console.log(JSON.stringify(doc, null, 2));
    else {
      console.log("=== AIOS RUNTIME ORCHESTRATOR DOCTOR ===");
      console.log(`State File: ${doc.state_file}`);
      console.log(`Gates Supported: ${doc.supported_gates.join(", ")}`);
      console.log("Status: OK");
    }
  } else if (command === "status") {
    const status = defaultOrchestrator.getStatus();
    if (isJson) console.log(JSON.stringify(status, null, 2));
    else {
      console.log("=== AIOS RUNTIME CONSOLE STATUS ===");
      console.log(`RUN ID:       ${status.run_id || "NONE"}`);
      console.log(`STATE:        ${status.state || "IDLE"}`);
      console.log(`LIVENESS:     ${status.liveness || "UNKNOWN"}`);
      console.log(`PROGRESS:     ${status.step_index || 0} / ${status.step_total || 0}`);
      console.log(`CURRENT STEP: ${status.current_step || "NONE"}`);
      console.log(`HEARTBEAT:    ${status.heartbeat_age_sec !== undefined ? status.heartbeat_age_sec + "s ago" : "N/A"}`);
      console.log(`LAST EVENT:   ${status.last_event || "NONE"}`);
      if (status.error) console.log(`ERROR:        ${status.error}`);
    }
  } else if (command === "stop") {
    const res = defaultOrchestrator.stop();
    if (isJson) console.log(JSON.stringify(res, null, 2));
    else console.log(`Runtime execution stopped: ${res.status}`);
  } else if (command === "run") {
    const gateIndex = args.indexOf("--gate");
    const gateVal = gateIndex !== -1 ? args[gateIndex + 1] : "24";

    console.log(`=== AIOS RUNTIME CONSOLE: STARTING GATE ${gateVal} ===`);
    defaultOrchestrator.run({
      gate: gateVal,
      onProgress: (p) => {
        const etaStr = p.eta ? `(ETA: ${p.eta.formatted})` : "";
        console.log(`[${p.step_index}/${p.step_total}] ${p.state} -> ${p.current_step} ${etaStr}`);
      },
    }).then((res) => {
      console.log(`\n=== GATE ${gateVal} FINISHED: ${res.state} ===`);
      console.log(`RUN ID:        ${res.run_id}`);
      console.log(`ELAPSED:       ${Math.round(res.elapsed_ms / 1000)}s`);
      console.log(`EVIDENCE HASH: ${res.evidence_hash}`);
      process.exit(res.state === "PASSED" ? 0 : 1);
    }).catch((err) => {
      console.error("Runtime fatal error:", err);
      process.exit(1);
    });
  }
}
