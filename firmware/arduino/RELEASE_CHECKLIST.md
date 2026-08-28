# AIOS — Kontrollü Pilot / Engineering Release Kontrol Listesi

Mevcut sınıflandırma:

```
Başlangıç prototipi         = Hayır
İleri mühendislik prototipi = Evet    (bu repo)
Gerçek entegrasyon          = S3 HIL sonrasında
Kontrollü pilot             = hedeflenen sonraki seviye
Production-ready            = henüz değil
```

Geçiş sırası: **(1) gerçek S3 hattını kanıtla → (2) dayanıklılık/güvenlik/yaşam döngüsü →
(3) sınırlı saha pilotu.** Fiziksel sonuçlar bu altyapı kapanmadan release kararı için
değil, manuel artifact olarak tutulur.

> **§1 Release altyapısı TAMAM** (2026-08-28): repo public → Actions çalışıyor → self-hosted
> runner (`aios-hil-01`) gerçek RA4M1'i CI'da flash edip 7-fazı koşturdu → `hil-proof`
> `master` için zorunlu check. PR #1 mergeable.
>
> **§6 + §7 non-fiziksel kısım TAMAM** (2026-08-28): `aios_key_lifecycle.*` +
> `aios_fw_lifecycle.*` modülleri eklendi, on-device **PHASE 8** (KL-01..10 +
> FW-01..12, 22/22 PASS) gerçek RA4M1'de koştu. Gate'ler:
> `AIOS_KEY_LIFECYCLE_SUITE=PASS`, `AIOS_FW_LIFECYCLE_SUITE=PASS`. Kalan §6/§7
> maddeleri (asimetrik imza + secure boot, gerçek çift-bank flash + bootloader
> entegrasyonu, bağımsız kriptografik inceleme) fiziksel/entegrasyon işi.

---

## 1. Release altyapısı

| # | İş | Çıkış kriteri | Durum |
|---:|---|---|---|
| 1 | Branch'e workflow push | Workflow repo'da | ✅ push edildi, **PR #1** açık |
| 1b | GitHub Actions çalışıyor | Workflow derleniyor (`startup_failure` yok) | ✅ repo public yapıldı |
| 2 | Self-hosted HIL runner | Runner online | 🟡 indirildi+kaydedildi (`aios-hil-01`, `C:ctions-runner-aios-hil`); **BAŞLAT:** `cd C:ctions-runner-aios-hil; .
un.cmd` (veya `.\svc.cmd install`) |
| 3 | İlk yeşil CI koşusu | `hil-proof` job PASS (fiziksel kart) | ✅ run 33186728296 success, `HIL PROOF: PASS`, `CONDITIONAL_PASS` |
| 4 | Branch protection | `hil-proof` zorunlu check | ✅ `master` → required check `hil-proof` (allow_force_pushes=false, allow_deletions=false) |
| 5 | Artifact retention | log, binary, commit SHA, report saklanır | ✅ `run_provenance.json` + workflow `upload-artifact` (30 gün) |

## 2. Gerçek S3 HIL — ana blocker

Prosedür: `BRIDGE_S3_E2E_PLAN.md`. Önce **smoke** (`-DAIOS_BRIDGE_SMOKE`: T0/T1/T2/T6 + T8
golden), sonra tam koşu.

Gerçek-S3 gate = `PASS` için TÜM koşullar:

```
BRIDGE_LINK_MODE            = phys-S3        (probe: aios_bridge_probe_s3)
BRIDGE_FALLBACK_USED        = 0              (--expect-s3 ile hard-gate'li)
s3 hello/identity           = AIOS_S3_BRIDGE_READY chip_id/sdk/fw görülür
firmware ID                 = fw=aios-s3-bridge-0.1  (beklenen)
golden vectors              = MATCH tools/golden_vectors.txt
9/9 bridge testi            = passed=1
T8 (S3 status vs golden)    = her sınıf eşit
iki taraflı log             = tam (R4 + s3_side.log)
```

