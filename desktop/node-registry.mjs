// AIOS Scale Fabric — Canonical Node Registry & Capacity Scoring Engine
import { canonicalJson, sha256 } from "./observer.mjs";

export const NODE_POOLS = {
  DEVICE: "DEVICE",
  DESKTOP: "DESKTOP",
  BROWSER: "BROWSER",
  ANDROID: "ANDROID",
  GPU: "GPU",
  CLOUD: "CLOUD",
  LLM: "LLM",
  SPECIALIZED: "SPECIALIZED",
};

export const NODE_HEALTH = {
  ONLINE: "ONLINE",
  DEGRADED: "DEGRADED",
  STALE: "STALE",
  OFFLINE: "OFFLINE",
};

export class NodeRegistry {
  constructor() {
    this.nodes = new Map();
    this.heartbeatTtlMs = 15000; // 15 seconds
  }

  /**
   * Register a node in the fabric
   */
  registerNode(nodeSpec = {}) {
    const {
      nodeId,
      pool = NODE_POOLS.DESKTOP,
      platform = "windows",
      runtime = "node",
      capabilities = [],
      capacity = { concurrency: 4, memoryMb: 8192, cpuCores: 8 },
      trust = 1.0,
      attestation = "attested",
      latencyMs = 10,
      isCloud = false,
      costPerOp = 0.0,
    } = nodeSpec;

    if (!nodeId) throw new Error("nodeId is required for registration");

    const record = {
      nodeId,
      pool,
      platform,
      runtime,
      capabilities: [...capabilities].sort(),
      capacity: {
        concurrency: capacity.concurrency || 1,
        activeTasks: 0,
        memoryMb: capacity.memoryMb || 1024,
        cpuCores: capacity.cpuCores || 1,
      },
      trust: Math.max(0.0, Math.min(1.0, trust)),
      attestation,
      latencyMs: Math.max(1, latencyMs),
      isCloud: Boolean(isCloud),
      costPerOp: Math.max(0.0, costPerOp),
      health: NODE_HEALTH.ONLINE,
      lastHeartbeat: Date.now(),
      registeredAt: Date.now(),
    };

    this.nodes.set(nodeId, record);
    return record;
  }

  /**
   * Update node heartbeat and health
   */
  recordHeartbeat(nodeId, health = NODE_HEALTH.ONLINE, latencyMs = null) {
    const node = this.nodes.get(nodeId);
    if (!node) return null;

    node.lastHeartbeat = Date.now();
    node.health = health;
    if (latencyMs !== null) {
      node.latencyMs = latencyMs;
    }
    return node;
  }

  /**
   * Sweep and update node health states based on TTL
   */
  sweepHeartbeats() {
    const now = Date.now();
    for (const [, node] of this.nodes) {
      const age = now - node.lastHeartbeat;
      if (age > this.heartbeatTtlMs * 2) {
        node.health = NODE_HEALTH.OFFLINE;
      } else if (age > this.heartbeatTtlMs) {
        node.health = NODE_HEALTH.STALE;
      }
    }
  }

  /**
   * Calculate deterministic capacity score for a node against task constraints
   */
  scoreNodeForCapability(node, capability, constraints = {}) {
    if (!node || node.health === NODE_HEALTH.OFFLINE) return -1;
    if (!node.capabilities.includes(capability)) return -1;

    // Check concurrency capacity
    const availableSlots = node.capacity.concurrency - node.capacity.activeTasks;
    if (availableSlots <= 0) return -1;

    let score = 100.0;

    // Health factor
    if (node.health === NODE_HEALTH.DEGRADED) score -= 30.0;
    if (node.health === NODE_HEALTH.STALE) score -= 60.0;

    // Trust & Attestation factor
    score += node.trust * 50.0;
    if (node.attestation !== "attested") score -= 40.0;

    // Latency factor (penalize higher latency)
    score -= Math.min(50.0, node.latencyMs / 10.0);

    // Available concurrency factor
    score += availableSlots * 10.0;

    // Locality preference: Local nodes preferred over cloud
    if (node.isCloud) {
      score -= (constraints.costSensitivity || 10.0);
    }

    return Math.max(0.0, score);
  }

  /**
   * Find best available nodes for a capability ranked deterministically
   */
  findBestNodes(capability, constraints = {}) {
    this.sweepHeartbeats();

    const candidates = [];
    for (const [, node] of this.nodes) {
      const score = this.scoreNodeForCapability(node, capability, constraints);
      if (score > 0) {
        candidates.push({ node, score });
      }
    }

    // Sort deterministically: highest score first, tie-break by nodeId
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.node.nodeId.localeCompare(b.node.nodeId);
    });

    return candidates.map((c) => c.node);
  }

  acquireTaskSlot(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) return false;
    if (node.capacity.activeTasks >= node.capacity.concurrency) return false;
    node.capacity.activeTasks++;
    return true;
  }

  releaseTaskSlot(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    node.capacity.activeTasks = Math.max(0, node.capacity.activeTasks - 1);
  }

  getNodeMetrics() {
    this.sweepHeartbeats();
    let online = 0;
    let stale = 0;
    let offline = 0;
    let degraded = 0;
    let totalCapacity = 0;
    let activeTasks = 0;

    for (const [, node] of this.nodes) {
      if (node.health === NODE_HEALTH.ONLINE) online++;
      else if (node.health === NODE_HEALTH.STALE) stale++;
      else if (node.health === NODE_HEALTH.DEGRADED) degraded++;
      else if (node.health === NODE_HEALTH.OFFLINE) offline++;

      totalCapacity += node.capacity.concurrency;
      activeTasks += node.capacity.activeTasks;
    }

    return {
      totalNodes: this.nodes.size,
      online,
      degraded,
      stale,
      offline,
      healthyNodes: online + degraded,
      totalCapacity,
      activeTasks,
      availableSlots: Math.max(0, totalCapacity - activeTasks),
    };
  }
}

export const defaultNodeRegistry = new NodeRegistry();

// Initialize canonical built-in nodes
defaultNodeRegistry.registerNode({
  nodeId: "node-windows",
  pool: NODE_POOLS.DESKTOP,
  platform: "win32",
  runtime: "node",
  capabilities: ["runtime.orchestrator", "system.exec", "evidence.verify", "browser.proof.read"],
  capacity: { concurrency: 8, memoryMb: 16384, cpuCores: 12 },
  trust: 1.0,
  latencyMs: 1,
});

defaultNodeRegistry.registerNode({
  nodeId: "node-android",
  pool: NODE_POOLS.ANDROID,
  platform: "android",
  runtime: "native-agent",
  capabilities: ["sensor.battery.read", "wifi.info", "volume.read"],
  capacity: { concurrency: 2, memoryMb: 4096, cpuCores: 8 },
  trust: 0.95,
  latencyMs: 35,
});

defaultNodeRegistry.registerNode({
  nodeId: "node-browser",
  pool: NODE_POOLS.BROWSER,
  platform: "chromium",
  runtime: "playwright-mv3",
  capabilities: ["browser.proof.read", "browser.witness.produce", "browser.ad_block.verify"],
  capacity: { concurrency: 4, memoryMb: 4096, cpuCores: 4 },
  trust: 1.0,
  latencyMs: 5,
});
