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

---

## 1. Release altyapısı

| # | İş | Çıkış kriteri | Durum |
|---:|---|---|---|
| 1 | Branch'e workflow push | Workflow repo'da | ✅ push edildi, **PR #1** açık |
| 1b | GitHub Actions çalışıyor | Workflow derleniyor (`startup_failure` yok) | ✅ repo public yapıldı |
| 2 | Self-hosted HIL runner kaydı | Runner `[self-hosted, aios-hil]` | ⏳ kullanıcı — `HIL_CI_SETUP.md §2` |
| 3 | Temiz checkout CI koşusu | 2 sketch compile + sync `--check` + proof PASS | ✅ lokal doğrulandı (`git archive` → compile EXIT 0 ×2); CI = 1b sonrası |
| 4 | Branch protection | `hil-proof` zorunlu check | ⏳ 1b + runner + ilk yeşil koşu sonrası — `gh api` komutu hazır |
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
off-device `nist_sts_lite` (~1M bit, 11/11). ⏳ Ürün süreçleri:

```
[ ] ilk seed üretimi          [ ] seed saklama / yeniden üretim
[ ] reset sonrası DRBG state   [ ] anahtar üretimi + provisioning
[ ] anahtar rotasyonu          [ ] eski/geçersiz anahtar davranışı
[ ] flash dump / fiziksel erişim senaryosu
[ ] debug arayüzleri üretim modunda kapalı
[ ] tehdit modeli + bağımsız kriptografik inceleme
```
> NIST STS PASS tek başına CSPRNG güvenliği kanıtı değildir.

## 7. Firmware yaşam döngüsü — ⏳ hiçbiri uygulanmadı

```
[ ] firmware version negotiation   [ ] uyumsuz sürüm reddi
[ ] güvenli güncelleme             [ ] imza doğrulaması
[ ] yarım kalan update recovery    [ ] rollback
[ ] eski/replay update reddi       [ ] factory reset davranışı
```
Bu kapanmadan: kontrollü laboratuvar/pilot **evet**, saha güncellemeli ürün **hayır**.

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
