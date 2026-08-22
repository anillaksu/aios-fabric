package com.aios.nodeagent

import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.ConcurrentHashMap

data class CapabilityResult(
    val capability: String,
    val status: String,       // CapabilityStatus.{DECLARED,TESTED,NOT_PROVEN}
    val detail: String,
    val latencyMs: Long,
    val observedAtMs: Long,
)

data class EvidenceEntry(
    val observationId: String,
    val timestampUtc: String,
    val operation: String,
    val success: Boolean,
    val previousHash: String,
    val currentHash: String,
)

/**
 * In-process shared state between RuntimeService (writer) and the Control
 * Surface (reader). Deliberately not persisted/immortal — this is process
 * memory, matching "no immortal background process": when the process dies,
 * this state dies with it and PROCESS_GONE becomes the honest answer.
 */
object RuntimeState {
    @Volatile var nodeId: String = "UNKNOWN"
    @Volatile var runId: String? = null
    @Volatile var taskState: TaskState = TaskState.QUEUED
    val serviceRunning = AtomicBoolean(false)
    val lastHeartbeatMs = AtomicLong(0)
    @Volatile var lastHeartbeatEvidenceHash: String = "GENESIS"

    val capabilities = ConcurrentHashMap<String, CapabilityResult>()
    val evidenceLog = java.util.Collections.synchronizedList(mutableListOf<EvidenceEntry>())

    @Volatile var currentArtifact: ArtifactManifest? = null

    fun liveness(): Liveness =
        livenessFromHeartbeat(
            lastHeartbeatMs = lastHeartbeatMs.get().takeIf { it > 0 },
            serviceRunning = serviceRunning.get(),
        )

    fun appendEvidence(operation: String, success: Boolean, hashFn: (String) -> String): EvidenceEntry {
        val prev = if (evidenceLog.isEmpty()) "GENESIS" else evidenceLog.last().currentHash
        val ts = java.time.Instant.now().toString()
        val obsId = "obs-" + (System.nanoTime() and 0xFFFFFFFFL).toString(16)
        val payload = """{"timestamp_utc":"$ts","observation_id":"$obsId","operation":"$operation","success":$success,"previous_witness_hash":"$prev"}"""
        val hash = hashFn(payload)
        val entry = EvidenceEntry(obsId, ts, operation, success, prev, hash)
        evidenceLog.add(entry)
        return entry
    }
}