- `PHASE_7_REAL_S3_SILICON_E2E = PASS` (hepsi geçerse)
- `= FAIL` (herhangi bir test gerçek hatta başarısız **veya** fallback kullanıldı)
- `= PENDING` (S3 bulunamadı **ve** `--expect-s3` verilmedi)

**Durum:** ⏳ — S3 skeleton derlendi (EXIT 0), fiziksel hat kurulmadı.

## 3. Tekrarlanabilirlik / bağlantı dayanıklılığı

`./aios-verify.sh --port <P> --expect-s3 --repeat 10` → `soak_summary.json`
(`same_software_and_transport` kontrolü dahil).

| Kontrol | Eşik | Harness desteği |
|---|---|---|
| Ardışık tam koşu | ≥ 10, başarısız = 0 | ✅ `--repeat N` |
| Koşu öncesi RA4M1 reset | her koşu | ✅ (re-flash = reset); RSTSR loglanır |
| S3 reset | her koşu | ⏳ fiziksel — plan'da manuel adım |
| UART disconnect/reconnect | recovery | ⏳ fiziksel |
| Timeout sonrası retry | T5 | ✅ |
| Yarım frame sonrası yeni frame | T2 + T7 | ✅ |
| CRC hatası sonrası recovery | T4 + T7 | ✅ |
| Replay window sınırları | T6 + golden replay | ✅ (16-slot) |
| Uzun fault-storm sonrası normal trafik | T7 (100→10) | ✅ (fiziksel hatta genişletilecek) |

Çıkış: `başarısız=0, deadlock=0, hang=0, sessiz frame kaybı=0, beklenmeyen fallback=0`
— hepsi `run_provenance_*.json` + `soak_summary.json`'da izlenir.

## 4. Soak / güç / reset

⏳ **Fiziksel — henüz yapılmadı.** Yazılı eşikler (gereksinim dokümanına göre ayarlanır):

```
8–24 saat soak
≥ 1000 reset/reconnect döngüsü
≥ 100000 frame
0 sessiz veri bozulması · 0 kilitlenme · 0 açıklanamayan watchdog reseti
```

## 5. Protokol güvenliği / kaynak tüketimi

Mevcut: PHASE 2 (6 mutasyon) + PHASE 6 (chaos MUT-07..13) + PHASE 7 T3/T4/T8 — hepsi
**link-model**. ⏳ Fiziksel S3 hattında tekrar + ek ölçüm:

```
CPU kullanım sınırı · maks frame işleme süresi · maks retry süresi
replay window kaynak maliyeti · hatalı istemci sistemi kilitleyemez
```
Çıkış: hatalı giriş → sınıflandırılmış hata **+** state bozulmaz **+** sonraki geçerli
frame kabul **+** kaynak sınırlı.

## 6. Kripto / anahtar yaşam döngüsü

