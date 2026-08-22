package com.aios.nodeagent

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.io.File
import kotlin.concurrent.thread

/**
 * AIOS Android Control Surface — vertical slice + artifact supply chain.
 * Projection-only: every value shown here is read from RuntimeState /
 * LocalArtifactStore / native core, nothing is computed as a new semantic
 * here (mission Part 7/10: "The Android UI is a projection... No UI-specific
 * truth."). Primary surface shows only Installed/Available/Verified/Update
 * available/Rolled back/Revoked — raw hashes live behind the disclosure toggle.
 */
class MainActivity : Activity() {

    private val canonicalBaseUrl = "http://127.0.0.1:9320" // via `adb reverse tcp:9320 tcp:9320`
    private lateinit var statusView: TextView
    private val agentCardServer = AgentCardServer(9301)

    private var candidateManifest: ArtifactManifest? = null
    private var candidateVerification: VerificationResult? = null
    private var showTechnical = false
    private var lastAction: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(32, 80, 32, 32) }
        statusView = TextView(this).apply { textSize = 13f; typeface = android.graphics.Typeface.MONOSPACE }
        root.addView(statusView)

        // action returns a detail string (or null for a plain "ok"); thrown
        // exceptions are the only failure signal — no swallowed return values.
        fun addButton(label: String, action: () -> String?) {
            root.addView(Button(this).apply {
                text = label
                setOnClickListener {
                    thread {
                        lastAction = try {
                            val detail = action()
                            "$label: ${detail ?: "ok"}"
                        } catch (e: Exception) {
                            "$label: ERROR ${e.javaClass.simpleName}: ${e.message}"
                        }
                        runOnUiThread { render() }
                    }
                }
            })
        }

        addButton("Start Runtime Service") {
            startService(Intent(this, RuntimeService::class.java).putExtra("runId", "run-${System.currentTimeMillis()}"))
            Thread.sleep(300)
            null
        }
        addButton("Dispatch Capabilities") {
            CapabilityDispatch.dispatchAll(this, canonicalBaseUrl)
            null
        }
        addButton("Stop Runtime Service") {
            stopService(Intent(this, RuntimeService::class.java))
            null
        }

        root.addView(TextView(this).apply { text = "\n-- ARTIFACT SUPPLY CHAIN --"; setPadding(0, 24, 0, 0) })

        addButton("1. Discover Current (snapshot ACTIVE)") {
            val s = AiosInstaller.snapshotCurrentActive(this)
            s.manifest.buildId
        }
        addButton("2. Load Candidate (from external files/candidate.apk)") {
            val f = File(getExternalFilesDir(null), "candidate.apk")
            if (!f.exists()) throw IllegalStateException("push a candidate.apk to ${f.absolutePath} first")
            candidateManifest = AiosInstaller.readManifestFromFile(this, f, "candidate")
            candidateVerification = null
            candidateManifest?.buildId
        }
        addButton("3. Verify Candidate") {
            val f = File(getExternalFilesDir(null), "candidate.apk")
            val m = candidateManifest ?: throw IllegalStateException("load a candidate first")
            val v = AiosInstaller.verifyFile(f, m, android.os.Build.VERSION.SDK_INT)
            candidateVerification = v
            m.status = if (v.allValid) ArtifactStatus.VERIFIED else ArtifactStatus.DISCOVERED
            val stored = StoredArtifact(m, if (v.allValid) ArtifactStatus.AVAILABLE else ArtifactStatus.DISCOVERED, LocalArtifactStore.currentActive(this)?.manifest?.artifactId, f.absolutePath)
            LocalArtifactStore.put(this, stored)
            RuntimeState.appendEvidence("artifact.verify:${m.artifactId}:${v.allValid}", v.allValid, NativeCore::canonicalHash)
            if (!v.allValid) throw IllegalStateException("VERIFICATION_FAILED: digest=${v.digestValid} sig=${v.signatureValid} compat=${v.compatibilityValid} policy=${v.policyValid}")
            "VERIFIED"
        }
        addButton("4. Activate Candidate (real PackageInstaller, needs device tap)") {
            val f = File(getExternalFilesDir(null), "candidate.apk")
            val m = candidateManifest ?: throw IllegalStateException("load+verify a candidate first")
            if (candidateVerification?.allValid != true) throw IllegalStateException("candidate not VERIFIED yet")
            val result = AiosInstaller.activate(this, f, m, isRollback = false)
            if (result.startsWith("BLOCKED") || result.startsWith("REFUSED")) throw IllegalStateException(result)
            result
        }
        addButton("5. Rollback to previous ACTIVE") {
            val current = LocalArtifactStore.currentActive(this) ?: throw IllegalStateException("no current active artifact tracked")
            val targetId = current.rollbackTargetId ?: throw IllegalStateException("no rollback target recorded")
            val target = LocalArtifactStore.get(this, targetId) ?: throw IllegalStateException("rollback target not found in store")
            val path = target.apkFilePath ?: throw IllegalStateException("no snapshot APK stored for rollback target")
            val result = AiosInstaller.activate(this, File(path), target.manifest, isRollback = true)
            if (result.startsWith("BLOCKED") || result.startsWith("REFUSED")) throw IllegalStateException(result)
            result
        }
        addButton("6. Revoke Candidate") {
            val m = candidateManifest ?: throw IllegalStateException("load a candidate first")
            AiosInstaller.revoke(this, m.artifactId)
            "REVOKED ${m.artifactId}"
        }
        addButton("Toggle technical details") {
            showTechnical = !showTechnical
            null
        }
        addButton("Start Agent Card Server (:9301)") {
            agentCardServer.start()
            null
        }
        addButton("Grant Install Permission (opens Settings)") {
            if (!AiosInstaller.canInstall(this)) {
                startActivity(AiosInstaller.requestInstallPermissionIntent(this).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                "opened Settings — grant 'Allow from this source', then return"
            } else "already granted"
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

    private fun render() {
        val liveness = RuntimeState.liveness()
        val installed = LocalArtifactStore.currentActive(this)
        val allStored = LocalArtifactStore.list(this)
        val available = allStored.filter { it.status == ArtifactStatus.AVAILABLE }
        val rolledBack = allStored.filter { it.status == ArtifactStatus.ROLLED_BACK }
        val revoked = allStored.filter { it.status == ArtifactStatus.REVOKED }
        val updateAvailable = available.any { installed == null || it.manifest.sha256 != installed.manifest.sha256 }
        val pending = AiosInstaller.readPending(this)

        statusView.text = buildString {
            appendLine("AIOS Node Agent — Control Surface")
            appendLine("device: ${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}  android ${android.os.Build.VERSION.RELEASE}")
            appendLine()
            appendLine("-- NODE AGENT --")
            appendLine("nodeId: ${RuntimeState.nodeId}")
            appendLine("platform: android  attestationStatus: NOT_IMPLEMENTED")
            appendLine()
            appendLine("-- RUNTIME STATE --")
            appendLine("taskState: ${RuntimeState.taskState}  liveness: $liveness")
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
            appendLine("-- ARTIFACT SUPPLY CHAIN --")
            appendLine("Installed:        ${installed?.let { "${it.manifest.version} (${it.manifest.buildId})" } ?: "(none discovered yet)"}")
            appendLine("Available:        ${if (available.isEmpty()) "(none)" else available.joinToString { it.manifest.buildId }}")
            appendLine("Verified:         ${candidateVerification?.let { "digest=${it.digestValid} sig=${it.signatureValid} compat=${it.compatibilityValid} policy=${it.policyValid} -> ${if (it.allValid) "VERIFIED" else "VERIFICATION_FAILED"}" } ?: "(no candidate verified yet)"}")
            appendLine("Update available: $updateAvailable")
            appendLine("Rolled back:      ${if (rolledBack.isEmpty()) "(none)" else rolledBack.joinToString { it.manifest.buildId }}")
            appendLine("Revoked:          ${if (revoked.isEmpty()) "(none)" else revoked.joinToString { it.manifest.buildId }}")
            if (pending != null) appendLine("PENDING ACTIVATION: candidate=${pending.candidateId} (awaiting install session result)")
            appendLine("last action: $lastAction")

            if (showTechnical) {
                appendLine()
                appendLine("-- TECHNICAL DETAILS (disclosure) --")
                allStored.forEach { s ->
                    appendLine("${s.manifest.artifactId}")
                    appendLine("  status=${s.status} rollbackTarget=${s.rollbackTargetId}")
                    appendLine("  sha256=${s.manifest.sha256}")
                    appendLine("  signatureRef=${s.manifest.signatureRef}")
                    appendLine("  apkFilePath=${s.apkFilePath}")
                }
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
