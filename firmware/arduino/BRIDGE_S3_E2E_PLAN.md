# PHASE 7 kapanışı — Gerçek ESP32-S3 bridge E2E

Bu, `PHASE_7_REAL_S3_SILICON_E2E` gate'ini `PENDING` → `PASS` yapmak için gereken
minimum kapanış kriterleri ve prosedürüdür. Tamamlanmadan **genel verdict `PASS`
yapılmaz** (`AIOS_HARDWARE_PROOF_VERDICT` en fazla `CONDITIONAL_PASS`).

## Minimum KOD kapanışı (fiziksel HIL'den ÖNCE — bu oturumda tamamlandı)

- [x] S3 status byte'ı her testte beklenen `AiosWireError` ile karşılaştırılıyor
      (`round_trip` içinde S3 status ↔ bağımsız `aios_wire_verify(echo)` çapraz kontrolü;
      **T8 "S3 status vs echo agreement"** ayrı test satırı; drift → run FAIL).
- [x] T2 (truncated) iki transport semantiğini de kabul ediyor:
      modeled → `ERR_LENGTH`, fiziksel → `ERR_TIMEOUT` (S3 skeleton short-frame'de
      `<ERR_TIMEOUT>` status byte'ı gönderiyor, hang yok). `want=ERR_LENGTH` gösterilir,
      pass koşulu `{ERR_LENGTH, ERR_TIMEOUT}`.
- [x] Canonical kaynaklar commit içinde: `src/*` committed ve build için otoritatif —
      temiz `git clone` + `arduino-cli compile` **sıfır kurulum adımıyla** çalışır.
      `sync-from-firmware.sh --check` drift'i yakalar (CI + `aios-verify.sh` bunu kullanır,
      working tree'yi değiştirmez).
- [x] Temiz checkout compile exit 0 doğrulandı: `git archive` → `arduino-cli compile` → EXIT 0
      (hem `AIOS_HardwareProof` hem `AIOS_S3_Bridge`).
- [x] `AIOS_S3_Bridge.ino` `arduino-cli compile -b esp32:esp32:esp32s3` → **EXIT 0**
      (esp32:esp32@3.3.11; 276 KB / 1.3 MB flash).

## Minimum kapanış kriterleri (gerçek S3)

1. `AIOS_S3_Bridge.ino` **compile exit 0** alındıktan sonra gerçek ESP32-S3'e yüklendi.
2. R4 ↔ S3 fiziksel UART (veya SPI) bağlantısı doğrulandı (`aios_bridge_probe_s3` geçti).
3. 9 bridge E2E testi (`aios_bridge_e2e_run`) gerçek link üzerinde koştu → 9/9 PASS
   (T8 dahil: S3 status ↔ R4 verify uyumu), `PHASE_7_BRIDGE_LINK_E2E` ve
   `PHASE_7_REAL_S3_SILICON_E2E` birlikte `PASS`.
4. Şu senaryolar gerçek link üzerinde tekrarlandı: **reset**, **framing error**,
   **timeout**, **replay**, **malformed payload**.
5. Artefaktlar kaydedildi: **firmware sürümü** (`fw=aios-s3-bridge-0.1`), **çip kimliği**
   (efuse MAC), **baud / SPI ayarları**, iki taraflı **seri log**.
6. Genel release verdict'i bu koşunun logu ile yeniden üretildi.

## Donanım hazırlığı

| RA4M1 (UNO R4) | ESP32-S3 Dev Module | Not |
|---|---|---|
| D1 (Serial1 TX) | UART1 RX (`PIN_RX`, vars. GPIO18) | 115200 8N1 |
| D0 (Serial1 RX) | UART1 TX (`PIN_TX`, vars. GPIO17) | |
| GND | GND | ortak toprak şart |

> UNO R4 WiFi'nin dahili S3'ünü kullanmak, stok Espressif network firmware'ini
> **değiştirir**. Bunu yalnızca gözetimli bir oturumda, kurtarma planıyla yapın
> (Arduino "Firmware Updater" stok imajı geri yükler). Alternatif: ayrı bir
> ESP32-S3 Dev Module kartı — sıfır risk, yukarıdaki tabloyla kablolayın.

## Prosedür

```bash
cd aios/aios-fabric/firmware/arduino

# 1. S3 tarafı (ayrı ESP32-S3 kartı; UNO R4 dahili S3 ise supervised passthrough)
arduino-cli core install esp32:esp32
arduino-cli compile -b esp32:esp32:esp32s3 AIOS_S3_Bridge          # EXIT 0 SART
arduino-cli upload  -b esp32:esp32:esp32s3 -p <S3_PORT> AIOS_S3_Bridge
arduino-cli monitor -p <S3_PORT> -c baudrate=115200 > artifacts/s3/s3_side.log &
#   -> "AIOS_S3_BRIDGE_READY chip_id=... sdk=... baud=115200 fw=aios-s3-bridge-0.1"  (HELLO / identity)

# 2. ILK KOSU -- SMOKE: yalnizca framing/timeout/replay + golden vektorler.
#    Performans olcumu YOK. Temel davranis dogrulanmadan throughput'u release
#    artifact'i olarak kabul etme (debug tip).
DEFS="-DAIOS_ARDUINO_PROOF -DAIOS_EMBED_SUITE -DESP32S3_RING_BUFFER_SIZE=1024 -DAIOS_BRIDGE_SMOKE"
arduino-cli compile -b arduino:renesas_uno:unor4wifi -p <R4_PORT> --upload -e \
  --build-property "compiler.cpp.extra_flags=$DEFS" --build-property "compiler.c.extra_flags=$DEFS" \
  AIOS_HardwareProof
# beklenen: T0/T1/T2/T6 + T8 golden = passed=1, transport=phys-S3;
#           T3/T4/T5/T7 = (skipped: -DAIOS_BRIDGE_SMOKE)

# 3. TAM KOSU -- smoke temiz gecince:
./aios-verify.sh --port <R4_PORT> --out artifacts/s3
# beklenen: Link: PHYSICAL RA4M1 SCI <-> ESP32-S3
#           9/9 passed=1  (T8 golden: S3 status == golden expect, her sinif)
#           golden vectors: on-device frames MATCH tools/golden_vectors.txt
#           PHASE_7_BRIDGE_LINK_E2E=PASS
#           PHASE_7_REAL_S3_SILICON_E2E=PASS
#           AIOS_HARDWARE_PROOF_VERDICT=PASS   (diger tum gate'ler PASS ise)

# 4. Herhangi bir test modeled fallback'e duserse (Link: MODELED ...) veya golden
#    diff FAIL verirse -> genel verdict PASS YAPILMAZ.
```

### Golden vektor cross-validation (T8)

`tools/gen_golden_vectors.py` off-device 8 frame sinifi uretir (`valid`, `truncated`,
`bad_magic`, `bad_msgtype`, `bad_agent`, `len_out_of_range`, `bad_crc`, `replay`) ve her
birinin **beklenen `AiosWireError`**'unu sabit olarak yazar (`tools/golden_vectors.txt`,
committed). Fiziksel kosuda T8:
1. golden truth (sabit) vs RA4M1 `aios_wire_verify` -> her sinif esit olmali
2. golden truth (sabit) vs S3 status byte -> her sinif esit olmali
3. cihazin logladigi vektor byte'lari vs `tools/golden_vectors.txt` -> byte-ozdes olmali

