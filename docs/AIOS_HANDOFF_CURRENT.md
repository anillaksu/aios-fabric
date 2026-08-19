# AIOS FABRIC — CANONICAL HANDOFF (repository = memory)

**Bu dosya kanonik durum kaynağıdır.** Model/session hafızası geçicidir —
bir önceki ajanın anlatımına GÜVENME, aşağıdaki kaynakları kendin doğrula:

1. `docs/CHECKLIST.md` — **tek doğruluk kaynağı**, madde bazlı durum
2. `docs/MIMARI_TEMEL.md` — mimari ilkeler, kanıt skalası, otorite zinciri
3. `docs/STANDARTLAR.md` — hangi açık standarda dayanıyoruz
4. en son `docs/OTURUM_*.md` — o günün ham kronolojisi
5. `docs/ARASTIRMA_ARSIVI.md` — kanıtlı oluşumların yeniden kullanım indeksi
6. `docs/PRODUCT_GAP_REGISTER.md` — açık ürün borcu ve kapanış kanıtı
7. `docs/AIOS_DETERMINISTIC_HANDOVER.md` — agent-bağımsız devir algoritması
8. `docs/CROSS_PLATFORM_BOOTSTRAP.md` — rol-bazlı fresh checkout ve bağlantı sınırı
9. `git log` / kod — çelişki varsa **bunlar kazanır**, bu dosya değil

Bu dosya bir **özet/index**'tir, birincil kaynak değil. Çelişki bulursan
"§ Bilinen belge kaymaları" bölümüne ekle, üstteki dosyaları elle düzeltme
zorunluluğun yok (ama düzeltirsen burada da güncelle).

`ARASTIRMA_ARSIVI.md` de bir durum kaynağı değildir: owner kararı, commit/test
ve cihaz canlı kanıtını başka bağlamda bulunabilir kılan bir indeksdir. Bir
kartın kanıt seviyesi checklist/commit ile çelişirse kaynak kanıt kazanır.

> **Devir kuralı (2026-08-19):** Bu handoff tek başına çalışma belleği değildir.
> Yeni ajan önce `AIOS_DETERMINISTIC_HANDOVER.md` algoritmasını uygular, sonra
> bu dosyadaki iddiaları HEAD, worktree, test ve canlı kanıtla çapraz doğrular.

---

## CURRENT COMMIT

Bu dosyaya elle bir hash YAZILMAZ — bayatlar, yanlış güven verir.
**Her oturum başında `git rev-parse HEAD` ve `git log --oneline -5` çalıştır.**
Bu handoff'un yazıldığı an: `600adab` (B-13 UI) + bu dosyayı ekleyen commit
(bkz. `git log`, mesajı "AIOS handoff sistemi kuruldu" ile başlar).
`git status` temiz olmalı; değilse önce onu anla, üstüne yazma.

Kanonik depo: `C:\Users\anil\Desktop\aios-fabric` · Telefon: Tailscale
`100.75.177.88:9300` (Fabric), SSH `:8022`. `deploy-to-phone.sh --check`
ile depo/telefon senkronu her zaman doğrulanabilir (md5, değişiklik yapmaz).

## Kanıt Durumları

- **FACT** = izlenebilir commit + ilgili test + canlı kanıt birlikte var.
- **TEST-VERIFIED** = implementation ve test var; canlı kabul kanıtı yoktur.
- **TARGET** = henüz uygulanmamış karar veya iş.

## Kanonik B-13 Ankrajları

```text
CANONICAL_BASE = 4824cf3
B13_READ_COMMIT = 2388002
B13_A2A_COMMIT = 10670f1
B13_DOC_COMMIT = 5784344
W6G_TEST_VERIFIED_COMMIT = 3b28451
W6_UI_EXPRESSIVENESS_FACT_CODE_COMMIT = 5905039
W6_UI_EXPRESSIVENESS_FACT_CHAIN = 5873af2 -> 82a5f6b -> 5905039
W6_MEDIA_VOLUME_STATE_FACT_CODE_COMMIT = 82d694b
W6_MEDIA_CONTROL_FACT_CODE_COMMIT = eaf2a64
B13_READ_APP_LIST_COMMIT = d5644f6
W6_PHONE_WORKSPACE_FACT_CODE_COMMIT = 6b97613
W6_PHONE_WORKSPACE_NAVIGATION_FACT_CODE_COMMIT = c66e5da
AGENT_SURFACE_TEST_VERIFIED_COMMIT = 8237ba9
GATEWAY_PROVISIONING_FACT_COMMIT = a4b7b2d
OPERATOR_DECK_TEST_VERIFIED_COMMIT = 385a7ed
```

