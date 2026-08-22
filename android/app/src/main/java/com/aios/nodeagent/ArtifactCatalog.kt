package com.aios.nodeagent

import android.content.Context
import org.json.JSONObject

/** One entry from the canonical catalog (artifacts-catalog/com.aios.nodeagent.json, bundled as an asset). */
data class CatalogEntry(
    val artifactId: String,
    val packageName: String?,
    val type: String,
    val version: String,
    val platform: String,
    val minSdk: Int?,
    val abi: String?,
    val sha256: String,
    val signatureReference: String,
    val buildId: String,
    val capabilities: List<String>,
    val createdAt: String,
)

/**
 * Read-only view of the canonical artifact catalog (Track D). This does NOT
 * duplicate the catalog — it parses the exact file produced by
 * desktop/build-artifact-catalog.mjs, bundled at build time (see
 * app/build.gradle.kts syncCatalogAsset).
 */
object ArtifactCatalog {
    private var cached: List<CatalogEntry>? = null

    fun load(context: Context): List<CatalogEntry> {
        cached?.let { return it }
        val text = context.assets.open("catalog.json").bufferedReader().use { it.readText() }
        val root = JSONObject(text)
        val arr = root.getJSONArray("artifacts")
        val entries = (0 until arr.length()).map { i ->
            val o = arr.getJSONObject(i)
            val capsArr = o.optJSONArray("capabilities")
            val caps = capsArr?.let { c -> (0 until c.length()).map { c.getString(it) } } ?: emptyList()
            CatalogEntry(
                artifactId = o.getString("artifactId"),
                packageName = o.optString("packageName", null),
                type = o.getString("type"),
                version = o.getString("version"),
                platform = o.getString("platform"),
                minSdk = if (o.has("minSdk")) o.optInt("minSdk") else null,
                abi = o.optString("abi", null),
                sha256 = o.getString("sha256"),
                signatureReference = o.getString("signatureReference"),
                buildId = o.getString("buildId"),
                capabilities = caps,
                createdAt = o.getString("createdAt"),
            )
        }
        cached = entries
        return entries
    }

    fun search(context: Context, query: String): List<CatalogEntry> {
        if (query.isBlank()) return load(context)
        val q = query.lowercase()
        return load(context).filter {
            it.packageName?.lowercase()?.contains(q) == true ||
                it.type.lowercase().contains(q) ||
                it.version.lowercase().contains(q) ||
                it.buildId.lowercase().contains(q)
        }
    }

    fun compatibility(entry: CatalogEntry, deviceSdk: Int, deviceAbi: String): Pair<Boolean, String> {
        val sdkOk = (entry.minSdk ?: 0) <= deviceSdk
        val abiOk = entry.abi == null || entry.abi == deviceAbi
        return (sdkOk && abiOk) to when {
            !sdkOk -> "requires minSdk ${entry.minSdk}, device is $deviceSdk"
            !abiOk -> "requires abi ${entry.abi}, device is $deviceAbi"
            else -> "compatible"
        }
    }
}
