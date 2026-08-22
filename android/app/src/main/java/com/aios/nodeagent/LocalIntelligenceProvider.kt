package com.aios.nodeagent

/**
 * Extension point ONLY (mission "AIOS ANDROID PRODUCTION HARDENING — BEFORE
 * LOCAL AI", Part 11). No implementation. No model runtime. No model files.
 * No inference. This exists so a future local-model provider (Gemma 4 E2B via
 * LiteRT-LM, or anything else) can be attached later WITHOUT changing
 * canonical runtime semantics — RuntimeService/RuntimeState/TaskState/
 * Liveness are untouched by this file and must stay that way.
 *
 * A provider implementation is explicitly DEFERRED. Do not add one until a
 * separate, explicit task authorizes it.
 */
enum class LocalIntelligenceState { UNAVAILABLE, DISCOVERED, READY, DEGRADED, OFFLINE }

data class LocalIntelligenceCapability(
    val name: String,
    val supported: Boolean,
)

/**
 * Contract a future provider must implement. No class in this repository
 * implements this interface yet — that is intentional (see GEMMA_READINESS
 * in docs/android-foundation for what is required before one can).
 */
interface LocalIntelligenceProvider {
    val providerId: String
    fun state(): LocalIntelligenceState
    fun capabilities(): List<LocalIntelligenceCapability>

    /** Must return null / UNAVAILABLE-equivalent, never fabricate a result — same "no false proven" rule as every other AIOS surface. */
    suspend fun infer(prompt: String): InferenceResult?
}

data class InferenceResult(
    val text: String,
    val latencyMs: Long,
    val providerId: String,
)
