package com.aios.nodeagent

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

/**
 * Real device calls only — per mission Part 3: "Only advertise a capability
 * after a REAL device call succeeds. If unavailable: NOT_PROVEN." No capability
 * here is ever marked TESTED without an actual successful platform API call or
 * HTTP round trip in this same function invocation.
 */
object CapabilityDispatch {

    private fun timed(capability: String, block: () -> String): CapabilityResult {
        val t0 = System.nanoTime()
        return try {
            val detail = block()
            val latency = (System.nanoTime() - t0) / 1_000_000
            CapabilityResult(capability, CapabilityStatus.TESTED, detail, latency, System.currentTimeMillis())
        } catch (e: Exception) {
            val latency = (System.nanoTime() - t0) / 1_000_000
            CapabilityResult(capability, CapabilityStatus.NOT_PROVEN, "error: ${e.javaClass.simpleName}: ${e.message}", latency, System.currentTimeMillis())
        }
    }

    fun sensorBatteryRead(context: Context): CapabilityResult = timed("sensor.battery.read") {
        val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val batteryStatus = context.registerReceiver(null, filter)
            ?: throw IllegalStateException("no battery broadcast available")
        val level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        if (level < 0 || scale <= 0) throw IllegalStateException("invalid battery reading")
        "level=${(level * 100 / scale)}%"
    }

    fun deviceDiagnosticsRead(): CapabilityResult = timed("device.diagnostics.read") {
        "manufacturer=${Build.MANUFACTURER} model=${Build.MODEL} sdk=${Build.VERSION.SDK_INT} abi=${Build.SUPPORTED_ABIS.firstOrNull()}"
    }

