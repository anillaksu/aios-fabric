# AIOS FABRIC — CANONICAL HANDOFF (repository = memory)

**Bu dosya kanonik durum kaynağıdır.** Model/session hafızası geçicidir —
bir önceki ajanın anlatımına GÜVENME, aşağıdaki kaynakları kendin doğrula:

1. `docs/CHECKLIST.md` — **tek doğruluk kaynağı**, madde bazlı durum
2. `docs/MIMARI_TEMEL.md` — mimari ilkeler, kanıt skalası, otorite zinciri
3. `docs/STANDARTLAR.md` — hangi açık standarda dayanıyoruz
4. en son `docs/OTURUM_*.md` — o günün ham kronolojisi
5. `git log` / kod — çelişki varsa **bunlar kazanır**, bu dosya değil

Bu dosya bir **özet/index**'tir, birincil kaynak değil. Çelişki bulursan
"§ Bilinen belge kaymaları" bölümüne ekle, üstteki dosyaları elle düzeltme
zorunluluğun yok (ama düzeltirsen burada da güncelle).

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
- `dispatcher.dispatch()` = **tek execution kapısı** (UI/MCP/A2A/otomasyon hepsi buradan geçer).
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
| `dispatcher.dispatch()` = execution kapısı, tüm yollar (UI/MCP/A2A/otomasyon) buradan geçer | Sabit, test edilmiş | `test/action-bus.test.ts`, `dispatcher.ts:72` |
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
- B-1/2/3/5/6/7/8/10/12/13 kapandı; B-9 kısmi (kod tarafı FACT, MIUI ayarı owner'ı bekliyor); B-4/B-11 bilinçli erteleme/karar.
- **B-13 (2026-08-18) — bugünkü en büyük iş:** `risk:ask` capability'ler artık koşulsuz reddedilmiyor;
  `src/approval.ts` (saf `isApproved`), `state.ts`/`types.ts` (`approval.granted/denied/revoked`),
  `dispatcher.ts` (`grantApproval/denyApproval/revokeApproval` — **capabilityMap'te YOK**, MCP/A2A/
  otomasyon bu metodlara asla erişemez, yapısal garanti), `server.ts` (`GET /approvals`,
  `POST /approvals/grant|deny|revoke`, insan-tetikli düz HTTP), ve Control Center'a **"İZİNLER"** paneli.
  Scope bugün **capability-düzeyinde** (KARAR-2'nin "kapsam" kısmı) — artefakt/capability-set düzeyi
  invalidation Katman B'ye kadar TARGET, sahte test yazılmadı. **Canlı kanıt iki kez:** curl ile
  (onaysız red → grant → gerçek `stdout` ile tamamlandı → revoke → red) VE owner'ın telefonda gerçek
  dokunuşuyla (journal: `approval.granted` 08:45:30.671 → `approval.revoked` 08:45:32.705).
  64/64 test (PC), 10/10 (telefon, gerçek Termux).
- Testler: `npm test` → **64/64** yeşil (bu handoff'u yazarken tekrar çalıştırıldı). `npm run build`
  (bash ile doğrudan, `for` döngüsü Windows'ta npm'in cmd.exe'si yüzünden patlıyor — bilinen ortam
  kısıtı) → **BUILD_OK**.
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

### W6 Katman B ürün kararları (henüz seçilmedi — 2026-08-18 sonu itibarıyla owner'a soruldu, cevap bekleniyor)

- **W6.G** Uygulamaya dönüştürme — galeriden ana ekrana sürükle → kalıcı "uygulama"
- **W6.N** Pub/sub yetki modeli — widget'lar birbirinin olayını dinleyebilir mi, kanal başına izin
- **W6.O** Widget kalıcı verisi — widget başına mı paylaşılan depo mu
- **W6.P** Yaşam döngüsü/bellek — pencere kapanınca temizlik + eşik
- **W6.V** Performans bütçesi — aynı anda kaç pencere
- **W6.Z** AETHER'a kayıt — widget üretimi yönetişim hattında görünsün

**CURRENT DECISION POINT:** Bu altı maddeden hangisiyle başlanacağı owner'a
soruldu (AskUserQuestion), henüz cevap gelmeden bu handoff talimatı devreye
girdi. **Sıradaki ajan bunu owner'a TEKRAR sormalı, kendi seçmemeli** —
W6.G önerilen seçenekti (diğerlerinin çoğunun ön koşulu) ama bu bir öneri,
karar değil.

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

## § Bilinen belge kaymaları (bu handoff'u yazarken bulundu, düzeltildi)

- `src/types.ts`'teki `risk` alanı yorumu, B-13 öncesi "AETHER onay kuyruğu
  bağlanana kadar ask koşulsuz reddedilir" diyordu — **artık yanlış**, B-13
  ile `isApproved()`'a bağlandı ve onay **AETHER'dan değil Fabric'in kendi
  journal'ından** geliyor (AETHER hâlâ pasif, bu akışa hiç dahil değil).
  **Bu handoff'u yazarken düzeltildi** (`types.ts:140-147`).
- `MIMARI_TEMEL.md §3`'teki "Runtime otorite zinciri" tablosu hâlâ
  *"`risk:"ask"` çalışma zamanında koşulsuz reddedilir"* diyor — B-13
  sonrası kısmen eskidi (artık koşullu: onay varsa geçer). **Bu dosya elle
  düzeltilmedi** (kapsam dışı tutuldu, yalnızca burada işaretlendi) — MIMARI_
  TEMEL.md bir "belgenin kendi ilkesine tabi" tarihsel doküman, düzeltme
  gerekiyorsa ayrı bir iş olarak ele alınmalı.

---

## NEXT SAFE ACTION

1. B-9 canlı kontrolü (yukarıdaki komut).
2. Owner'a W6 Katman B önceliği sorusu HÂLÂ AÇIK — tekrar sor, tahmin etme.
3. Cevap gelene kadar S-1/S-2/M-1 (ürün kararı gerektirmeyen, düşük riskli
   teknik işler) bir "boşta iken yapılabilir" havuzu olarak değerlendirilebilir
   — ama yine de başlamadan önce owner'a "bunlarla mı başlayalım" diye sor,
   otonom karar verme (bu projede tekrarlayan, açık bir tercih: `sessiz-hata-
   birakma.md`, `once-dogrulama-sonra-sinir-yaz.md` hafıza kayıtlarıyla aynı
   ilke — küçük kararlarda bile önce doğrula/sor).
