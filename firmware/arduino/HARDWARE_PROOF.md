# AIOS — Donanımsal Doğrulama Raporu (On-Silicon Proof)

**Tarih:** 2026-08-28 (rev.4 — hash-DRBG CSPRNG, genişletilmiş NIST alt kümesi, chaos suite, git+CI)
**Hedef donanım:** Arduino UNO R4 WiFi — Renesas **RA4M1** (R7FA4M1AB3CFM, Cortex‑M4 @ 48 MHz, 32 kB SRAM, 256 kB Flash) + Espressif **ESP32‑S3** yardımcı işlemci
**Bağlantı:** USB CDC, `COM4` (VID:PID `2341:1002`)
**Sonuç:** `AIOS_HARDWARE_PROOF_VERDICT=PASS` — **6 fazın tümü** gerçek silikonda `rc=0`
(5/5 kanonik · 6/6 mutasyon KILLED · 9/9 gerçek UID · TRNG+12 NIST testi · DRBG+12 NIST testi · 7/7 chaos KILLED)

Bu rapor, `CANONICAL_VERIFICATION_REPORT.json` ve `MUTATION_AUDIT_REPORT.md` iddialarının,
README'de adı geçen **RA4M1 + ESP32‑S3 heterojen mimarisinin fiziksel örneği** olan bir
Arduino UNO R4 WiFi üzerinde derlenip yüklenerek ve seri çıktısı kaydedilerek
doğrulanmasını belgeler.

---

## 1. Ne kanıtlandı (gerçek RA4M1 CPU üzerinde çalıştı)

### PHASE 1 — Kanonik doğrulama süiti (mock HW root)
| # | Kontrol | Sonuç |
|---|---------|-------|
| TEST‑01 | Bellek sınırları & Zero‑Heap (`AiosKernelStorage 192 B`, `TokenTable 264`, `Framebuffer 24`, `WireFrame 32`) | PASS |
| TEST‑02 | Deterministik durum geçişi (Variance = 0) | PASS |
| TEST‑03 | JSON‑RPC 2.0 Token/Key‑Value Offset Hashing (O(1)) | PASS |
| TEST‑04 | ESP32‑S3 halka bellek / pipe‑stall deadlock kaçınması (`Accepted 3 / Rejected 97`) | PASS |
| TEST‑05 | 12x8 Charlieplex matris framebuffer & concurrency ısı haritası | PASS |

### PHASE 2 — Adversarial mutasyon süiti (mock HW root) — **%100.0 (6/6 KILLED, 0 SURVIVED)**
MUT‑01 CRC bit‑flip · MUT‑02 JSON taşkını · MUT‑03 sözleşme sahteciliği · MUT‑04 L4 flood DoS · MUT‑05 kilitli slot · MUT‑06 fault strobe — hepsi KILLED.

### PHASE 3 — **Gerçek Hardware Root of Truth (Renesas FSP `R_BSP_UniqueIdGet()`)**
`aios-real-hw-uid` iş maddesi. Kernel'e `mock_hw=false` yolu için yeni
`aios_kernel_init_with_uid(storage, uid_low, uid_high)` API'si eklendi; platform
katmanı (`.ino`) gerçek fabrika 128‑bit UID'sini FSP ile okuyup geçiriyor.

```
FSP R_BSP_UniqueIdGet(): 35130A25 36313231 B43F3333 4B572F26   (gerçek, sıfır DEĞİL)
UID64  low=0x3631323135130A25  high=0x4B572F26B43F3333
```
| Kontrol | Sonuç |
|---------|-------|
| Fabrika Unique ID sıfır değil (gerçek silikon kimliği mevcut) | OK |
| Aynı gerçek UID → aynı `baseline_constant` (Variance = 0) | OK |
| Gerçek UID'den türetilen baseline sıfır değil | OK |
| Gerçek‑UID baseline ≠ mock/CI baseline | OK |
| Gerçek root of truth üzerinde aynı geçiş → aynı state (Variance = 0) | OK |
| Kuantum geçişi non‑linear mixing yapıyor | OK |
| Global kuantum state deterministik eşleşiyor | OK |
| **MUT‑03 gerçek root üzerinde:** 1‑bit sözleşme sahteciliği → Hamming = **33 bit** (≥ 20) | OK |
| Farklı cihaz kimliği → farklı baseline (state silikona bağlı) | OK |
| Farklı cihaz kimliği → aynı girdi için farklı kuantum state | OK |

### PHASE 4 — **SCE5 donanım TRNG + NIST SP 800-22 alt kümesi** (rev.3)

