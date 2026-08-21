package com.aios.nodeagent

/**
 * Thin JNI declaration for AIOS Core Native (L0). Implemented in Rust —
 * see native-core/src/jni_bridge.rs. This is the vertical-slice proof binding,
 * not the full Runtime Service/Node Agent (see docs/android-foundation/
 * 08-VERTICAL-SLICE-STATUS.md for what those actually require).
 */
object NativeCore {
    init {
        System.loadLibrary("aios_core_native")
    }

    external fun selfCheckHash(): String

    external fun computeNodeIdentity(
        agentName: String,
        agentVersion: String,
        arch: String,
        endpoint: String,
    ): String
}
