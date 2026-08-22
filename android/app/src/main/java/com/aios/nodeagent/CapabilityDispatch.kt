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

    fun dispatchAll(context: Context, canonicalBaseUrl: String): List<CapabilityResult> {
        val results = listOf(
            sensorBatteryRead(context),
            deviceDiagnosticsRead(),
            networkDiagnosticsRead(context),
            aiosReality(canonicalBaseUrl),
            aiosStatus(canonicalBaseUrl),
        )
        results.forEach { RuntimeState.capabilities[it.capability] = it }
        return results
    }
}
