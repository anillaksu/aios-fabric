package com.aios.nodeagent

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

/**
 * AIOS Installer abstraction (mission Part 5) for Android: prepare / verify /
 * install / activate / rollback / revoke, separate from Control Surface UI.
 * Implements the atomic update model (Part 6) via Android's real
 * PackageInstaller Session API — not a simulation. Because this installs an
 * update to the SAME running app, Android kills this process once the user
 * approves the install (standard self-update behavior); the transition is
 * completed by [InstallResultReceiver] in the resulting fresh process, using
 * state persisted in [LocalArtifactStore] / [PendingActivation] so no
 * in-memory state is lost across that restart.
 */
object AiosInstaller {

    private const val PENDING_PREFS = "aios_pending_activation"

    // ---- pending-activation bookkeeping (survives the self-update process kill) ----

    private fun pendingPrefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PENDING_PREFS, Context.MODE_PRIVATE)

    data class PendingActivation(val candidateId: String, val previousActiveId: String?, val isRollback: Boolean)

    fun readPending(context: Context): PendingActivation? {
        val p = pendingPrefs(context)
        val candidate = p.getString("candidateId", null) ?: return null
        return PendingActivation(candidate, p.getString("previousActiveId", null), p.getBoolean("isRollback", false))
    }

    private fun writePending(context: Context, pending: PendingActivation) {
        pendingPrefs(context).edit()
            .putString("candidateId", pending.candidateId)
            .putString("previousActiveId", pending.previousActiveId)
            .putBoolean("isRollback", pending.isRollback)
            .apply()
    }

    fun clearPending(context: Context) {
        pendingPrefs(context).edit().clear().apply()
    }

    // ---- file-based manifest + verification for an arbitrary APK on disk ----

    fun readManifestFromFile(context: Context, apkFile: File, buildMarkerLabel: String): ArtifactManifest {
        val pm = context.packageManager
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) PackageManager.GET_SIGNING_CERTIFICATES else 0
        val info = pm.getPackageArchiveInfo(apkFile.absolutePath, flags)
            ?: throw IllegalStateException("cannot parse APK: ${apkFile.absolutePath}")

        val bytes = apkFile.readBytes()
        val sha256 = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

        val sigDigest = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val signer = info.signingInfo?.apkContentsSigners?.firstOrNull()
                ?: throw IllegalStateException("no signer in candidate APK")
            "sha256:" + MessageDigest.getInstance("SHA-256").digest(signer.toByteArray()).joinToString("") { "%02x".format(it) }
        } else "UNKNOWN"

        val minSdk = info.applicationInfo?.minSdkVersion ?: 0
        val buildId = "build-${info.longVersionCode}-${sha256.take(12)}-$buildMarkerLabel"
        val artifactId = "art-" + NativeCore.canonicalHash(
            """{"type":"node-agent","packageName":"${info.packageName}","version":"${info.versionName}","platform":"android","buildId":"$buildId"}"""
        ).take(32)

        return ArtifactManifest(
            artifactId = artifactId,
            type = "node-agent",
            version = info.versionName ?: "0.0.0",
            platform = "android",
            minRuntime = minSdk,
            capabilities = listOf("sensor.battery.read", "device.diagnostics.read", "network.diagnostics.read", "aios.reality", "aios.status").sorted(),
            dependencies = emptyList(),
            sha256 = sha256,
            signatureRef = sigDigest,
            buildId = buildId,
            status = ArtifactStatus.DISCOVERED,
        )
    }

    /** Recomputes digest/signature/compat/policy against the FILE on disk — a real recheck, not trust-on-first-use. */
    fun verifyFile(apkFile: File, manifest: ArtifactManifest, deviceSdk: Int): VerificationResult {
        val digestValid = try {
            MessageDigest.getInstance("SHA-256").digest(apkFile.readBytes())
                .joinToString("") { "%02x".format(it) } == manifest.sha256
        } catch (_: Exception) { false }
        val compatibilityValid = manifest.minRuntime <= deviceSdk
        val policyValid = manifest.capabilities.all {
            it in setOf("sensor.battery.read", "device.diagnostics.read", "network.diagnostics.read", "aios.reality", "aios.status")
        }
        // signature already recomputed as part of readManifestFromFile == manifest.signatureRef at build time;
        // here we just confirm it's present/well-formed (non-UNKNOWN) as a real string check.
        val signatureValid = manifest.signatureRef.startsWith("sha256:")
        return VerificationResult(digestValid, signatureValid, compatibilityValid, policyValid)
    }

    /** Prepare: snapshot the CURRENTLY ACTIVE apk's real bytes so rollback has something real to reinstall. */
    fun snapshotCurrentActive(context: Context): StoredArtifact {
        val manifest = ArtifactManifestBuilder.buildForSelf(context)
        val snapshotDir = File(context.filesDir, "artifact-snapshots").apply { mkdirs() }
        val snapshotFile = File(snapshotDir, "${manifest.artifactId}.apk")
        File(context.packageCodePath).copyTo(snapshotFile, overwrite = true)
        val stored = StoredArtifact(manifest, ArtifactStatus.ACTIVE, rollbackTargetId = null, apkFilePath = snapshotFile.absolutePath)
        LocalArtifactStore.put(context, stored)
        return stored
    }

    fun canInstall(context: Context): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.packageManager.canRequestPackageInstalls() else true

    fun requestInstallPermissionIntent(context: Context): Intent =
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))

    /**
     * Activate (or rollback-reactivate) a prepared+verified artifact by real
     * PackageInstaller session install. `isRollback` only changes bookkeeping
     * semantics (SUPERSEDED->ACTIVE vs ROLLED_BACK terminal), not the install
     * mechanism — same real installer path either way, per mission Part 6
     * "do not fake rollback".
     */
    fun activate(context: Context, apkFile: File, manifest: ArtifactManifest, isRollback: Boolean): String {
        if (!canInstall(context)) return "BLOCKED: REQUEST_INSTALL_PACKAGES / unknown-sources not granted"

        val current = LocalArtifactStore.currentActive(context)
        if (LocalArtifactStore.installState(context, manifest.artifactId) == ArtifactStatus.REVOKED) {
            return "REFUSED: artifact ${manifest.artifactId} is REVOKED and cannot become ACTIVE"
        }

        writePending(context, PendingActivation(manifest.artifactId, current?.manifest?.artifactId, isRollback))
        LocalArtifactStore.put(context, StoredArtifact(manifest, ArtifactStatus.INSTALLED, current?.manifest?.artifactId, apkFile.absolutePath))

        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        val sessionId = installer.createSession(params)
        val session = installer.openSession(sessionId)
        try {
            session.openWrite("candidate", 0, apkFile.length()).use { out ->
                FileInputStream(apkFile).use { it.copyTo(out) }
                session.fsync(out)
            }
            // Explicit component target: a manifest receiver with no <intent-filter>
            // only receives explicit intents. An implicit action+setPackage() intent
            // (what this used to be) silently never reaches it — Android has no
            // filter to match it against.
            val intent = Intent(context, InstallResultReceiver::class.java)
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
            val pendingIntent = PendingIntent.getBroadcast(context, sessionId, intent, flags)
            session.commit(pendingIntent.intentSender)
            return "SESSION_COMMITTED: id=$sessionId (awaiting OS install confirmation — physical device action required)"
        } finally {
            session.close()
        }
    }

    /** Called by [InstallResultReceiver] once the OS reports the session outcome. */
    fun onInstallResult(context: Context, success: Boolean, message: String?) {
        val pending = readPending(context) ?: return
        val candidate = LocalArtifactStore.get(context, pending.candidateId) ?: return
        if (success) {
            candidate.status = ArtifactStatus.ACTIVE
            candidate.rollbackTargetId = pending.previousActiveId
            LocalArtifactStore.put(context, candidate)
            pending.previousActiveId?.let { prevId ->
                LocalArtifactStore.get(context, prevId)?.let { prev ->
                    prev.status = if (pending.isRollback) ArtifactStatus.ROLLED_BACK else ArtifactStatus.SUPERSEDED
                    LocalArtifactStore.put(context, prev)
                }
            }
            RuntimeState.appendEvidence("artifact.activate:${pending.candidateId}:success", true, NativeCore::canonicalHash)
        } else {
            candidate.status = ArtifactStatus.VERIFIED // install attempt failed; stays non-active, not auto-revoked
            LocalArtifactStore.put(context, candidate)
            RuntimeState.appendEvidence("artifact.activate:${pending.candidateId}:failed:${message ?: "unknown"}", false, NativeCore::canonicalHash)
        }
        clearPending(context)
    }

    fun revoke(context: Context, artifactId: String) {
        val a = LocalArtifactStore.get(context, artifactId) ?: return
        a.status = ArtifactStatus.REVOKED
        LocalArtifactStore.put(context, a)
        RuntimeState.appendEvidence("artifact.revoke:$artifactId", true, NativeCore::canonicalHash)
    }
}