Bu iki commit ayrı tutulur: `/read` dar read facade'ı ile A2A insan-onayı
hizalaması aynı değişiklik kümesi değildir. Canlı kanıt ayrıntıları aşağıdaki
B-13 kaydında, test karşılıkları ilgili commitlerde yer alır.

`W6G_TEST_VERIFIED_COMMIT` yalnız implementation+test kanıtıdır; telefon UI
kabulü yoktur ve **FACT değildir**. Bu handoff dosyasını içeren commit kendi
hash'ini içeriğine doğru yazamaz; geçerli `CANONICAL_HEAD` her devralmada
`git rev-parse HEAD` ile okunur ve bu dosyadaki önceki zincir ankrajlarıyla
karşılaştırılır.

`GATEWAY_PROVISIONING_FACT_COMMIT` için canlı zincir: owner'ın Termux:Widget
başarısı, sır göstermeden `fabric.env` mode `600` ve authenticated Gateway
`/v1/models` HTTP `200`. Bu operational FACT, B-9'un Android/MIUI altında
uzun dönem süreç hayatta kalma garantisi değildir. `OPERATOR_DECK_TEST_VERIFIED_COMMIT`
telefon dağıtımı/test kanıtı taşır; görsel kullanıcı kabulü gelene kadar FACT
olarak okunmaz.

`W6_UI_EXPRESSIVENESS_FACT_CODE_COMMIT`, yukarıdaki üç commit'in son kod
ankrajıdır. FACT için ayrıca aşağıdaki canlı K5 kanıtı gerekir; bu kod zinciri
W6.G'nin durumunu değiştirmez.

---

## DEĞİŞMEZ AIOS İLKELERİ (bunları asla yeniden tartışma, uygula)

- **FÜTÜRİZM** — eskimiş çözüm reddedilir, modern Web Platform tercih edilir
  (Custom Elements, Container Queries, View Transitions, Popover API — W6.8).
- **MALİYET** — gezinme/deterministic davranış sıfır token; modele yalnızca
  gerçekten gereken veri gider.
- **KANIT İLKESİ** — dört seviye: **FACT › TEST-VERIFIED › REVIEW-VERIFIED ›
  TARGET** (`MIMARI_TEMEL.md §0.1`). Koddan/canlı çağrıdan kanıtlanmayan
  FACT değildir — dış iddialar kadar **kendi iddialarımız** için de geçerli.
- **STANDART TEMELİ** — yeni wire protokol/format icat edilmez; JSON-RPC 2.0/
  A2A/MCP/CloudEvents/W3C Trace Context/Web Platform kullanılır, gerekirse
  adapter yazılır (`STANDARTLAR.md`).
- **ÖZ ALMA** — yoktan var etme yok: önce mevcut kodda, sonra standartta,
  sonra adapter'da karşılık ara.

**Ayrıca (mimari invaryant, tercih değil):**
- LLM authority değildir — önerir, AIOS doğrular/yetkilendirir, runtime yürütür.
- `dispatcher.dispatch()` = UI/MCP/A2A/otomasyon için **eylem execution kapısıdır**.
  `/read`, yalnız açık `risk:"safe" + readOnly:true` capability'leri kabul eden dar
  read facade'ıdır; genel execution endpoint'i değildir.
- AETHER execution sahibi DEĞİLDİR — pasif yönetişim belleği (`read_canonical`,
  `append_unverified_metadata` var; `write_canonical`/`promote`/`execute` YOK).
  Kod tarafında AETHER'a sıfır import (`MIMARI_TEMEL.md §9`).
- Sessiz hata kabul edilmez — her `catch` ya loglar ya gerekçesini yazar.
- Yeni kod yazmadan önce mevcut kod/standart kontrol edilir.
- Owner ürün kararları TAHMİN EDİLMEZ — belirsizse sorulur.
- Büyük altyapı (compiler/DAG/terfi sistemi) ölçek kanıtı olmadan kurulmaz
  (n=8-20 artefaktta "erken mühendislik" reddedilir, K10).

