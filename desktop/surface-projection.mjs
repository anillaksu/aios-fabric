// AIOS Canonical Surface Projection Engine
// ONE REALITY — MANY DETERMINISTIC PROJECTIONS
import { canonicalJson, sha256 } from "./observer.mjs";

export const PROJECTION_PROFILES = {
  DESKTOP: "desktop",
  TABLET: "tablet",
  MOBILE: "mobile",
  COMPACT_MOBILE: "compact-mobile",
};

/**
 * Kanonik durumdan profil-bağımsız Semantic Slot nesnelerini üretir.
 * Slotlar tüm profillerde veri ve kimlik olarak byte-özdeştir.
 */
export function extractSemanticSlots(canonicalState = {}) {
  const reality = canonicalState.reality || {};
  const runtime = canonicalState.runtime || {};
  const requests = canonicalState.requests || {};
  const agents = canonicalState.agents || {};
  const evidence = canonicalState.evidence || {};
  const nodes = reality.nodes || {};

  // Truthful Dynamic Proven Matrix Calculation
  const isAndroidOnline = Boolean(nodes.android?.online && !nodes.android?.stale);
  const isChainValid = evidence.status === "CHAIN_VALID";
  const hasAttestation = Boolean(reality.attestation?.latestWitnessId && reality.attestation?.latestWitnessId !== "GENESIS");
  const hasArtifact = Boolean(canonicalState.artifacts?.length || canonicalState.latestArtifact);
  const isBrowserProven = nodes.browser?.verdict === "PASS";
  const isHumanGateReady = Boolean(requests !== undefined);
  const isA2aConnected = Boolean(isAndroidOnline && reality.a2a?.authenticated);

  const dynamicMatrix = [
    { title: "OBSERVER (100.75.177.88)", status: isAndroidOnline ? "PROVEN" : nodes.android?.stale ? "STALE" : "NOT_PROVEN", proven: isAndroidOnline },
    { title: "EVIDENCE LEDGER", status: isChainValid ? `PROVEN (${evidence.events || 0} events)` : evidence.status ? evidence.status : "NOT_PROVEN", proven: isChainValid },
    { title: "NODE ATTESTATION", status: hasAttestation ? "PROVEN" : "NOT_PROVEN", proven: hasAttestation },
    { title: "BROWSER SENTINEL", status: nodes.browser?.verdict || "NOT_PROVEN", proven: isBrowserProven },
    { title: "DISTRIBUTED ARTIFACT", status: hasArtifact ? "PROVEN" : "NOT_PROVEN", proven: hasArtifact },
    { title: "A2A AUTH GATE", status: isA2aConnected ? "CONNECTED (A2A v1.0)" : "FAIL-CLOSED", proven: isA2aConnected },
    { title: "HUMAN CONTROL GATE", status: requests.pending_count > 0 ? `${requests.pending_count} REVIEW REQ` : "PROVEN", proven: isHumanGateReady },
  ];

  const provenMatrixCount = dynamicMatrix.filter((m) => m.proven).length;

  const latestArtifactId =
    canonicalState.artifacts?.[canonicalState.artifacts.length - 1]?.artifactId ||
    canonicalState.artifacts?.[0]?.artifactId ||
    canonicalState.latestArtifact?.artifactId ||
    "NONE";

  return {
    primaryAction: {
      type: "ASK_AIOS",
      targetCapability: "sensor.battery.read",
      allowedOperations: ["sensor.battery.read", "browser.proof.read", "wifi.info", "volume.read"],
    },
    currentReality: {
      digest: reality.digest || canonicalState.digest || "GENESIS",
      provenMatrixCount,
      matrix: dynamicMatrix,
      status: reality.digest ? "PROVEN" : "NOT_PROVEN",
    },
    pendingHuman: {
      pendingCount: requests.pending_count || 0,
      items: (requests.items || []).map((r) => ({
        requestId: r.requestId,
        operation: r.operation,
        status: r.status,
        requestedBy: r.requestedBy,
        timestamp: r.createdAt || r.timestamp,
      })),
    },
    activeExecution: {
      runId: runtime.run_id || "NONE",
      state: runtime.state || "IDLE",
      liveness: runtime.liveness || "STANDBY",
      progress: runtime.progress || "0 / 0",
      currentStep: runtime.current_step || "IDLE",
      // Duvar saatinden türeyen "yaş" hash'lenen slotlara giremez: hiçbir
      // kanonik değişiklik olmadan semantic_slot_hash'i her saniye kaydırır ve
      // "aynı state + aynı profil -> byte-özdeş" değişmezini gözlemlenemez kılar.
      // Kanonik olan mutlak zaman damgasıdır; yaş sunum katmanında hesaplanır.
      lastHeartbeat: runtime.last_heartbeat || null,
      elapsedMs: runtime.elapsed_ms || 0,
      eta: runtime.eta?.formatted || "N/A",
    },
    recentEvidence: {
      chainStatus: evidence.status || "UNKNOWN",
      eventsCount: evidence.events || 0,
      latestHash: evidence.latest_hash || "GENESIS",
      latestArtifactId,
    },
    nodeOverview: {
      windows: {
        nodeId: nodes.windows?.nodeId || "node-windows",
        online: nodes.windows?.online !== false,
      },
      android: {
        nodeId: nodes.android?.nodeId || "node-android",
        online: isAndroidOnline,
        stale: Boolean(nodes.android?.stale),
      },
      browser: {
        nodeId: nodes.browser?.nodeId || "node-browser",
        online: Boolean(nodes.browser?.online),
        verdict: nodes.browser?.verdict || "UNKNOWN",
      },
    },
    runtimeDiagnostics: {
      orchestratorLiveness: runtime.liveness || "STANDBY",
      singleAuthority: "desktop/agent-control-plane.mjs",
      mcpEndpoint: "http://127.0.0.1:9320/api/remote-mcp",
    },
  };
}