    fun networkDiagnosticsRead(context: Context): CapabilityResult = timed("network.diagnostics.read") {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: throw IllegalStateException("no active network")
        val caps = cm.getNetworkCapabilities(network) ?: throw IllegalStateException("no network capabilities")
        val transport = when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WIFI"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "CELLULAR"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ETHERNET"
            else -> "OTHER"
        }
        val validated = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        "transport=$transport validated=$validated"
        // Deliberately not reading SSID/BSSID: that requires location permission
        // and is not needed to prove this capability honestly.
    }

    private fun httpGet(urlStr: String, timeoutMs: Int = 3000): String {
        val conn = URL(urlStr).openConnection() as HttpURLConnection
        conn.connectTimeout = timeoutMs
        conn.readTimeout = timeoutMs
        conn.requestMethod = "GET"
        try {
            val code = conn.responseCode
            if (code !in 200..299) throw IllegalStateException("HTTP $code")
            return BufferedReader(InputStreamReader(conn.inputStream)).use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    /** Real HTTP call to the canonical control plane, reached via `adb reverse tcp:9320 tcp:9320`. */
    fun aiosReality(baseUrl: String): CapabilityResult = timed("aios.reality") {
        val body = httpGet("$baseUrl/api/projection?profile=mobile")
        val digestMatch = Regex("\"realityDigest\":\"([a-f0-9]+)\"").find(body)
            ?: throw IllegalStateException("no realityDigest in response")
        "realityDigest=${digestMatch.groupValues[1].take(16)}..."
    }

    fun aiosStatus(baseUrl: String): CapabilityResult = timed("aios.status") {
        val body = httpGet("$baseUrl/api/projection?profile=mobile")
        val stateMatch = Regex("\"activeExecution\":\\{\"runId\":\"([^\"]*)\",\"state\":\"([^\"]*)\"").find(body)
        stateMatch?.let { "runId=${it.groupValues[1]} state=${it.groupValues[2]}" } ?: "no active execution"
    }

    /**
     * Raw projection fetch for the Nodes screen (Track C) — reuses the exact
     * same endpoint aiosReality/aiosStatus already call, just returns the full
     * body so nodeOverview can be read too. Not a new protocol, not a new
     * capability contract — a read-only convenience on top of the proven call.
     */
    fun fetchProjectionRaw(baseUrl: String): String = httpGet("$baseUrl/api/projection?profile=mobile")

    /**
     * First user of Semantics.kt's CapabilityStatus.DECLARED (previously defined
     * but never returned by this object). DeviceDiscovery always runs (it never
     * throws), so this cannot be NOT_PROVEN in the timed()/exception sense —
     * instead: if not one single real field was measured, the result is honestly
     * DECLARED (discovered but effectively unprobed), otherwise TESTED.
     */
    fun deviceBuildProfileRead(context: Context): CapabilityResult {
        val t0 = System.nanoTime()
        val profile = DeviceDiscovery.discover(context)
        val latency = (System.nanoTime() - t0) / 1_000_000
        val status = if (DeviceDiscovery.hasAnyRealMeasurement(profile)) CapabilityStatus.TESTED else CapabilityStatus.DECLARED
        return CapabilityResult("device.build_profile.read", status, DeviceDiscovery.summarize(profile), latency, System.currentTimeMillis())
    }

    // ─── Owner'ın AnyDesk kurulum ekran görüntüsünden (2026-08-23) taşınan
    // gerçek izin-durumu capability'leri: uzaktan-erişim tarzı bir uygulamanın
    // istediği her izin, burada gerçek platform API'siyle OKUNUR (yalnızca
    // durum okuma — izin isteme ayrı, kullanıcı onayı gerektiren bir eylem).
    // Yeni kütüphane yok: yalnız android.* framework API'leri.

    fun overlayPermissionRead(context: Context): CapabilityResult = timed("overlay.permission.read") {
        "canDrawOverlays=${android.provider.Settings.canDrawOverlays(context)}"
    }

    fun batteryOptimizationStatus(context: Context): CapabilityResult = timed("battery.optimization.status") {
        val pm = context.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
        "ignoringBatteryOptimizations=${pm.isIgnoringBatteryOptimizations(context.packageName)}"
    }

    /** Requesting exemption opens the OS dialog — a real user-approval action, not silent. */
    fun requestIgnoreBatteryOptimizationsIntent(context: Context): Intent =
        Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, android.net.Uri.parse("package:${context.packageName}"))

    fun notificationListenerStatus(context: Context): CapabilityResult = timed("notification.listener.status") {
        val enabled = android.provider.Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: ""
        "listenerAccessGranted=${enabled.contains(context.packageName)}"
    }

    /**
     * Real, live flag from ScreenCaptureService — never TESTED just because
     * MediaProjection consent was granted once in the past; consent does not
     * survive past the service instance that requested it (Android's design,
     * not a limitation invented here).
     */
    fun screenCaptureStatus(): CapabilityResult = timed("screen.capture.status") {
        "active=${RuntimeState.screenCaptureActive}"
    }

    /** Real check: is our AccessibilityService actually connected right now (not just enabled in Settings). */
    fun remoteControlStatus(context: Context): CapabilityResult = timed("remote.control.status") {
        val enabledInSettings = android.provider.Settings.Secure
            .getString(context.contentResolver, android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
            ?.contains("${context.packageName}/${AiosAccessibilityService::class.java.name}") ?: false
        "enabledInSettings=$enabledInSettings connectedNow=${AiosAccessibilityService.instance != null}"
    }

    fun microphonePermissionStatus(context: Context): CapabilityResult = timed("microphone.permission.status") {
        val granted = context.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED
        "recordAudioGranted=$granted"
    }

    fun dispatchAll(context: Context, canonicalBaseUrl: String): List<CapabilityResult> {
        val results = listOf(
            sensorBatteryRead(context),
            deviceDiagnosticsRead(),
            networkDiagnosticsRead(context),
            aiosReality(canonicalBaseUrl),
            aiosStatus(canonicalBaseUrl),
            deviceBuildProfileRead(context),
            overlayPermissionRead(context),
            batteryOptimizationStatus(context),
            notificationListenerStatus(context),
            microphonePermissionStatus(context),
            screenCaptureStatus(),
            remoteControlStatus(context),
        )
        results.forEach { RuntimeState.capabilities[it.capability] = it }
        return results
    }
}
