# Fiziksel ESP32-S3 HIL — tane tane adımlar

Bu dosya **senin fiziksel olarak yapacağın** işi anlatır. Yazılım tarafı (kod,
derleme, test mantığı, CI) hazır ve gerçek RA4M1'de yeşil. Eksik olan tek şey:
`AIOS_S3_Bridge` firmware'inin **gerçek bir ESP32-S3 çipinde** çalışması ve
RA4M1 ile fiziksel telle konuşması. Bunu tamamlayınca `PHASE_7_REAL_S3_SILICON_E2E`
gate'i `PENDING` → `PASS` olur ve genel verdict `CONDITIONAL_PASS` → `PASS` çıkar.

Tahmini süre: **30–45 dakika**. Lehim yok, sadece jumper kablo.

---

## 0. Ne lazım (malzeme)

- [ ] **Ayrı bir ESP32-S3 geliştirme kartı** (örn. "ESP32-S3-DevKitC-1", "ESP32-S3
      DevKitM", Waveshare ESP32-S3, vb.) + USB kablosu.
      → UNO R4 WiFi'nin **içindeki** S3'ü KULLANMA (stok WiFi firmware'ini bozar).
      Ayrı kart = sıfır risk.
- [ ] **3 adet dişi-dişi jumper kablo** (S3 dev kartı pin header'lıysa erkek-dişi).
- [ ] Arduino UNO R4 WiFi zaten bağlı (COM4).
- [ ] İki kart da **aynı bilgisayara** USB ile bağlı olacak (iki ayrı COM portu).

---

## 1. ESP32-S3 core'unu kur (bir kez)

PowerShell'de:

```powershell
& "C:\Program Files\Arduino CLI\arduino-cli.exe" core update-index
& "C:\Program Files\Arduino CLI\arduino-cli.exe" core install esp32:esp32
```

> Not: bu ~1 sürebilir (indirme). Bende (Claude) daha önce `esp32:esp32@3.3.11`
> kuruluydu; sende yoksa yukarıdaki komut kurar.

---

## 2. S3 kartını tak ve portunu bul

1. ESP32-S3 dev kartını USB ile bağla.
2. Portu öğren:

```powershell
& "C:\Program Files\Arduino CLI\arduino-cli.exe" board list
```

3. Çıktıda UNO R4 **dışında** yeni bir `COMx` satırı göreceksin (çoğu S3 kartında
   "USB Serial" / "CP210x" / "USB JTAG/serial debug unit" yazar). Bu portu not et.
   Bu dosyada ona **`<S3_PORT>`** diyeceğim (örn. `COM7`).
4. UNO R4 portu = **`COM4`** (bu dosyada **`<R4_PORT>`**).

> S3 kartı görünmüyorsa: farklı USB kablo dene (bazı kablolar sadece güç verir),
> ya da kartın "UART" USB soketini kullan (bazı S3 kartlarında 2 USB-C var: biri
> native-USB biri UART-köprü; ikisi de olur ama UART daha az sorun çıkarır).

---

## 3. S3 firmware'ini derle ve yükle

```powershell
cd D:\AIOS_CyberSecurity_IoT_Ecosystem\aios\aios-fabric\firmware\arduino

& "C:\Program Files\Arduino CLI\arduino-cli.exe" compile -b esp32:esp32:esp32s3 AIOS_S3_Bridge
#   -> "Sketch uses ... bytes" + EXIT 0 GÖRMELİSİN (hata yoksa devam)

& "C:\Program Files\Arduino CLI\arduino-cli.exe" upload -b esp32:esp32:esp32s3 -p <S3_PORT> AIOS_S3_Bridge
```

Yükleme sırasında bazı S3 kartlarında **BOOT düğmesini basılı tutup** bir kez
**RESET**'e basman gerekebilir (kart "waiting for download" moduna girsin).
Modern kartların çoğu bunu otomatik yapar; `upload` "Hard resetting..." yazıp
biterse tamamdır.

---

## 4. S3'ün açıldığını doğrula (kabloları takmadan ÖNCE)

```powershell
& "C:\Program Files\Arduino CLI\arduino-cli.exe" monitor -p <S3_PORT> -c baudrate=115200
```

Şunu görmelisin (RESET'e basınca tekrar çıkar):

```
AIOS_S3_BRIDGE_READY chip_id=<efuse-mac-hex> sdk=<...> baud=115200 fw=aios-s3-bridge-0.1
```

- Bu satır çıkıyorsa S3 firmware'i çalışıyor. `chip_id`'yi not et (artifact).
- `Ctrl+C` ile monitörden çık. **Monitör açıkken port meşgul olur**, kapat.

Çıkmıyorsa: baud yanlış (115200 olmalı), yanlış port, ya da yükleme başarısız —
adım 3'ü tekrarla.

---

## 5. İki kartı birbirine kabloyla bağla

**Önce iki kartın da USB'sini çıkar** (ya da en azından bağlarken dikkat et).
3 kablo, UART "çapraz" bağlanır (birinin TX'i diğerinin RX'ine):

| UNO R4 WiFi pini | ESP32-S3 pini | Anlamı |
|---|---|---|
| **D1** (Serial1 TX) | **GPIO18** (S3 RX) | R4 konuşur → S3 dinler |
| **D0** (Serial1 RX) | **GPIO17** (S3 TX) | S3 konuşur → R4 dinler |
| **GND** | **GND** | ortak toprak — ŞART |

Notlar:
- UNO R4 WiFi'de **D0/D1** dijital header'ın en başındadır ("RX←0", "TX→1" yazar).
- S3 dev kartında GPIO17/GPIO18 çoğu kartta yan yanadır; kart üstündeki serigrafi
  "17"/"18" ya da "IO17"/"IO18" yazar. Kartın pinout şemasına bak.
- GPIO17/18 pinleri `AIOS_S3_Bridge/AIOS_S3_Bridge.ino` içinde `PIN_RX`/`PIN_TX`
  olarak tanımlı. Kartında bu pinler doluysa (örn. PSRAM), `.ino`'da bu iki
  `#define`'ı boş iki GPIO'ya çevir, S3'ü yeniden yükle.
- Her iki kart da 3.3V UART seviyesinde — seviye çevirici GEREKMEZ.
- **D0/D1'e kablo takılıyken UNO R4'e USB'den kod yüklemek sorun çıkarabilir**
  (Serial1 ≠ USB Serial olsa da bazı bootloader'lar etkilenir). Sorun olursa:
  yükleme sırasında D0 kablosunu çıkar, yükleme bitince tak.

---

## 6. Kabloları taktıktan sonra: SMOKE koşusu (önce bu!)

İki kartın da USB'sini tak. **S3 monitörü KAPALI olsun** (port boş olmalı).

Smoke = sadece framing/timeout/replay + golden vektörler. Performans ölçümü YOK.
Temel davranış doğrulanmadan throughput sayısına güvenme.

```powershell
cd D:\AIOS_CyberSecurity_IoT_Ecosystem\aios\aios-fabric\firmware\arduino
$DEFS = "-DAIOS_ARDUINO_PROOF -DAIOS_EMBED_SUITE -DESP32S3_RING_BUFFER_SIZE=1024 -DAIOS_BRIDGE_SMOKE -DAIOS_EXPECT_S3"
& "C:\Program Files\Arduino CLI\arduino-cli.exe" compile -b arduino:renesas_uno:unor4wifi -p <R4_PORT> --upload -e `
  --build-property "compiler.cpp.extra_flags=$DEFS" `
  --build-property "compiler.c.extra_flags=$DEFS" `
  AIOS_HardwareProof
```

Sonra R4'ün seri çıkışını izle:

```powershell
& "C:\Program Files\Arduino CLI\arduino-cli.exe" monitor -p <R4_PORT> -c baudrate=115200
```

**Beklenen (PHASE 7 bölümünde):**
```
BRIDGE_LINK_MODE=phys-S3          <-- "modeled" DEĞİL
BRIDGE_FALLBACK_USED=0
T0 ... transport=phys-S3 ... passed=1
T1 ... transport=phys-S3 ... passed=1
T2 truncated frame ... expected={ERR_LENGTH,ERR_TIMEOUT} observed=ERR_TIMEOUT ... passed=1
T6 replay rejection ... transport=phys-S3 ... passed=1
T8 golden-vector cross-validation ... passed=1
T3/T4/T5/T7 = skipped (AIOS_BRIDGE_SMOKE)
```

- `BRIDGE_LINK_MODE=modeled` görüyorsan → kablo/pin/GND yanlış, S3 probe başarısız.
  Adım 7'ye (sorun giderme) bak. `-DAIOS_EXPECT_S3` sayesinde bu durumda gate
  `FAIL` verir, sessiz geçmez.
- `Ctrl+C` ile çık.

---

## 7. Smoke temizse: TAM koşu + artifact

```powershell
cd D:\AIOS_CyberSecurity_IoT_Ecosystem\aios\aios-fabric\firmware\arduino
& "C:\Program Files\Git\bin\bash.exe" aios-verify.sh --port <R4_PORT> --expect-s3 --out artifacts/s3
```

Bu script: R4'ü tam modda (smoke flag'siz) flash'lar, 8 fazı koşturur, S3'ü de
derleyip binary hash'ini alır, `run_provenance.json` yazar.

**Beklenen:**
```
BRIDGE_LINK_MODE=phys-S3
9/9 bridge testi passed=1
golden vectors: MATCH tools/golden_vectors.txt
PHASE_7_BRIDGE_LINK_E2E=PASS
PHASE_7_REAL_S3_SILICON_E2E=PASS      <-- artık PENDING değil
AIOS_HARDWARE_PROOF_VERDICT=PASS      <-- artık CONDITIONAL_PASS değil
HIL PROOF: PASS
```

**Aynı anda S3 tarafının logunu da kaydet** (ayrı bir PowerShell penceresinde,
tam koşudan hemen önce başlat):
```powershell
& "C:\Program Files\Arduino CLI\arduino-cli.exe" monitor -p <S3_PORT> -c baudrate=115200 `
  | Tee-Object -FilePath artifacts\s3\s3_side.log
```
S3 satırları şu formatta olmalı:
`S3 seq=<n> len=<u> rpc=<hex16> crc_rx=<hex4> crc_calc=<hex4> err=<u> t_us=<u>`

---

## 8. Tekrarlanan senaryolar (gerçek link üzerinde — kapanış kriteri 4)

Tam koşu geçtikten sonra bunları da bir kez elle doğrula:

1. **Reset:** S3'ün RESET düğmesine bas, sonra `aios-verify.sh` koşusunu tekrarla →
   yine 9/9 PASS.
2. **Kablo çekme (framing/timeout):** koşu sırasında D1 kablosunu 1 saniye çıkar/tak
   → T5/T7 recovery göstermeli, hang olmamalı.
3. **`--repeat 10`:** `aios-verify.sh --port <R4_PORT> --expect-s3 --repeat 10 --out artifacts/s3`
   → `soak_summary.json`: `runs=10 pass=10 fail=0`.

---

## 9. Kaydedilecek artifact'lar (`artifacts/s3/` içine)

- [ ] `hardware_proof_serial.log` — R4 tarafı (script otomatik yazar)
- [ ] `s3_side.log` — S3 tarafı per-frame log + `AIOS_S3_BRIDGE_READY` satırı
- [ ] `run_provenance.json` / `soak_summary.json` (script otomatik yazar)
- [ ] `link_config.txt` — elle yaz: baud=115200, pin haritası (D1→GPIO18, D0→GPIO17,
      GND→GND), S3 `chip_id`, iki kartın FQBN'i, `fw=aios-s3-bridge-0.1`

Bunlar tamamlanınca bana ("devam et" diyerek) haber ver — raporları (`HARDWARE_PROOF.md`,
`hardware_proof_report.json`, `RELEASE_CHECKLIST.md §2`) gerçek-S3 sonuçlarıyla
güncelleyip verdict'i `PASS`'a çekerim ve AETHER'e delta düşerim.

---

## Sorun giderme

| Belirti | Olası sebep | Çözüm |
|---|---|---|
| `BRIDGE_LINK_MODE=modeled` (phys-S3 beklerken) | GND ortak değil / TX-RX ters / yanlış GPIO | Kabloları adım 5 tablosuna göre kontrol et; TX↔RX çapraz mı? |
| S3 monitörde hiç çıktı yok | Yanlış port ya da baud | `board list` ile portu doğrula, baud=115200 |
| `upload` "Failed to connect to ESP32-S3" | Kart download moduna girmedi | BOOT basılı tut + RESET'e bas, sonra `upload` |
| T2 `observed=ERR_LENGTH` (phys'te `ERR_TIMEOUT` beklenir) | S3 short-frame'de status göndermiyor | `AIOS_S3_Bridge.ino` gap-timeout yolunu kontrol et |
| `crc_rx != crc_calc` S3 logunda | Hat gürültüsü / baud uyuşmazlığı / uzun kablo | Kabloları kısalt (<20cm), baud'u iki tarafta da 115200 doğrula |
| R4'e yükleme takılıyor (D0 kablo takılıyken) | Bootloader Serial1 hattından etkileniyor | Yükleme sırasında D0 kablosunu çıkar |
| `err` sınıfı iki tarafta farklı | S3 `aios_wire_verify` ↔ `firmware/esp32s3_bridge.cpp` sapması | İki `aios_wire_verify` implementasyonunu diff'le |
