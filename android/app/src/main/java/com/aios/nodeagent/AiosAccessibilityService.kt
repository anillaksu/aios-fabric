package com.aios.nodeagent

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Build
import android.view.accessibility.AccessibilityEvent

/**
 * Real remote-input side of "çift yönlü" (bidirectional) remote control —
 * screen.capture.status (ScreenCaptureService) is the view direction, this
 * is the control direction. Uses AccessibilityService.dispatchGesture, the
 * same official Android mechanism AnyDesk's own "Eklenti AD1" (accessibility
 * plugin, per the owner's screenshot) relies on for unattended input — not a
 * workaround, the actual sanctioned API for this.
 *
 * Requires the user to enable this service once in
 * Settings > Accessibility (cannot be silently granted — same class of
 * constraint as notification-listener access). CapabilityDispatch reads
 * whether it's enabled the same way it reads notification.listener.status.
 */
class AiosAccessibilityService : AccessibilityService() {

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
    override fun onInterrupt() {}
    override fun onDestroy() {
        if (instance === this) instance = null
        super.onDestroy()
    }

    /** Real gesture dispatch — returns whether the OS actually accepted and completed it. */
    fun tap(x: Float, y: Float, callback: (Boolean) -> Unit) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            callback(false)
            return
        }
        val path = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(path, 0, 50)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        dispatchGesture(
            gesture,
            object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) = callback(true)
                override fun onCancelled(gestureDescription: GestureDescription?) = callback(false)
            },
            null,
        )
    }

    fun swipe(x1: Float, y1: Float, x2: Float, y2: Float, durationMs: Long, callback: (Boolean) -> Unit) {
        val path = Path().apply { moveTo(x1, y1); lineTo(x2, y2) }
        val stroke = GestureDescription.StrokeDescription(path, 0, durationMs)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        dispatchGesture(
            gesture,
            object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) = callback(true)
                override fun onCancelled(gestureDescription: GestureDescription?) = callback(false)
            },
            null,
        )
    }

    companion object {
        // Live reference only while the OS has this service connected — never
        // assumed present; every caller must null-check (same discipline as
        // RuntimeState.screenCaptureActive).
        @Volatile var instance: AiosAccessibilityService? = null
    }
}