Mevcut: PHASE 4 (SCE5 TRNG + on-device NIST subset) + PHASE 5 (hash-DRBG) +
off-device `nist_sts_lite` (~1M bit, 11/11) + **PHASE 8 key lifecycle**
(`aios_key_lifecycle.*`, KL-01..10, gerçek RA4M1'de 10/10 PASS):

```
[x] ilk seed üretimi (TRNG)         KL-01  aios_seed_generate
[x] seed saklama / yeniden üretim   KL-03  seal + deterministik re-derive
[x] reset sonrası DRBG state        KL-04  aios_drbg_from_seed (+ reseed sayacı)
[x] anahtar üretimi + provisioning  KL-05  aios_key_derive (label/epoch)
[x] anahtar rotasyonu               KL-06  aios_key_rotate (monotonik epoch floor)
[x] eski/geçersiz anahtar davranışı KL-06/07/08  STALE / FUTURE reddi
[x] flash dump / transplant         KL-02  seal UID'e bağlı -> başka cihazda UNSEALED
[x] debug arayüzü üretimde kapalı   KL-09  production_lock -> raw export LOCKED
[x] factory reset                   KL-10  seed zeroize -> NOT_PROVISIONED
[ ] tehdit modeli + bağımsız kriptografik inceleme        (dış iş)
[ ] asimetrik imza / secure boot ile bağlama              (üretim gereksinimi)
```
> DÜRÜST KAPSAM: authenticator simetrik MAC (aios_fast_hash64, HMAC-benzeri) —
> asimetrik kod imzalama / donanım secure boot DEĞİL. Güvenilir provisioning
> kanalı olan kontrollü lab pilotu için yeterli; üretim OTA'sı için asimetrik
> imza + ölçülen boot zinciri + rollback-korumalı fuse gerekir.
> NIST STS PASS tek başına CSPRNG güvenliği kanıtı değildir.

## 7. Firmware yaşam döngüsü — ✅ mantık katmanı uygulandı (PHASE 8)

`aios_fw_lifecycle.*` + PHASE 8 FW-01..12, gerçek RA4M1'de **12/12 PASS**:

```
[x] firmware version negotiation   FW-01  aios_fw_negotiate (compat aralığı)
[x] uyumsuz sürüm reddi            FW-01  aralık dışı -> INCOMPAT
[x] güvenli güncelleme (auth)      FW-02  aios_fw_stage (MAC + CRC + nonce)
[x] imza (MAC) doğrulaması         FW-03/04/05  bozuk gövde / manifest / anahtar -> SIG
[x] yarım kalan update recovery    FW-08/FW-11  truncation -> CRC; power-loss -> aios_fw_resume
[x] rollback                       FW-10  sağlık başarısız -> known-good'da kal
[x] eski/replay update reddi       FW-06  downgrade -> DOWNGRADE; FW-07  nonce -> NONCE
[x] boot-loop koruması             FW-12  N denemeden sonra otomatik rollback
[x] factory reset davranışı        aios_fw_factory_reset (anti-downgrade floor korunur)
[ ] gerçek çift-bank flash + bootloader entegrasyonu      (donanım entegrasyonu)
[ ] asimetrik imza + secure boot zinciri                  (üretim gereksinimi)
```
> DÜRÜST KAPSAM: A/B "slot"lar RAM'de manifest kayıtları — flash düzenini
> modelliyor. Gerçek dual-bank flash + bootloader'a bağlamak ayrı entegrasyon.
> Kontrollü lab/pilot: **evet**. Sahada asimetrik-imzalı OTA'lı ürün: **hayır**.

## 8. Performans / sınır

`~380 kB/s · ~84 µs/frame` = **link-model benchmark** (gerçek S3'te yeniden ölçülecek).
Harness artık yapısal rapor veriyor:

```
PERF <transport> frames= errors= throughput_bytes_s= lat_avg_us=
     lat_p50_us= lat_p95_us= lat_p99_us= lat_max_us=
```
⏳ Fiziksel S3: retry altında latency · fault-storm toparlanma süresi · maks sürdürülebilir
trafik · en kötü boyutlu frame · soak sırasında drift.

## 9. Kontrollü pilot için minimum paket

```
[ ] Real S3 E2E PASS
[ ] 9/9 fiziksel bridge testi PASS
[ ] 10 ardışık temiz HIL koşusu
[ ] 8–24 saat soak
[ ] reset/reconnect/power-cycle testleri
[ ] fiziksel fault/chaos testleri
[ ] performans sınırları ölçülmüş (p50/p95/p99)
[ ] CI branch protection aktif
[ ] binary + commit + firmware ID + log artifact'leri arşivlenmiş   (✅ run_provenance.json)
[ ] bilinen sınırlamalar belgelenmiş                                 (✅ HARDWARE_PROOF.md §2, report openItems)
[ ] rollback / kurtarma prosedürü mevcut                             (⏳ §7)
```

Tamamlanınca: **`AIOS = kontrollü pilot / engineering release için kullanılabilir`**.
Genel tüketici/üretim için ayrıca: provisioning, update/rollback, çevresel test,
güvenlik incelemesi, üretim varyasyonu testleri.