---

## REPOSITORY'NİN TAŞIDIĞI SABİT KARARLAR (yeniden icat etme)

| Karar | Durum | Kanıt |
|---|---|---|
| Mobile UI = hibrit (sabit izgara + odaklı tam ekran, masaüstü pencere yok) | KARAR-1, ÇÖZÜLDÜ | `CHECKLIST.md` KARAR-1 |
| Katman B onay modeli = tek-seferlik ask + aynı kapsam reuse + kapsam değişince yeniden ask | KARAR-2, ÇÖZÜLDÜ | `CHECKLIST.md` KARAR-2, B-13 ile çalışma zamanına geçti |
| Model/provider = mevcut Hermes gateway (Codex OAuth üzerinden), yeni entegrasyon YOK | KARAR-3, ÇÖZÜLDÜ | `CHECKLIST.md` KARAR-3 |
| AETHER = governance/approval/promotion, execution DEĞİL | Sabit mimari invaryant | `MIMARI_TEMEL.md §9` |
| `dispatcher.dispatch()` = UI/MCP/A2A/otomasyon eylem kapısı; `/read` yalnız `safe + readOnly` dar read facade'ı | Sabit, test+canlı kanıtlı | `test/action-bus.test.ts`, `test/read-policy.test.ts`, `dispatcher.ts`, `read-policy.ts` |
| Depolama: sunucu birincil, IndexedDB önbellek (ters çevrildi) | M-9, TEST-VERIFIED | `app.js:loadArtifacts/saveArtifacts` |
| Prompt cache: READ her zaman dener, WRITE yalnızca `trustedWrite` kaynaklardan | W6.L revize, FACT | `prompt-cache.js:writeEligible` |
| **B-13 = Approval Contract + Control Center UI** | FACT, canlı kanıtlı (backend + UI ikisi de) | `src/approval.ts`, `app.js:openControlCenter` İZİNLER bölümü |
| Artifact Compiler / DAG | **BİLİNÇLİ ERTELENDİ** — n=8-20 artefakt ölçeğinde erken mühendislik | `MIMARI_TEMEL.md §11`, K10 |
| B-9 (Termux'un MIUI tarafından öldürülmesi) | **KRİTİK operasyonel/doğrulama riski, kod tarafında kapanmadı** | aşağıda ayrı bölüm |

---

## CURRENT FACTS (bugün kanıtlı, FACT seviyesinde — kısa liste, tam liste `CHECKLIST.md`)

- W0-W5 tamamlandı (A2A v1.0, risk kapısı, async teslim, MCP cihaz sunucusu, deterministik action bus).
- W6.I/B/C/D/F/H/K/L/T/W kapandı — Framework7 kaldırıldı (native `<dialog>`/Popover), WindowManager + gerçek artefakt lifecycle, IndexedDB göçü, izole Worker (parse), prompt cache.
- M-5 (capabilities/version/provenance kısmı), M-6 (tanım düzeyi), M-7, M-10 kapandı.
- B-1/2/3/5/6/7/8/10/12/13 kapandı; B-9 anlık süreç sağlığı FACT, fakat MIUI Termux survivability owner ayarını bekliyor; B-4/B-11 bilinçli erteleme/karar.
- **B-13 (2026-08-18) — bugünkü en büyük iş:** `risk:ask` capability'ler artık koşulsuz reddedilmiyor;
  `src/approval.ts` (saf `isApproved`), `state.ts`/`types.ts` (`approval.granted/denied/revoked`),
  `dispatcher.ts` (`grantApproval/denyApproval/revokeApproval` — **capabilityMap'te YOK**, MCP/A2A/
  otomasyon bu metodlara asla erişemez, yapısal garanti), `server.ts` (`GET /approvals`,
  `POST /approvals/grant|deny|revoke`, insan-tetikli düz HTTP), ve Control Center'a **"İZİNLER"** paneli.
  Scope bugün **capability-düzeyinde** (KARAR-2'nin "kapsam" kısmı) — artefakt/capability-set düzeyi
  invalidation Katman B'ye kadar TARGET, sahte test yazılmadı. **Canlı kanıt iki kez:** curl ile
  (onaysız red → grant → gerçek `stdout` ile tamamlandı → revoke → red) VE owner'ın telefonda gerçek
  dokunuşuyla (journal: `approval.granted` 08:45:30.671 → `approval.revoked` 08:45:32.705).
   İlk contract/UI kanıtı 64/64'tü; enforcement uzantısı sonrası **67/67** test telefonunda geçti.
   A2A, geçerli insan approval'ı varken dispatcher üzerinden gerçek `script.run` sonucuna ulaştı;
   approval yok/revoke/geçmiş expiry fail-closed, A2A approval grant edemiyor. `/read` canlıda yalnız
   `sensor.battery.read` ve `wifi.info` için izinli, `torch.set`/`sensor.location.read`/`script.run` için 403.
- **B-9 anlık canlı sağlık (2026-08-18 13:25 +03):** fabric, llm_bridge, Hermes gateway ve watchdog
  süreçleri mevcuttu; Fabric 200, 9300/9201/8642 dinliyordu. Bu FACT, MIUI'nin gelecekte Termux'u
  öldürmeyeceği anlamına gelmez.
- **W6 UI Expressiveness / Layer A (2026-08-18) FACT:** ScreenSpec'in güvenilir deklaratif
  katalogu `stack`, `scroll-region` ve native HTML `range` ile genişledi. Sunucu/istemci validator
  ve registry drift testleri aynı contract'ı taşır; `meetsUiRequirements()` saf ve doğal dil
  yorumlamayan kabul kapısıdır. Kalıcı `reference-sound-panel-v1` gerçek
  `scroll-region → stack → range` spec'iyle telefonda açıldı. Parmak sürükleme yerel değeri anında
  değiştirdi; bırakışta yalnız bir `volume.set` dispatcher zinciri oluştu
  (`taskId 624f3358-5582-49cc-b2e3-1df2a874ebb5`, `music=10`). Dispatcher üzerinden yapılan
  bağımsız `volume.read` aynı `music=10` değerini döndürdü. İç-scroll ve yeniden açılış owner
  tarafından canlı doğrulandı. `volume.read` bugün `readOnly` damgası taşımadığından doğrulama
  bilinçli olarak `/read` yerine dispatcher üzerinden yapıldı. Kod zinciri: `5873af2 → 82a5f6b → 5905039`.
- **W6 medya-volume state (2026-08-18) FACT:** `82d694b`, referans panel açılışında
  `volume.read`i mevcut UI → envelope → dispatcher zincirinden çağırır. Sadece
  gerçek `termux-volume` içindeki `music.volume/max_volume`, saf mapping ile
  range label/value/max'a görünüm olarak uygulanır; artifact spec'i ve ephemeral
  state kalıcılığı değişmez. Eksik/bozuk cevap empty state'tir. Telefon K5'te
  slider bırakışları 49→91→150→68→150 olarak tek tek `volume.set` task'larına
  dönüştü; yeniden açılış `volume.read` ile önce 68/150, sonra 150/150 okudu.
  Test 77/77, telefon BUILD_OK ve 61 dosya md5 eşitliği geçti.
- **W6 medya kontrolü (2026-08-18) FACT:** `eaf2a64`, referansın play/pause
  düğmesini `media.control({action:"toggle"})` ile hizaladı ve deterministic
  admission'a `capability:media.control` ekledi. Shizuku canlıda `alive:true`
  iken owner referans yüzeyinde toggle/next/prev'ü gerçek medya üzerinde
  doğruladı; journal üç ayrı completed görevi kaydetti (`375353dc…`,
  `9819d06d…`, `2a85add1…`). Bu yalnız kontrol FACT'idir; playback veya
  metadata okunmadığından UI durumu uydurmaz.
- Testler: `npm test` → **75/75** yeşil (telefon dağıtımında). Telefon build → **BUILD_OK**.
- Telefon-depo senkronu: `deploy-to-phone.sh --check` ile düzenli doğrulanıyor, son kontrol birebir.

---

## OPEN DECISIONS (owner kararı bekliyor — TAHMİN ETME)

### S bölümü — hepsi kodda 0 sonuç (2026-08-18'de code-first denetlendi)

| Madde | Kod kanıtı | Kategori |
|---|---|---|
| S-1 CloudEvents adapter | 0 sonuç | **Ürün kararı GEREKTİRMİYOR** — journal'ı dışa map eden saf fonksiyon, ne zaman istenirse yazılabilir |
| S-2 W3C Trace Context | 0 sonuç | **Ürün kararı GEREKTİRMİYOR** — zarfa `traceparent`/`tracestate` eklemek, deterministic |
| S-3 A2UI adapter | 0 sonuç | **Karar gerektirir** — bugün gerçek bir A2UI tüketicisi yok, adapter yazmak erken soyutlama (K10) olabilir |
| S-4 widget postMessage köprüsü | 0 sonuç (Worker'daki postMessage widget bağlamında değil) | **Katman B'ye bağlı** — widget sandbox modeli (W6.3/W6.4) henüz karara bağlanmadı |
| S-5 ScreenSpec → MCP resource | 0 sonuç (`mcp.ts`'te yalnızca `tools/*`, `resources/*` yok) | **Karar gerektirir** — hangi tüketici okuyacak, URI şeması |
| S-7 katmanlı capability eşlemesi | 0 sonuç (tek düzlemde MCP Tool + deny listesi) | **Katman B'ye bağlı** — S-4/S-5 olmadan taksonomi eklemek erken soyutlama |
| S-8 sandbox için ayrı origin | 0 sonuç (hiç iframe/sandbox yok) | **Katman B'ye bağlı** — W6.3 kararına bağlı |

### M bölümü

| Madde | Durum | Kategori |
|---|---|---|
| M-1 (4 seviyeli kanıt skalasına yeniden etiketleme) | Yapılmadı | **Ürün kararı GEREKTİRMİYOR** — saf dokümantasyon işi |
| M-3 (5 kalemli maliyet ölçümü) | 0 sonuç, W6.7'nin kendisi kurulmamış | **Katman B'ye bağlı** (W6.7 widget-özel prompt bölünmesi önce gerekli) |
| M-4 (corpus provenance + W6.5d tetikleyicisi) | `provenance` alanı var, `"corpus"` değeri hiç kullanılmamış | **Katman B'ye bağlı** (W6.5d 200-artefakt eşiği henüz kodda yok) |
| M-5 kalan iş (`approvalScope` artefakt kaydına bağlanması) | B-13 onay deposu var ama artefakta bağlanmadı | **Katman B'ye bağlı** — Katman B'nin kendi onay senaryosu olmadan bağlamak erken soyutlama |

### W6 açık ürün kararları (owner seçer)

- **W6.G** ApplicationEntry implementation/test kanıtlıdır (`3b28451`), fakat bu
  UI-expressiveness FACT'i onun bağımsız lifecycle kabulünü FACT'e çıkarmaz.
- **W6.N** Pub/sub yetki modeli — widget'lar birbirinin olayını dinleyebilir mi, kanal başına izin
- **W6.O** Widget kalıcı verisi — widget başına mı paylaşılan depo mu
- **W6.P** Yaşam döngüsü/bellek — pencere kapanınca temizlik + eşik
- **W6.V** Performans bütçesi — aynı anda kaç pencere
- **W6.Z** AETHER'a kayıt — widget üretimi yönetişim hattında görünsün

**CURRENT DECISION POINT:** Owner sonraki görünür ekran/gerçek kullanım
isteğini verir. Medya için çalan uygulama, parça, sanatçı ve playback state
bugün capability kaynağı olmadan TARGET'tır; veri uydurulmaz. W6.N/O/P/V/Z
otomatik başlatılmaz.

### Phone Workspace kanıt ankrajı (2026-08-18)

**FACT:** `6b97613` HOME'u çalışma alanı, eski KOMUT sekmesini KEŞFET yüzeyi
olarak bağlar; ikisi aynı deterministik istemci kataloğunu kullanır. Katalog
kategorileri Cihaz, Medya, Ağ, Uygulamalar, Sistem, AIOS ve Araçlar'dır.
Kısa Türkçe arama başlık/tag üzerinden çalışır; LLM, yeni protokol ya da yeni
yetkilendirme katmanı yoktur. `d5644f6`, canlıda 63 uygulama döndüren
`app.list`i mevcut `/read` izinli setine `risk:"safe" + readOnly:true`
olarak ekledi.

Kalıcı `reference-device-status-v1`, gerçek batarya/Wi-Fi/uygulama-listesi
verisini `/read` yerine mevcut UI → envelope → dispatcher yolundan okur.
Canlı journal task'ları: battery `8e091ec8-61f8-4967-adb1-ae4811a9c82c`,
Wi-Fi `0c298b19-bd00-4b7d-a828-8587eab6b5ea`, `app.list`
`cfc95b7-f23ab-4845-bcf4-d0727af3734c` (63/52). Owner telefonda HOME,
KEŞFET, kısa arama, gerçek Cihaz Durum Merkezi verisi ve yeniden açılışı
doğruladı. Yerel `npm test` 81/81, syntax ve diff-check geçti. Referans
kaydında contract nesnesi değil ayrı `capabilities`/`version`/`provenance`
alanları saklanır; canlı kayıtta `provenance:"reference"` vardır.

**CURRENT DECISION POINT (güncel):** Phone Workspace'in sonraki bağımsız
görünür dilimi HOME/KEŞFET veri-state ve component feedback denetimidir.
`9c337a1`, ApplicationEntry'ye sınırlı `lastOpenedAt` ekleyip HOME'da son
kullanılan uygulamaları gösterir; telefon BUILD_OK, 88/88 test ve 68 dosya
md5 eşitliği geçti, owner gerçek iki entry ile sıralama/açılışı doğruladı.
W6.N/O/P/V/Z, Layer B, pub/sub, generic state store, yeni router/protokol
otomatik açılmaz.

---

## BLOCKED ITEMS

- **S-3/S-4/S-5/S-7/S-8, M-3, M-4, M-5(kalan)** — hepsi yukarıdaki W6 Katman B
  kararlarından en az birine bağlı, o kararlar netleşmeden anlamlı ilerleme yok.
- **B-9'un MIUI kök nedeni** — kod tarafında yapılabilecek başka bir şey yok
  (aşağıya bkz.), owner'ın fiziksel telefon ayarı değişikliği bekleniyor.
- **`persist()` (Chrome IndexedDB'ye Shizuku üzerinden erişim)** — SELinux/
  üretim-derlemesi sınırına çarpıldı, root gerekiyor, owner kendi araştırıyor
  (fiziksel USB+fastboot erişimi şart, uzaktan yapılamaz). TARGET kaldı.

---

## OPERATIONAL RISKS

### B-9 — Termux'un arka planda öldürülmesi (KRİTİK, tekrarlayan)

**Kök neden NET (2026-08-18, koda/cihaza sorularak bulundu, tahmin değil):**
cihaz REBOOT olmuyor (`~/.termux/boot/aios-boot.log`'da tek giriş, `uptime`
kesintisiz) — **MIUI/HyperOS (Xiaomi, Android 15, build V816)** cihaz
açıkken Termux sürecinin TAMAMINI arka planda öldürüyor. Bu bir kod sorunu
DEĞİL, cihaz ayarı sorunu — `persist()`'in SELinux sınırıyla aynı sınıf.

Toplam **altı kez, iki oturumda** tetiklendi; en az ikisi doğrudan canlı
test sonuçlarını yanlış yorumlattı (önbellek/backend karışıklığı).

**Kod tarafında yapılan (FACT):** `scripts/watchdog.sh` artık üç süreci de
izliyor (`fabric`, `llm_bridge`, `hermes gateway` — üçüncüsü 2026-08-18'de
eklendi, canlı `pkill -9` + 45sn içinde otomatik geri gelme ile kanıtlandı).

**Owner'ı bekleyen (kod tarafında yapılabilecek başka bir şey YOK):**
1. Güvenlik uygulaması → İzinler → Otomatik başlatma → Termux açık
2. Ayarlar → Uygulamalar → Termux → Pil → "Kısıtlama yok"
3. Son uygulamalar ekranında Termux kartını kilitle

**Her canlı testten önce ZORUNLU kontrol** (bu handoff'un en önemli
operasyonel kuralı):

```bash
KEY="$HOME/Desktop/Telefon_AI_Agent_Session_2026-08-16/keys/phone_termux_key"
ssh -p 8022 -i "$KEY" u0_a322@100.75.177.88 'ps -ef | grep -E "uvicorn|hermes gateway|node.*server.ts|watchdog" | grep -v grep'
```

Dördü de yoksa: `nohup bash ~/start_hermes_os.sh > ~/start_hermes_os.out 2>&1 & disown`

Bu kontrolü atlayıp doğrudan canlı teste geçmek, "özellik bozuk" ile
"backend ölü" durumlarını karıştırıp yanlış teşhise yol açar — 2026-08-18
oturumunda en az iki kez oldu.

### Chrome-in-browser otomasyonu kararsız

2026-08-18'de B-13'ün onay UI'sini test ederken Chrome uzantısı
bağlanamadı. Alternatif: **journal'ı doğrudan SSH+`node:sqlite` ile
sorgulamak** — owner'ın gerçek dokunuşunu ekran paylaşımı olmadan
kanıtlamanın çalışan yolu (bkz. `OTURUM_2026-08-18.md §7.1`, doğru yol
`~/fabric-journal.db`, **`~/fabric/fabric-journal.db` YANLIŞ** — boş bir
dosya oluşturur).

---

## § Bilinen belge kaymaları (2026-08-18 hizalaması)

- `src/types.ts`'teki `risk` alanı yorumu, B-13 öncesi "AETHER onay kuyruğu
  bağlanana kadar ask koşulsuz reddedilir" diyordu — **artık yanlış**, B-13
  ile `isApproved()`'a bağlandı ve onay **AETHER'dan değil Fabric'in kendi
  journal'ından** geliyor (AETHER hâlâ pasif, bu akışa hiç dahil değil).
  **Bu handoff'u yazarken düzeltildi** (`types.ts:140-147`).
- Eski `MIMARI_TEMEL.md §3` "risk:ask koşulsuz reddedilir" ifadesi ve
  "tüm yollar doğrudan dispatcher" genellemesi bu turda düzeltildi. Güncel
  gerçek: geçerli insan approval'ı A2A dahil dispatcher policy'sinden geçer;
  `/read` yalnız açık `safe + readOnly` seti için ayrı, genel olmayan facade'dır.

---

## Formation Memory — Runtime Witness provenance kabulü (2026-08-19)

```text
RUNTIME_PROVENANCE_BRIDGE_COMMIT = 6e2e314
REUSE_ACCEPTANCE_TEST_COMMIT    = 3bbca13
```

**FACT zinciri:** `task.completed` → doğrulanmış Runtime Ledger checkpoint'i → canonical `RuntimeWitness` → immutable exact-parent provenance edge. Ledger `GENESIS` ile başlar; exact `previous-event-hash` bağını ve event hash'ini fail-closed denetler. Witness ham sonucu saklamaz; yalnız journal'a gidebilen/redakte edilmiş sonuçtan hesaplanan `resultDigest` taşır. Heartbeat/watchdog tek başına witness veya formation üretemez.

Parent seçimi exact formation ID + `verifyFormation()` + artifact contract capability üyeliğidir; similarity, başlık veya prompt eşleşmesi parent değildir. Root formation immutable kalır: aynı root'un yeni execution bağlamında kullanımı **reuse**'dur; production'da derived child formation yaratılmaz. Edge JOIN set birleşimidir: idempotent, commutative, associative; aynı edge ID altında farklı canonical kayıt fail-closed reddedilir. Bir conflict çözüm politikası yoktur.

**Canlı kabul:** Telefonun kalıcı Kaydırılabilir Ses Paneli formation'ı `formation:53542f…030c655`, ikinci ayrı task'ta (`9a030eee-fa1d-4a3b-ae91-0d5f34ed7804`) yeniden kullanıldı. Yeni witness `runtime-witness:23952…6bcaa`, yeni edge `provenance-edge:025faa…ec3ad`; ikisi de aynı exact parent'a bağlıdır. Sonradan gerçek `volume.read` `music=10/150` döndü ve ledger `LEDGER_OK events=42` verdi. Phone export → PC import sonucu 1 formation + 2 edge ve aynı canonical projection hash `sha256:93e50a…07ee8` oldu. PC/telefon: 144/144 PASS, BUILD_OK, telefon 144/144 PASS, 96 dosya md5 eşit; odaklı provenance paketi telefon üzerinde 13/13 PASS.

Bu FACT yalnız gerçek dispatcher execution + provenance/portability kabulüdür; aynı çağrının fiziksel PWA slider'a dokunularak başlatıldığı iddia edilmez. B-9 Android/MIUI survivability riski değişmeden açıktır.

---

## NEXT SAFE ACTION

1. Formation Canvas/UI veya AETHER promotion katmanına geçmeden önce owner,
   gerçek kullanıcı için hangi read-only projection'ın değerli olduğunu seçsin.
   Bu kabulde yeni graph, pub/sub, Layer B, economy/Essence veya canvas UI
   açılmadı.
2. B-9 ayrı operasyonel risktir: bir sonraki canlı test öncesi anlık sağlık
   yeniden kontrol edilir; bu risk otomatik ürün önceliğine dönüştürülmez.

---

## Portable CLI + Connectivity Bridge (2026-08-19)

```text
PORTABLE_CLI_COMMIT          = 55c4d62
PORTABLE_CLI_PATH_FIX_COMMIT = 0cb9db9 -> 3b6c579
```

**FACT (dar kapsam):** `fabric/bin/aios.mjs`, Node 22+ bulunan Windows ve
Termux üzerinde aynı `argv → stdout/stderr → exit-code` sözleşmesiyle yalnız
okuma yapar: `status`, `capabilities`, `artifacts`, `formations`. Hiçbir
capability çalıştırmaz; dispatcher/policy sınırını değiştirmez. Windows'tan
Tailscale URL ile ve Termux'tan localhost ile alınan gerçek
`aios --json formations` çıktılarının SHA-256 değeri aynıydı:
`7c711043a31ecbab7a0e9f91ed29125db23d8659f62d3f758d7adb6ad1e0adac`.
Yerel ve telefonda `npm test` **151/151**, `npm run build` **BUILD_OK** geçti.

Bu **shell script taşınabilirliği** iddiası değildir: Termux:Widget, `am`,
Termux:API, `rish` ve `sshd` Android adapter'ları olarak kalır. macOS/zsh ve
genel Linux/bash aynı Node CLI sözleşmesinin hedefleridir, fakat bu oturumda
canlı kabul kanıtları yoktur.

**Connectivity Bridge düzeltmesi:** `ss`/`netstat` Android'de 8022'yi
göstermese bile köprü artık önce `nc -z -w 1 127.0.0.1 8022` ile gerçek TCP
dinleyicisini doğrular; başarıyı ancak bu kontrolden sonra yazar. Dinleyici
yoksa mevcut runit `sshd` servisinden `sv up` ister ve sekiz saniye boyunca
yeniden doğrular. Canlı widget çalıştırması `bridge_exit=0` ve
`tcp_listener_exit=0` verdi; log `sshd zaten dinliyor` kaydetti.

**Açık sınır:** canlı port hâlâ elle başlatılmış `sshd` tarafından tutulduğu
için runit servisinin gerçek port kaybından sonra devralma kabulü bu oturumda
sahnelenmedi. Bunu doğrulamak mevcut SSH oturumunu kesmeyi gerektirir; B-9
survivability FACT'i değildir.

---

## Node admission / dağıtım sınırı (2026-08-19)

`289dad3` ile CLI'ya `aios node doctor` eklendi. Bu, mevcut A2A Agent Card,
`/runtime-status` ve `/capabilities` için sıralı salt-okunur admission
kontrolüdür; eksik herhangi bir kontrol exit `3` ile fail-closed döner ve
node/peer/approval/capability kaydı yapmaz. Windows x64 ve gerçek Termux
Android/arm64 üzerinde canlı geçti; ikisinde de Node `26.4.0`, A2A `1.0`,
4 runtime servisi ve 39 capability gözlendi. Yerel ve telefon testleri
**153/153**, BUILD_OK geçti.

Tam başlatma, roller ve gerçek eksik matris:
`docs/NODE_DISTRIBUTION_TARGET.md`. Bu FACT yalnız observer/admission CLI
katmanıdır. Linux/macOS/Windows'a aynı Termux native capability'lerinin
kopyalandığı veya public/global node dağıtımının hazır olduğu anlamına gelmez.
