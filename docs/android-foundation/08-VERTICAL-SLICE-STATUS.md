# PART 22 FAZ 2 — DİKEY DİLİM DURUMU (bu oturumun ürettiği gerçek durum)

Bu belge, "implement the smallest vertical slice" talimatına bu oturumda ne kadar ilerlenebildiğinin **dürüst** kaydıdır.

## Ortam kısıtları (denetimle doğrulandı, bu oturumda ölçüldü)

| Araç | Durum |
|---|---|
| `cargo` / `rustc` | **mevcut** (1.97.1) — native core host üzerinde gerçekten derlenip test edildi |
| Android SDK | **yok** (`ANDROID_HOME` boş, `Sdk` dizini bulunamadı) |
| Android NDK | **yok** — Rust'ı Android hedefine (aarch64-linux-android vb.) cross-compile edecek toolchain yok |
| Gradle | **yok** (`which gradle` boş) |
| `rustup target` (android) | **kurulu değil** |
| ADB bağlı cihaz | **var** — ama bu cihaz **Samsung SM-J730F (Android 10)**, mission'ın açıkça "otomatik onboard etme" dediği ikinci node adayı. **Bu cihaza hiçbir mutasyon uygulanmadı** (install/push/shell yok) — mission Part 6 ve önceki turun "TELEFON: DEFERRED" talimatına uyum. |

Sonuç: bu ortamda **gerçek bir APK derlenip fiziksel cihaza kurulamaz**. Bu, mission'ın "must install on a real Android test device" kabul kriterinin bu oturumda karşılanamayacağı anlamına gelir — zorlanmadı, dürüstçe raporlanıyor.

## Gerçekten inşa edilen ve KANITLANMIŞ olan

**`native-core/` — Rust crate, host üzerinde derlendi ve test edildi (8/8 PASS):**

| Modül | İçerik | Kanıt |
|---|---|---|
| `canonical.rs` | `canonical_json()` — `desktop/observer.mjs`'in birebir portu | 2 golden-vector testi, **gerçek Node.js çıktısıyla** karşılaştırıldı (bu oturumda `node -e` ile üretildi) |
| `hashing.rs` | `sha256_hex()` | Aynı golden-vector'larla dolaylı kanıtlı |
| `node_identity.rs` | `calculate_node_identity()` — `desktop/attestation.mjs`'in portu | Golden-vector + trailing-slash normalizasyon testi |
| `evidence.rs` | `verify_chain()` — `EvidenceLedger.verifyChain()`'in portu | 3 birim test (empty/valid/tampered) |
| `task_state.rs` | `ALLOWED_STATES` (8 durum) | Kayma koruması testi — JS tarafındaki 8 durumla senkron |

Bu, Faz 2'nin (Native Core Skeleton) **gerçek ve doğrulanabilir** bir parçasıdır — sentetik değil, iki farklı dilde aynı algoritmanın bit-birebir aynı çıktısı üretildiği kanıtlanmıştır. **Ama henüz Android'e cross-compile edilmedi** — bu yüzden PRODUCTION_READY değil, "host-PROVEN, Android-NOT_PROVEN" ara durumundadır.

## Yazılmayan (ve neden)

Runtime Service (L1, Kotlin), Node Agent (L2), Control Surface (L5, Compose) için Kotlin/Gradle iskeleti bu oturumda **yazılmadı**. Gerekçe: bu ortamda Gradle/Android SDK yok — yazılan herhangi bir `.kt`/`build.gradle` dosyası derlenip doğrulanamaz. Test edilemeyen, "çalışır görünen ama kimse bilmeyen" kod üretmek, mission'ın "Do not claim this as proven until tested" ilkesini ihlal eder. Bunun yerine bu üç katmanın **arayüz sözleşmesi** aşağıda kesin biçimde tanımlanıyor — bir sonraki oturumda Android Studio/Gradle mevcut bir ortamda gerçek kod olarak yazılacak.

### Runtime Service (L1) arayüz sözleşmesi

```kotlin
interface AiosRuntimeService {
    fun onNodeLifecycleStart()
    fun sendHeartbeat(): HeartbeatResult
    fun attachToRun(runId: String): AttachResult
    fun intakeTask(task: TaskEnvelope): TaskState        // aios_core_native::task_state::TaskState ile aynı 8 değer
    fun checkpoint(taskId: String, digest: String)
    fun recordEvidence(entry: EvidenceEntry)              // native core verify_chain() ile doğrulanır
    fun dispatchCapability(capability: String): CapabilityResult
    fun detectOfflineOrStale(): NodeLiveness               // ALIVE | NO_HEARTBEAT | PROCESS_GONE — runtime-console.mjs ile aynı sözlük
}
```
Modern Android lifecycle kısıtı: `WorkManager` + kısa ömürlü `Foreground Service` (ölümsüz arka plan süreci YOK — mission talimatı). Recovery: process death/reboot/network-loss/agent-loss senaryolarının her biri ayrı, fiziksel cihazda test edilecek (07-PHYSICAL-DEVICE-ACCEPTANCE-MATRIX.md).

### Node Agent (L2) arayüz sözleşmesi

`fabric/src/a2a.ts`'teki `getAgentCard()` ile aynı şemaya uyan `/.well-known/agent-card.json` üretir — yeni protokol icat edilmez. Alanlar: `nodeId` (native core `calculate_node_identity()`'den), `platform: "android"`, `runtime`, `capabilities` (yalnızca AVAILABLE durumundakiler), `health`, `capacity`, `attestationStatus` (bugün her zaman `NOT_IMPLEMENTED`), `availability`.

### Control Surface (L5) arayüz sözleşmesi

Yalnızca `Runtime Service`'ten okur, hiçbir semantik karar vermez — mevcut PWA projeksiyonundaki `runStateSemantic()`/`proofSemantic()` kurallarının Compose tarafındaki birebir eşdeğeri olacak (aynı 8 durum sözlüğü, aynı "PASS+stale asla Doğrulandı değildir" kuralı). Jetpack Compose + adaptive window size classes + Material 3 primitifleri yalnızca sunumda; `semanticSlotHash` PWA ile aynı olmalı (parite kanıtı Faz 9'da).

## Faz 2 kabul durumu

```
NATIVE_CORE (host):     PASS — 8/8 test, golden-vector cross-language kanıt
NATIVE_CORE (Android):  NOT_PROVEN — cross-compile edilmedi (NDK yok)
RUNTIME_SERVICE:        DESIGN_ONLY — arayüz tanımlı, kod yazılmadı (Gradle yok)
NODE_AGENT:             DESIGN_ONLY
CONTROL_SURFACE:        DESIGN_ONLY
PHYSICAL_DEVICE:        FAIL — ortamda SDK/Gradle yok; bağlı tek cihaz (Samsung) mission gereği dokunulmadı
```
