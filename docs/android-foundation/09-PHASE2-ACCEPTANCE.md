# PART 22 FAZ 2 TAMAMLANMA — Native Core + Runtime Service + Node Agent + Artifact + Verification + Control Surface (gerçek Xiaomi cihazında)

Tarih: 2026-08-22. Temel checkpoint: `1d5294d`. Bu belge, o commit'teki dar dikey dilimin (yalnızca native core + JNI + bir kanıt ekranı) mission'ın istediği tam kapsama (Runtime Service, Node Agent, Artifact Manifest, Verification, Control Surface) gerçek cihazda genişletildiği turun kaydıdır.

Cihaz: **Xiaomi 2210129SG, Android 15 (SDK 35), arm64-v8a** — mission'ın "existing/admitted node" dediği doğru cihaz (bir önceki oturumda ADB'ye bağlı olan Samsung SM-J730F'e hâlâ dokunulmadı).

## Ne eklendi (kod, tamamı `android/app/src/main/java/com/aios/nodeagent/`)

| Dosya | Rol |
|---|---|
| `Semantics.kt` | `TaskState` (8 kanonik durum), `Liveness` (ALIVE/NO_HEARTBEAT/PROCESS_GONE — yeni sözlük değil, `runtime-console.mjs`/`app.js`'in birebir portu), `livenessFromHeartbeat()` |
| `RuntimeState.kt` | Servis↔Surface arası paylaşılan process-memory durumu; `appendEvidence()` hash-zincirli (native core `canonicalHash` ile) |
| `RuntimeService.kt` | Gerçek Android `Service` — lifecycle start, 2sn'lik heartbeat thread'i, task intake, checkpoint. Foreground/START_STICKY DEĞİL — "ölümsüz arka plan süreci yok" kuralına uyum |
| `CapabilityDispatch.kt` | 5 capability, hepsi GERÇEK cihaz/ağ çağrısı: `BatteryManager`, `Build.*`, `ConnectivityManager`, ve `adb reverse` tüneli üzerinden gerçek `http://127.0.0.1:9320/api/projection` çağrıları |
| `ArtifactManifest.kt` | AIOS Artifact v1'in Android örneği — kurulu APK'nın GERÇEK sha256'sı, GERÇEK imza sertifikası digest'i (`PackageManager.GET_SIGNING_CERTIFICATES`), gerçek minSdk uyumluluk kontrolü |
| `AgentCardServer.kt` | Ham `ServerSocket` tabanlı HTTP sunucu, `:9301`'de `/.well-known/agent-card.json` sunuyor — `fabric/src/a2a.ts`'teki `AgentCard` şemasıyla uyumlu, yeni protokol yok |
| `MainActivity.kt` | Control Surface — yalnızca projeksiyon, kendi semantiğini üretmiyor |

Native core tarafında tek ekleme: `jni_bridge.rs`'e `canonicalHash(json: String): String` — evidence kayıtlarını Kotlin'de yeniden hash algoritması yazmadan, tek sahiplik ilkesiyle imzalamak için.

## Fiziksel cihaz kanıt zinciri (hepsi gerçek, sırayla çalıştırıldı)

1. **BUILD**: `gradle assembleDebug` → `BUILD SUCCESSFUL`
2. **INSTALL**: `adb install -r` → ilk denemede Android'in kendi USB-kurulum onay diyaloğu devreye girdi (`INSTALL_FAILED_USER_RESTRICTED`) — **atlanmadı**, operatör telefonda fiziksel onayladı, ikinci denemede `Success`
3. **START**: `adb shell am start -W` → `Status: ok`, `LaunchState: COLD`, **`TotalTime: 1441ms`**
4. **OBSERVE**: `uiautomator dump` ile başlangıç durumu okundu — `nodeId: UNKNOWN`, `liveness: PROCESS_GONE`, `entries: 0` (dürüst, hiçbir şey henüz başlatılmadan önce sahte veri yok)
5. **RUNTIME SERVICE başlat** → `nodeId` hesaplandı (`node-f4bb85e4...`), `taskState: RUNNING`, `liveness: ALIVE`, evidence zinciri büyümeye başladı (`runtime.lifecycle_start` → `runtime.run_attach` → `runtime.heartbeat` × N)
6. **CALL CAPABILITY** (hepsi gerçek):
   ```
   sensor.battery.read:        TESTED (1-2ms)  — level=100%
   device.diagnostics.read:    TESTED (0ms)    — manufacturer=Xiaomi model=2210129SG sdk=35 abi=arm64-v8a
   network.diagnostics.read:   TESTED (0-1ms)  — transport=WIFI validated=true
   aios.reality:                TESTED (176ms)  — realityDigest=c42225cb88192d44...
   aios.status:                 TESTED (86-119ms) — runId=gatecanonical-20260821-200600-ad98c654 state=PASSED
   ```
7. **CANONICAL PARITY kanıtı**: aynı anda PC'den `curl http://127.0.0.1:9320/api/projection?profile=mobile` çekildi → `realityDigest: c42225cb88192d44a00d7ee413c06ac6b47df000000573b20f0fbadf3d7924b3` — **telefonun gösterdiği ile birebir aynı** (kısaltılmamış tam değer karşılaştırıldı).
8. **CREATE ARTIFACT MANIFEST + VERIFY**:
   ```
   artifactId: art-d2ccf9958f3b4627b198195ed7212025
   sha256: a10918f244cbbca1d348d559... (kurulu APK'nın gerçek hash'i)
   signatureRef: sha256:3d28cd9478089dce0... (gerçek imza sertifikası)
   verify: digest=true sig=true compat=true policy=true
   status: ACTIVE
   ```
9. **AGENT CARD**: `:9301` başlatıldı, PC'den `adb forward tcp:9301 tcp:9301` üzerinden `curl http://127.0.0.1:9301/.well-known/agent-card.json` ile çekildi — `fabric/src/a2a.ts`'teki `AgentCard` alanlarıyla (name/description/url/version/protocolVersion/supportedInterfaces/capabilities/skills) uyumlu, artı dürüst uzantı alanları (`nodeId`, `platform`, `attestationStatus: "NOT_IMPLEMENTED"`).
10. **SHOW RUNTIME STATE**: her adımda `uiautomator dump` ile ekran okundu, tüm alanlar (heartbeat yaşı, evidence sayacı, capability durumları) tutarlı.
11. **UNINSTALL**: `adb uninstall` → `Success`, `pm list packages | grep aios` → boş (iz yok).

## RECOVERY (3/3 fiziksel olarak ölçüldü)

| Senaryo | Yöntem | Sonuç |
|---|---|---|
| Runtime process death | `adb shell am force-stop com.aios.nodeagent`, sonra yeniden başlat | **PASS** — process-memory state sıfırlandı (kalıcılık yok, "ölümsüz süreç yok" kuralına uygun); yeniden açılan uygulama dürüstçe `liveness: PROCESS_GONE`, `entries: 0` gösterdi — sahte "ALIVE" YOK |
| Network loss (kanonik sunucuya) | `adb reverse --remove tcp:9320` | **PASS** — `aios.reality`/`aios.status` gerçek `ConnectException` ile `NOT_PROVEN` döndü (fail-closed); yerel capability'ler (battery/device/network diagnostics) etkilenmedi çünkü gerçekten cihaz-yerel |
| Reconnect | `adb reverse tcp:9320 tcp:9320` geri kuruldu, tekrar dispatch | **PASS** — `aios.reality`/`aios.status` tekrar `TESTED` |

Not: `svc wifi disable` denendi ama cihaz otomatik olarak LTE'ye düştü ve `adb reverse` USB üzerinden çalıştığı için etkilenmedi — bu, gerçek "ağ kaybı" testi için yanlış katmandı; asıl anlamlı test kanonik tünelin kendisini kesmekti (yukarıdaki), o yapıldı.

## PERFORMANCE (ölçülen, ayrıştırılmış)

```
process startup (cold, am start -W):        TotalTime 1441ms, WaitTime 1472ms
JNI call latency (yerel, ağsız):             0-2ms  (device/network/battery capability'leri)
runtime service latency (heartbeat interval): 2000ms (tasarım, ölçüm değil)
capability dispatch latency (ağ dahil):       86-177ms (adb-reverse-over-USB tüneli üzerinden — üretim Tailscale/LAN gecikmesini TEMSİL ETMEZ, yalnızca bu test topolojisinin gerçek ölçümü)
```
Sahte "native hız" iddiası yok — process spawn/başlatma overhead'i (1441ms) ile saf JNI çağrı gecikmesi (0-2ms) ayrı ayrı raporlandı, mission Part 11 gereği.

## Bilinçli olarak GENİŞLETİLMEYEN kapsam (mission Part "STOP" talimatı)

Artifact Store (görsel mağaza), AOSP/APEX entegrasyonu — **yapılmadı**, mission'ın açık talimatı gereği. `secretRef` modeli hâlâ DESIGN_ONLY (bu vertical slice'ta hiçbir secret kullanılmadı, dolayısıyla test edilecek bir şey yoktu). Device-level hardware attestation hâlâ `NOT_IMPLEMENTED/NOT_PROVEN` — fabrikasyon yapılmadı.