Bu, T8'i "iki implementasyon ayni sonucu verdi" testinden cikarip **bagimsiz referansa
karsi** gercek capraz-dogrulamaya donusturur.

## İki taraflı log formatı (modeled ↔ fiziksel sapmayı tek satır diff yapar)

Her iki taraf da her frame için **aynı alanları** yazar:

```
<SIDE> seq=<n> rpc=<hex16> crc_rx=<hex4> crc_calc=<hex4> err=<CODE> t_us=<n> [retry=<n>]
```

- `SIDE` = `R4` veya `S3`
- `err` = `AiosWireError` sayısal değeri (0 = OK)
- RA4M1 harness satırları zaten `seed / got / want / detail` içeriyor; gerçek-S3
  koşusunda ek olarak S3'ün `s3_side.log`'u ile eşleştirilir (aynı `rpc` + `seq`).

**Debug ipucu:** modeled koşudaki `got`/`detail` ile fiziksel koşudaki `S3 err=` /
`crc_calc` birebir aynı olmalı. Fark varsa: `crc_rx != crc_calc` → hat gürültüsü/baud;
`err=ERR_TIMEOUT` beklenmedik yerde → frame-gap / flow control; `err` sınıfı farklı →
S3 `wire_verify` ile `firmware/esp32s3_bridge.cpp` `aios_wire_verify` byte-sapması.

## Kaydedilecek artefaktlar (`artifacts/s3/`)

- `hardware_proof_serial.log` — R4 tarafı 7-faz + PHASE 7 gerçek-S3 satırları
- `s3_side.log` — S3 tarafı per-frame log + `AIOS_S3_BRIDGE_READY` (chip_id, sdk, baud, fw)
- `link_config.txt` — baud/SPI, pin haritası, kablo şeması, iki kartın FQBN + firmware sürümü
- `tool_versions.txt` — arduino-cli, esp32 core, arm gcc sürümleri
