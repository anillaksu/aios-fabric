# PHASE 7 kapanışı — Gerçek ESP32-S3 bridge E2E

Bu, `PHASE_7_REAL_S3_SILICON_E2E` gate'ini `PENDING` → `PASS` yapmak için gereken
minimum kapanış kriterleri ve prosedürüdür. Tamamlanmadan **genel verdict `PASS`
yapılmaz** (`AIOS_HARDWARE_PROOF_VERDICT` en fazla `CONDITIONAL_PASS`).

## Minimum kapanış kriterleri

1. `AIOS_S3_Bridge.ino` gerçek ESP32-S3 silikonuna yüklendi.
2. R4 ↔ S3 fiziksel UART (veya SPI) bağlantısı doğrulandı (probe geçti).
3. Aynı 8 bridge E2E testi (`aios_bridge_e2e_run`) gerçek link üzerinde koştu →
   8/8 PASS, `PHASE_7_BRIDGE_LINK_E2E` ve `PHASE_7_REAL_S3_SILICON_E2E` birlikte `PASS`.
4. Şu senaryolar gerçek link üzerinde tekrarlandı: **reset**, **framing error**,
   **timeout**, **replay**, **malformed payload**.
5. Artefaktlar kaydedildi: **firmware sürümü**, **çip kimliği** (efuse MAC),
   **baud / SPI ayarları**, iki taraflı **seri log**.
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
arduino-cli compile -b esp32:esp32:esp32s3 AIOS_S3_Bridge
arduino-cli upload  -b esp32:esp32:esp32s3 -p <S3_PORT> AIOS_S3_Bridge
arduino-cli monitor -p <S3_PORT> -c baudrate=115200 > artifacts/s3/s3_side.log &   # AIOS_S3_BRIDGE_READY ...

# 2. R4 tarafı — proof harness S3'ü otomatik tespit eder (aios_bridge_probe_s3)
./aios-verify.sh --port <R4_PORT> --out artifacts/s3

# 3. Beklenen: Link: PHYSICAL RA4M1 SCI <-> ESP32-S3
#              PHASE_7_BRIDGE_LINK_E2E=PASS
#              PHASE_7_REAL_S3_SILICON_E2E=PASS
#              AIOS_HARDWARE_PROOF_VERDICT=PASS   (diğer tüm gate'ler PASS ise)
```

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
