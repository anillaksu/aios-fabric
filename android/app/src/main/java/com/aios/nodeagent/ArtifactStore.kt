package com.aios.nodeagent

import android.content.Context
import android.os.Build
import java.io.File

/**
 * Track B: AIOS Artifact Store v1. A facade only — every operation below
 * delegates to the already-proven primitives (ArtifactCatalog, LocalArtifactStore,
 * AiosInstaller) from the Artifact Supply Chain batch. Nothing here reimplements
 * digest/signature/compatibility/policy checking, install sessions, or state
 * transitions — see docs/android-foundation/10-ARTIFACT-SUPPLY-CHAIN.md for
 * those proofs, which this batch does not repeat from scratch.
 */
data class StoreListing(
    val catalog: CatalogEntry,
    val localStatus: String,       // ArtifactStatus.* — DISCOVERED if never touched locally
    val compatible: Boolean,
    val compatibilityDetail: String,
)

object ArtifactStore {

    fun list(context: Context): List<StoreListing> =
        ArtifactCatalog.load(context).map { toListing(context, it) }

    fun search(context: Context, query: String): List<StoreListing> =
        ArtifactCatalog.search(context, query).map { toListing(context, it) }

    private fun toListing(context: Context, entry: CatalogEntry): StoreListing {
        val local = LocalArtifactStore.get(context, entry.artifactId)
        val (compatible, detail) = ArtifactCatalog.compatibility(
            entry, Build.VERSION.SDK_INT, Build.SUPPORTED_ABIS.firstOrNull() ?: "unknown"
        )
        return StoreListing(entry, local?.status ?: ArtifactStatus.DISCOVERED, compatible, detail)
    }

    /** Verification, using the SAME candidate-file verification path already proven in AiosInstaller. */
    fun verify(context: Context, entry: CatalogEntry, apkFile: File): VerificationResult {
        val manifest = ArtifactManifest(
            artifactId = entry.artifactId, type = entry.type, version = entry.version, platform = entry.platform,
            minRuntime = entry.minSdk ?: 0, capabilities = entry.capabilities, dependencies = emptyList(),
            sha256 = entry.sha256, signatureRef = entry.signatureReference, buildId = entry.buildId,
            status = ArtifactStatus.DISCOVERED,
        )
        val v = AiosInstaller.verifyFile(apkFile, manifest, Build.VERSION.SDK_INT)
        val stored = StoredArtifact(manifest, if (v.allValid) ArtifactStatus.AVAILABLE else ArtifactStatus.DISCOVERED,
            LocalArtifactStore.currentActive(context)?.manifest?.artifactId, apkFile.absolutePath)
        LocalArtifactStore.put(context, stored)
        RuntimeState.appendEvidence("store.verify:${entry.artifactId}:${v.allValid}", v.allValid, NativeCore::canonicalHash)
        return v
    }

    /** Install+activate in one store-level operation — same real PackageInstaller path as AiosInstaller.activate(). */
    fun install(context: Context, entry: CatalogEntry, apkFile: File): String {
        val manifest = LocalArtifactStore.get(context, entry.artifactId)?.manifest ?: ArtifactManifest(
            artifactId = entry.artifactId, type = entry.type, version = entry.version, platform = entry.platform,
            minRuntime = entry.minSdk ?: 0, capabilities = entry.capabilities, dependencies = emptyList(),
            sha256 = entry.sha256, signatureRef = entry.signatureReference, buildId = entry.buildId,
            status = ArtifactStatus.AVAILABLE,
        )
        return AiosInstaller.activate(context, apkFile, manifest, isRollback = false)
    }

    /** "Update" is the same atomic activate path as install — Part 6 doesn't define a second mechanism for it. */
    fun update(context: Context, entry: CatalogEntry, apkFile: File): String = install(context, entry, apkFile)

    fun rollback(context: Context): String {
        val current = LocalArtifactStore.currentActive(context) ?: return "REFUSED: no current active artifact"
        val targetId = current.rollbackTargetId ?: return "REFUSED: no rollback target recorded"
        val target = LocalArtifactStore.get(context, targetId) ?: return "REFUSED: rollback target not found"
        val path = target.apkFilePath ?: return "REFUSED: no snapshot APK stored for rollback target"
        return AiosInstaller.activate(context, File(path), target.manifest, isRollback = true)
    }

    fun revoke(context: Context, artifactId: String) = AiosInstaller.revoke(context, artifactId)
}
