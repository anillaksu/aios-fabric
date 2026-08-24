package com.aios.nodeagent

import android.content.Intent
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.File

/** Ticks every second so screens re-read the live (non-Compose-observable) state objects. */
@Composable
private fun rememberLiveTick(): Int {
    var tick by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) { delay(1000); tick++ }
    }
    return tick
}

@Composable
private fun SectionCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(Modifier.fillMaxWidth().padding(8.dp), elevation = CardDefaults.cardElevation(2.dp)) {
        Column(Modifier.padding(16.dp)) {
            Text(title, style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
            Divider(Modifier.padding(vertical = 8.dp))
            content()
        }
    }
}

// ---------------------------------------------------------------- HOME ----

@Composable
fun HomeScreen(activity: MainActivity, modifier: Modifier = Modifier) {
    val tick = rememberLiveTick()
    val m = remember(tick) { Metrics.compute(activity) }
    Column(modifier.fillMaxSize().padding(8.dp)) {
        SectionCard("AIOS — Home") {
            Text("nodeId: ${RuntimeState.nodeId}")
            Text("liveness: ${RuntimeState.liveness()}   task: ${RuntimeState.taskState}")
        }
        SectionCard("Final Metrics (live, measured)") {
            Text("artifacts total: ${m.artifactsTotal}   active: ${m.active}   verified: ${m.verified}")
            Text("installed: ${m.installed}   rollback-capable: ${m.rollbackCapable}   revoked: ${m.revoked}")
            Text("nodes known: ${m.nodesKnown}   capabilities: ${m.capabilitiesTested}/${m.capabilitiesTotal}")
            Text("runtime healthy: ${m.runtimeHealthy}   evidence entries: ${m.evidenceEntries}")
            Text("jni-local latency: ${m.jniLatencyMs?.let { "${it}ms" } ?: "not measured"}")
            Text("evidence append latency: ${m.evidenceLatencyMs}ms (measured just now)")
            Text("startup latency: ${activity.startupLatencyMs.value?.let { "${it}ms" } ?: "see am start -W externally"}")
        }
    }
}

// ------------------------------------------------------------- RUNTIME ----

@Composable
fun RuntimeScreen(activity: MainActivity, modifier: Modifier = Modifier) {
    val tick = rememberLiveTick()
    val scope = rememberCoroutineScope()
    var lastAction by remember { mutableStateOf("") }
    val liveness = remember(tick) { RuntimeState.liveness() }
    val hbAge = remember(tick) {
        if (RuntimeState.lastHeartbeatMs.get() > 0) "${System.currentTimeMillis() - RuntimeState.lastHeartbeatMs.get()}ms ago" else "never"
    }
    Column(modifier.fillMaxSize().padding(8.dp)) {
        SectionCard("Runtime Service") {
            Text("serviceRunning: ${RuntimeState.serviceRunning.get()}")
            Text("liveness: $liveness   lastHeartbeat: $hbAge")
            Text("runId: ${RuntimeState.runId ?: "none"}")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = {
                    activity.startService(Intent(activity, RuntimeService::class.java).putExtra("runId", "run-${System.currentTimeMillis()}"))
                }) { Text("Start") }
                Button(onClick = { activity.stopService(Intent(activity, RuntimeService::class.java)) }) { Text("Stop") }
            }
        }
        SectionCard("Canonical Runtime Attach (aios.status)") {
            Text(lastAction)
            Button(onClick = {
                scope.launch(Dispatchers.IO) {
                    val r = CapabilityDispatch.aiosStatus(activity.canonicalBaseUrl)
                    RuntimeState.capabilities[r.capability] = r
                    lastAction = "${r.status} (${r.latencyMs}ms): ${r.detail}"
                }
            }) { Text("Attach to canonical run") }
        }
    }
}

// --------------------------------------------------------------- NODES ----

@Composable
fun NodesScreen(activity: MainActivity, modifier: Modifier = Modifier) {
    var overview by remember { mutableStateOf("(not fetched yet)") }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    Column(modifier.fillMaxSize().padding(8.dp)) {
        SectionCard("This Node") {
            Text("nodeId: ${RuntimeState.nodeId}")
            Text("platform: android   attestationStatus: NOT_IMPLEMENTED")
        }
        SectionCard("Canonical Node Overview (from /api/projection)") {
            Text(error ?: overview)
            Button(onClick = {
                scope.launch(Dispatchers.IO) {
                    try {
                        val body = CapabilityDispatch.fetchProjectionRaw(activity.canonicalBaseUrl)
                        val m = Regex("\"nodeOverview\":(\\{.*?\\}\\})(?=,\"runtimeDiagnostics\")").find(body)
                        overview = m?.groupValues?.get(1) ?: "no nodeOverview in response"
                        error = null
                    } catch (e: Exception) {
                        error = "error: ${e.javaClass.simpleName}: ${e.message}"
                    }
                }
            }) { Text("Refresh node overview") }
        }
    }
}