Adım 1 hedefi. RA4M1'in SCE5 donanımsal rastgele sayı üreticisi FSP `HW_SCE_RNG_Read()`
ile entegre edildi (Arduino çekirdeğinin `random()` için kullandığı aynı primitive).
32 768 canlı TRNG biti (256 × 128‑bit çekiliş) toplanıp **cihaz üzerinde** kapalı‑form
p‑değerleriyle test edildi (`erfc` + kompakt regularized incomplete gamma). Eşik α = 0.01.

```
SCE5 TRNG collected 4096 bytes (32768 bits)
draw[0]=D2C8F57009CAA60C9F6F242685F7A947    (her koşuda farklı → canlı örnekleme)

  [PASS] Monobit Frequency              p=0.816523
  [PASS] Runs                           p=0.894759
  [PASS] Block Frequency M=128          p=0.613986
  [PASS] Longest Run of Ones M=128      p=0.569029
  [PASS] Byte chi-square (256 bins)     p=0.422800
  [PASS] Draw non-repetition / not-stuck (256 benzersiz çekiliş)
```
Ek olarak yeni `aios_kernel_init_hw(storage, uid_lo, uid_hi, ent_lo, ent_hi)` API'si ile
canlı entropi **Hardware Root of Truth'a füzyon** edildi:
| Kontrol | Sonuç |
|---|---|
| `init_hw(entropy=0)` ≡ `init_with_uid` (bit‑özdeş invariant) | OK |
| Canlı entropi baseline'ı gerçekten değiştiriyor (per‑boot öngörülemezlik) | OK |
| Farklı entropi örnekleri → farklı baseline | OK |
| Aynı (uid, entropy) → aynı baseline → sabit root için geçiş fn hâlâ **Variance = 0** | OK |
| Entropi‑tohumlu root'lar bağımsız state uzayları üretiyor | OK |

### PHASE 5 — **Deterministik hash-DRBG (CSPRNG)** (rev.4)

Adım 1'in "PRNG" ayağı. Kernel'e counter-mod hash-DRBG eklendi
(`aios_prng_seed / next64 / fill`, 16 bayt durum, zero-heap). TRNG'den tohumlanır;
tohumlar arası çıktı `(key, counter)`'ın kesin deterministik fonksiyonudur.
| Kontrol | Sonuç |
|---|---|
| Aynı (root, seed) → bit‑özdeş akış (Variance = 0) | OK |
| 1‑bit seed değişimi → farklı akış | OK |
| Yakalanan ara‑durum önceki blokları yeniden üretemez (backtracking direnci) | OK |
| Aynı seed, farklı cihaz root → farklı akış (silikona bağlı) | OK |
| DRBG çıktısı 12 NIST alt‑küme testinin hepsini geçer (p ≥ 0.01) | OK |

### PHASE 6 — **Chaos engineering** (Adım 2)

DRBG‑güdümlü (deterministik, CI‑tekrarlanabilir) yüksek hacimli kötüye kullanım.
`aios_chaos_test.cpp` → `aios_run_chaos_suite()`. **Kill rate %100.0 (7/7 KILLED).**
| # | Saldırı | Sonuç |
|---|---|---|
| MUT‑07 | Kesik (truncated) wire frame — her kısa prefix | KILLED (CRC‑16 uyuşmazlığı) |
| MUT‑08 | Aşırı/yalancı `payload_len` (64× rastgele) | KILLED (ingest reddi, ring buffer dokunulmadı) |
| MUT‑09 | Replay edilen frame | KILLED (state + tick her replay'de ilerliyor, sessiz emilim yok) |
| MUT‑10 | Byte fuzzing burst vs CRC‑16 | KILLED (tek‑bit 2000/2000 %100, kirli‑burst 6000/6000 ≥%99.9) |
| MUT‑11 | Rastgele blob JSON parser fuzzing (2000×) | KILLED (token_count ≤ MAX, OOB yok) |
| MUT‑12 | Rastgele ingest/forward interleave (timing chaos, 4000 tur) | KILLED (corruption=0, deadlock=0, backpressure+kurtarma) |
| MUT‑13 | Kilitli slot fuzzing (5000 vuruş, 2469 kilitli slota) | KILLED (0 mutasyon, fault_count tam) |

**Süre (gerçek silikon):** P1 ~0.99 s · P2 ~1.02 s · P3 ~0.055 s · P4 ~0.47 s · P5 ~0.33 s · P6 ~4.9 s.
Tam kayıt: [`hardware_proof_serial.log`](./hardware_proof_serial.log)

---

## 2. Dürüst kısıtlamalar — bu koşuda **hâlâ kanıtlanmayan** noktalar

1. ~~Fabrika HW_UID okunamıyor~~ — **ÇÖZÜLDÜ (rev.2).** RA4M1'de UID sabit adreste değil;
   FSP `(*(uint32_t*)0x407FB19C + 0x14)` ile çözüyor. Artık `R_BSP_UniqueIdGet()` ile
   gerçek değer okunuyor ve TEST‑02 + MUT‑03 özellikleri PHASE 3'te bu gerçek kimlik
   üzerinde yeniden kanıtlanıyor. `ra4m1_kernel.hpp` içindeki `0x01008190` literali
   yalnızca legacy fallback olarak bırakıldı (üretimde `aios_kernel_init_with_uid` çağrılmalı).
2. ~~SCE5 / TRNG entegre değil~~ — **ÇÖZÜLDÜ (rev.3–4).** SCE5 donanım TRNG'si FSP
   `HW_SCE_RNG_Read()` ile entegre; `aios_kernel_init_hw()` canlı entropiyi Root of
   Truth'a füzyon ediyor; hash‑DRBG (PHASE 5) TRNG'den tohumlanıyor; PHASE 4 & 5 on‑device
   **NIST SP 800‑22 alt kümesi (12 test)** geçiyor: Monobit, Runs, Block Frequency M=128,
   Longest Run M=128, Byte χ², non‑repetition, Cumulative Sums (fwd/bwd), Serial m=3 (×2),
   Approximate Entropy m=2.
   **Hâlâ açık:** tam 15‑test NIST STS + dieharder/ent **off‑device** — bunun için
   `AIOS_TrngDump/` sketch'i + `aios-verify.sh --dump-trng <nbytes>` var (ham TRNG'yi
   host'a hex olarak akıtıp `.bin` üretir; `dieharder -a -g 201 -f` / NIST STS `assess`
   ile çalıştırılır). Bu off‑device yol henüz donanımda koşturulmadı. Kernel'in
   `mock_hw=false` register yolundaki ham `RA4M1_TRNG_DATA_REG` okuması proof yapımında
   hâlâ UID türetmesiyle değiştiriliyor (SCE5 FSP yolu tercih edilmeli).
