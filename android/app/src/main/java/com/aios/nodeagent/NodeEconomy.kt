package com.aios.nodeagent

/**
 * PROTOTYPE — "sahte ama hazır" (fake but ready), per owner instruction
 * 2026-08-23: node performance/uptime should be convertible into earnings,
 * and real settlement should be delegated to an external payment institution
 * via an API surface, not built in-house. Nothing here moves real money.
 *
 * Two pieces, deliberately separate:
 * 1. `NodeEconomy` — computes a contribution score from REAL measured
 *    signals already in RuntimeState/CapabilityDispatch (no fabricated
 *    numbers; if a signal isn't available, it contributes 0, never a guess).
 * 2. `PaymentProviderAdapter` — the contract a real payment institution
 *    (Stripe/iyzico/etc.) would implement. AIOS never touches card data or
 *    settlement itself; it calls out to whichever provider is registered and
 *    trusts THEIR response as ground truth for whether money moved
 *    ("ödemeyi kendi gerçekliklerine çevirirler" — settlement authority
 *    stays with the payment institution, matching AIOS's own rule that a
 *    capability is never marked TESTED without a real round trip).
 */
data class ContributionScore(
    val dispatchSuccessCount: Int,
    val dispatchTotalCount: Int,
    val lastHeartbeatMs: Long,
    val score: Double,
)

object NodeEconomy {
    /**
     * Real signals only: counts from RuntimeState.capabilities (no fabricated
     * "uptime" — RuntimeState does not track a start time, so this does not
     * invent one). If real per-node metrics are added later, this formula
     * changes; it is never allowed to silently substitute a guessed number.
     */
    fun computeContribution(): ContributionScore {
        val results = RuntimeState.capabilities.values
        val success = results.count { it.status == CapabilityStatus.TESTED }
        val total = results.size
        val heartbeat = RuntimeState.lastHeartbeatMs.get()
        // Placeholder formula — NOT a real payout rate, just a monotonic,
        // auditable function of real signals until a real economic model
        // is designed (owner decision, not guessed here).
        val score = success.toDouble()
        return ContributionScore(success, total, heartbeat, score)
    }
}

enum class PayoutStatus { NOT_PROVEN, ACCEPTED_BY_PROVIDER, REJECTED_BY_PROVIDER }

data class PayoutRequest(val nodeId: String, val units: Double, val currency: String)
data class PayoutResult(val status: PayoutStatus, val providerReference: String?, val detail: String)

/**
 * Contract a real payment institution's SDK/API adapter must implement.
 * AIOS calls this; it never computes or claims settlement itself.
 */
interface PaymentProviderAdapter {
    val providerName: String
    fun requestPayout(request: PayoutRequest): PayoutResult
}

/**
 * No real provider is wired yet. This always returns NOT_PROVEN honestly —
 * it must never be swapped for a fabricated ACCEPTED_BY_PROVIDER response.
 * Replacing this with a real adapter (Stripe Connect, iyzico, etc.) is an
 * owner product decision, not something to guess here.
 */
object MockPaymentProvider : PaymentProviderAdapter {
    override val providerName = "mock (no real provider registered)"
    override fun requestPayout(request: PayoutRequest): PayoutResult =
        PayoutResult(PayoutStatus.NOT_PROVEN, providerReference = null, detail = "No payment provider integrated yet — stub only, no money moved.")
}