// --------------------------------------------------------------- TASKS ----

@Composable
fun TasksScreen(modifier: Modifier = Modifier) {
    val tick = rememberLiveTick()
    val state = remember(tick) { RuntimeState.taskState }
    Column(modifier.fillMaxSize().padding(8.dp)) {
        SectionCard("Current Task") {
            Text("taskState: $state")
            Text("runId: ${RuntimeState.runId ?: "none"}")
        }
    }
}

// ----------------------------------------------------------- ARTIFACTS ----

@Composable
fun ArtifactsScreen(activity: MainActivity, modifier: Modifier = Modifier) {
    val tick = rememberLiveTick()
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var lastAction by remember { mutableStateOf("") }
    val listings = remember(tick, query) { ArtifactStore.search(activity, query) }
    var lastVerification by remember { mutableStateOf<VerificationResult?>(null) }
    var showTechnical by remember { mutableStateOf(false) }

    fun candidateFile() = File(activity.getExternalFilesDir(null), "candidate.apk")

    Column(modifier.fillMaxSize().padding(8.dp)) {
        SectionCard("Artifact Store — search") {
            OutlinedTextField(value = query, onValueChange = { query = it }, label = { Text("search catalog") })
        }
        SectionCard("Candidate actions (external files/candidate.apk)") {
            Text(lastAction)
            lastVerification?.let { v -> Text("verify: digest=${v.digestValid} sig=${v.signatureValid} compat=${v.compatibilityValid} policy=${v.policyValid}") }
            // 5 actions don't fit a fixed-width Row on a phone screen without
            // clipping/overlap (found during physical UI hardening) — scroll
            // instead of shrinking below the 48dp Material touch-target minimum.
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.horizontalScroll(rememberScrollState()),
            ) {
                Button(onClick = {
                    scope.launch(Dispatchers.IO) {
                        lastAction = try {
                            val s = AiosInstaller.snapshotCurrentActive(activity)
                            "discovered: ${s.manifest.buildId}"
                        } catch (e: Exception) { "ERROR: ${e.message}" }
                    }
                }) { Text("Discover Current") }
                Button(onClick = {
                    scope.launch(Dispatchers.IO) {
                        lastAction = try {
                            val f = candidateFile()
                            if (!f.exists()) throw IllegalStateException("push candidate.apk first")
                            val m = AiosInstaller.readManifestFromFile(activity, f, "store-candidate")
                            val v = ArtifactStore.verify(activity, ArtifactCatalog.load(activity).firstOrNull { it.artifactId == m.artifactId }
                                ?: CatalogEntry(m.artifactId, activity.packageName, m.type, m.version, m.platform, m.minRuntime, "arm64-v8a", m.sha256, m.signatureRef, m.buildId, m.capabilities, "unknown"), f)
                            lastVerification = v
                            if (v.allValid) "VERIFIED" else "VERIFICATION_FAILED"
                        } catch (e: Exception) { "ERROR: ${e.message}" }
                    }
                }) { Text("Verify") }
                Button(onClick = {
                    scope.launch(Dispatchers.IO) {
                        lastAction = try {
                            val f = candidateFile()
                            val m = AiosInstaller.readManifestFromFile(activity, f, "store-candidate")
                            ArtifactStore.install(activity, ArtifactCatalog.load(activity).firstOrNull { it.artifactId == m.artifactId }
                                ?: CatalogEntry(m.artifactId, activity.packageName, m.type, m.version, m.platform, m.minRuntime, "arm64-v8a", m.sha256, m.signatureRef, m.buildId, m.capabilities, "unknown"), f)
                        } catch (e: Exception) { "ERROR: ${e.message}" }
                    }
                }) { Text("Install/Activate") }
                Button(onClick = {
                    scope.launch(Dispatchers.IO) { lastAction = ArtifactStore.rollback(activity) }
                }) { Text("Rollback") }
                Button(onClick = {
                    scope.launch(Dispatchers.IO) {
                        lastAction = try {
                            val f = candidateFile()
                            val m = AiosInstaller.readManifestFromFile(activity, f, "store-candidate")
                            ArtifactStore.revoke(activity, m.artifactId)
                            "REVOKED ${m.artifactId}"
                        } catch (e: Exception) { "ERROR: ${e.message}" }
                    }
                }) { Text("Revoke") }
            }
        }
        SectionCard("Catalog") {
            // Mission Part 4: primary surface shows ONE of six words, never raw
            // hashes/buildIds. Toggle reveals the technical disclosure panel.
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("show technical details")
                Button(onClick = { showTechnical = !showTechnical }) { Text(if (showTechnical) "Hide" else "Show") }
            }
            LazyColumn {
                items(listings) { l ->
                    val display = remember(tick, l) { ArtifactStore.displayStatus(activity, l) }
                    Column(Modifier.padding(vertical = 4.dp)) {
                        Text("${l.catalog.type} ${l.catalog.version}")
                        Text("status: $display   compatible: ${l.compatible}")
                        if (showTechnical) {
                            Text("buildId: ${l.catalog.buildId}")
                            Text("sha256: ${l.catalog.sha256.take(16)}...")
                            Text("artifactId: ${l.catalog.artifactId}")
                            Text("rollbackTarget: ${l.rollbackTargetId ?: "none"}")
                        }
                        Divider()
                    }
                }
            }
        }
    }
}

