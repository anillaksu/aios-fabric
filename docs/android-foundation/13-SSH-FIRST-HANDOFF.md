# AIOS ANDROID SSH-FIRST HANDOFF

Tarih: 2026-08-22. Temel checkpoint: `f82db05`. Cihaz: **Xiaomi 2210129SG**, mevcut Termux tabanlı "Phone AI-OS Fabric" node'u (`fabric/src/server.ts`'in cihazdaki canlı kopyası, port 9300).

Kanonik kontrol düzlemi **değişmedi**: 9320 aynı örnek (PID 15552, yeniden başlatılmadı), yeni A2A protokolü icat edilmedi, ikinci bir evidence sistemi açılmadı. PC hâlâ kanonik state otoritesi. Samsung'a dokunulmadı.

## PHASE 1 — TERMUX DISCOVERY

ADB üzerinden Termux'un uygulama verisine erişilemedi (debuggable değil, `run-as: package not debuggable`) — beklenen, dürüst bir kısıt. SSH kuruldu (`~/.ssh/phone_termux_key`, port 8022, kullanıcı `u0_a322`), tüm keşif SSH üzerinden yapıldı:

```
uname -a       : Linux localhost 5.10.236-android12-9-... aarch64 Android
id / whoami    : uid=10322(u0_a322) ... context=u:r:untrusted_app_27:s0:...
node           : v26.4.0
npm            : 11.19.0
git            : 2.55.0
curl           : 8.21.0 (aarch64-unknown-linux-android)
openssl        : 3.6.3
termux-info    : TERMUX_VERSION=0.118.3, aarch64, F-Droid build
$HOME          : /data/data/com.termux/files/home
$PREFIX        : /data/data/com.termux/files/usr
storage        : 153G available (/storage/emulated/0)
network        : wlan0=192.168.1.12, tun0=100.75.177.88 (Tailscale), rmnet_data2=10.239.134.83 (hücresel)
DNS/route      : erişilemedi (untrusted_app SELinux sandbox, "Cannot bind netlink socket: Permission denied") — dürüstçe raporlandı
```

## PHASE 2 — SSH IDENTITY

```
hostname          : localhost (cihaz model: 2210129SG)
SSH listening     : PASS — gerçek sshd-session süreçleri (PID 2593/2597/3559/3562/8518)
SSH endpoint      : 100.75.177.88:8022 (Tailscale IP üzerinden)
Tailscale (PC-taraflı doğrulama) : xiaomi-13-lite-1, active, direct bağlantı
local IP          : 192.168.1.12 (wlan0)
Tailscale IP      : 100.75.177.88 (tun0)
```
Özel anahtar içeriği hiçbir zaman gösterilmedi/loglanmadı.

## PHASE 3 — AIOS REACHABILITY (Termux'tan)

```
canonical control plane (PC, 100.109.236.30:9320) : HTTP 200, realityDigest PC'deki ile birebir eşleşti
A2A / Agent Card (cihaz-yerel, 127.0.0.1:9300)     : HTTP 200
runtime-status                                      : {"services":[{"id":"fabric","status":"online"},{"id":"llm_bridge","status":"online"},{"id":"hermes_gateway","status":"online"},...]}
capabilities                                        : gerçek liste (app.open, sensor.battery.read, wifi.info, ... 17 capability)
```
İkinci bir sunucu başlatılmadı.

## PHASE 4 — NODE SELF CHECK

```
nodeId (kanonik node-registry)  : node-e09887136f677275944a6b7ae72e8d814a941a274b836915eb47dd607fda21c4
runtime                          : Termux/Node.js v26.4.0, fabric/src/server.ts
capabilities                     : 17 (agent-card.json'dan, risk:safe)
health                           : online (runtime-status'tan doğrulandı)
attestationStatus                : NOT_IMPLEMENTED — mevcut gerçek durum korunuyor, fabrikasyon yapılmadı
```

## Token yönetimi — operatör onayı

Görev sırasında `sensor.battery.read`'in **gerçek, yetkilendirilmiş** A2A çağrısı (JSON-RPC `SendMessage`) için Bearer token gerekti. Token'ı aramayacağımı belirttim; operatör "cihazda zaten kurulu bir config dosyasından okunmasına izin ver, sen bak" dedi. `~/fabric/.a2a-token` dosyası bulundu ve **değeri hiçbir zaman ekrana yazdırılmadan**, yalnızca uzak sunucu tarafındaki tek bir `curl` çağrısına satır-içi (`TOK=$(cat ...)`) gömülerek kullanıldı.

## PHASE 5/6 — SSH OPERATIONAL MODE + İLK GERÇEK SSH GÖREVİ

