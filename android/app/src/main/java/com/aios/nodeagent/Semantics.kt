package com.aios.nodeagent

/**
 * Ports of the canonical vocabularies already proven in desktop/runtime-console.mjs
 * and desktop/renderer/app.js. This file does NOT define new semantics — every
 * value here must exist on the Node/desktop side first. See
 * docs/android-foundation/08-VERTICAL-SLICE-STATUS.md Part 8 (Canonical Parity).
 */

/** Mirrors runtime-console.mjs ALLOWED_STATES (8 values). */
enum class TaskState {
    QUEUED, RUNNING, BLOCKED, FAILED, PASSED, STALE, CANCELLED, WAITING_HUMAN
}

/** Mirrors app.js LIVENESS_TEXT keys: ALIVE | NO_HEARTBEAT | PROCESS_GONE. */
enum class Liveness { ALIVE, NO_HEARTBEAT, PROCESS_GONE }

/** Mirrors app.js proofSemantic() truthfulness rule: PASS+stale is never "proven". */
enum class ProofVerdict { PROVEN, STALE_PROOF, NOT_PROVEN, INCONCLUSIVE, FAILED, OFFLINE }

object CapabilityStatus {
    const val DECLARED = "DECLARED"
    const val TESTED = "TESTED"
    const val NOT_PROVEN = "NOT_PROVEN"
}

object ArtifactStatus {
    const val DISCOVERED = "DISCOVERED"
    const val VERIFIED = "VERIFIED"
    const val AVAILABLE = "AVAILABLE"
    const val INSTALLED = "INSTALLED"
    const val ACTIVE = "ACTIVE"
    const val SUPERSEDED = "SUPERSEDED"
    const val ROLLED_BACK = "ROLLED_BACK"
    const val REVOKED = "REVOKED"
}

/**
 * Liveness from a heartbeat timestamp, same rule as app.js applyFreshness():
 * recent -> ALIVE, stale but process alive -> NO_HEARTBEAT, service reported
 * stopped -> PROCESS_GONE. Thresholds match the LIVE/STALE breakpoints already
 * proven in the mobile projection (10s / 120s windows), not new numbers.
 */
fun livenessFromHeartbeat(lastHeartbeatMs: Long?, serviceRunning: Boolean, nowMs: Long = System.currentTimeMillis()): Liveness {
    if (!serviceRunning) return Liveness.PROCESS_GONE
    if (lastHeartbeatMs == null) return Liveness.NO_HEARTBEAT
    val ageMs = nowMs - lastHeartbeatMs
    return if (ageMs <= 10_000) Liveness.ALIVE else Liveness.NO_HEARTBEAT
}
