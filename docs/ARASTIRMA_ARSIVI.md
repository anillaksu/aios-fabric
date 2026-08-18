# AIOS — YENİDEN ARAŞTIRMA ARŞİVİ

Bu dosya, AIOS'ta ortaya çıkan doğrulanabilir oluşumların yeniden kullanım
indeksidir. Amaç geçmişi özetlemek değil; insanın verdiği kararın, cihazda
gözlenen gerçeğin ve ajanın yaptığı değişikliğin başka bir bağlamda tekrar
bulunup güvenle kullanılabilmesini sağlamaktır.

Bu arşiv **tek doğruluk kaynağı değildir**. Madde bazlı durum için
`CHECKLIST.md`, mimari ilke için `MIMARI_TEMEL.md`, güncel çalışma bağlamı için
`AIOS_HANDOFF_CURRENT.md`, ham kronoloji için `OTURUM_YYYY-MM-DD.md` ve gerçek
uygulama için git/kod kazanır. Arşiv, bu kanıtları bağlayan erişim katmanıdır.

## 1. Oluşum kartı

Her tekrar kullanılabilir oluşum aşağıdaki sorulara cevap vermelidir:

| Alan | Anlamı |
|---|---|
| Kim / ne | İnsan kararı, ajan üretimi, cihaz gözlemi veya bunların birleşimi |
| Sağladığı şey | Başka bir ekranın ya da akışın alabileceği somut davranış |
| Sınır | Ne değildir; hangi veriyi/semantiği uydurmaz |
| Kod ve test | Commit, kaynak modül ve test karşılığı |
| Canlı kanıt | Cihaz gözlemi, journal task/event veya owner görünür kabulü |
| Kanıt seviyesi | FACT / TEST-VERIFIED / REVIEW-VERIFIED / TARGET |
| Yeniden kullanım kuralı | Hangi sözleşme korunarak nerede kullanılabilir |

Bir kartta commit + test + canlı kanıtın üçü birlikte yoksa **FACT** yazılmaz.
`TEST-VERIFIED` kart, canlı kabul gelene kadar adaydır; `TARGET` kart ise
gelecek fikir değil, henüz gerçek karşılığı olmayan sınırdır.

## 2. Arşivleme kuralları

1. Yeni bir ekran ya da araç önce mevcut kartlarda aranır. Aynı davranış
   varsa yeni capability, protocol veya genel altyapı açılmaz.
2. İnsan kararı, cihaz gözlemi ve ajan değişikliği birbirinin yerine geçmez.
   Owner "istiyorum" der; cihaz "çalıştı" der; commit/test "nasıl çalıştığını"
   sabitler.
3. Bir oluşumun başka bağlamda kullanımı, kaynak capability'nin risk/policy
   sınırını değiştirmez. UI yalnız dispatcher'a intent verir; `/read` yalnız
   açık `safe + readOnly` facade olarak kalır.
4. Canlı veri yoksa aynı empty/error davranışı yeniden kullanılır; yeni ekran
   eksik bilgiyi tamamlayıp gerçekmiş gibi göstermez.
5. Her yeni FACT kartı ilgili checklist ve oturum kaydına da bağlanır. Bu
   indeks tek başına checklist maddesi kapatmaz.

## 3. Kanıtlı ve yeniden kullanılabilir oluşumlar

### FORM-01 — Yetkili cihaz eylemi zinciri

- **Sağladığı şey:** UI, MCP, A2A ve otomasyon kaynaklı eylemler
  `dispatcher.dispatch()` → policy → capability → journal zincirinden geçer.
  İnsan approval kaydı yalnız insan-tetikli approval uçlarından verilebilir;
  A2A approval veremez.
- **Sınır:** `/read` genel execution kapısı değildir; yalnız capability
  kaydında `risk:"safe" + readOnly:true` yazan dar okumaları açar.
- **İnsan kararı:** B-13 Approval Contract; aynı capability kapsamındaki insan
  onayı tekrar kullanılabilir, yeni scope için yeniden onay gerekir.
- **Kod/test:** `2388002` (`/read` enforcement), `10670f1` (A2A human-approval
  alignment); `test/read-policy.test.ts`, `test/approval.test.ts`,
  `test/action-bus.test.ts`.
- **Cihaz kanıtı:** Telefonda `/read` allow/403 fail-closed; A2A'da onaysız
  red → insan grant → dispatcher üzerinden gerçek sonuç → revoke/expiry red.
- **Durum:** **FACT.** Ayrıntılı zincir `CHECKLIST.md` B-13 ve
  `OTURUM_2026-08-18.md` §B-13'tedir.
