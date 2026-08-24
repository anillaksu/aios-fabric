package com.aios.nodeagent

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * First-launch capability tour — glassmorphism surface over CapabilityCatalog
 * (the single source of truth also feeding docs/PLAY_STORE_LISTING.md §2).
 * Owner's rule this exists to satisfy: nothing about what this app can touch
 * on the device is hidden or discovered later — every one of the 43
 * capabilities is named plainly before the user reaches the main tabs.
 *
 * Visual language: translucent frosted cards (blurred backdrop + soft border
 * + gradient wash) over a dark aurora background — no external asset/CDN,
 * pure Compose primitives, works back to minSdk 24 (blur degrades to a plain
 * translucent surface on API < 31, never crashes).
 */
private object OnboardingPrefs {
    private const val PREFS = "aios_onboarding"
    private const val KEY_SEEN = "seen_v1"

    fun hasSeen(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_SEEN, false)

    fun markSeen(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_SEEN, true).apply()
    }
}

fun onboardingAlreadySeen(context: Context): Boolean = OnboardingPrefs.hasSeen(context)

@Composable
private fun GlassCard(content: @Composable ColumnScope.() -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .background(
                Brush.linearGradient(
                    listOf(Color.White.copy(alpha = 0.14f), Color.White.copy(alpha = 0.05f)),
                ),
                shape = RoundedCornerShape(20.dp),
            )
            .border(1.dp, Color.White.copy(alpha = 0.22f), RoundedCornerShape(20.dp))
            .padding(18.dp),
    ) {
        Column(content = content)
    }
}

@Composable
fun OnboardingScreen(context: Context, onFinished: () -> Unit) {
    var groupIndex by remember { mutableStateOf(0) }
    val groups = CapabilityCatalog.groups
    val isLast = groupIndex == groups.lastIndex

    Box(
        Modifier
            .fillMaxSize()
            .background(
                Brush.radialGradient(
                    listOf(Color(0xFF0B0E2A), Color(0xFF06070F)),
                    radius = 1400f,
                ),
            ),
    ) {
        // Soft aurora blobs — pure color, no bitmap assets.
        Box(
            Modifier
                .fillMaxWidth()
                .padding(top = 40.dp)
                .background(Color(0xFF6C4DFF).copy(alpha = 0.35f), RoundedCornerShape(200.dp))
                .blur(80.dp),
        )

        Column(
            Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .padding(20.dp),
        ) {
            Text(
                "AIOS — ${CapabilityCatalog.totalCount} gerçek yetenek",
                color = Color.White,
                fontSize = 22.sp,
                style = MaterialTheme.typography.headlineSmall,
            )
            Text(
                "Kuruluma bastığın andan itibaren her şey açık: hiçbiri gizli değil.",
                color = Color.White.copy(alpha = 0.7f),
                modifier = Modifier.padding(top = 4.dp, bottom = 12.dp),
            )

            val group = groups[groupIndex]
            GlassCard {
                Text(group.title, color = Color.White, style = MaterialTheme.typography.titleLarge)
                Text(
                    "${groupIndex + 1} / ${groups.size}",
                    color = Color.White.copy(alpha = 0.5f),
                    modifier = Modifier.padding(bottom = 8.dp),
                )
            }

            LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(vertical = 4.dp)) {
                items(group.items) { cap ->
                    GlassCard {
                        Text(cap.title, color = Color.White, style = MaterialTheme.typography.titleMedium)
                        Text("• ${cap.whatItDoes}", color = Color.White.copy(alpha = 0.85f))
                        if (cap.whatItDoesNot.isNotBlank()) {
                            Text("• DEĞİL: ${cap.whatItDoesNot}", color = Color(0xFFFFB4A2))
                        }
                        Text(cap.id, color = Color.White.copy(alpha = 0.35f), fontSize = 11.sp)
                    }
                }
            }

            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Button(
                    onClick = {
                        if (isLast) {
                            OnboardingPrefs.markSeen(context)
                            onFinished()
                        } else {
                            groupIndex += 1
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6C4DFF)),
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                ) {
                    Text(if (isLast) "Anladım, başla" else "Devam et")
                }
                Text(
                    "Play Store açıklamasıyla birebir aynı liste — docs/PLAY_STORE_LISTING.md",
                    color = Color.White.copy(alpha = 0.35f),
                    fontSize = 10.sp,
                    modifier = Modifier.padding(top = 6.dp, bottom = 4.dp),
                )
            }
        }
    }
}