// ------------------------------------------------------------ EVIDENCE ----

@Composable
fun EvidenceScreen(modifier: Modifier = Modifier) {
    val tick = rememberLiveTick()
    val entries = remember(tick) { RuntimeState.evidenceLog.toList().takeLast(30).reversed() }
    Column(modifier.fillMaxSize().padding(8.dp)) {
        SectionCard("Evidence Vault (local projection, ${entries.size} shown)") {
            LazyColumn {
                items(entries) { e ->
                    Column(Modifier.padding(vertical = 4.dp)) {
                        Text("${e.operation}")
                        Text("${e.currentHash.take(16)}...   success=${e.success}")
                        Divider()
                    }
                }
            }
        }
    }
}

// ------------------------------------------------------------ SETTINGS ----

@Composable
fun SettingsScreen(activity: MainActivity, modifier: Modifier = Modifier) {
    val scope = rememberCoroutineScope()
    var lastAction by remember { mutableStateOf("") }
    val canInstall = remember { AiosInstaller.canInstall(activity) }
    Column(modifier.fillMaxSize().padding(8.dp)) {
        MembershipCard(activity)
        NodeEconomyCard()
        ConnectivityCard(activity)
        ScreenCaptureCard(activity)
        RemoteControlCard(activity)
        SectionCard("Install permission") {
            Text("canRequestPackageInstalls: $canInstall")
            Button(onClick = {
                activity.startActivity(AiosInstaller.requestInstallPermissionIntent(activity).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }) { Text("Open Settings") }
        }
        SectionCard("Agent Card server (:9301)") {
            Button(onClick = { activity.agentCardServer.start() }) { Text("Start") }
        }
        SectionCard("Capability dispatch") {
            Text(lastAction)
            Button(onClick = {
                scope.launch(Dispatchers.IO) {
                    val r = CapabilityDispatch.dispatchAll(activity, activity.canonicalBaseUrl)
                    lastAction = r.joinToString("\n") { "${it.capability}: ${it.status} (${it.latencyMs}ms)" }
                }
            }) { Text("Dispatch all 10 capabilities") }
        }
        DeviceProfileCard(activity)
    }
}

/**
 * PROTOTYPE, not a real account system — see MembershipConfig.kt. Local-only,
 * offline invite redemption; no server-side registry or payment exists yet.
 * Shown honestly as PROTOTYPE in the UI so it is never mistaken for a working
 * multi-user membership backend.
 */
@Composable
private fun MembershipCard(activity: MainActivity) {
    var status by remember { mutableStateOf(MembershipConfig.status(activity)) }
    var codeField by remember { mutableStateOf("") }
    SectionCard("Üyelik (PROTOTİP — yerel, gerçek sunucu doğrulaması yok)") {
        Text(
            when (status) {
                MembershipConfig.MembershipStatus.ROOT_ADMIN -> "ROOT ADMIN (bu cihaz)"
                MembershipConfig.MembershipStatus.MEMBER -> "Üye — katılım: ${MembershipConfig.joinedAtMs(activity)}"
                MembershipConfig.MembershipStatus.NOT_MEMBER -> "Üye değil — davet kodu gerekli"
                MembershipConfig.MembershipStatus.NOT_PROVEN -> "Kanonik doğrulama yok (stub)"
            }
        )
        if (status == MembershipConfig.MembershipStatus.NOT_MEMBER) {
            OutlinedTextField(value = codeField, onValueChange = { codeField = it }, label = { Text("Davet kodu") })
            Button(onClick = { status = MembershipConfig.redeemInviteCode(activity, codeField) }) { Text("Kodu kullan") }
        }
    }
}

/**
 * PROTOTYPE — see NodeEconomy.kt. Score is a real function of measured
 * capability dispatch results; the "Payout iste" button calls the currently
 * registered PaymentProviderAdapter (MockPaymentProvider until a real
 * institution's API is wired in) and shows its actual response honestly —
 * never fabricates ACCEPTED.
 */
@Composable
private fun NodeEconomyCard() {
    var contribution by remember { mutableStateOf(NodeEconomy.computeContribution()) }
    var payoutResult by remember { mutableStateOf<String?>(null) }
    SectionCard("Node ekonomisi (PROTOTİP — gerçek ödeme yok)") {
        Text("Başarılı capability: ${contribution.dispatchSuccessCount}/${contribution.dispatchTotalCount}")
        Text("Katkı skoru: ${contribution.score}")
        Button(onClick = { contribution = NodeEconomy.computeContribution() }) { Text("Skoru yenile") }
        Button(onClick = {
            val r = MockPaymentProvider.requestPayout(PayoutRequest("this-device", contribution.score, "TRY"))
            payoutResult = "${MockPaymentProvider.providerName}: ${r.status} — ${r.detail}"
        }) { Text("Payout iste (${MockPaymentProvider.providerName})") }
        payoutResult?.let { Text(it) }
    }
}

/**
 * View direction of "çift yönlü" (bidirectional) remote control. Real
 * MediaProjection capture (ScreenCaptureService) — the consent dialog and
 * permanent notification are Android's own, non-optional security boundary
 * for this API, not something this card can skip.
 */
@Composable
private fun ScreenCaptureCard(activity: MainActivity) {
    var bitmap by remember { mutableStateOf<android.graphics.Bitmap?>(null) }
    var status by remember { mutableStateOf("") }
    SectionCard("Ekran yakalama (MediaProjection, gerçek)") {
        Text(status)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { activity.requestScreenCapture(); status = "İzin istendi — sistem onay ekranını bekleyin" }) {
                Text("İzin iste ve başlat")
            }
            Button(onClick = {
                val svc = ScreenCaptureService.instance
                if (svc == null) {
                    status = "Servis çalışmıyor — önce izin isteyin"
                } else {
                    val file = svc.saveSnapshotToFile(activity)
                    bitmap = file?.let { BitmapFactory.decodeFile(it.absolutePath) }
                    status = if (bitmap != null) "Anlık görüntü alındı: ${file?.absolutePath}" else "Henüz kare hazır değil, tekrar deneyin"
                }
            }) { Text("Anlık görüntü al") }
        }
        bitmap?.let { bmp ->
            Image(bitmap = bmp.asImageBitmap(), contentDescription = "Ekran anlık görüntüsü", modifier = Modifier.fillMaxWidth())
        }
    }
}