## PART 22/12 KABUL DURUMU

```
NATIVE_CORE_ANDROID:     PASS
JNI:                     PASS
RUNTIME_SERVICE:         PASS — lifecycle/heartbeat/task-intake/checkpoint gerçek cihazda çalıştı
NODE_AGENT:              PASS — nodeId/platform/capabilities/health gerçek; attestationStatus dürüstçe NOT_IMPLEMENTED
AGENT_CARD:               PASS — a2a.ts şemasıyla uyumlu, :9301'den PC'ye gerçek HTTP ile servis edildi
CAPABILITY_PROOF:         PASS — 5/5 capability gerçek çağrıyla TESTED (ağ kaybında NOT_PROVEN'a düştü, fabrikasyon yok)
HEARTBEAT:                PASS — ALIVE/NO_HEARTBEAT/PROCESS_GONE, ikinci bir sözlük icat edilmedi
ARTIFACT_MANIFEST:        PASS — gerçek sha256, gerçek imza referansı
ARTIFACT_VERIFICATION:    PASS — 4/4 kontrol (digest/signature/compat/policy) gerçek recompute ile
CONTROL_SURFACE:          PASS — yalnızca projeksiyon, kendi semantiği yok
CANONICAL_PARITY:         PASS — realityDigest PC ve telefonda birebir aynı (canlı, aynı anda doğrulandı)
PHYSICAL_DEVICE:          PASS — BUILD/INSTALL/START/OBSERVE/CALL CAPABILITY/CREATE ARTIFACT/VERIFY/SHOW STATE/UNINSTALL hepsi gerçek Xiaomi'de
RECOVERY:                 PASS — process death, network loss, reconnect (3/3 fiziksel ölçüldü)
PERFORMANCE:              MEASURED — startup/JNI/dispatch ayrı ayrı, sahte hız iddiası yok
EVIDENCE:                 CHAIN_VALID (yerel Evidence Vault projeksiyonu, native core canonicalHash ile — kanonik EvidenceLedger'ın kopyası değil, ayrı bir zincir)
```
