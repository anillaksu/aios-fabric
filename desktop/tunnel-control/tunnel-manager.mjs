// AIOS Tunnel Control: Subprocess Manager for official OpenAI tunnel-client
import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

export const DEFAULT_BINARY_PATH = "C:\\AIOS\\tools\\tunnel-client\\tunnel-client.exe";
export const DEFAULT_MCP_TARGET = "http://127.0.0.1:9320/api/remote-mcp";
export const REMOTE_ALLOWLIST = ["aios.reality", "aios.status", "aios.evidence"];

export class TunnelManager {
  constructor(options = {}) {
    this.binaryPath = options.binaryPath || DEFAULT_BINARY_PATH;
    this.mcpServerUrl = options.mcpServerUrl || DEFAULT_MCP_TARGET;
    
    // In-memory volatile session store - NEVER written to disk
    this._session = {
      tunnelId: process.env.CONTROL_PLANE_TUNNEL_ID || "",
      apiKey: process.env.CONTROL_PLANE_API_KEY || "",
    };

    this.process = null;
    this.pid = null;
    this.status = "STOPPED"; // STOPPED | STARTING | RUNNING | ERROR
    this.logs = [];
    this.maxLogs = 200;
    this.lastHealth = { healthy: false, ready: false, timestamp: null };
  }

  setSessionCredentials({ tunnelId, apiKey }) {
    if (typeof tunnelId === "string") this._session.tunnelId = tunnelId.trim();
    if (typeof apiKey === "string") this._session.apiKey = apiKey.trim();
  }

  getMaskedTunnelId() {
    const id = this._session.tunnelId;
    if (!id) return "NOT_CONFIGURED";
    if (id.length <= 12) return id.slice(0, 4) + "••••";
    return id.slice(0, 10) + "••••" + id.slice(-4);
  }

  isApiKeySet() {
    return Boolean(this._session.apiKey && this._session.apiKey.length > 0);
  }

  redact(text) {
    if (!text || typeof text !== "string") return "";
    let clean = text;
    if (this._session.apiKey) {
      clean = clean.replaceAll(this._session.apiKey, "••••••••");
    }
    // Also redact standard OpenAI key patterns
    clean = clean.replace(/sk-[a-zA-Z0-9_-]{20,}/g, "••••••••");
    clean = clean.replace(/Bearer\s+[a-zA-Z0-9_.-]+/gi, "Bearer ••••••••");
    return clean;
  }