/**
 * Control direction of bidirectional remote control — real AccessibilityService
 * gesture dispatch (AiosAccessibilityService), the same official API AnyDesk's
 * own accessibility plugin uses. Must be enabled once by the user in
 * Settings > Accessibility; this card cannot silently turn it on.
 */
@Composable
private fun RemoteControlCard(activity: MainActivity) {
    var x by remember { mutableStateOf("500") }
    var y by remember { mutableStateOf("1000") }
    var result by remember { mutableStateOf("") }
    SectionCard("Uzaktan kontrol (AccessibilityService, gerçek dokunuş)") {
        Text("connectedNow=${AiosAccessibilityService.instance != null}")
        Button(onClick = { activity.startActivity(Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS)) }) {
            Text("Erişilebilirlik ayarlarını aç")
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(value = x, onValueChange = { x = it }, label = { Text("x") }, modifier = Modifier.fillMaxWidth())
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(value = y, onValueChange = { y = it }, label = { Text("y") }, modifier = Modifier.fillMaxWidth())
        }
        Button(onClick = {
            val svc = AiosAccessibilityService.instance
            if (svc == null) {
                result = "Servis bağlı değil — önce Erişilebilirlik ayarlarından etkinleştirin"
            } else {
                svc.tap(x.toFloatOrNull() ?: 0f, y.toFloatOrNull() ?: 0f) { ok -> result = "tap sonucu: $ok" }
            }
        }) { Text("Dokunuş gönder") }
        Text(result)
    }
}