/**
 * Kanonik durumdan deterministik presentation projection üretir.
 */
export function projectCanonicalState(canonicalState = {}, profile = PROJECTION_PROFILES.DESKTOP) {
  const semanticSlots = extractSemanticSlots(canonicalState);
  const realityDigest = canonicalState.reality?.digest || canonicalState.digest || "GENESIS";

  // Profil bazlı görünürlük haritası
  const visibleCapabilities = ["sensor.battery.read", "browser.proof.read", "wifi.info", "volume.read"];
  const visibleRequests = semanticSlots.pendingHuman.items.map((r) => r.requestId);

  // Layout konfigürasyonu (Sunum farkı)
  let layout = {
    mode: "multi-column-grid",
    columns: 3,
    bottomNav: false,
    activeTab: "all",
    cardMinHeightPx: 44,
  };

  if (profile === PROJECTION_PROFILES.MOBILE || profile === PROJECTION_PROFILES.COMPACT_MOBILE) {
    layout = {
      mode: "single-column-focus",
      columns: 1,
      bottomNav: true,
      activeTab: "ask",
      cardMinHeightPx: 48,
      touchTargetMinPx: 44,
    };
  } else if (profile === PROJECTION_PROFILES.TABLET) {
    layout = {
      mode: "split-pane",
      columns: 2,
      bottomNav: false,
      activeTab: "overview",
      cardMinHeightPx: 44,
      touchTargetMinPx: 44,
    };
  }

  // Deterministik Semantic Slot Hash (Tüm profillerde birebir aynı)
  const semanticSlotHash = sha256(canonicalJson(semanticSlots));

  // Deterministik Projection Hash (Profil ve Layout spesifik)
  const projectionPayload = {
    schema: "aios.surface.v1",
    profile,
    canonical_reality_digest: realityDigest,
    semantic_slots: semanticSlots,
    layout: {
      mode: layout.mode,
      columns: layout.columns,
      bottomNav: layout.bottomNav,
    },
    visible_capabilities: visibleCapabilities,
    visible_requests: visibleRequests,
  };
  const projectionHash = sha256(canonicalJson(projectionPayload));

  return {
    schema: "aios.surface.projection.v1",
    profile,
    realityDigest,
    semanticSlotHash,
    projectionHash,
    semanticSlots,
    layout,
    timestamp: canonicalState.timestamp || new Date().toISOString(),
  };
}
