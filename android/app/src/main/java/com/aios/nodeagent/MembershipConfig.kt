package com.aios.nodeagent

import android.content.Context
import java.security.MessageDigest

/**
 * PROTOTYPE — local-only skeleton for the owner's invite-only single-tier
 * membership model (no per-feature/no per-interaction pricing; described in
 * OTURUM chat 2026-08-22/23). This is NOT a real multi-user system: there is
 * no server-side account store, no payment processor, no cross-device user
 * list yet. Everything here lives in this device's own SharedPreferences.
 *
 * Per AIOS's own evidence rule (no fabricated FACT), this must not be
 * presented as a working membership backend. Real invite-code issuance and
 * validation belongs on the Fabric canonical control plane (PC is canonical
 * state authority) once that surface is actually designed — this class is
 * the client-side shape that surface would eventually be validated against,
 * kept deliberately swappable (see `validateAgainstCanonical`, currently a
 * stub returning MembershipStatus.NOT_PROVEN in offline/no-server condition).
 */
object MembershipConfig {
    private const val PREFS = "aios_membership"
    private const val KEY_INVITE_CODE = "invite_code"
    private const val KEY_JOINED_AT_MS = "joined_at_ms"
    private const val KEY_IS_ROOT_ADMIN = "is_root_admin"

    // Bootstrap-only: the very first install with no root admin yet on this
    // device becomes root admin ("owner is the first user, a reality that
    // starts from me" — owner's own framing). This is a LOCAL bootstrap flag,
    // not a real distributed root-of-trust; production must replace this with
    // a canonical-server-issued root credential before any real distribution.
    private const val ROOT_BOOTSTRAP_CODE = "AIOS-ROOT-GENESIS"

    enum class MembershipStatus { NOT_MEMBER, MEMBER, ROOT_ADMIN, NOT_PROVEN }

    fun status(context: Context): MembershipStatus {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return when {
            prefs.getBoolean(KEY_IS_ROOT_ADMIN, false) -> MembershipStatus.ROOT_ADMIN
            prefs.contains(KEY_INVITE_CODE) -> MembershipStatus.MEMBER
            else -> MembershipStatus.NOT_MEMBER
        }
    }

    fun joinedAtMs(context: Context): Long? {
        val v = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(KEY_JOINED_AT_MS, -1L)
        return if (v > 0) v else null
    }

    /**
     * Local-only acceptance: recognizes the root bootstrap code, otherwise
     * accepts any non-blank code as a plain MEMBER (there is no server to
     * check a real invite registry against yet — this is intentionally
     * permissive so the UI flow can be demoed, and intentionally NOT wired
     * to unlock anything sensitive by itself; real gating must happen
     * server-side once that exists).
     */
    fun redeemInviteCode(context: Context, code: String): MembershipStatus {
        val trimmed = code.trim()
        if (trimmed.isEmpty()) return status(context)
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val isRoot = trimmed == ROOT_BOOTSTRAP_CODE && !prefs.getBoolean(KEY_IS_ROOT_ADMIN, false) && !anyRootAdminClaimedOnThisDevice(context)
        prefs.edit()
            .putString(KEY_INVITE_CODE, sha256(trimmed))
            .putLong(KEY_JOINED_AT_MS, System.currentTimeMillis())
            .apply { if (isRoot) putBoolean(KEY_IS_ROOT_ADMIN, true) }
            .apply()
        return status(context)
    }

    private fun anyRootAdminClaimedOnThisDevice(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_IS_ROOT_ADMIN, false)

    /**
     * STUB. Real membership authority must live on the Fabric canonical
     * control plane (matches this project's own "PC is canonical state
     * authority" rule) — this function is where that HTTP call belongs once
     * a real `/api/membership/validate` route exists server-side. Until then
     * it honestly reports NOT_PROVEN rather than claiming a fake TESTED
     * validation.
     */
    fun validateAgainstCanonical(): MembershipStatus = MembershipStatus.NOT_PROVEN

    private fun sha256(s: String): String =
        MessageDigest.getInstance("SHA-256").digest(s.toByteArray())
            .joinToString("") { "%02x".format(it) }
}
