package com.aios.nodeagent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller

/**
 * Manifest-declared (not runtime-registered) receiver: because activating an
 * artifact for this same package is a self-update, Android kills the current
 * process once the user approves install, so a runtime-registered receiver in
 * that process would never fire. A manifest receiver is invoked in the fresh
 * process after the update lands, which is what actually completes the
 * ACTIVATE state transition (see AiosInstaller.onInstallResult).
 */
class InstallResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
        when (status) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                // Surface the OS confirmation UI; requires FLAG_ACTIVITY_NEW_TASK since we're not in an Activity context here.
                val confirmIntent = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                confirmIntent?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                confirmIntent?.let { context.startActivity(it) }
            }
            PackageInstaller.STATUS_SUCCESS -> AiosInstaller.onInstallResult(context, true, null)
            else -> AiosInstaller.onInstallResult(context, false, message ?: "status=$status")
        }
    }
}
