package com.aios.nodeagent

import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.widget.TextView

/**
 * AIOS Android vertical-slice proof (Part 22, mission "AIOS ANDROID OS FABRIC
 * FOUNDATION v1"). This is NOT the real Runtime Service / Node Agent / Control
 * Surface — those are specified in docs/android-foundation/08-VERTICAL-SLICE-STATUS.md
 * and require more than fits in one proof activity. This activity exists to prove
 * one thing honestly: that AIOS Core Native (Rust, cross-compiled for arm64
 * Android) is reachable via JNI from a real installed app on a real device, and
 * that it produces the exact same output as the canonical Node.js implementation
 * (desktop/observer.mjs) — the golden-vector constant below is checked on-device,
 * not assumed.
 */
class MainActivity : Activity() {

    private val expectedSelfCheckHash =
        "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val hash = NativeCore.selfCheckHash()
        val hashOk = hash == expectedSelfCheckHash

        val nodeId = NativeCore.computeNodeIdentity(
            agentName = "aios-node-agent-vertical-slice",
            agentVersion = "0.1.0-design",
            arch = Build.SUPPORTED_ABIS.firstOrNull() ?: "unknown-arch",
            endpoint = "device-local",
        )

        val text = TextView(this)
        text.textSize = 16f
        text.setPadding(48, 96, 48, 48)
        text.text = buildString {
            appendLine("AIOS Node Agent — vertical slice proof")
            appendLine()
            appendLine("device: ${Build.MANUFACTURER} ${Build.MODEL}")
            appendLine("android: ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT})")
            appendLine("abi: ${Build.SUPPORTED_ABIS.firstOrNull()}")
            appendLine()
            appendLine("JNI self-check: ${if (hashOk) "PASS (matches Node.js golden vector)" else "FAIL (native/JS output diverged)"}")
            appendLine("hash: $hash")
            appendLine()
            appendLine("node identity (native): $nodeId")
            appendLine()
            appendLine("This is a vertical-slice proof, not the production Node Agent.")
            appendLine("Runtime Service / Control Surface / Evidence Vault are DESIGN_ONLY.")
        }
        setContentView(text)
    }
}
