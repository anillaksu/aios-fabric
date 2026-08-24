package com.aios.nodeagent

import android.content.Context

/**
 * Canonical control plane address, previously hardcoded in MainActivity as
 * `http://127.0.0.1:9320 // via adb reverse` — a USB-tethered ADB session was
 * a silent single point of failure: unplug the cable (e.g. mid-demo) and
 * every aios.reality/aios.status call fails with no warning until someone
 * looks at the screen. The PC's canonical control plane is already reachable
 * over Tailscale without USB (docs/android-foundation/13-SSH-FIRST-HANDOFF.md
 * Phase 3: 100.109.236.30:9320 -> HTTP 200 from the Termux side); this makes
 * the same reachability the native app's default while staying editable, since
 * the Tailscale address is this owner's environment, not a new protocol.
 */
object ConnectivityConfig {
    private const val PREFS = "aios_connectivity"
    private const val KEY_BASE_URL = "canonical_base_url"
    const val DEFAULT_BASE_URL = "http://100.109.236.30:9320"

    fun getBaseUrl(context: Context): String =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_BASE_URL, DEFAULT_BASE_URL) ?: DEFAULT_BASE_URL

    fun setBaseUrl(context: Context, url: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_BASE_URL, url.trim())
            .apply()
    }
}