- **Yeniden kullanım:** Yeni Layer A ekranı bir capability bağlayacaksa bu
  kartın dispatcher/policy sınırını aynen kullanır; doğrudan executor çağrısı
  eklemez.

### FORM-02 — Güvenilir deklaratif, sürekli medya kontrolü

- **Sağladığı şey:** `scroll-region → stack → range` ile yerel slider state'i;
  sürükleme sırasında cihaz çağrısı yok, bırakışta payload'a güncel değer
  bağlanır ve tek `volume.set` dispatch edilir.
- **Sınır:** Bu generic persistent state, pub/sub ya da Layer B değildir.
  `volume.read` geçersizse değer uydurmak yerine empty state gösterir.
- **İnsan kararı:** Ses panelinin gerçek scroll, touch-drag, anlık local değer
  ve release'te tek eylem taşıması istendi.
- **Kod/test:** `5873af2 → 82a5f6b → 5905039` (ScreenSpec contract),
  `82d694b` (gerçek volume mapping), `eaf2a64` (medya kontrol hizası);
  `screenspec-ui-expressiveness.test.ts` ve mapping testleri.
- **Cihaz kanıtı:** Kalıcı `reference-sound-panel-v1`; scroll/drag/yeniden
  açılış owner tarafından doğrulandı. Journal'da release başına tek
  `volume.set`; `volume.read` sonuçları cihaz sesini doğruladı. Shizuku açıkken
  toggle/next/prev görevleri de tamamlandı.
- **Durum:** **FACT.**
- **Yeniden kullanım:** Sürekli, tek değerli bir kontrol gerektiğinde mevcut
  native `range` sözleşmesi ve `valueKey` payload binding kullanılır. Yeni
  kontrol primitive'i ancak bu sözleşme karşılamıyorsa araştırılır.

### FORM-03 — Gerçek cihaz durumunun dar mapping'i

- **Sağladığı şey:** Kalıcı `reference-device-status-v1`; gerçek batarya,
  Wi-Fi ve uygulama-listesi cevaplarını ScreenSpec metric/list alanlarına
  deterministik map eder.
- **Sınır:** Hermes/gateway canlı health kaynağı, medya metadata'sı veya
  Tailscale telemetrisi bu artefact'ta yoktur; bunlar "sağlıklı" ya da dolu
  gösterilmez.
- **Kod/test:** `6b97613`, `reference-artifacts.js`,
  `workspace-catalog.test.ts`.
- **Cihaz kanıtı:** Dispatcher/journal task'ları: batarya
  `8e091ec8-61f8-4967-adb1-ae4811a9c82c`, Wi-Fi
  `0c298b19-bd00-4b7d-a828-8587eab6b5ea`, uygulama listesi
  `cfc95b7-f23ab-4845-bcf4-d0727af3734c` (63 uygulama/52 ad); owner gerçek
  paneli ve yeniden açılışını doğruladı.
- **Durum:** **FACT.**
- **Yeniden kullanım:** Aynı cevap alanları başka cihaz ekranında doğrudan
  kullanılabilir; yeni kaynak eklenirse önce capability cevabı ve empty state
  kanıtlanır.

### FORM-04 — Phone Workspace keşfi ve geri dönüş

- **Sağladığı şey:** HOME ve KEŞFET'te sıfır-token, deterministik kategori ve
  kısa Türkçe metadata araması; Cihaz/Medya/Ağ/Uygulamalar/Sistem/AIOS/Araçlar
  arasında kategori → ekran/artifact → geri akışı.
- **Sınır:** Katalog LLM semantic search değildir; Artifact, ApplicationEntry,
  sistem ekranı ve Android paketi aynı nesne değildir.
- **Kod/test:** `d5644f6` (`app.list` explicit read policy), `6b97613`
  (catalog), `c66e5da` (history/back), `71688e1` (native View Transitions),
  `06f3128` (tasarım tokenları), `9c337a1` (son kullanılan ApplicationEntry).
  İlgili sözleşme testleri `workspace-catalog`, `navigation-state`,
  `view-transitions`, `design-tokens`, `application-model` testleridir.
- **Cihaz kanıtı:** Owner HOME/KEŞFET, kısa arama, kategori-artifact geri
  akışı, Android/browser back, reduced motion, tema/focus ve son kullanılan
  ApplicationEntry sıralamasını telefonda doğruladı.
