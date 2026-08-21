# PART 22 FAZ 2-3-10 — DİKEY DİLİM DURUMU (güncellendi 2026-08-22, fiziksel cihaz kanıtı ile)

Bu belge iki oturumun gerçek durumunu kaydeder: önce toolchain yokken ulaşılan sınır, sonra operatörün D:\Android\Sdk'yı işaret etmesi ve telefonu bağlamasıyla aşılan sınır.

## Ortam (2026-08-22 itibarıyla, gerçekten doğrulandı)

| Araç | Durum | Kaynak |
|---|---|---|
| `cargo`/`rustc` | 1.97.1, mevcut | önceden kuruluydu |
| Android SDK (build-tools 34/36/36.1/37, platforms android-35/36.1/37.0, cmdline-tools) | **mevcut**, `D:\Android\Sdk` | operatör işaret etti |
| Android NDK | **kuruldu**, `27.2.12479018`, `D:\Android\Sdk\ndk\27.2.12479018` | bu oturumda `sdkmanager` ile kuruldu (D:'ye, kalıcı) |
| JDK | **kuruldu**, Temurin 17.0.20+8, `D:\Android\jdk\jdk-17.0.20+8` | bu oturumda indirildi (D:'ye, kalıcı) — sdkmanager/gradle'ın kendisi de JVM gerektirdiği için önce bu eksikti |
| Gradle | **kuruldu**, 8.11.1, `D:\Android\gradle\gradle-8.11.1` | bu oturumda indirildi (D:'ye, kalıcı) |
| Gradle/derleme önbelleği | `R:\cache\gradle` | operatörün ayırdığı RAM disk, hız için — kalıcı olması gerekmeyen her şey burada |
| ADB bağlı cihaz | **Xiaomi 2210129SG**, Android 15 (SDK 35), arm64-v8a — mission'ın "existing/admitted node" dediği cihaz | operatör bağladı ve tam yetki verdi |

Not: Bir önceki oturumda ADB'ye bağlı olan cihaz **Samsung SM-J730F** idi — mission'ın "otomatik onboard etme" dediği ikinci aday. O cihaza hiçbir mutasyon uygulanmadı. Bu oturumda bağlanan **farklı, doğru cihaz** (Xiaomi) üzerinde çalışıldı.

## Yapılan ve gerçekten kanıtlanan

### 1. Native Core → Android cross-compile (host'tan sonraki adım)

`native-core/.cargo/config.toml` NDK'nın clang sürücülerine (`aarch64-linux-android24-clang` vb.) işaret ediyor. `cargo build --release --target aarch64-linux-android` **gerçekten link edilen** bir `libaios_core_native.so` üretti (ELF 64-bit ARM aarch64, `for Android 24, built by NDK r27c`).

### 2. Cihazda çalışan bağımsız binary kanıtı

`native-core/src/bin/device_selfcheck.rs` — canonical_json/sha256/node_identity/verify_chain'i çağıran bağımsız bir ELF executable. `adb push` + `adb shell chmod 755` + doğrudan çalıştırma ile **gerçek Xiaomi cihazında** çalıştırıldı:

```
=== AIOS CORE NATIVE — ON-DEVICE SELF-CHECK ===
PASS canonical_json+sha256(empty_object) — hash=44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a
PASS calculate_node_identity — node-e063da3fd0d8a02f3bcc981f02eb8a51b83800b15f90abb079cd82695d8c3331
PASS verify_chain(single valid entry) — ChainValid { events: 1, ... }
=== ALL CHECKS PASSED ON DEVICE ===
```
Çalıştırma süresi (5 ölçüm, adb-shell fork/exec dahil): 14-21ms. Bu saf native yürütme gecikmesi değil — process spawn overhead'i içeriyor (dürüst not: Part 15'in istediği gerçek Macrobenchmark/JNI-çağrı-gecikmesi ölçümü bu değil, yalnızca "gerçekten çalışıyor" kanıtı).

İş bitince binary cihazdan silindi (`adb shell rm`) — kalıcı hiçbir iz bırakılmadı.

### 3. JNI köprüsü + gerçek Android uygulaması (Faz 3/4'ün en küçük dikey dilimi)

`native-core/src/jni_bridge.rs` (`--features android-jni`) iki JNI fonksiyonu dışa veriyor: `Java_com_aios_nodeagent_NativeCore_selfCheckHash`, `Java_com_aios_nodeagent_NativeCore_computeNodeIdentity`.

`android/` — gerçek bir Gradle Android projesi (`com.aios.nodeagent`, minSdk 24, compileSdk/targetSdk 35, tek `MainActivity`). `libaios_core_native.so` (arm64-v8a) `jniLibs`'e kopyalandı. **Bu, Runtime Service/Node Agent/Control Surface'ın kendisi DEĞİL** — 08 belgesinin altındaki arayüz sözleşmelerinin gerçek kod olarak yazılması ayrı, daha büyük bir iştir. Bu uygulama yalnızca şunu kanıtlamak için var: JNI köprüsü gerçek bir kurulu uygulamadan gerçek cihazda çalışıyor mu.

`gradle assembleDebug` ile derlendi, `adb install` ile **gerçek Xiaomi'ye kuruldu**. İlk kurulum denemesi Android'in kendi güvenlik onayı yüzünden reddedildi (`INSTALL_FAILED_USER_RESTRICTED`) — bu, cihaz sahibinin USB kurulum onay diyaloğu; **atlanmadı**, operatör telefonda fiziksel olarak onayladı, sonra kurulum tekrar denendi ve başarılı oldu.

Uygulama başlatıldı (`am start`), çökme yok (logcat'te `FATAL EXCEPTION` yok), `topResumedActivity` uygulamayı gösterdi. Ekran içeriği `uiautomator dump` ile okundu:

```
AIOS Node Agent — vertical slice proof
device: Xiaomi 2210129SG
android: 15 (SDK 35)
abi: arm64-v8a
JNI self-check: PASS (matches Node.js golden vector)
hash: 44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a
node identity (native): node-b8d99c2ad719e02061731936fdcd4885c3bc2b667a447ff772d2ce6663186890
```

Bu, `desktop/observer.mjs`'in ürettiği hash ile **birebir aynı** — Node.js → Rust → JNI → gerçek cihaz zinciri boyunca kanonik gerçekliğin bölünmediğinin kanıtı.

### 4. Reversibility (ROLLBACK doktrininin OS-seviyesi alt kümesi)

`adb uninstall com.aios.nodeagent` → `Success`, `pm list packages | grep aios` → boş (iz bırakmadan temiz kaldırma doğrulandı). **Bu, Part 12'nin tam atomik installer/rollback modelinin kanıtı DEĞİL** — bu vertical slice'ta bir AIOS Installer/Updater yok, kurulum doğrudan `adb install`'dı. Gerçek atomik ACTIVE/ROLLED_BACK durum makinesi (04-INSTALL-UPDATE-ROLLBACK.md) hâlâ DESIGN_ONLY.

## Faz 2/3/10 kabul durumu (güncel)

```
NATIVE_CORE (host):          PASS — 8/8 test, golden-vector cross-language kanıt
NATIVE_CORE (Android, .so):  PASS — cross-compile edildi, cihazda bağımsız binary olarak çalıştırıldı
JNI_BRIDGE:                  PASS — gerçek kurulu uygulamadan, gerçek cihazda, doğru hash ile çağrıldı
RUNTIME_SERVICE:             DESIGN_ONLY — arayüz sözleşmesi tanımlı, gerçek kod yazılmadı (bu vertical slice'ın kapsamı dışında bırakıldı, bkz. gerekçe altta)
NODE_AGENT (tam):            DESIGN_ONLY — yalnızca kimlik hesaplama fonksiyonu (computeNodeIdentity) kanıtlandı, heartbeat/agent-card/capability dispatch yok
CONTROL_SURFACE (tam):       DESIGN_ONLY — MainActivity yalnızca kanıt metni gösteriyor, gerçek Compose/projeksiyon parite arayüzü yok
INSTALLER/ROLLBACK (AIOS modeli): DESIGN_ONLY — yalnızca OS-seviyesi adb install/uninstall reversibility kanıtlandı
PHYSICAL_DEVICE:              PASS — Xiaomi 2210129SG, gerçek APK, gerçek kurulum (operatör USB onayı ile), gerçek çalıştırma, gerçek gözlem, temiz kaldırma
```

## Neden burada durduk (bir sonraki adım için dürüst sınır)

Bu vertical slice, mission'ın "AIOS Core Native + Runtime Service + Node Agent + Artifact Manifest + Verification + Control Surface" listesinin **yalnızca en dar kesitini** gerçek koda çevirdi: native core + JNI + bir kanıt aktivitesi. Gerçek Runtime Service (heartbeat/lifecycle/WorkManager), tam Node Agent (agent-card.json sunumu, capability dispatch), ve Control Surface'ın PWA ile semantik parite kanıtı (`semanticSlotHash` eşitliği) — hepsi 08 belgesinin üstündeki arayüz sözleşmelerinde tanımlı ama **henüz yazılmadı**. Bunun nedeni kapsam disiplini: mission'ın kendisi "Do NOT open another architectural branch... This is ONE PRODUCTIZATION TASK" diyor — bu oturumda önce toolchain'i kurup tek bir uçtan uca kanıt üretmek, sonra genişletmeden önce raporlamak tercih edildi.