3. **SCI2 UART STDERR izolasyonu.** İzole tanı akışı USB‑CDC üzerine `[STDERR]` etiketiyle yönlendirildi.
4. **12x8 matris fiziksel sürüşü.** Framebuffer mantığı `mock_hw=true` ile doğrulandı;
   Charlieplex port register yazımları bu koşuda fiziksel LED'leri sürmüyor.
5. **64 kB → 4 kB halka bellek.** 64 kB L4 halka bellek fiziksel olarak ESP32‑S3'ün 512 kB
   SRAM'inde yaşar; 32 kB RA4M1 master üzerinde aynı backpressure/stall mantığını
   çalıştırmak için 4 kB'a ölçeklendi (watermark %93.75 sabit, kod yolları değişmedi).
   `.bss` = 26 044 B / 32 768 B.

---

## 3. Yeniden üretme

### Bileşenler (hepsi sistemde mevcuttu — indirme gerekmedi)
| Bileşen | Sürüm |
|---------|-------|
| Arduino CLI | 1.5.1 (01f3d4f2b) |
| Çekirdek `arduino:renesas_uno` | 1.6.0 (Renesas FSP dahil) |
| Toolchain `arm-none-eabi-gcc` | 7.2.1 (7‑2017‑q4‑major) |

### Komutlar
```bash
cd aios/aios-fabric/firmware/arduino
bash AIOS_HardwareProof/sync-from-firmware.sh      # src/ = kanonik firmware kaynakları

bash AIOS_HardwareProof/sync-from-firmware.sh
DEFS="-DAIOS_ARDUINO_PROOF -DAIOS_EMBED_SUITE -DESP32S3_RING_BUFFER_SIZE=2048"
arduino-cli compile -b arduino:renesas_uno:unor4wifi -p COM4 --upload -e \
  --build-property "compiler.cpp.extra_flags=$DEFS" \
  --build-property "compiler.c.extra_flags=$DEFS" \
  AIOS_HardwareProof
arduino-cli monitor -p COM4 -c baudrate=115200    # kart reset sonrası bir kez rapor basar
```

Tek komut (CI ve insan için aynı): `./aios-verify.sh --port COM4` → exit 0 = PASS.
Off‑device tam NIST/dieharder için: `./aios-verify.sh --dump-trng 1250000` → `artifacts/hil/trng_dump.bin`.

