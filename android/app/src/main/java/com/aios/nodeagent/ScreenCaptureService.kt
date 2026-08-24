package com.aios.nodeagent

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.util.DisplayMetrics
import java.io.File
import java.io.FileOutputStream

/**
 * Real MediaProjection-backed screen capture — the actual Android API this
 * capability class of app (AnyDesk et al.) is built on; no shortcut/hack.
 * MediaProjection consent (MediaProjectionManager.createScreenCaptureIntent())
 * is a per-session, user-granted Activity result — Android does not allow it
 * to be silently persisted or auto-re-granted after the service dies, by
 * design. `screen.capture.status` in CapabilityDispatch reports exactly that
 * real constraint rather than pretending otherwise.
 */
class ScreenCaptureService : Service() {
    private var projection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null

    inner class LocalBinder : Binder() {
        fun service(): ScreenCaptureService = this@ScreenCaptureService
    }
    private val binder = LocalBinder()
    override fun onBind(intent: Intent?): IBinder = binder

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, 0) ?: 0
        val resultData = intent?.getParcelableExtra<Intent>(EXTRA_RESULT_DATA)
        startForegroundWithNotification()
        if (resultData != null) startCapture(resultCode, resultData)
        return START_NOT_STICKY
    }

    private fun startForegroundWithNotification() {
        val channelId = "aios_screen_capture"
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(NotificationChannel(channelId, "AIOS Ekran Yakalama", NotificationManager.IMPORTANCE_LOW))
        }
        val notification = Notification.Builder(this, channelId)
            .setContentTitle("AIOS ekran yakalama aktif")
            .setContentText("Bu bildirim MediaProjection'ın zorunlu, gizlenemeyen kullanıcı uyarısıdır.")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    private fun startCapture(resultCode: Int, resultData: Intent) {
        val mgr = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val proj = mgr.getMediaProjection(resultCode, resultData) ?: return
        projection = proj

        val metrics = DisplayMetrics()
        (getSystemService(Context.WINDOW_SERVICE) as android.view.WindowManager).defaultDisplay.getRealMetrics(metrics)
        val width = metrics.widthPixels
        val height = metrics.heightPixels
        val density = metrics.densityDpi

        val reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
        imageReader = reader
        virtualDisplay = proj.createVirtualDisplay(
            "aios-screen-capture", width, height, density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            reader.surface, null, null,
        )
        RuntimeState.screenCaptureActive = true
    }

    /** Reads the most recent frame, if any, into a Bitmap. Real pixels, no placeholder image. */
    fun captureSnapshot(): Bitmap? {
        val reader = imageReader ?: return null
        val image = reader.acquireLatestImage() ?: return null
        try {
            val plane = image.planes[0]
            val rowStride = plane.rowStride
            val pixelStride = plane.pixelStride
            val rowPadding = rowStride - pixelStride * image.width
            val bitmap = Bitmap.createBitmap(image.width + rowPadding / pixelStride, image.height, Bitmap.Config.ARGB_8888)
            bitmap.copyPixelsFromBuffer(plane.buffer)
            return Bitmap.createBitmap(bitmap, 0, 0, image.width, image.height)
        } finally {
            image.close()
        }
    }

    fun saveSnapshotToFile(context: Context): File? {
        val bmp = captureSnapshot() ?: return null
        val file = File(context.getExternalFilesDir(null), "screen_snapshot.png")
        FileOutputStream(file).use { out -> bmp.compress(Bitmap.CompressFormat.PNG, 90, out) }
        return file
    }

    override fun onDestroy() {
        virtualDisplay?.release()
        imageReader?.close()
        projection?.stop()
        RuntimeState.screenCaptureActive = false
        if (instance === this) instance = null
        super.onDestroy()
    }

    companion object {
        const val EXTRA_RESULT_CODE = "resultCode"
        const val EXTRA_RESULT_DATA = "resultData"
        private const val NOTIF_ID = 4201

        // Live reference only while this service instance is running — same
        // discipline as AiosAccessibilityService.instance: never assumed
        // present, every caller null-checks.
        @Volatile var instance: ScreenCaptureService? = null
    }
}
