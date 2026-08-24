package com.aios.nodeagent

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.StatFs
import java.io.File

/**
 * Real, on-device measurement only — mirrors CapabilityDispatch's own rule
 * (Part 3: never advertise a value that wasn't actually read from the
 * platform this invocation). Every field that cannot be safely measured on
 * this minSdk (24) without a new native/API dependency is NOT_MEASURED,
 * never guessed. This does not touch canonical AIOS reality — it only
 * describes this device's compatibility with a future native artifact.
 */
data class DeviceFacts(
    val androidRelease: String,
    val sdkInt: Int,
    val abis: List<String>,
    val manufacturer: String,
    val model: String,
    val socModel: String?,          // NOT_MEASURED (null) below API 31
    val cpuCoreCount: Int,
    val totalMemMb: Long?,
    val availMemMb: Long?,
    val storageFreeMb: Long?,
    val storageTotalMb: Long?,
    val networkTransport: String?,  // null -> NOT_MEASURED (no active network)
    val batteryPercent: Int?,       // null -> NOT_MEASURED
    val rootHintDetected: Boolean?, // heuristic metadata only — never trust/attestation
    val rootHintMethod: String,
)

data class NativeFeatureFlags(
    val vulkanHardwareLevel: Boolean?,   // hasSystemFeature, real boolean where API allows
    val nnapiApiLevelSufficient: Boolean, // SDK floor only (>=27) — NOT actual NNAPI availability proof
    val arm64: Boolean,
)

data class BuildProfile(
    val schema: String = "aios.android.build-profile.v1",
    val deviceFacts: DeviceFacts,
    val abi: String,
    val androidSdk: Int,
    val nativeFeatures: NativeFeatureFlags,
    val knownCapabilitiesCount: Int,
    val generatedAtMs: Long,
)

object DeviceDiscovery {

    private fun detectRootHint(): Pair<Boolean, String> {
        val testKeys = Build.TAGS?.contains("test-keys") == true
        val suPaths = listOf("/system/bin/su", "/system/xbin/su", "/sbin/su")
        val suFound = suPaths.any { File(it).exists() }
        val method = "heuristic: Build.TAGS contains test-keys OR su binary present at ${suPaths.joinToString(",")} — metadata only, not used for trust/attestation"
        return (testKeys || suFound) to method
    }

    fun discover(context: Context): BuildProfile {
        val (rootHint, rootMethod) = detectRootHint()

        var totalMemMb: Long? = null
        var availMemMb: Long? = null
        try {
            val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
            if (am != null) {
                val mi = ActivityManager.MemoryInfo()
                am.getMemoryInfo(mi)
                totalMemMb = mi.totalMem / (1024 * 1024)
                availMemMb = mi.availMem / (1024 * 1024)
            }
        } catch (_: Exception) { /* leave NOT_MEASURED (null) */ }

        var storageFreeMb: Long? = null
        var storageTotalMb: Long? = null
        try {
            val stat = StatFs(context.filesDir.path)
            storageFreeMb = (stat.availableBytes) / (1024 * 1024)
            storageTotalMb = (stat.totalBytes) / (1024 * 1024)
        } catch (_: Exception) { /* leave NOT_MEASURED */ }

        var networkTransport: String? = null
        try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            val network = cm?.activeNetwork
            val caps = network?.let { cm.getNetworkCapabilities(it) }
            networkTransport = when {
                caps == null -> null
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WIFI"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "CELLULAR"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ETHERNET"
                else -> "OTHER"
            }
        } catch (_: Exception) { /* leave NOT_MEASURED */ }

        var batteryPercent: Int? = null
        try {
            val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            val batteryStatus = context.registerReceiver(null, filter)
            val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            if (level >= 0 && scale > 0) batteryPercent = level * 100 / scale
        } catch (_: Exception) { /* leave NOT_MEASURED */ }

        val socModel: String? = if (Build.VERSION.SDK_INT >= 31) Build.SOC_MODEL else null

        val vulkan: Boolean? = try {
            context.packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_VULKAN_HARDWARE_LEVEL, 0)
        } catch (_: Exception) { null }

        val facts = DeviceFacts(
            androidRelease = Build.VERSION.RELEASE ?: "NOT_MEASURED",
            sdkInt = Build.VERSION.SDK_INT,
            abis = Build.SUPPORTED_ABIS?.toList() ?: emptyList(),
            manufacturer = Build.MANUFACTURER ?: "NOT_MEASURED",
            model = Build.MODEL ?: "NOT_MEASURED",
            socModel = socModel,
            cpuCoreCount = Runtime.getRuntime().availableProcessors(),
            totalMemMb = totalMemMb,
            availMemMb = availMemMb,
            storageFreeMb = storageFreeMb,
            storageTotalMb = storageTotalMb,
            networkTransport = networkTransport,
            batteryPercent = batteryPercent,
            rootHintDetected = rootHint,
            rootHintMethod = rootMethod,
        )

        return BuildProfile(
            deviceFacts = facts,
            abi = facts.abis.firstOrNull() ?: "NOT_MEASURED",
            androidSdk = facts.sdkInt,
            nativeFeatures = NativeFeatureFlags(
                vulkanHardwareLevel = vulkan,
                nnapiApiLevelSufficient = facts.sdkInt >= 27,
                arm64 = facts.abis.contains("arm64-v8a"),
            ),
            knownCapabilitiesCount = RuntimeState.capabilities.size,
            generatedAtMs = System.currentTimeMillis(),
        )
    }

    /** Human-readable one-line summary for CapabilityResult.detail — same style as deviceDiagnosticsRead(). */
    fun summarize(p: BuildProfile): String {
        val d = p.deviceFacts
        val mem = if (d.totalMemMb != null) "${d.availMemMb}/${d.totalMemMb}MB" else "NOT_MEASURED"
        val storage = if (d.storageFreeMb != null) "${d.storageFreeMb}/${d.storageTotalMb}MB" else "NOT_MEASURED"
        return "abi=${p.abi} sdk=${p.androidSdk} cores=${d.cpuCoreCount} mem=$mem storage=$storage " +
            "vulkan=${p.nativeFeatures.vulkanHardwareLevel ?: "NOT_MEASURED"} soc=${d.socModel ?: "NOT_MEASURED"}"
    }

    /** True if at least one real field was actually measured beyond the always-available Build.* constants. */
    fun hasAnyRealMeasurement(p: BuildProfile): Boolean {
        val d = p.deviceFacts
        return d.totalMemMb != null || d.storageFreeMb != null || d.networkTransport != null ||
            d.batteryPercent != null || p.nativeFeatures.vulkanHardwareLevel != null
    }
}