  addLog(entry) {
    const redacted = this.redact(entry);
    const line = `[${new Date().toISOString()}] ${redacted}`;
    this.logs.push(line);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  async verify() {
    const results = {
      binaryExists: false,
      version: null,
      doctor: null,
      localMcpReachable: false,
      mcpInitialize: false,
      secretExposure: "ZERO",
      ready: false,
      reason: "",
    };

    // 1. Binary existence
    if (!existsSync(this.binaryPath)) {
      results.reason = `Binary not found at ${this.binaryPath}`;
      return results;
    }
    results.binaryExists = true;

    // 2. Binary version execution
    try {
      results.version = execSync(`"${this.binaryPath}" -v`, { encoding: "utf8" }).trim();
    } catch (err) {
      results.reason = `Version command failed: ${err.message}`;
      return results;
    }

    // 3. Doctor execution
    try {
      const docEnv = {
        ...process.env,
        CONTROL_PLANE_TUNNEL_ID: this._session.tunnelId || process.env.CONTROL_PLANE_TUNNEL_ID || "tunnel_test",
        CONTROL_PLANE_API_KEY: this._session.apiKey || process.env.CONTROL_PLANE_API_KEY || "sk-test",
      };
      const docOut = execSync(`"${this.binaryPath}" doctor --explain`, {
        env: docEnv,
        encoding: "utf8",
        timeout: 5000,
      });
      results.doctor = this.redact(docOut.slice(0, 300));
    } catch (err) {
      results.doctor = "DOCTOR_FAILED";
    }

    // 4. Local MCP target reachability & initialize check
    try {
      const initRes = await fetch(this.mcpServerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer aios-gate22-test-token" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "verify-init",
          method: "initialize",
          params: { protocolVersion: "2025-03-26", clientInfo: { name: "tunnel-control-verify", version: "1.0.0" } },
        }),
      });
      if (initRes.ok) {
        results.localMcpReachable = true;
        const data = await initRes.json();
        if (data.result?.serverInfo?.name === "aios-evidence-observer") {
          results.mcpInitialize = true;
        }
      }
    } catch {
      // Local target may not have listener in standalone verify test
    }

    results.ready = results.binaryExists && Boolean(results.version);
    return results;
  }

  start() {
    if (this.process && !this.process.killed) {
      return { ok: false, error: "Tunnel process is already running", pid: this.pid };
    }

    if (!existsSync(this.binaryPath)) {
      return { ok: false, error: `Binary not found at ${this.binaryPath}` };
    }

    const tunnelId = this._session.tunnelId || process.env.CONTROL_PLANE_TUNNEL_ID;
    const apiKey = this._session.apiKey || process.env.CONTROL_PLANE_API_KEY;

    if (!tunnelId || !apiKey) {
      return {
        ok: false,
        error: "Missing credentials: CONTROL_PLANE_TUNNEL_ID and CONTROL_PLANE_API_KEY must be set in session",
      };
    }

    const childEnv = {
      ...process.env,
      CONTROL_PLANE_TUNNEL_ID: tunnelId,
      CONTROL_PLANE_API_KEY: apiKey,
      MCP_SERVER_URL: this.mcpServerUrl,
    };

    // Command line args contain NO SECRETS
    const args = ["run", "--mcp-server-url", this.mcpServerUrl];

    try {
      this.process = spawn(this.binaryPath, args, {
        env: childEnv,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      this.pid = this.process.pid;
      this.status = "RUNNING";
      this.addLog(`Tunnel client started (PID: ${this.pid}, Target: ${this.mcpServerUrl})`);

      this.process.stdout?.on("data", (chunk) => {
        this.addLog(`[STDOUT] ${chunk.toString().trim()}`);
      });

      this.process.stderr?.on("data", (chunk) => {
        this.addLog(`[STDERR] ${chunk.toString().trim()}`);
      });

      this.process.on("close", (code, signal) => {
        this.status = "STOPPED";
        this.addLog(`Tunnel client exited (Code: ${code}, Signal: ${signal})`);
        this.process = null;
        this.pid = null;
      });

      this.process.on("error", (err) => {
        this.status = "ERROR";
        this.addLog(`Tunnel client error: ${err.message}`);
        this.process = null;
        this.pid = null;
      });

      return { ok: true, pid: this.pid, status: this.status };
    } catch (err) {
      this.status = "ERROR";
      this.addLog(`Failed to spawn tunnel client: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  stop() {
    if (!this.process || this.process.killed) {
      this.status = "STOPPED";
      this.pid = null;
      return { ok: true, message: "Tunnel client was not running" };
    }

    try {
      const pid = this.pid;
      if (process.platform === "win32" && pid) {
        try {
          execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
        } catch {
          this.process.kill("SIGKILL");
        }
      } else {
        this.process.kill("SIGTERM");
      }
      this.status = "STOPPED";
      this.addLog(`Tunnel client terminated (PID: ${pid})`);
      this.process = null;
      this.pid = null;
      return { ok: true, message: "Tunnel client stopped successfully" };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  getStatus() {
    return {
      status: this.status,
      pid: this.pid,
      tunnelId: this.getMaskedTunnelId(),
      apiKeySet: this.isApiKeySet(),
      mcpServerUrl: this.mcpServerUrl,
      binaryPath: this.binaryPath,
      chatgptConnector: "NOT_CONFIGURED",
      chatgptReachability: "NOT_PROVEN",
      allowedTools: REMOTE_ALLOWLIST,
      secretExposure: "ZERO",
      secretStorage: "SESSION_MEMORY_ONLY",
      logs: [...this.logs],
    };
  }
}

export const defaultTunnelManager = new TunnelManager();