- **Durum:** **FACT.**
- **Yeniden kullanım:** Yeni görünür araç, önce mevcut katalog kategorisine
  deterministik metadata ile bağlanır; Hermes yalnız yeni üretim isteğinin
  giriş kapısıdır.

### FORM-05 — Artifact ve ApplicationEntry ayrımı

- **Sağladığı şey:** Artifact tekrar kullanılabilir declarative iş birimidir;
  ApplicationEntry yalnız onu açan kalıcı launcher identity'sidir. Bir
  artifact'e birden çok entry bağlanabilir; entry açılışı yalnız kendi
  `lastOpenedAt` izini değiştirir.
- **Sınır:** ApplicationEntry execution/capability sahibi değildir. Bağlı entry
  varsa artefact silme engellenir.
- **Kod/test:** `3b28451` model/lifecycle implementation; `9c337a1` son
  kullanılan görünümü; `application-model.test.ts`.
- **Cihaz kanıtı:** Son kullanılan entry görünümü ve doğru artifact açılışı
  canlı kabul edildi.
- **Durum:** Lifecycle bütünü için **TEST-VERIFIED** kalır; bu kart, Phone
  Workspace görünür kanıtının onu bağımsız lifecycle FACT'e yükseltmediğini
  açıkça korur.
- **Yeniden kullanım:** Yeni launcher yüzeyi artifact'i kopyalamaz; yalnız
  `artifactId` referanslı ApplicationEntry okur/açar.

### FORM-06 — Operasyonel sağlık ve sınırı

- **Sağladığı şey:** Fabric, `llm_bridge`, Hermes gateway ve watchdog için
  tekrar edilebilir anlık süreç/port/HTTP sağlık kontrolü.
- **Sınır:** Anlık sağlık, Android/MIUI'nin gelecekte Termux'u öldürmeyeceğini
  kanıtlamaz; bu B-9 açık operasyonel riskidir.
- **Kod/test:** Watchdog Hermes gateway'i de izler; kanıt ve davranış
  `CHECKLIST.md` B-9'da kayıtlıdır.
- **Cihaz kanıtı:** 2026-08-18'de süreçler/9300-9201-8642 listener'ları ve
  Fabric 200 gözlendi; watchdog kasıtlı Hermes ölümü sonrası gateway'i geri
  getirdi. Sonraki canlı kontrolde süreç PID'leri ve Fabric 200 tekrar görüldü.
- **Durum:** Anlık süreç sağlığı **FACT**; MIUI survivability **TARGET/risk**.
- **Yeniden kullanım:** Her telefon canlı kapısından önce aynı dört bileşen
  kontrol edilir; başarısızsa UI sonucuna FACT denmez.

### FORM-07 — Uygulama listesi veri durumları

- **Sağladığı şey:** Telefon uygulamaları, Artefakt ve ApplicationEntry
  yüzeylerinde loading / ready / empty / error ayrımı ve açık "Tekrar dene"
  eylemi; arama sonucu yoksa yerel katalogda eşleşme bulunmadığını söyler.
- **Sınır:** Bu dar ekran-veri durumu modelidir; generic state store değildir.
  Hermes kartı sonuç yok durumundan ayrı, kullanıcı-tetikli üretim seçeneği
  olarak kalır.
- **Kod/test:** `6e916c2`; `workspace-catalog.test.ts` ile `npm test` 89/89;
  telefon BUILD_OK, Fabric 200 ve 68 dosya md5 eşitliği.
- **Canlı kanıt durumu:** Normal uygulama listesi/KEŞFET/aramanın görünür kabulü
  bu oturumda bildirildi; hata ve retry yolu yapay servis kesintisiyle henüz
  canlı kanıtlanmadı.
- **Durum:** Normal akış **canlı kabul kaydı bekliyor**; error/retry **TEST-VERIFIED**.
  Bu kart hiçbir bölümü erken FACT'e yükseltmez.
- **Yeniden kullanım:** Yeni veri ekranı, sonsuz skeleton veya boş liste yerine
  aynı dört görünür durumu kullanır; gerçek hata üretmeden error UI FACT olmaz.

## 4. Gelecek kartların ekleme sırası

Bir yeni oluşum için şu sırayı uygula:

```text
Owner ihtiyacı / kararı
  → mevcut oluşum ve kod taraması
  → en dar reusable contract
  → commit + otomatik test
  → B-9 kontrolü + telefon canlı kanıtı
  → CHECKLIST / OTURUM / HANDOFF
  → bu indeks kartı
```

Bu sıra, arşivi pasif bir not yığını değil, AIOS'un öğrenilmiş ve yeniden
kullanılabilir ürün hafızası yapar.
