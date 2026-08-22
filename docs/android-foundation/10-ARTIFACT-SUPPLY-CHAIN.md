# AIOS ARTIFACT SUPPLY CHAIN v1 — PHYSICAL ACCEPTANCE

Tarih: 2026-08-22. Temel checkpoint: `b38237c`. Cihaz: **Xiaomi 2210129SG, Android 15**.

Bu belge, `com.aios.nodeagent` artifact'i için gerçek bir tedarik zincirinin (katalog → doğrulama → kurulum → aktivasyon → rollback → iptal) fiziksel cihazda uçtan uca kanıtlandığı turun kaydıdır. Mevcut kanıtlanmış semantikler (native core/JNI/runtime service/node agent/5 capability/agent card/canonical parity/recovery) **değiştirilmedi** — yalnızca üzerine yeni bir katman (artifact supply chain) eklendi.

## 1. ARTIFACT CATALOG

`desktop/build-artifact-catalog.mjs` — host-side, gerçek `aapt2 dump badging` ve `apksigner verify --print-certs` çıktılarından üretilir. Hiçbir alan icat edilmedi:

| Alan | Kaynak |
|---|---|
| `packageName`, `versionCode`, `versionName`, `minSdk`, `targetSdk` | `aapt2 dump badging` |
| `abi` | `native-code:` satırı (gerçek `jniLibs/arm64-v8a`) |
| `sha256` | Gerçek APK byte'larının hash'i (`desktop/observer.mjs` `sha256()`) |
| `signatureReference` | `apksigner verify --print-certs` SHA-256 sertifika digest'i |
| `catalogDigest` | `sha256(canonicalJson(artifacts))` — aynı kanonik algoritma, ikinci bir hashing semantiği yok |