```
1. USB bağlıyken temel çağrı yapıldı (mekanizma doğrulandı)     : PLUGGED_AC / FULL
2. Operatör USB kablosunu FİZİKSEL olarak çıkardı
3. `adb devices` → BOŞ liste (ADB artık cihazı görmüyor, USB bağımlılığı gerçekten kalktı)
4. SSH hâlâ erişilebilir (100.75.177.88:8022)                    : PASS
5. Kanonik control plane erişilebilir (SSH üzerinden PC'ye)      : HTTP 200
6. sensor.battery.read, gerçek yetkilendirmeyle, SSH-only        : TASK_STATE_COMPLETED
   plugged: "UNPLUGGED", status: "DISCHARGING"  ← USB'nin gerçekten çıkarıldığının
   kendi kendini doğrulayan kanıtı (önceki ölçüm PLUGGED_AC idi)
```

**Kanıt paketi (Phase 6 formatı):**
```
nodeId       : node-e09887136f677275944a6b7ae72e8d814a941a274b836915eb47dd607fda21c4
requestId    : req-nousb-battery (task id: 51f14aab-f77d-40d2-9248-d629cb30901c)
capability   : sensor.battery.read
result       : {present:true, technology:"Li-poly", health:"GOOD", plugged:"UNPLUGGED",
                status:"DISCHARGING", temperature:39.2, voltage:4376, current:729000,
                percentage:100, level:100, scale:100, charge_counter:3139000, cycle:1105}
realityDigest: 762fdf0454b83755a235058d1f5b68cf3d251fd0e18f9ddf7c8a85c01b6b3876
evidenceRef  : sha256(canonicalJson(payload)) ile hesaplandı — kanonik EvidenceLedger'a
               EKLENMEDİ (ikinci bir evidence sistemi oluşturmama kuralına uyum;
               bu yalnızca izlenebilirlik için türetilmiş bir referans)
transport    : SSH
```

## PHASE 7 — FAILURE TEST

```
1. WiFi kapatıldı → SSH HÂLÂ erişilebilir (Tailscale hücresel veriye devrolmuş:
   direct 192.168.1.12:47003 → 46.106.107.219:49603). Bu bir başarısızlık DEĞİL —
   cihazın gerçek ağ dayanıklılığı (WiFi + hücresel). Dürüstçe "gerçek izolasyon
   sağlanamadı" olarak kaydedildi, sahte bir "SSH_OFFLINE" iddia edilmedi.
2. Operatör uçak modunu açıp kapattı (tam radyo kesintisi)
3. Reconnect sonrası Tailscale direct adresi TEKRAR değişti (176.54.8.253:1035)
   → bağlantının gerçekten sıfırdan yeniden kurulduğunun kanıtı
4. Reconnect sonrası TAZE bir health-check çağrısı yapıldı (mevcut bir "ALIVE"
   durumuna güvenilmedi): voltage/charge_counter değerleri önceki ölçümden
   FARKLI (4376→4356, 3139000→3115000) — bu, sonucun gerçekten yeni bir okuma
   olduğunun, önbelleklenmiş/sahte bir yanıt olmadığının kanıtı
```
Sürekli bir monitör çalıştırılmadığı için "SSH_OFFLINE" anının kendisi canlı yakalanamadı (yalnızca tekil istek-yanıt döngüleri kullanıldı) — bu dürüstçe belirtiliyor. Ama reconnect sonrası davranış kesin: node, önbelleklenmiş bir "ALIVE" değil, gerçek ve taze bir sağlık kontrolüyle "healthy" durumuna döndü.

## FINAL

```
USB_DEPENDENCY:    REMOVED — `adb devices` boş liste döndürdü, SSH bağımsız çalıştı
SSH:               PASS
AIOS_REACHABILITY: PASS (canonical 9320 + yerel 9300, ikisi de SSH üzerinden doğrulandı)
A2A:               PASS — gerçek yetkilendirilmiş SendMessage çağrısı, TASK_STATE_COMPLETED
NODE_HEALTH:       PASS — nodeId/runtime/capabilities/health doğrulandı; attestationStatus dürüstçe NOT_IMPLEMENTED
CAPABILITIES:      PASS — sensor.battery.read gerçek veriyle iki kez (USB'li/USB'siz) ve reconnect sonrası üçüncü kez çalıştırıldı
EVIDENCE:          hesaplandı (sha256(canonicalJson(payload))), kanonik ledger'a eklenmedi — ikinci sistem yok
CANONICAL_REALITY: PASS — realityDigest PC ve telefon arasında (SSH üzerinden) birebir eşleşti
```

Kanonik control plane bu turda **ikinci kez başlatılmadı**, yeni protokol/gate tree/branch açılmadı. Samsung'a dokunulmadı.
