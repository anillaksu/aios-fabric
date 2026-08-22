package com.aios.nodeagent

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Local Artifact Store (mission Part 4). Machine-readable, on-device, real
 * persistence (SharedPreferences) so install/rollback state survives process
 * death — unlike RuntimeState, which is deliberately volatile. This is NOT a
 * second EvidenceLedger and NOT a visual marketplace: list/get/verify/
 * installState/rollbackState only.
 */
data class StoredArtifact(
    val manifest: ArtifactManifest,
    var status: String,          // ArtifactStatus.*
    var rollbackTargetId: String?,
    var apkFilePath: String?,     // where the candidate/installed bytes live on-device
)

object LocalArtifactStore {
    private const val PREFS = "aios_artifact_store"
    private const val KEY_ARTIFACTS = "artifacts"

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun list(context: Context): List<StoredArtifact> {
        val raw = prefs(context).getString(KEY_ARTIFACTS, null) ?: return emptyList()
        val arr = JSONArray(raw)
        return (0 until arr.length()).map { fromJson(arr.getJSONObject(it)) }
    }

    fun get(context: Context, artifactId: String): StoredArtifact? =
        list(context).find { it.manifest.artifactId == artifactId }

    fun currentActive(context: Context): StoredArtifact? =
        list(context).find { it.status == ArtifactStatus.ACTIVE }

    fun put(context: Context, artifact: StoredArtifact) {
        val all = list(context).filterNot { it.manifest.artifactId == artifact.manifest.artifactId } + artifact
        save(context, all)
    }

    fun installState(context: Context, artifactId: String): String =
        get(context, artifactId)?.status ?: ArtifactStatus.DISCOVERED

    fun rollbackState(context: Context, artifactId: String): String? =
        get(context, artifactId)?.rollbackTargetId

    private fun save(context: Context, artifacts: List<StoredArtifact>) {
        val arr = JSONArray()
        artifacts.forEach { arr.put(toJson(it)) }
        prefs(context).edit().putString(KEY_ARTIFACTS, arr.toString()).apply()
    }

    private fun toJson(a: StoredArtifact): JSONObject = JSONObject().apply {
        put("artifactId", a.manifest.artifactId)
        put("type", a.manifest.type)
        put("version", a.manifest.version)
        put("platform", a.manifest.platform)
        put("minRuntime", a.manifest.minRuntime)
        put("capabilities", JSONArray(a.manifest.capabilities))
        put("dependencies", JSONArray(a.manifest.dependencies))
        put("sha256", a.manifest.sha256)
        put("signatureRef", a.manifest.signatureRef)
        put("buildId", a.manifest.buildId)
        put("manifestStatus", a.manifest.status)
        put("status", a.status)
        put("rollbackTargetId", a.rollbackTargetId)
        put("apkFilePath", a.apkFilePath)
    }

    private fun fromJson(o: JSONObject): StoredArtifact {
        val caps = (0 until o.getJSONArray("capabilities").length()).map { o.getJSONArray("capabilities").getString(it) }
        val deps = (0 until o.getJSONArray("dependencies").length()).map { o.getJSONArray("dependencies").getString(it) }
        val manifest = ArtifactManifest(
            artifactId = o.getString("artifactId"),
            type = o.getString("type"),
            version = o.getString("version"),
            platform = o.getString("platform"),
            minRuntime = o.getInt("minRuntime"),
            capabilities = caps,
            dependencies = deps,
            sha256 = o.getString("sha256"),
            signatureRef = o.getString("signatureRef"),
            buildId = o.getString("buildId"),
            status = o.optString("manifestStatus", ArtifactStatus.DISCOVERED),
        )
        return StoredArtifact(
            manifest = manifest,
            status = o.getString("status"),
            rollbackTargetId = o.optString("rollbackTargetId", null)?.takeIf { it != "null" },
            apkFilePath = o.optString("apkFilePath", null)?.takeIf { it != "null" },
        )
    }
}
