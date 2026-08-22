package com.aios.nodeagent

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.os.Build
import java.util.concurrent.atomic.AtomicBoolean

/**
 * AiosRuntimeService implementation (docs/android-foundation/08-VERTICAL-SLICE-STATUS.md
 * Runtime Service contract), scoped down to what's honestly implementable and
 * testable in this slice. A plain (non-foreground, non-START_STICKY) Android
 * Service: the OS can and will kill it under memory pressure or when the app
 * leaves the foreground — that is intentional, not a bug. "No immortal
 * background process" per mission Part 1. Recovery after process death is
 * exercised in Phase 10, not assumed.
 */
class RuntimeService : Service() {

    private val heartbeatThreadRunning = AtomicBoolean(false)
    private var heartbeatThread: Thread? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        onNodeLifecycleStart()
    }

    /** Lifecycle start: computes and records this device's canonical node identity. */
    private fun onNodeLifecycleStart() {
        RuntimeState.nodeId = NativeCore.computeNodeIdentity(
            agentName = "aios-node-agent",
            agentVersion = "0.2.0-vertical-slice",
            arch = Build.SUPPORTED_ABIS.firstOrNull() ?: "unknown-arch",
            endpoint = "device-local",
        )
        RuntimeState.appendEvidence("runtime.lifecycle_start", true, NativeCore::canonicalHash)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        RuntimeState.serviceRunning.set(true)
        RuntimeState.taskState = TaskState.RUNNING
        RuntimeState.runId = intent?.getStringExtra("runId") ?: RuntimeState.runId ?: "run-${System.currentTimeMillis()}"
        RuntimeState.appendEvidence("runtime.run_attach", true, NativeCore::canonicalHash)
        startHeartbeat()
        return START_NOT_STICKY
    }

    private fun startHeartbeat() {
        if (!heartbeatThreadRunning.compareAndSet(false, true)) return
        heartbeatThread = Thread {
            while (heartbeatThreadRunning.get()) {
                RuntimeState.lastHeartbeatMs.set(System.currentTimeMillis())
                RuntimeState.appendEvidence("runtime.heartbeat", true, NativeCore::canonicalHash)
                try {
                    Thread.sleep(2000)
                } catch (_: InterruptedException) {
                    break
                }
            }
        }.also { it.isDaemon = true; it.start() }
    }

    /** Task intake: accepts a task id, transitions state, records a checkpoint digest. */
    fun intakeTask(taskId: String): TaskState {
        RuntimeState.taskState = TaskState.RUNNING
        RuntimeState.appendEvidence("runtime.task_intake:$taskId", true, NativeCore::canonicalHash)
        return RuntimeState.taskState
    }

    fun checkpoint(taskId: String, digest: String) {
        RuntimeState.appendEvidence("runtime.checkpoint:$taskId:$digest", true, NativeCore::canonicalHash)
    }

    override fun onDestroy() {
        heartbeatThreadRunning.set(false)
        heartbeatThread?.interrupt()
        RuntimeState.serviceRunning.set(false)
        RuntimeState.appendEvidence("runtime.lifecycle_stop", true, NativeCore::canonicalHash)
        super.onDestroy()
    }
}
