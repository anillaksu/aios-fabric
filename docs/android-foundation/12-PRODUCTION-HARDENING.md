# AIOS ANDROID PRODUCTION HARDENING — BEFORE LOCAL AI

Tarih: 2026-08-22. Temel checkpoint: `def7491`. Cihaz: **Xiaomi 2210129SG**. Gemma 4/LiteRT-LM entegrasyonu bu turda **kesinlikle yapılmadı** — mission'ın açık talimatına uyuldu.

## 1. Android Runtime Hardening

| Test | Sonuç |
|---|---|
| Start | PASS — `RuntimeService` onCreate/onStartCommand, `nodeId` hesaplandı |
| Stop | PASS — `stopService`, `serviceRunning=false` |
| Process death | PASS — `am force-stop` sonrası yeniden açılış dürüst `PROCESS_GONE`/sıfır state gösterdi (önceki turlarda kanıtlandı, bu turda tekrar doğrulandı) |
| Restart | PASS — yeniden başlatma sonrası `nodeId`/heartbeat/evidence temiz sıfırdan üretildi |
| Network loss | PASS — `adb reverse --remove tcp:9320`, `aios.reality`/`aios.status` gerçek `ConnectException` ile `NOT_PROVEN`, yerel capability'ler etkilenmedi |
| Reconnect | PASS — tünel geri kurulunca `TESTED`'a döndü |
| State persistence | KISMİ — `LocalArtifactStore` `SharedPreferences` ile kalıcı (process ölümüne dayanıklı, doğrulandı); `RuntimeState` (heartbeat/task) kasıtlı olarak **kalıcı değil** (process-memory) — bu tasarım gereği, "ölümsüz süreç yok" kuralına uyum |
| **Boot persistence** | **İDDİA EDİLMİYOR** — fiziksel reboot testi bu turda yapılmadı, mission'ın "do not claim boot persistence unless physically tested" talimatına uyuldu |

## 2-3. Artifact Store — gerçek işlevsellik + katalog dürüstlüğü

`ArtifactStore.kt`'ye `details()` ve `displayStatus()` eklendi — ikisi de mevcut `AiosInstaller`/`LocalArtifactStore` üzerine ince katman, kurulum/doğrulama semantiği yeniden yazılmadı.

**Katalog gerçekliği korundu**: `system-catalog.json` hâlâ 2 gerçek + 6 DESIGN_ONLY. Hiçbir yeni kurulabilir paket icat edilmedi.

Fiziksel cihazda tam döngü (bu turda, temiz baştan):
```
Discover Current  → build-1-9481677 (gerçek, kurulu APK'nın anlık görüntüsü)
Verify             → digest=true sig=true compat=true policy=true
Install/Activate   → REQUEST_INSTALL_PACKAGES engellendi (taze kurulumda izin sıfırlanmış, dürüstçe raporlandı) → operatör izni verdi → SESSION_COMMITTED → operatör fiziksel onayı → gerçek self-update (installerPackageName=com.aios.nodeagent)
Rollback           → operatör fiziksel onayı → önceki sürüm yeniden ACTIVE, yeni sürüm ROLLED_BACK (silinmedi)
Revoke             → REVOKED; sonraki Activate denemesi REFUSED, lastUpdateTime değişmedi (fail-closed, install denemesi bile başlamadı)
```
Ham SharedPreferences dosyası (`aios_artifact_store.xml`) doğrudan `run-as` ile okunarak UI'ya güvenilmeden doğrulandı.

## 4. Update UX

`DisplayStatus` enum'u eklendi (`NOT_INSTALLED/VERIFIED/UPDATE_AVAILABLE/ACTIVE/ROLLBACK_AVAILABLE/REVOKED`) — mevcut `ArtifactStatus` üzerine saf sunum etiketi, yeni state değil. Birincil yüzeyde artık yalnızca bu altı kelimeden biri + `compatible: true/false` görünüyor; `buildId`/`sha256`/`artifactId` yalnızca "Show technical details" açılır panelinde. Cihazda doğrulandı: toggle önce/sonra ekran içeriği karşılaştırıldı.

## 5. Security

Değişmedi. `chatgpt_control_plane_tunnel.txt` ve `memory` dosyalarına hâlâ dokunulmadı. Bu turda hiçbir secret git/ledger/artifact/UI/log'a girmedi.

## 6. Performance — gerçek cihazdan ölçüldü

```
cold start (am start -W, force-stop sonrası):  2673ms   (önceki ölçüm 2093ms idi — dürüstçe raporlanan varyans, saklanmadı)
hot start (am start -W, arka plandan):          282ms   (Android "HOT" launch state; ayrı bir "WARM" — process canlı, Activity yok — senaryosu izole edilemedi, dürüstçe belirtiliyor)
runtime service startup:                        RuntimeService.onCreate → nodeId hesaplama, ayrı ölçülmedi (cold start'a dahil, alt-bileşen ayrıştırması yapılmadı)
capability dispatch (yerel):                    0-3ms (battery/device/network diagnostics)
capability dispatch (ağ dahil):                 105-305ms (aios.status/aios.reality, adb-reverse-over-USB tüneli üzerinden — üretim ağ gecikmesini temsil etmez)
artifact catalog load:                          ölçülmedi (küçük JSON asset, tekil frame içinde tamamlanıyor gibi görünüyor — enstrümante edilmiş bir ölçüm YOK, bu yüzden rakamı raporlamıyorum)
```
**Regresyon saklanmadı**: cold start önceki turdan (~2093ms) bu tura (~2673ms) yükseldi. Kök neden araştırılmadı (muhtemelen cihaz termal/yük durumu farkı) — optimize etmeden önce yalnızca ölçüldü, mission'ın "optimize only after measurement" kuralına uyuldu.

