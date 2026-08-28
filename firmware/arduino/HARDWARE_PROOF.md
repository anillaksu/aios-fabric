# AIOS — Donanımsal Doğrulama Raporu (On-Silicon Proof)

**Tarih:** 2026-08-28 (rev.5 — bridge E2E link layer, off-device NIST battery, release gates, git+CI)
**Hedef donanım:** Arduino UNO R4 WiFi — Renesas **RA4M1** (R7FA4M1AB3CFM, Cortex‑M4 @ 48 MHz, 32 kB SRAM, 256 kB Flash) + Espressif **ESP32‑S3** yardımcı işlemci
**Bağlantı:** USB CDC, `COM4` (VID:PID `2341:1002`)
**Sonuç:** `AIOS_HARDWARE_PROOF_VERDICT=CONDITIONAL_PASS` — **7 fazın tümü** gerçek silikonda `rc=0`
(5/5 kanonik · 6/6 mutasyon KILLED · 9/9 gerçek UID · TRNG NIST batch · DRBG NIST batch · 7/7 chaos KILLED · 8/8 bridge E2E).
Koşullu: `AIOS_ESP32S3_BRIDGE_E2E=PENDING` — bridge firmware henüz gerçek S3 silikonunda değil (bkz. §Release Gates).

### Release Gates
```
AIOS_RA4M1_KERNEL_PROOF            = PASS
AIOS_TRNG_ON_DEVICE_SUITE          = PASS
AIOS_DRBG_PROOF                    = PASS
AIOS_CHAOS_SUITE                   = PASS
PHASE_7_BRIDGE_LINK_E2E            = PASS      (32-byte wire protokolü + link katmanı)
PHASE_7_REAL_S3_SILICON_E2E        = PENDING   (bridge fw gerçek S3 silikonunda + gerçek R4<->S3 hattı)
AIOS_OFFDEVICE_TRNG_BATTERY        = PASS      (nist_sts_lite, ~1M bit, 11/11 — artifacts/sts/)
AIOS_FULL_NIST_STS_REFERENCE_TOOL  = NOT_RUN   (resmi 15-test STS/dieharder — komut hazır)
AIOS_HARDWARE_PROOF_VERDICT        = CONDITIONAL_PASS
```
`.ino` verdict mantığı: her yürütülen gate PASS **ve** `PHASE_7_REAL_S3_SILICON_E2E=PASS`
ise `PASS`; gerçek S3 hâlâ PENDING ise `CONDITIONAL_PASS`; herhangi bir `=FAIL` varsa `FAIL`.
Proof harness `aios_bridge_probe_s3()` ile gerçek S3'ü otomatik tespit eder — kablo takılıysa
PHASE 7 kendiliğinden gerçek link üzerinde koşar (bkz. `BRIDGE_S3_E2E_PLAN.md`).

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

### PHASE 4 — **SCE5 donanım TRNG + NIST SP 800-22 alt kümesi**

