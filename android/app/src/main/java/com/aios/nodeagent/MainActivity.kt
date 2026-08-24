package com.aios.nodeagent

import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Done
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier

/**
 * AIOS Android Control Surface (Track C) — premium native surface, 7 tabs.
 * Every screen is projection-only over the already-proven state objects
 * (RuntimeState, LocalArtifactStore, CapabilityDispatch, ArtifactStore,
 * NativeCore) — no business semantics are computed here, matching
 * docs/android-foundation/09-PHASE2-ACCEPTANCE.md Part 7/10's rule, now
 * extended to a multi-screen surface instead of one Activity's TextView.
 */
class MainActivity : ComponentActivity() {
    // Was a hardcoded `127.0.0.1:9320` requiring a live `adb reverse` (USB)
    // session — a demo-time single point of failure (ConnectivityConfig.kt).
    // Now loaded from persisted settings, defaulting to the PC's Tailscale
    // address, and editable from SettingsScreen without a rebuild.
    var canonicalBaseUrl by mutableStateOf("")
    val agentCardServer = AgentCardServer(9301)
    var startupLatencyMs = mutableStateOf<Long?>(null)

    // Screen capture: MediaProjection consent is a per-request Activity
    // result — there is no way to obtain it without this launcher, by
    // Android's own design (real security boundary, not a limitation
    // introduced here). Result is forwarded to ScreenCaptureService.
    private lateinit var screenCaptureLauncher: ActivityResultLauncher<Intent>

    fun requestScreenCapture() {
        val mgr = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        screenCaptureLauncher.launch(mgr.createScreenCaptureIntent())
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        screenCaptureLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == RESULT_OK && result.data != null) {
                val intent = Intent(this, ScreenCaptureService::class.java)
                    .putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, result.resultCode)
                    .putExtra(ScreenCaptureService.EXTRA_RESULT_DATA, result.data)
                startForegroundService(intent)
            }
        }
        canonicalBaseUrl = ConnectivityConfig.getBaseUrl(this)
        startService(Intent(this, RuntimeService::class.java).putExtra("runId", "run-${System.currentTimeMillis()}"))
        setContent {
            var showOnboarding by remember { mutableStateOf(!onboardingAlreadySeen(this)) }
            MaterialTheme {
                if (showOnboarding) {
                    OnboardingScreen(this) { showOnboarding = false }
                } else {
                    AiosApp(this)
                }
            }
        }
    }

    override fun onDestroy() {
        agentCardServer.stop()
        super.onDestroy()
    }
}

private data class Tab(val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)

@Composable
fun AiosApp(activity: MainActivity) {
    var selected by remember { mutableIntStateOf(0) }
    val tabs = listOf(
        "Home" to Icons.Filled.Home,
        "Runtime" to Icons.Filled.Refresh,
        "Nodes" to Icons.Filled.Person,
        "Tasks" to Icons.Filled.List,
        "Artifacts" to Icons.Filled.Star,
        "Evidence" to Icons.Filled.Done,
        "Settings" to Icons.Filled.Settings,
    )

    Scaffold(
        bottomBar = {
            NavigationBar {
                tabs.forEachIndexed { i, (label, icon) ->
                    NavigationBarItem(
                        selected = selected == i,
                        onClick = { selected = i },
                        icon = { Icon(icon, contentDescription = label) },
                        label = { Text(label) },
                    )
                }
            }
        }
    ) { padding ->
        val mod = Modifier.padding(padding)
        when (selected) {
            0 -> HomeScreen(activity, mod)
            1 -> RuntimeScreen(activity, mod)
            2 -> NodesScreen(activity, mod)
            3 -> TasksScreen(mod)
            4 -> ArtifactsScreen(activity, mod)
            5 -> EvidenceScreen(mod)
            6 -> SettingsScreen(activity, mod)
        }
    }
}