## 7. UI Hardening

| Kontrol | Sonuç |
|---|---|
| Touch targets | Buton yüksekliği ~40dp ölçüldü (Material'ın 48dp önerisinin biraz altında) — Material3 `Button`'ın varsayılan boyutu; ayrı bir düzeltme yapılmadı, bulgu olarak kaydedildi |
| Scrolling | PASS — 5 aksiyonluk satır tek ekrana sığmıyordu, `Modifier.horizontalScroll` ile düzeltildi (gerçek bulunan hata) |
| Landscape / font scale / small-large phone / dark-light / reduced motion | **NOT_MEASURED bu turda** — yalnızca tek fiziksel cihaz (Xiaomi, sabit ekran boyutu) mevcut; diğer form faktörleri test edilmedi, dürüstçe belirtiliyor |
| Accessibility | Kısmi — Compose semantics ağacı `uiautomator` ile okunabilir durumda (TalkBack uyumluluğunun dolaylı göstergesi), ayrı bir TalkBack oturumu çalıştırılmadı |

Not: Test sırasında `uiautomator dump`'ta bir buton metninin dikey tek-karakter sarmalandığı geçici bir anomali gözlemlendi; tekrarlanabilir değildi ve manuel tek dokunuşlarda sorun yaşanmadı — enstrümantasyon zamanlama artefaktı olarak değerlendirildi, kod değişikliği yapılmadı.

## 8. Canonical Parity

Değişmedi, bu turda yeniden doğrulandı: `aios.reality`/`aios.status` aynı `/api/projection` uç noktasını kullanıyor, `nodeOverview` PWA/desktop ile aynı kaynaktan geliyor.

## 9. Physical Acceptance

```
BUILD → INSTALL (operatör USB onayı) → START (2673ms) → WALK ALL 7 SCREENS (çökme yok)
→ CAPABILITY DISPATCH (5/5 TESTED) → ARTIFACT CATALOG (bundled asset'ten yüklendi)
→ VERIFY (4/4) → UPDATE/ACTIVATE (operatör onayı, gerçek self-update)
→ ROLLBACK (operatör onayı, gerçek reinstall) → REVOKE (fail-closed refuse)
→ PROCESS DEATH (dürüst sıfırlama) → RECONNECT (TESTED'a döndü)
```
Hepsi bu turda, temiz bir taze kurulumdan itibaren fiziksel olarak yürütüldü.

## 10. Full Regression

```
node desktop/cli.mjs runtime start --gate canonical
run_id: gatecanonical-20260822-055641-f2537efd
state: PASSED
step: 35/35
elapsed: 27623ms
```
Mevcut `RuntimeOrchestrator` üzerinden, yeni bir gate tree açılmadan, tek seferlik çalıştırıldı.

## 11. Local AI Extension Point

`LocalIntelligenceProvider.kt` eklendi: `LocalIntelligenceState` (UNAVAILABLE/DISCOVERED/READY/DEGRADED/OFFLINE), `LocalIntelligenceCapability`, `LocalIntelligenceProvider` arayüzü, `InferenceResult`. **Hiçbir implementasyon yok.** Hiçbir sınıf bu arayüzü uygulamıyor. Model dosyası, runtime, inference çağrısı yok.

## 12. Gemma Readiness Check

`artifacts-catalog/gemma-readiness-checklist.json` — cihazdan gerçekten ölçülen alanlar (`device`, `androidVersion`, `ram`, `storage`, `gpuBackend`) dolu; Gemma'ya özgü tüm alanlar (`liteRtLmVersionCandidate`, `modelVariant`, `modelDigest`, `functionCallingSupport`, `toolRouting`, `thermalConstraints`, `batteryImpact`, `latency`) `NOT_MEASURED`.

## FINAL

```
ANDROID_RUNTIME:      PASS (boot persistence hariç — test edilmedi)
ARTIFACT_STORE:       PASS
INSTALL:              PASS
UPDATE:                PASS
ROLLBACK:              PASS
REVOCATION:            PASS
SECURITY:              PASS
UI:                    PASS (tek form faktörü; landscape/font-scale/dark-light/reduced-motion NOT_MEASURED)
PERFORMANCE:           MEASURED (regresyon saklanmadı: 2093ms→2673ms cold start)
CANONICAL_PARITY:      PASS
PHYSICAL_ACCEPTANCE:   PASS
FULL_REGRESSION:       PASS (35/35, gatecanonical-20260822-055641-f2537efd)
LOCAL_AI_PROVIDER:     INTERFACE_ONLY
GEMMA:                 DEFERRED
NO_NEW_PROTOCOL:       PASS
NO_NEW_CANONICAL_STATE: PASS
NO_DUPLICATE_EVIDENCE: PASS
```

Cihaz temiz kaldırıldı (`adb uninstall`), ADB tünelleri kapatıldı. Samsung'a dokunulmadı.