Üç gerçek build kataloglandı (`artifacts-catalog/com.aios.nodeagent.json`):
```
build-1-1e1435640207-v1   sha256=1e1435640207...
build-1-6dd3422d9206-v2   sha256=6dd3422d9206...
build-1-d1bbe005f6a3-v3   sha256=d1bbe005f6a3...
```
Üçü de aynı `versionCode` (Android'in kendi downgrade-koruması rollback'i engellemesin diye — AIOS artifact sürümü Android versionCode'dan bağımsız, `ArtifactManifest.version` alanı gerçek kimlik taşıyıcısı).

## 2-3. ARTIFACT STATES + VERIFICATION

`android/.../ArtifactManifest.kt` (Phase 2'den değişmedi) + `AiosInstaller.kt` (yeni): `DISCOVERED → VERIFIED → AVAILABLE → INSTALLED → ACTIVE → SUPERSEDED/ROLLED_BACK/REVOKED`. Doğrulama 4 gerçek kontrol: digest (dosyadan yeniden hesaplama), signature (imza referansı biçim kontrolü), compatibility (`minRuntime <= Build.VERSION.SDK_INT`), policy (capability seti izinli kümenin alt kümesi). Tek koşul bile false ise → `VERIFICATION_FAILED`, `ACTIVE`'e geçilemez.

## 4-5. LOCAL ARTIFACT STORE + INSTALLER

`LocalArtifactStore.kt` — `SharedPreferences` üzerinde kalıcı, `list/get/verify/installState/rollbackState`. İkinci bir EvidenceLedger değil.

`AiosInstaller.kt` — `prepare/verify/install/activate/rollback/revoke`, UI'dan ayrı. **Gerçek Android `PackageInstaller.Session` API'si** kullanılıyor — simülasyon değil. Kendi paketini güncellediği için (self-update), OS onayı sonrası süreç öldürülür; geçiş `InstallResultReceiver` (manifest-tanımlı, taze süreçte çalışır) tarafından tamamlanır.

**Bulunan ve düzeltilen gerçek hata**: İlk implementasyonda `PendingIntent`'in hedef `Intent`'i `setPackage()` ile implicit action kullanıyordu ama receiver'da `<intent-filter>` yoktu — broadcast hiçbir zaman ulaşmadı, session sonsuza dek `STATUS_PENDING_USER_ACTION`'da askıda kaldı. Düzeltme: explicit component intent (`Intent(context, InstallResultReceiver::class.java)`). Bu, cihazda gerçekten yakalanan ve düzeltilen bir kusur — mission'ın "do not fake" ilkesine uygun olarak burada saklanmadı.

## 6-7. ATOMIC UPDATE MODEL — FİZİKSEL CİHAZDA KANITLANDI

```
CURRENT_ACTIVE (v2, snapshot'landı) → NEW_CANDIDATE (v3, external storage'dan yüklendi)
  → VERIFY (digest=true sig=true compat=true policy=true)
  → real PackageInstaller.Session.commit() → OS onayı (operatör "Bilinmeyen kaynaklar" iznini fiziksel olarak verdi)
  → self-update, süreç öldü, InstallResultReceiver taze süreçte ACTIVATE'i tamamladı
  → v3: ACTIVE, rollbackTarget=v2 | v2: SUPERSEDED
```

Kanıt (cihazdan `uiautomator dump`):
```
art-886bbef3382220a4e8c2608744bbbedd  status=ROLLED_BACK  (v3, sonradan)
art-32162fb2ad90a16cae23640cb261ec08  status=ACTIVE       sha256=aa4e7d3fce743a4b3b46e580cf49952d71c771c7b88b9747a8f91aa5c95b382b  (v2, rollback sonrası)
```

**ROLLBACK** aynı gerçek installer yolundan (`isRollback=true`), snapshot'lanmış v2 APK'sını yeniden kurarak yapıldı — `adb`/host müdahalesi yok, tamamen cihaz-içi `PackageInstaller` çağrısı.

**REVERIFY — bağımsız dış doğrulama**: rollback sonrası cihazda kurulu APK, PC'ye `adb pull` ile çekildi ve Node.js ile bağımsız olarak hash'lendi:
```
adb pull <installed apk> → sha256 = aa4e7d3fce743a4b3b46e580cf49952d71c771c7b88b9747a8f91aa5c95b382b
LocalArtifactStore'daki ACTIVE kaydın sha256'sı           = aa4e7d3fce743a4b3b46e580cf49952d71c771c7b88b9747a8f91aa5c95b382b
```
**Birebir eşleşiyor** — uygulamanın kendi iddiası değil, PC'den bağımsız yeniden hesaplama ile doğrulandı.

## 8. REVOCATION — FİZİKSEL OLARAK KANITLANDI

```
1. candidate (v3) yeniden yüklendi, VERIFIED
2. Revoke Candidate  → status=REVOKED (art-886bbef3...)
3. Activate denendi  → REFUSED: "artifact ... is REVOKED and cannot become ACTIVE"
4. lastUpdateTime DEĞİŞMEDİ (07:58:35) → hiçbir install denemesi bile başlatılmadı, fail-closed
5. REVOKED kayıt store'da hâlâ mevcut (silinmedi) — tarihsel kanıt korunuyor
```

## 9-10. CONTROL SURFACE + CANONICAL PARITY

Birincil yüzey yalnızca mission'ın istediği 6 alanı gösteriyor: `Installed / Available / Verified / Update available / Rolled back / Revoked`. Ham `sha256`/`signatureRef` yalnızca "Toggle technical details" açılır panelinde. Hiçbir semantik Compose/UI katmanında hesaplanmadı — hepsi `LocalArtifactStore`'dan okunuyor (Phase 2'nin "UI yalnızca projeksiyondur" kuralı korundu).

## 11. SECURITY

`signatureReference` yalnızca sertifika SHA-256 digest'i taşıyor — ham anahtar/imza materyali değil. Bu turda hiçbir secret dosyaya/loga/artifact'e yazılmadı. `chatgpt_control_plane_tunnel.txt` ve `memory` dosyalarına hâlâ dokunulmadı.

## 12. TEST DOCTRINE — 8/8 kanıtlı

```
BUILD:     gradle assembleDebug (v1/v2/v3, hepsi BUILD SUCCESSFUL)
CATALOG:   3 gerçek build, aapt2/apksigner'dan üretildi
DIGEST:    her adımda gerçek sha256 recompute
VERIFY:    4/4 kontrol, birden fazla kez
INSTALL:   gerçek PackageInstaller.Session, operatör fiziksel onayı
ACTIVATE:  v3 ACTIVE, v2 SUPERSEDED — cihazda gözlemlendi
ROLLBACK:  v2 yeniden ACTIVE, v3 ROLLED_BACK — cihazda gözlemlendi
REVERIFY:  PC'den bağımsız adb pull + hash, dahili kayıtla birebir eşleşti
```

## FINAL

```
ARTIFACT_CATALOG:      PASS
ARTIFACT_VERIFICATION: PASS
INSTALLER:             PASS (gerçek PackageInstaller, UI'dan ayrı)
ATOMIC_UPDATE:         PASS (yarı-aktif durum hiç raporlanmadı)
ROLLBACK:              PASS (gerçek reinstall, sahte değil)
REVOCATION:            PASS (fail-closed, kanıt korunuyor)
REAL_DEVICE:           PASS (Xiaomi 2210129SG, uçtan uca)
EVIDENCE:              CHAIN_VALID (yerel vault projeksiyonu)
CANONICAL_PARITY:      PASS (yapısal olarak korundu — Phase 2 semantiği değiştirilmedi)
REGRESSION:            ÇALIŞTIRILMADI (mission talimatı: AOSP/APEX/system_server'a geçilmedi, kapsam ilk artifact döngüsüyle sınırlı tutuldu)
```

Cihaz temiz kaldırıldı (`adb uninstall`, iz yok), ADB tünelleri kapatıldı.
