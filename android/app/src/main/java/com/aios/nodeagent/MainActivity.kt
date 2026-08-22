package com.aios.nodeagent

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import kotlin.concurrent.thread

/**
 * AIOS Android Control Surface — vertical slice. Projection-only: every value
 * shown here is read from RuntimeState / RuntimeService / native core, nothing
 * is computed as a new semantic here (mission Part 7: "The Android UI is a
 * projection. It MUST NOT implement its own state semantics.").
 */
class MainActivity : Activity() {

    private val canonicalBaseUrl = "http://127.0.0.1:9320" // via `adb reverse tcp:9320 tcp:9320`
    private lateinit var statusView: TextView
    private val agentCardServer = AgentCardServer(9301)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(32, 80, 32, 32) }
        statusView = TextView(this).apply { textSize = 13f; typeface = android.graphics.Typeface.MONOSPACE }
        root.addView(statusView)

        fun addButton(label: String, action: () -> Unit) {
            root.addView(Button(this).apply {
                text = label
                setOnClickListener { thread { action(); runOnUiThread { render() } } }
            })
        }

        addButton("Start Runtime Service") {
            startService(Intent(this, RuntimeService::class.java).putExtra("runId", "run-${System.currentTimeMillis()}"))
            Thread.sleep(300) // let onCreate/onStartCommand land before we render
        }
        addButton("Dispatch Capabilities") {
            CapabilityDispatch.dispatchAll(this, canonicalBaseUrl)
        }
        addButton("Build + Verify Artifact Manifest") {
            val manifest = ArtifactManifestBuilder.buildForSelf(this)
            RuntimeState.currentArtifact = manifest
            val v = ArtifactManifestBuilder.verify(this, manifest)
            manifest.status = if (v.allValid) ArtifactStatus.ACTIVE else ArtifactStatus.REVOKED
            RuntimeState.appendEvidence("artifact.verify:${manifest.artifactId}:${v.allValid}", v.allValid, NativeCore::canonicalHash)
            lastVerification = v
        }
        addButton("Start Agent Card Server (:9301)") {
            agentCardServer.start()
        }
        addButton("Stop Runtime Service") {
            stopService(Intent(this, RuntimeService::class.java))
        }

        val scroll = ScrollView(this)
        scroll.addView(root)
        setContentView(scroll)

        render()
        thread {
            while (true) {
                Thread.sleep(1000)
                runOnUiThread { render() }
            }
        }
    }

    private var lastVerification: VerificationResult? = null

    private fun render() {
        val liveness = RuntimeState.liveness()
        val art = RuntimeState.currentArtifact
        val v = lastVerification
        statusView.text = buildString {
            appendLine("AIOS Node Agent — Control Surface (vertical slice)")
            appendLine("device: ${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}  android ${android.os.Build.VERSION.RELEASE}")
            appendLine()
            appendLine("-- NODE AGENT --")
            appendLine("nodeId: ${RuntimeState.nodeId}")
            appendLine("platform: android  attestationStatus: NOT_IMPLEMENTED")
            appendLine()
            appendLine("-- RUNTIME STATE --")
            appendLine("runId: ${RuntimeState.runId ?: "none"}")
            appendLine("taskState: ${RuntimeState.taskState}")
            appendLine("serviceRunning: ${RuntimeState.serviceRunning.get()}")
            appendLine("liveness: $liveness")
            val hbAge = if (RuntimeState.lastHeartbeatMs.get() > 0)
                "${(System.currentTimeMillis() - RuntimeState.lastHeartbeatMs.get())}ms ago" else "never"
            appendLine("lastHeartbeat: $hbAge")
            appendLine()
            appendLine("-- CAPABILITIES --")
            if (RuntimeState.capabilities.isEmpty()) appendLine("(none dispatched yet)")
            RuntimeState.capabilities.values.sortedBy { it.capability }.forEach {
                appendLine("${it.capability}: ${it.status} (${it.latencyMs}ms) — ${it.detail}")
            }
            appendLine()
            appendLine("-- ARTIFACT MANIFEST --")
            if (art == null) appendLine("(none built yet)") else {
                appendLine("artifactId: ${art.artifactId}")
                appendLine("type/version: ${art.type} ${art.version}  minRuntime: ${art.minRuntime}")
                appendLine("sha256: ${art.sha256.take(24)}...")
                appendLine("signatureRef: ${art.signatureRef.take(24)}...")
                appendLine("status: ${art.status}")
                if (v != null) appendLine("verify: digest=${v.digestValid} sig=${v.signatureValid} compat=${v.compatibilityValid} policy=${v.policyValid}")
            }
            appendLine()
            appendLine("-- EVIDENCE (Vault projection) --")
            appendLine("entries: ${RuntimeState.evidenceLog.size}")
            RuntimeState.evidenceLog.takeLast(5).forEach {
                appendLine("  ${it.operation} -> ${it.currentHash.take(12)}...")
            }
        }
    }

    override fun onDestroy() {
        agentCardServer.stop()
        super.onDestroy()
    }
}
