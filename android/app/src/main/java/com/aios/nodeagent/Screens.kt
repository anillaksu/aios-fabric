package com.aios.nodeagent

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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

    fun candidateFile() = File(activity.getExternalFilesDir(null), "candidate.apk")

    Column(modifier.fillMaxSize().padding(8.dp)) {
        SectionCard("Artifact Store — search") {
            OutlinedTextField(value = query, onValueChange = { query = it }, label = { Text("search catalog") })
        }
        SectionCard("Candidate actions (external files/candidate.apk)") {
            Text(lastAction)
            lastVerification?.let { v -> Text("verify: digest=${v.digestValid} sig=${v.signatureValid} compat=${v.compatibilityValid} policy=${v.policyValid}") }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
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
            }
        }
        SectionCard("Catalog + local status") {
            LazyColumn {
                items(listings) { l ->
                    Column(Modifier.padding(vertical = 4.dp)) {
                        Text("${l.catalog.type} ${l.catalog.version} (${l.catalog.buildId})")
                        Text("local: ${l.localStatus}   compatible: ${l.compatible} (${l.compatibilityDetail})")
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
            }) { Text("Dispatch all 5 capabilities") }
        }
    }
}
