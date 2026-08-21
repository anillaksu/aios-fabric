// AIOS Scale Fabric — Capability & Provider Fallback Graph + Quorum Evaluator
import { canonicalJson, sha256 } from "./observer.mjs";

export const PROVIDER_HEALTH = {
  AVAILABLE: "AVAILABLE",
  DEGRADED: "DEGRADED",
  QUOTA_LIMITED: "QUOTA_LIMITED",
  OFFLINE: "OFFLINE",
};

export const QUORUM_VERDICTS = {
  CONFIRMED: "CONFIRMED", // N-of-M consensus achieved
  OBSERVED: "OBSERVED",   // Single node observation (below quorum)
  CONFLICT: "CONFLICT",   // Conflicting observations detected
};

export class FallbackGraph {
  constructor() {
    this.capabilityMap = new Map();
    this.providerHealth = new Map();
    this.initDefaultGraphs();
  }

  initDefaultGraphs() {
    // Default Capability Routing Paths
    this.capabilityMap.set("browser.proof.read", {
      primary: "agent-ai-browser",
      secondary: "agent-claude",
      tertiary: "agent-antigravity",
      emergency: "agent-hermes",
    });

    this.capabilityMap.set("sensor.battery.read", {
      primary: "agent-android-native",
      secondary: "agent-hermes",
      tertiary: "agent-claude",
      emergency: "agent-antigravity",
    });

    this.capabilityMap.set("reasoning.plan", {
      primary: "provider-claude",
      secondary: "provider-openai",
      tertiary: "provider-gemini",
      emergency: "provider-local-hermes",
    });

    // Default Provider States
    this.providerHealth.set("provider-claude", { status: PROVIDER_HEALTH.AVAILABLE, quotaUsed: 0 });
    this.providerHealth.set("provider-openai", { status: PROVIDER_HEALTH.AVAILABLE, quotaUsed: 0 });
    this.providerHealth.set("provider-gemini", { status: PROVIDER_HEALTH.AVAILABLE, quotaUsed: 0 });
    this.providerHealth.set("provider-local-hermes", { status: PROVIDER_HEALTH.AVAILABLE, quotaUsed: 0 });
  }

  setProviderStatus(providerId, status) {
    const current = this.providerHealth.get(providerId) || { quotaUsed: 0 };
    this.providerHealth.set(providerId, { ...current, status, lastUpdated: Date.now() });
  }

  /**
   * Get active candidate executor for capability considering current provider health
   */
  resolveExecutionCandidate(capability) {
    const graph = this.capabilityMap.get(capability);
    if (!graph) return { candidate: "agent-antigravity", tier: "default" };

    const candidates = [
      { id: graph.primary, tier: "primary" },
      { id: graph.secondary, tier: "secondary" },
      { id: graph.tertiary, tier: "tertiary" },
      { id: graph.emergency, tier: "emergency" },
    ];

    for (const c of candidates) {
      const pHealth = this.providerHealth.get(c.id);
      if (!pHealth || pHealth.status === PROVIDER_HEALTH.AVAILABLE) {
        return { candidate: c.id, tier: c.tier };
      }
    }

    // Return emergency fallback if all degraded
    return { candidate: graph.emergency, tier: "emergency-degraded" };
  }

  /**
   * Quorum / Cross-Check Evaluator: Evaluates multi-node observations
   * @param {Array<{nodeId: string, observationDigest: string, data: any}>} observations
   * @param {number} requiredQuorum (e.g. 2 for 2-of-N)
   */
  evaluateQuorum(observations = [], requiredQuorum = 2) {
    if (!Array.isArray(observations) || observations.length === 0) {
      return { verdict: QUORUM_VERDICTS.OBSERVED, confirmedCount: 0, observationDigest: null };
    }

    if (observations.length === 1) {
      return {
        verdict: QUORUM_VERDICTS.OBSERVED,
        confirmedCount: 1,
        observationDigest: observations[0].observationDigest,
        nodes: [observations[0].nodeId],
      };
    }

    // Count identical digests
    const digestCounts = new Map();
    for (const obs of observations) {
      const digest = obs.observationDigest || sha256(canonicalJson(obs.data || {}));
      const list = digestCounts.get(digest) || [];
      list.push(obs.nodeId);
      digestCounts.set(digest, list);
    }

    // Find highest agreement
    let maxDigest = null;
    let maxNodes = [];
    for (const [digest, nodes] of digestCounts) {
      if (nodes.length > maxNodes.length) {
        maxDigest = digest;
        maxNodes = nodes;
      }
    }

    if (digestCounts.size > 1 && maxNodes.length < requiredQuorum) {
      return {
        verdict: QUORUM_VERDICTS.CONFLICT,
        confirmedCount: maxNodes.length,
        observationDigest: maxDigest,
        conflictingNodes: observations.map((o) => o.nodeId),
        distribution: Object.fromEntries(digestCounts),
      };
    }

    if (maxNodes.length >= requiredQuorum) {
      return {
        verdict: QUORUM_VERDICTS.CONFIRMED,
        confirmedCount: maxNodes.length,
        observationDigest: maxDigest,
        nodes: maxNodes,
      };
    }

    return {
      verdict: QUORUM_VERDICTS.OBSERVED,
      confirmedCount: maxNodes.length,
      observationDigest: maxDigest,
      nodes: maxNodes,
    };
  }
}

export const defaultFallbackGraph = new FallbackGraph();