Adım 1 hedefi. RA4M1'in SCE5 donanımsal RNG'si FSP `HW_SCE_RNG_Read()` ile entegre edildi
(Arduino çekirdeğinin `random()` için kullandığı aynı primitive). **16 384 canlı TRNG biti**
toplanıp **cihaz üzerinde** kapalı‑form p‑değerleriyle test edildi. Battery: Monobit, Runs,
Block Frequency M=128, Longest Run M=128, Byte χ², non‑repetition, Cumulative Sums fwd/bwd
(Serial m=3 ×2 ve Approximate Entropy m=2 yalnızca büyük off‑device örnekte sayılır — 16 K
bit'te chi‑square yaklaşımı güvenilmez, NIST kılavuzu gereği).

**Verdict kuralı (çoklu karşılaştırma bilinçli):** ~8 bağımsız test α = 0.01'de → tek
sınırda kaçış battery'i düşürmez; herhangi p < 1e‑4 veya ≥ 2 test p < 0.01 → başarısız.
3 ardışık `aios-verify.sh` koşusunda stabil PASS. Her koşuda `draw[0]` farklı → canlı örnekleme.
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

Adım 1'in "PRNG" ayağı. Kernel'e **counter-mode 2-round hash-DRBG** eklendi
(`aios_prng_seed / next64 / fill`, 16 bayt durum, zero-heap). Tek round non-crypto mixer
küçük n'de zayıf m≥3 serial korelasyon bırakıyordu; ikinci round ilk round'un tam çıktısını
tüketerek bunu kırar. TRNG'den tohumlanır; tohumlar arası çıktı `(key, counter)`'ın kesin
deterministik fonksiyonudur.
| Kontrol | Sonuç |
|---|---|
| Aynı (root, seed) → bit‑özdeş akış (Variance = 0) | OK |
| 1‑bit seed değişimi → farklı akış | OK |
| Yakalanan ara‑durum önceki blokları yeniden üretemez (backtracking direnci) | OK |
| Aynı seed, farklı cihaz root → farklı akış (silikona bağlı) | OK |
| DRBG çıktısı NIST alt‑küme batch verdict'ini geçer (PHASE 4 ile aynı kural) | OK |

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

### PHASE 7 — **RA4M1 ↔ ESP32-S3 wire-bridge END-TO-END** (Adım 2 devamı)

`aios_bridge_e2e.{h,cpp}` (proof-harness) + kernel wire-katmanı eklendi
(`aios_wire_seal`, `aios_wire_verify` → `AiosWireError` sınıfları, `aios_replay_admit`
16-slot replay penceresi). Transport-agnostik: fiziksel **RA4M1 SCI (Serial1, D0↔D1
harici loopback)** varsa onun üzerinde, yoksa modellenmiş UART transport üzerinde
**aynı 8 test** koşar. Her test deterministik DRBG seed'i + beklenen `AiosWireError`
+ gözlenen sonuç + detay ile loglanır.

> **Bu koşu `[link-model]` etiketlidir** — fiziksel R4↔S3 hattı takılı değil, S3 probe
> başarısız → modellenmiş UART transport. Aşağıdaki tüm sayımlar ve throughput/latency
> **link-model benchmark**'tır; fiziksel S3 hattından ölçülmedi.

| Test | Beklenen | Sonuç `[link-model]` |
|---|---|---|
| T0 parser izole (link YOK) — önce byte-buffer üzerinde | OK / ERR_CRC / ERR_LENGTH | PASS |
| T1 framing + CRC happy path | OK (got=32) | PASS |
| T2 truncated frame (son 2 byte düşük) | ERR_LENGTH | PASS |
| T3 oversized payload_len (60000) | ERR_LENRANGE | PASS |
| T4 in-transit byte corruption (200 frame, **modeled**) | hepsi reddedildi (200/200) | PASS |
| T5 timeout + retry (link ilk 3 denemeyi düşürür) | OK, retries=3 | PASS |
| T6 replay rejection | 2. gönderim ERR_REPLAY, taze rpc_id OK | PASS |
| T7 recovery after 100-frame fault storm (**modeled**) | 10/10 temiz frame teslim | PASS |
| throughput / latency (**link-model benchmark**) | ~380 kB/s · ~84 µs / 32B frame | ölçüldü |

**`PHASE_7_BRIDGE_LINK_E2E` ne kanıtlar:** 32-byte wire protokolü + link katmanı (framing,
CRC, timeout/retry, replay penceresi, hata sınıflandırması, fault-storm recovery).
**`PHASE_7_REAL_S3_SILICON_E2E` ne bekler (PENDING):** bridge firmware'inin gerçek ESP32-S3
silikonunda çalışması + gerçek R4↔S3 SPI/UART hattı. Prosedür + minimum kapanış kriterleri:
`BRIDGE_S3_E2E_PLAN.md`. S3 tarafı skeleton: `AIOS_S3_Bridge/AIOS_S3_Bridge.ino`.
Debug disiplini (tasarım notu): `aios_wire_verify` saf fonksiyondur, T0'da linksiz
doğrulanır → parser hatası ile transfer hatası karışmaz.

### Off-device TRNG battery (release gate 1)

`AIOS_TrngDump/` sketch'i ile gerçek SCE5 TRNG'den **~1 035 728 bit** host'a alındı,
`tools/nist_sts_lite.py` ile analiz edildi (bağımsız re-implementasyon; resmi NIST STS
değil). **11/11 PASS** — Monobit p=0.955, Block Freq p=0.356, Runs p=0.062, Longest Run
p=0.638, CUSUM fwd/bwd p=0.92/0.96, Serial m=3 ×2 p=0.20/0.29, ApEn p=0.20, Byte χ²
p=0.80, **DFT Spectral p=0.704** (numpy 2.5.2). Artefaktlar: `artifacts/sts/`
(`trng_dump.bin` + sha256, `nist_sts_lite_output.txt`, `tool_versions.txt`).
Tam 15-test resmi STS: `./aios-verify.sh --dump-trng 1250000` sonra
`dieharder -a -g 201 -f trng_dump.bin` / NIST STS `assess` — komut hazır, çalıştırılmadı.

**Süre (gerçek silikon):** P1 ~1.0 s · P2 ~1.0 s · P3 ~0.055 s · P4 ~0.5 s · P5 ~0.34 s · P6 ~4.7 s · P7 ~0.17 s.
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
DEFS="-DAIOS_ARDUINO_PROOF -DAIOS_EMBED_SUITE -DESP32S3_RING_BUFFER_SIZE=1024"
arduino-cli compile -b arduino:renesas_uno:unor4wifi -p COM4 --upload -e \
  --build-property "compiler.cpp.extra_flags=$DEFS" \
  --build-property "compiler.c.extra_flags=$DEFS" \
  AIOS_HardwareProof
arduino-cli monitor -p COM4 -c baudrate=115200    # kart reset sonrası bir kez rapor basar
```

Tek komut (CI ve insan için aynı): `./aios-verify.sh --port COM4` → exit 0 = PASS.
Off‑device tam NIST/dieharder için: `./aios-verify.sh --dump-trng 1250000` → `artifacts/sts/trng_dump.bin` + `nist_sts_lite_output.txt`.

### Bellek (arm-none-eabi-size, Berkeley)
```
   text	   data	    bss	    dec	    hex
  92556	    568	  28412	 121536	  1dac0
```
Flash: ~93 kB / 262 144 B (%35). SRAM (global): 19 484 B / 32 768 B — headroom ~13 kB
(`ESP32S3_RING_BUFFER_SIZE=1024`: 4 bridge örneği × 1 kB için).

### Artefakt sağlaması (SHA‑256)
```
AIOS_HardwareProof.ino.bin  e5e3548bc2af4564626dbd0f742c97564c3148dd18ac0ce4827cf9219dfc2033
AIOS_HardwareProof.ino.hex  062dbd3887f21c17b81d8d49e4b6b507fb111dac8f8894184f0cf581fd967df5
trng_dump.bin (artifacts/sts) d879e7c2351e2a70aa15d25ac6191a78e18cddb6844d6f44e17bd7f25fbc5cbf
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