/**
 * Was the demo-time failure point: canonicalBaseUrl used to be a hardcoded
 * `127.0.0.1:9320` requiring a live `adb reverse` (USB) session, with no way
 * to see it was unreachable until a capability quietly came back NOT_PROVEN.
 * This card makes the address editable (persisted via ConnectivityConfig) and
 * testable with one tap, so reachability can be confirmed *before* going live
 * instead of discovering it mid-presentation.
 */
@Composable
private fun ConnectivityCard(activity: MainActivity) {
    val scope = rememberCoroutineScope()
    var urlField by remember { mutableStateOf(activity.canonicalBaseUrl) }
    var testResult by remember { mutableStateOf<String?>(null) }
    var testing by remember { mutableStateOf(false) }
    SectionCard("Kanonik kontrol düzlemi") {
        OutlinedTextField(
            value = urlField,
            onValueChange = { urlField = it },
            label = { Text("Base URL (örn. http://100.109.236.30:9320)") },
        )
        Row {
            Button(onClick = {
                ConnectivityConfig.setBaseUrl(activity, urlField)
                activity.canonicalBaseUrl = urlField
                testResult = null
            }) { Text("Kaydet") }
            Button(onClick = {
                testing = true
                testResult = null
                scope.launch(Dispatchers.IO) {
                    val r = CapabilityDispatch.aiosStatus(activity.canonicalBaseUrl)
                    RuntimeState.capabilities[r.capability] = r
                    testResult = "${r.status} · ${r.detail} · ${r.latencyMs}ms"
                    testing = false
                }
            }) { Text(if (testing) "Test ediliyor..." else "Bağlantıyı test et") }
        }
        testResult?.let {
            Text(if (it.startsWith("TESTED")) "CANLI: $it" else "ERİŞİLEMİYOR: $it")
        }
    }
}

@Composable
private fun DeviceProfileCard(activity: MainActivity) {
    var profile by remember { mutableStateOf<BuildProfile?>(null) }
    var showRaw by remember { mutableStateOf(false) }
    SectionCard("Cihaz Profili") {
        val p = profile
        if (p == null) {
            Button(onClick = { profile = DeviceDiscovery.discover(activity) }) { Text("Cihazı keşfet") }
        } else {
            val d = p.deviceFacts
            Text("Android ${d.androidRelease} (SDK ${p.androidSdk})  ·  ABI ${p.abi}")
            Text("SoC: ${d.socModel ?: "NOT_MEASURED"}  ·  Çekirdek: ${d.cpuCoreCount}")
            Text("Bellek: ${if (d.availMemMb != null) "${d.availMemMb}/${d.totalMemMb} MB" else "NOT_MEASURED"}")
            Text("Depolama: ${if (d.storageFreeMb != null) "${d.storageFreeMb}/${d.storageTotalMb} MB" else "NOT_MEASURED"}")
            Text("Ağ: ${d.networkTransport ?: "NOT_MEASURED"}  ·  Pil: ${d.batteryPercent?.let { "%$it" } ?: "NOT_MEASURED"}")
            Text("Vulkan: ${p.nativeFeatures.vulkanHardwareLevel ?: "NOT_MEASURED"}  ·  arm64: ${p.nativeFeatures.arm64}")
            Button(onClick = { showRaw = !showRaw }) { Text(if (showRaw) "Teknik ayrıntıyı gizle" else "Teknik ayrıntı") }
            if (showRaw) {
                Text(
                    "root_hint=${d.rootHintDetected} (metadata only, not trust)\n" +
                        "nnapi_api_level_sufficient=${p.nativeFeatures.nnapiApiLevelSufficient} (SDK floor only, not proof)\n" +
                        "known_capabilities=${p.knownCapabilitiesCount}"
                )
            }
        }
    }
}
