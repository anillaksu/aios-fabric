package com.aios.nodeagent

import android.content.Context

/**
 * Final metrics (mission "FINAL METRICS" / "No claim without measurement").
 * Every field is a live read from already-proven state — nothing here is a
 * new counter that isn't backed by a real observation.
 */
data class ProductMetrics(
    val artifactsTotal: Int,
    val installed: Int,
    val active: Int,
    val verified: Int,
    val rollbackCapable: Int,
    val revoked: Int,
    val nodesKnown: Int,
    val capabilitiesTested: Int,
    val capabilitiesTotal: Int,
    val runtimeHealthy: Boolean,
    val taskState: TaskState,
    val evidenceEntries: Int,
    val startupLatencyMs: Long?,      // from am start -W, recorded externally; null if not measured this run
    val jniLatencyMs: Long?,          // local-call capability latency (device.diagnostics.read), 0-network
    val evidenceLatencyMs: Long?,     // time to append+hash one evidence entry, measured live
)

object Metrics {
    fun compute(context: Context, startupLatencyMs: Long? = null): ProductMetrics {
        val stored = LocalArtifactStore.list(context)
        val caps = RuntimeState.capabilities.values

        val t0 = System.nanoTime()
        RuntimeState.appendEvidence("metrics.probe", true, NativeCore::canonicalHash)
        val evidenceLatency = (System.nanoTime() - t0) / 1_000_000

        return ProductMetrics(
            artifactsTotal = stored.size,
            installed = stored.count { it.status == ArtifactStatus.INSTALLED || it.status == ArtifactStatus.ACTIVE },
            active = stored.count { it.status == ArtifactStatus.ACTIVE },
            verified = stored.count { it.status == ArtifactStatus.AVAILABLE || it.status == ArtifactStatus.ACTIVE || it.status == ArtifactStatus.SUPERSEDED },
            rollbackCapable = stored.count { it.rollbackTargetId != null },
            revoked = stored.count { it.status == ArtifactStatus.REVOKED },
            nodesKnown = if (RuntimeState.nodeId != "UNKNOWN") 1 else 0,
            capabilitiesTested = caps.count { it.status == CapabilityStatus.TESTED },
            capabilitiesTotal = caps.size,
            runtimeHealthy = RuntimeState.liveness() == Liveness.ALIVE,
            taskState = RuntimeState.taskState,
            evidenceEntries = RuntimeState.evidenceLog.size,
            startupLatencyMs = startupLatencyMs,
            jniLatencyMs = caps.find { it.capability == "device.diagnostics.read" }?.latencyMs,
            evidenceLatencyMs = evidenceLatency,
        )
    }
}