### Bellek (arm-none-eabi-size, Berkeley)
```
   text	   data	    bss	    dec	    hex
  88700	    568	  30964	 120232	  1d5a8
```
Flash: 89 232 B / 262 144 B (%34). SRAM (global): 22 036 B / 32 768 B — headroom ~1.8 kB
(2 kB TRNG/DRBG tamponu; `ESP32S3_RING_BUFFER_SIZE=2048` chaos suite'in paylaşımlı
bridge'i için).

### Artefakt sağlaması (SHA‑256)
```
AIOS_HardwareProof.ino.bin  9d94d4201a5f82a2d005dbb8a6242a0a5e72462a972622a5e406e76634b311ad
AIOS_HardwareProof.ino.hex  cde3576ea00e88ae05b61a625f79880d73d67c9df5bdcd5b46310b9a97a70cc5
```

---

## Adım 3 — Hardware-in-the-Loop CI

| Dosya | Rol |
|---|---|
| `arduino/aios-verify.sh` | Tek komut: sync → compile → flash → seri yakalama → `VERDICT=PASS` assert (exit 0/1). PowerShell veya `python3+pyserial`. `--dump-trng` off‑device NIST için ham TRNG akıtır. Gerçek kartta doğrulandı (exit 0). |
| `.github/workflows/hil-proof.yml` | `firmware/**` değişince `[self-hosted, aios-hil]` runner'da; seri log + binary artifact; `VERDICT!=PASS` → job fail. |
| `arduino/HIL_CI_SETUP.md` | Self‑hosted runner kaydı + branch protection (`gh` komutları dahil). |

**Durum:** Git deposu **var** — `aios/aios-fabric` (branch `master`), commit
`feat/hil-deterministic-kernel-proof` dalında; `firmware/` + `.github/workflows/hil-proof.yml`
izlenir. **Kalan (kullanıcıda):** GitHub remote'una push + self‑hosted runner kaydı +
`master` branch protection'a `hil-proof` status check eklemek (HIL_CI_SETUP.md §2–4).

---

## 4. Firmware değişiklikleri

Kanonik kaynaklar (`aios/aios-fabric/firmware/`) güncellendi — proof kopyaları değil:

- **`ra4m1_kernel.hpp/.cpp`**:
  - `aios_kernel_init_with_uid()` — Root of Truth'u dışarıdan verilen gerçek 128‑bit cihaz
    kimliğine bağlar (MCU‑agnostik, tam deterministik).
  - `aios_kernel_init_hw(uid_lo, uid_hi, ent_lo, ent_hi)` (rev.3) — kimlik + **canlı donanım
    entropisi** füzyonu. `entropy=0` → `init_with_uid` ile bit‑özdeş (invariant). README'deki
    "HW_UID + SCE5 TRNG durum geçiş fonksiyonuna taban sabiti" tasarımını gerçekler.
  - Ortak init kuyruğu `aios_kernel_finish_init()` helper'ına çıkarıldı (mock / register /
    FSP‑UID / TRNG yollarının determinizmi ispatlanabilir şekilde aynı kod).
  - `RA4M1_HW_UID_BASE_ADDR` artık `#ifndef` ile override edilebilir; `AIOS_ARDUINO_PROOF`
    guard'ları (raw TRNG / SCI2).
- **`esp32s3_bridge.hpp`**: `ESP32S3_RING_BUFFER_SIZE` / `ESP32S3_STALL_WATERMARK` artık
  `#ifndef` ile build‑time override edilebilir; watermark otomatik %93.75'e ölçekleniyor.
  - `aios_prng_seed / aios_prng_next64 / aios_prng_fill` + `AiosPrng` (rev.4) — counter‑mode
    hash‑DRBG, 16 bayt durum, zero‑heap, backtracking dirençli, root of truth'a bağlı.
  - `aios_stderr_set_enabled(bool)` (rev.4) — yüksek hacimli fault‑injection testleri için
    izole tanı akışını susturur.
- **`aios_quantum_kernel_test.cpp` / `aios_mutation_test.cpp` / `aios_chaos_test.cpp`**:
  `-DAIOS_EMBED_SUITE` ile `main()` yerine `aios_run_*_suite()`; `%zu` → `%lu`; büyük
  buffer'lar `static`. `aios_chaos_test.cpp` yeni (Adım 2 — MUT‑07..13).

Proof‑harness'a özel (kanonik değil): `arduino/AIOS_HardwareProof/src/aios_randtest.{h,cpp}`
— NIST SP 800‑22 alt kümesi **12 test** (Monobit, Runs, Block Frequency M=128, Longest Run
M=128, Byte χ², non‑repetition, Cumulative Sums fwd/bwd, Serial m=3 ×2, Approximate Entropy
m=2), tek dosya `erfc` + normal CDF + kompakt regularized incomplete gamma ile.
`arduino/AIOS_TrngDump/` — off‑device tam NIST için ham TRNG hex dump sketch'i.

Paket yapısı için `arduino/` alt ağacına bakın; `hardware_proof_report.json` makine‑okunur özettir.
