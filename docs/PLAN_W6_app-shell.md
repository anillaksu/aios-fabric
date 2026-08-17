# PLAN W6 — App Shell: pencere yöneticisi, widget kanvası, kalıcı galeri

**2026-08-17 · kullanıcı vizyonundan + mevcut kodun ölçümünden türetildi · kod yazılmadı**
**Zamanlama: W2–W5 bittikten SONRA** (kullanıcı kararı: "en son bitişte")

---

## 0. Mevcut arayüzün ölçülmüş durumu

Plan varsayıma değil, şu ölçümlere dayanıyor:

| Bulgu | Kanıt | Sonuç |
|---|---|---|
| Gezinme **zaten sıfır token** | `app.js:208` `goTab()`, `:214` `goSecondary()` — saf istemci | Şartınız bugün de sağlanıyor; eksik olan **pencere** katmanı |
| LLM **zaten HTML üretmiyor** | `renderer.js:1-17` — LLM `ScreenSpec` (JSON) üretir, istemci bilinen bileşenlerle çizer | Token hedefinizin altyapısı hazır; üzerine inşa edilecek |
| Bileşen seti: ~19 tip | `registry.js` `REGISTRY` + `renderer.js:22` `ALLOWED_TYPES` | Widget'ların çoğu **kod üretmeden** ifade edilebilir |
| Framework7 **1.5 MB**, kullanımı **2 çağrı** | `grep 'app\.'` → yalnızca `app.toast.show`, `app.sheet.create` | Atılabilir; native karşılığı ~30 satır |
| Tek ekran, pencere yok | `renderer.js:117` `mount()` → `container.innerHTML = ""` | Çoklu pencere/sürükleme/z-index **sıfırdan** yazılacak |
| Artefakt deposu `localStorage` | `app.js:34` `ART_KEY`, `:46` `setItem` | ~5 MB sınır, senkron; widget kodu için yetersiz → IndexedDB |
| Sabitlenmemişte **30 kayıt sınırı** | `app.js:43-45` — fazlası sessizce siliniyor | "Galeri" hedefiyle çelişiyor; kaldırılacak |
| Artefakt sunucu yedeği var | `server.ts:/artifacts` GET/POST → `~/fabric-artifacts.json` | Cihazlar arası senkron için temel mevcut |

---

## 0b. Tier list denetimi (2026-08-17, kullanıcı mimari önerisi)

Kullanıcı bir "Composable Micro-Frontend OS" tier list'i sundu. Her katman canlı testle
sınandı; sonuç sayfası: **Mimari Tier Denetimi** artefaktı (Test 1–4 tarayıcıda çalışıyor).

| Katman | Karar | Gerekçe |
|---|---|---|
| S · Shadow DOM izolasyon | **Düzeltildi** | JS izolasyonu sağlamıyor — §1 |
| S · Web Workers + RPC | **Kabul, yükseltildi** | Doğru sınır **ve** `terminate()` ile kaçak widget çözümü — §1b |
| S · DeepSeek/GPT-4o | **Reddedildi (gerekçe düzeltildi)** | ~~"yerel llm_bridge zaten var"~~ **YANLIŞTI** — `llm_bridge.py` zaten Codex OAuth ile owner'ın ChatGPT hesabına gidiyor, hiç yerel değil. Doğru gerekçe: owner'ın kendi kontrolündeki **OmniRoute** (Tailscale, ayrı proje) hazır olunca oraya geçilecek — bkz. KARAR-3 |
| A · PostMessage bus | **Kabul, eksikle** | Kanal başına yetki modeli tasarlanmadan "secure" değil |
| A · IndexedDB + hash | **Kabul, yeni katkı** | Planda yoktu → W6.5b |
| B · Web Components | **Kabul** | W6.J ile aynı |
| B · Gridstack/Muuri | **Farklı ürün** | Izgara ≠ pencere; karar §6'da |

---

## 1. Bir teknik düzeltme: Shadow DOM güvenlik sınırı değildir

Vizyonunuzda **"Shadow DOM veya güvenli bir iframe"** diyorsunuz. İkisi aynı şey değil ve fark bu projede kritik:

- **Shadow DOM** yalnızca **stil ve DOM kapsüllemesi** verir. İçindeki JavaScript ana sayfayla **aynı** bağlamda çalışır: `window`, `document`, `localStorage`, `fetch` — hepsine erişir. Yani üretilen bir widget, galerinizi silebilir, temayı bozabilir, `/envelope`'a doğrudan capability çağrısı atabilir.
- **`<iframe sandbox="allow-scripts">`** (dikkat: `allow-same-origin` **verilmeden**) opaque origin yaratır: `localStorage` yok, çerez yok, ana DOM'a erişim yok, aynı-origin `fetch` yok. Tek iletişim yolu `postMessage`.

> **DÜZELTME (2026-08-17, MCP Apps spec'i incelendikten sonra):** Yukarıdaki kural
> **aynı origin'de** (`srcdoc`) geçerlidir — orada `allow-same-origin` sandbox'ı anlamsız
> kılar, iframe kendi `sandbox` niteliğini kaldırabilir. Ancak MCP Apps (SEP-1865) sandbox'ı
> **ayrı bir origin'de** barındırır ve o durumda `allow-scripts allow-same-origin` ikisini
> birden **zorunlu** kılar: "same origin" artık sandbox'ın kendi origin'idir, host'unki değil.
> Widget kendi depolamasını kullanabilir, host'unkine erişemez.
>
> | Barındırma | Doğru sandbox değeri |
> |---|---|
> | Aynı origin (`srcdoc`) | `allow-scripts` — `allow-same-origin` **verilmez** |
> | Ayrı origin (MCP Apps deseni) | `allow-scripts allow-same-origin` — host ≠ sandbox origin **şart** |
>
> Pratik sonuç: telefon bugün tek origin sunuyor (`:9300`). Standarda uymak için sandbox'a
> **ayrı bir origin** (farklı port ya da hostname) ayrılmalı — S-8 maddesi.

**Beklediğiniz faydayı (widget menüleri patlatmasın) iframe zaten veriyor; üstüne gerçek güvenlik sınırını da veriyor.** W1'de kurduğumuz risk katmanı ancak böyle istemciye kadar uzanır.

İlgili güzel yan etki: **W1.5'te CORS wildcard'ını kaldırdık.** Bu sayede opaque-origin bir iframe'in `/envelope`'a doğrudan `fetch` denemesi tarayıcı tarafından engellenir — izolasyon teoride değil, uygulamada geçerli.

### 1b. Worker: kullanıcının önerisi kabul edildi ve çekirdeğe alındı

Tier list'teki **Web Workers** önerisi isabetli ve tek başına iframe'den üstün:

- Ayrı global bağlam — `window`, `document`, `localStorage` yok (Test 3 ile doğrulandı)
- **`terminate()` edilebilir** — sonsuz döngüye giren bozuk bir widget telefonu kilitlemez.
  Bu, iframe'in bile temiz çözemediği bir sorun ve tier list'te gerekçe olarak yazılmamıştı.
- iframe'e göre ucuz (Test 4: iframe ölçülebilir şekilde daha pahalı)

Eksik parçası: **Worker DOM'a erişemez**, yani widget'ın arayüzünü kendisi çizemez.
Çözüm zaten kodumuzda: Worker *ne çizileceğini* söyler (`ScreenSpec`), ana thread bilinen
bileşenlerle çizer (`renderer.js`). Güvenilmeyen kod hiçbir zaman DOM'a dokunmaz.

**Çekirdek katman sırası (düzeltilmiş):**

```
1. Üretilen kod        → Web Worker (izole, terminate edilebilir)
2. Worker çıktısı      → ScreenSpec (JSON) — "ne çizilecek", çizim değil
3. Ana thread          → deterministik çizim + Shadow DOM ile STİL kapsüllemesi
                         (Shadow DOM burada doğru yerde: güvenlik için değil,
                          tasarım dilini korumak için)
4. Capability isteği   → W1 risk kapısı (widget çağırmaz, ister)
5. Serbest HTML şartsa → iframe sandbox, yalnızca kaçış kapağı olarak
```

---

## 2. İki katmanlı üretim (asıl maliyet kararı)

Her widget'ı kod olarak üretmek pahalıdır. Her widget'ı ScreenSpec'e sığdırmak da mümkün değildir. Karar kuralı:

```
İstek gelir
   │
   ├─ Bilinen bileşenlerle ifade edilebilir mi?  ──EVET──►  KATMAN A: ScreenSpec (JSON)
   │                                                        ~300-600 token · sıfır risk
   │                                                        (panel, liste, metrik, buton, form)
   │
   └──HAYIR (özel mantık/çizim/oyun/hesap)  ──────────►  KATMAN B: Serbest kanvas
                                                            ~1500-4000 token · iframe sandbox
                                                            (hesap makinesi, çizim, mini oyun)
```

**Her iki katman da galeriye kaydedilir; ikinci açılışta üretim maliyeti SIFIRDIR.**

| İşlem | Token |
|---|---|
| Sekme/ekran geçişi, menü açma, pencere sürükleme, boyutlandırma, kapatma | **0** |
| Galeriden widget açma (daha önce üretilmiş) | **0** |
| Katman A widget üretimi | ~300–600 |
| Katman B widget üretimi | ~1500–4000 |
| Widget içi veri yenileme (dar context) | yalnızca o widget'ın verisi |

---

## 3. Aşamalar

### W6.1 — Zemin temizliği (kod yazımı buradan başlar)
- `Framework7` kaldırılır (1.5 MB). `app.toast.show` → native `<dialog>`/`popover` tabanlı ~30 satırlık `toast()`; `app.sheet.create` → `<dialog>` + CSS
- Ölü kopya silinir: `fabric/public/js/components.css` (bkz. CHECKLIST B-3; yüklenen `/css/` altındaki)
- **Kabul:** sayfa Framework7 olmadan açılıyor, toast ve sheet çalışıyor, ilk yük boyutu ölçülüp raporlanıyor

### W6.2 — Pencere yöneticisi (saf istemci, sıfır token)
- `<aios-window>` **Custom Element**: başlık çubuğu, kapat/küçült/tam ekran, sürükleme, boyutlandırma
- `WindowManager`: z-index yığını, odak, konum kalıcılığı (IndexedDB), ekran sınırına yapışma
- Sürükleme `transform: translate3d` ile (layout thrashing yok), `pointer-events` + Pointer Events API (mouse/touch/kalem tek yol)
- Geçişler **View Transitions API** ile — native, sıfır token
- **Kabul:** üç pencere aynı anda açık, sürükleniyor, sıralanıyor; ağ trafiği **sıfır** (DevTools ile kanıt)

### W6.3 — Kanvas ve boş pencere enjeksiyonu
- "Yeni boş pencere" → içi boş `<aios-window>`; içerik sonradan doldurulur
- Katman A içeriği: mevcut `renderScreen()` doğrudan pencere gövdesine mount edilir (yeniden kullanım, yeni kod yok)
- Katman B içeriği: `<iframe sandbox="allow-scripts">` + `srcdoc`
- **Kabul:** boş pencere açılıp içine hem ScreenSpec hem sandbox'lı kod yerleştirilebiliyor

### W6.4 — Sandbox köprüsü (widget → capability)
- Widget capability çağıramaz; **ister**: `postMessage({call:"sensor.battery.read", payload:{}})`
- Kabuk isteği alır → **W1 risk kapısından geçirir** → `/envelope`'a gönderir → sonucu `postMessage` ile geri verir
- `risk:"ask"` olan çağrı widget'tan geldiğinde **reddedilir** (onay kuyruğu W2/P2'de bağlanınca oraya düşer)
- Origin doğrulaması: gelen mesajın `event.source` kontrolü; bilinmeyen kaynak yok sayılır
- **Kabul:** sandbox'lı widget pil yüzdesini okuyabiliyor; `script.run` denemesi **reddediliyor** (canlı kanıt)

### W6.5 — Kalıcı galeri (IndexedDB)
- `localStorage` → **IndexedDB**; şema: `{ id, kind: "spec"|"canvas", title, payload, createdAt, version, pinned, icon }`
- `navigator.storage.persist()` ile kalıcılık talebi (Android'de temizlenmesin)
- **30 kayıt sınırı kaldırılır** (`app.js:43`)
- Mevcut `localStorage` içeriği ilk açılışta otomatik taşınır (veri kaybı yok)
- Sunucu senkronu korunur (`/artifacts`) — cihaz kaybında geri dönüş
- **Kabul:** üretilen widget kapatılıp yeniden açıldığında **hiç ağ/model çağrısı olmadan** geliyor

### W6.5b — Prompt→kod önbelleği (kullanıcı katkısı, planda yoktu)
- Başarılı her widget, üreten isteğin **SHA-256** özetiyle eşlenip IndexedDB'ye yazılır
  (`crypto.subtle.digest` — bağımlılık yok)
- Benzer istek gelince modele **hiç gidilmez**, kod doğrudan yerelden yüklenir
- **Normalizasyon zorunlu:** ham prompt hash'i kırılgan ("hesap makinesi yap" ≠ "bana hesap
  makinesi yapar mısın"). Küçük harfe indirme + noktalama/dolgu kelime temizliği + boşluk
  sadeleştirmesi hash'ten önce uygulanır
- **Hash'e capability sürümü de katılır:** capability seti değişince eski kod sessizce yanlış
  çalışmaya devam etmesin (`hash(normalize(prompt) + "|" + capabilitySetVersion)`)
- Önbellek isabet oranı journal'a düşer — tasarrufun ölçülebilir olması için
- **(W6.5d katkısı) Structure + Parameters ayrımı:** kayıt `{structureHash, structure, parameters}`
  şeklinde tutulur — aynı widget yapısı (örn. "hesap makinesi kartı") farklı başlık/ikon/renk gibi
  yüzeysel farklarla tekrar istendiğinde tüm yapı yeniden üretilmez, yalnızca parametreler değişir.
  Bu, DAG/paylaşılan-düğüm kurmadan aynı faydanın **ucuz** kısmını verir.
- **Kabul:** aynı istek ikinci kez verildiğinde model çağrısı **sıfır**, isabet journal'da görünüyor

### W6.5c — Deterministik prompt şablonları (kullanıcı katkısı)
- Modele serbest istek gitmez; **sınırları çizilmiş görev** gider:
  ~~"bana bir muhasebe paneli yaz"~~ → "girdi olarak iki tarih alan, çıktı olarak şu şemadaki
  veriyi listeleyen bir ScreenSpec üret; kullanabileceğin bileşenler şunlar"
- Şablon = sabit iskelet + değişken yuvalar. Sabit kısım önbelleğe girer, yalnızca yuvalar değişir
- Yan fayda: çıktı daha kararlı → hash isabet oranı yükselir → maliyet daha da düşer

### W6.6 — Uygulamaya dönüştürme ve yayınlama
- Galeriden ana ekrana sürükle → kalıcı kısayol (ikon + ad), açılışta doğrudan IndexedDB'den
- "Yayınla": widget'ı tek dosya HTML olarak dışa aktar **veya** Fabric üzerinden `/app/<id>` yolundan servis et
- Sürümleme: `stok_widget_v1`, `v2`… — üzerine yazmak yerine yeni sürüm (geri dönülebilir)
- **Kabul:** bir widget ana ekrana sabitlenip uygulama gibi açılıyor; dışa aktarılan dosya tarayıcıda tek başına çalışıyor

### W6.5d — Artifact Compiler/Optimizer önerisi: değerlendirme ve kapsam kararı (kullanıcı katkısı, 2026-08-17)

Kullanıcı tam bir derleyici hattı önerdi: `normalize → canonicalize → validate →
deduplicate → compose → optimize → promote → archive/GC`, canonical Artifact IR,
DAG/reference graph (paylaşılan alt-düğümler, örn. ortak `BatteryCard`), yapısal
eşdeğerlik hash'i (`Equivalent(a,b) ⇒ Hash(Compile(a))=Hash(Compile(b))`), maliyet
tabanlı reuse kararı (`E(C_reuse) < E(C_regenerate)`), çok aşamalı terfi
(`GENERATED→VALIDATED→OBSERVED→CANDIDATE→PROMOTED`) ve çok aşamalı GC
(`ACTIVE→COLD→ARCHIVED→GC CANDIDATE→DELETE`).

**Teknik olarak sağlam** — gerçek derleyici teorisi (hash-consing, e-graph,
canonical form), ve kullanıcı kendisi kontrolsüz equality-saturation riskini
görüp deterministik/sınırlı rewrite kuralları öneriyor; bu naif bir öneri değil.

**Ölçüm (K8 ilkesi — kodlamadan önce koda/veriye sorulur):**

```
GET /artifacts (telefon, 2026-08-17) → 8 kayıt, 5.9 KB toplam
```

**Kapsam kararı: şimdi ERTELE, tetikleyici koşulla birlikte yaz.** Gerekçe üç madde:

1. **Ölçek yanlış eşleşiyor.** Bu öneri, birçok kullanıcının örtüşen isteklerini
   karşılayan bir **çok-kiracılı artefakt deposu** için doğru mimari (aynı
   `BatteryCard`'ın yüzlerce kez üretilmesi, gerçek bir sorun *o bağlamda*).
   AIOS tek cihaz, tek kullanıcı. 8 artefaktta yapısal çakışma **ölçülebilir bir
   sorun değil** — DAG/paylaşılan-düğüm/GC katmanı, var olmayan bir sorunu
   çözer.
2. **İstatistiksel sinyal yok.** `reuse frequency`, `success rate`, `structural
   stability` gibi terfi ölçütleri **anlam kazanmak için hacim ister**. n=8'de
   bu ölçütler gürültüden ibaret; bürokratik bir yaşam döngüsü (5 aşama) katmak,
   kazanmadığı bir kesinliği iddia eder.
3. **Depolama baskısı yok.** GC'nin çözdüğü sorun disk/bellek baskısıdır.
   IndexedDB'de (W6.F) birkaç KB'lık widget'lar için pratik sınır yok — 8 kayıt
   5.9 KB'yi henüz bile doldurmuyor. Aşamalı GC (`COLD→ARCHIVED→GC CANDIDATE`)
   olmayan bir baskıyı yönetmek için makine kurmaktır.

**Zaten doğru olan bir madde:** *"Compiler LLM çağırmamalı, LLM yalnızca
karşılanamayan yapı için IR önerir."* Bu **hedef değil, mevcut mimari** —
`screenspec.ts` (W5.1) zaten deterministik, LLM'i hiç çağırmayan bir doğrulama/
temizleme geçişi. Önerinin bu maddesi ekstra iş gerektirmiyor.

**Şimdi alınan, ucuz ve gerçek değeri olan üç parça** (mevcut W6 maddelerine
katıldı, ayrı bir "compiler" çatısı **kurulmadan**):

- **Exact dedup** → zaten **W6.5b**'de var (SHA-256 + normalizasyon + capability
  sürümü). Öneri bunu doğruladı, değiştirmedi.
- **Structure + Parameters ayrımı** → W6.5b'ye eklendi (aşağı bak): bir widget
  `{structure_hash, parameters}` olarak saklanır; aynı yapının farklı
  parametrelerle (örn. farklı başlık/renk) yeniden üretilmesini önler — DAG
  kurmadan, yalnızca depolama şeklini değiştirerek.
- **Capability minimal closure** → yeni checklist maddesi **W6.W**: üretilen bir
  widget yalnızca **gerçekten kullandığı** capability'leri bildirir (statik
  kullanım taraması, `screenspec.ts`'e bir geçiş olarak). Ucuz, güvenlik +
  gözlemlenebilirlik kazandırır, DAG/GC gerektirmez.

**Ertelenen, silinmeyen kısım — yeniden gözden geçirme tetikleyicisi:**

Bu belgenin geri kalanı (canonical IR, DAG, terfi yaşam döngüsü, çok aşamalı GC,
maliyet-tabanlı reuse) **atılmadı** — aşağıdaki **herhangi biri** gerçekleştiğinde
buraya dönülür:

- Artefakt sayısı **200'ü** geçer (o zaman istatistiksel terfi ölçütleri anlam
  kazanır) **VEYA**
- Aynı yapının **ölçülebilir şekilde** (journal'da) tekrar tekrar farklı
  parametrelerle üretildiği görülür **VEYA**
- AIOS tek cihazdan **çok-cihaz/çok-kullanıcı** bir modele geçer (o zaman
  "çok-kiracılı depo" varsayımı gerçek olur).

Tetikleyici gerçekleşmeden bu makineyi kurmak, K10 ilkesinin (yoktan var etme
yoktur, her şeyin bir başlangıcı vardır) tersini yapar: henüz var olmayan bir
ölçek için bugünden bürokrasi icat etmek.

#### W6.5d-ek — Tasarım ilkeleri ve tuzaklar (kullanıcı katkısı, ikinci tur, 2026-08-17)

Tetikleyici gerçekleştiğinde (§ yukarı) bu ilkelerle inşa edilecek. Her biri
AIOS'un GERÇEK mimarisine karşı süzüldü — biri düzeltildi, biri ölçekle
anlamsızlaştı, geri kalanı olduğu gibi kabul edildi:

- **Granülarite parametrik kalsın** — kabul, olduğu gibi. Parça boyutunu
  (fonksiyon/modül/widget) koda gömülü sabit yapmayın.
- **Meta veri toplama asenkron/kuyruklu olsun** — kabul, olduğu gibi.
  `lastUsedAt`/`sizeBytes` gibi ölçümler ana okuma/yazma yolunu bloklamaz.
- **Metadata overhead tuzağı** — kabul, ve zaten §W6.5d'nin granülarite
  gerekçesini DOĞRULUYOR: parça çok küçük seçilirse (fonksiyon/satır seviyesi)
  meta veri içerikten büyür. AIOS'un bugünkü 5.9 KB/8 kayıt oranında, parçayı
  widget SEVİYESİNDE tutmak (fonksiyon seviyesine İNMEMEK) bu tuzağa
  düşmemenin önkoşulu.
- **Determinizm yanılsaması** (timestamp/yerel yol/mimari sızıntısı) — kabul,
  ve ZATEN bir tasarım invaryantı: W6.5b'nin hash formülü
  `hash(normalize(prompt) + "|" + capabilitySetVersion)` — ortamdan hiçbir
  şey (saat, yol, cihaz) sızmıyor, yalnızca girdi + capability sürümü.
  İnşa anında **zorunlu test**: aynı girdi iki farklı "çalıştırmada" (saat
  ileri alınmış, farklı işlemde) AYNI hash'i üretmeli — bu olmadan W6.5b
  "tamam" sayılmaz.
- **Cascading invalidation (bağımlılık zincirinin kırılması)** — kabul, VE
  bu tam olarak **DAG'ı şimdi kurmama kararını güçlendiriyor**: bu tuzak
  yalnızca paylaşılan alt-düğümler (§'de ertelenen DAG özelliği) var olunca
  ortaya çıkar. Grafı henüz kurmadığımız için bu maliyeti henüz taşımıyoruz -
  DAG'ı erteleyerek bu problemi de erteliyoruz, ayrıca çözmemiz gerekmiyor.
- **Structure Hash ≠ Content Hash, AST'ten türetilmeli** — **kısmen kabul,
  netleştirilerek:** AIOS'un BUGÜNKÜ artefaktları (ScreenSpec JSON, W5.1)
  imperatif kod DEĞİL, deklaratif bir ağaç. Onlar için "AST" karşılığı zaten
  W6.5b'nin `{structure_hash, parameters}` ayrımı - bileşen TİPİ+YERLEŞİMİ
  structure, `label`/`value`/renk gibi yapraklar parameters. Değişken adı/
  boşluk normalizasyonu gibi problemler JSON ağacında YOK (kod değil).
  Gerçek AST-tabanlı structural hash, **Katman B**'nin (W6.3 KARAR-2, serbest
  kod üretimi - Worker'da çalışan gerçek JS/HTML) sorunu - orada değişken
  adı/boşluk gerçekten değişir. Yani bu madde bugün W6.5b'de karşılanmış
  durumda; AST'nin kendisi yalnızca Katman B açılırsa gerekli.
- **CapabilitySet bitmask/hiyerarşik olsun** — **kısmen reddedildi,
  gerekçeli:** bitmask, capability kümesinin İNŞA ZAMANINDA SABİT ve
  numaralandırılmış olmasını gerektirir. AIOS'ta capability seti SABİT
  DEĞİL - `kits.ts` ile veri olarak (kod değişikliği gerektirmeden) yeni
  intent/link/doc kiti eklenebiliyor (bkz. W1 kararı, "sistemin genişleme
  yüzeyi kod değil veri"). Bitmask bu modeli kırar (her yeni kit demek
  bitmask genişletmek demek). Ayni "küme teorisi işlemleri" (kesişim/
  birleşim) hedefi, **hiyerarşik STRING etiketleriyle** (capability adları
  zaten nokta-adlı: `sensor.battery.read`, `wifi.info` - bir prefix-trie ya da
  `Set<string>` üzerinde prefix eşleşmesi) bitmask'in esneklik maliyetini
  ödemeden elde edilir. Hiyerarşi kabul, bitmask reddedildi.
- **GUID/hash çakışması riski** — **reddedildi, matematiksel gerekçeyle:**
  SHA-256 çakışma olasılığı doğum günü sınırıyla ~2⁻¹²⁸. Bu risk gerçek
  mühendislik kaygısı olan yer milyarlarca nesneli sistemlerdir (npm
  registry, Git'in kendisi ölçeğinde). AIOS gerçekçi en üst sınırda (§
  tetikleyici: 200 artefakt) bu riskten uzak - tasarlanması gereken GERÇEK
  hata modu çakışma değil, **normalizasyon hatası** (iki farklı isteğin aşırı
  agresif normalizasyonla aynı hash'e düşmesi) ya da **capability sürümünün
  bump edilmemesi** (W6.L'de zaten adı geçen risk). Enerji oraya gitmeli.

### W6.7 — Dar context yönetimi
- Widget içi işlemde modele **yalnızca o widget'ın** durumu gider (tüm uygulama durumu değil)
- `prompt.ts` bölünür: çekirdek sistem promptu + **widget-özel ek** (yalnızca ilgili capability'ler ve o widget'ın şeması)
- Ölçüm zorunlu: her üretim öncesi/sonrası token sayısı journal'a düşer (maliyet görünür olsun)
- **Kabul:** aynı istek eski yolla ve yeni yolla çalıştırılıp token farkı sayıyla raporlanıyor

### W6.8 — Fütürist temel (yatay, tüm aşamalara yayılır)
- **Web Components** (Custom Elements v1) — çerçeve bağımlılığı yok
- **CSS Container Queries** — widget pencere boyutuna uyar (media query pencere içinde anlamsız)
- **View Transitions API** — geçişler
- **Popover API + CSS Anchor Positioning** — menüler, native
- **`dvh`/`env(safe-area-inset-*)`** — zaten kullanılıyor (`aios.html:26`), korunur
- **Pointer Events** — tek kod yolu (dokunma/fare/kalem)

---

## 4. Kabul ölçütü (bütün W6 için)

1. `BUILD_OK` + sunucu `/` **200** + `deploy-to-phone.sh --check` ✅
2. **Ağ sekmesi kanıtı:** menü açma / pencere sürükleme / galeriden widget açma sırasında **sıfır istek**
3. **İzolasyon kanıtı:** sandbox'lı widget'tan `localStorage` ve doğrudan `/envelope` erişimi **engelleniyor**
4. **Maliyet kanıtı:** aynı widget ikinci açılışta **0 token**
5. Kullanıcı telefonda **gözle görüyor** (K5: görünür doğrulama, önceden haber verilerek)

---

## 5. Kararlar — ÜÇÜ DE ÇÖZÜLDÜ (2026-08-17)

Kod yazımından önce cevaplanması gereken üç karar netleşti. Sıralama, seçenekler ve
gerekçe kalıcı kayıt olarak burada duruyor; güncel özet `docs/CHECKLIST.md`'de.

### KARAR-1 — Yerleşim modeli: Hibrit

Tier list `Gridstack.js / Muuri` öneriyordu — **ızgara** kütüphaneleri, hücrelere
oturtur, çakışmayı engeller. Sizin orijinal tarifiniz ise **pencere**: serbest
konum, üst üste binme, z-index, "Android gibi". Karşılaştırma:

| | Pano (Gridstack) | Masaüstü (kendi WindowManager) | **Hibrit (seçilen)** |
|---|---|---|---|
| Yerleşim | ızgaraya oturur, çakışma yok | serbest, üst üste binebilir | ana ekran ızgara, açılan widget tam ekran |
| Kod | ~50 KB dış bağımlılık | ~250 satır kendi kodumuz | ~250 satır, overlap mantığı yok (daha basit) |
| Telefon uyumu | iyi | küçük ekranda üst üste pencere az anlamlı | **Android'in kendi widget modeliyle birebir** |

**Seçilen: Hibrit.** Ana ekran Android widget'ı gibi sabit bir ızgara (çakışma
yok); bir widget'a dokununca **odaklı tam ekrana** açılır — masaüstü tarzı üst
üste binen pencereler YOK, telefon ekranı buna uygun değil. `WindowManager`
mantığı (aç/kapat/odakla/kalıcılık) **yüzeyden ayrık** yazılır — surface-specific
sunum detaylarından (ekran boyutu sınıfı, dokunma-vs-fare) bağımsız bir çekirdek.
Bu ekstra iş değil, sadece doğru modül sınırı: gelecekte başka bir yüzey (PC
istemcisi gibi) eklenirse bu karar TEK BAŞINA değişebilir, WindowManager'ın
çekirdeği yeniden yazılmaz.

### KARAR-2 — Katman B izni: tek-seferlik onay + kapsam-değişince-yeniden-sor

İlk çerçevem ikiliydi: `ask` (her üretimde onay) vs `notify` (onaysız). Owner
daha iyi bir üçüncü model önerdi — mobil uygulama izin modeliyle aynı mantık:

```
NEW FREE-FORM ARTIFACT
    ↓ validate
    ↓ risk = ask
    ↓ USER APPROVAL
    ↓ persist artifact + approval scope
    ↓ future reuse → NO NEW ASK

(widget yeni bir capability isterse → ASK tekrar)
```

Aynı doğrulanmış artefakt tekrar açıldığında **0 token, 0 tekrar-onay** — W6'nın
sıfır-token hedefiyle birebir uyumlu. Onay maliyeti yalnızca **gerçek yeni risk**
ortaya çıktığında (capability kapsamı genişlediğinde) ödenir. Bu, onay kaydının
W6.L'nin önbellek girdisiyle (`{structureHash, structure, parameters}`) birlikte
saklanacağı anlamına gelir — `approvalScope: string[]` alanı eklenecek.

### KARAR-3 — Model seçimi: değişiklik yok, mevcut yol kullanılır

**Burada kendi hatamı düzeltiyorum (K8 ilkesi kendi iddialarıma da uygulanır).**
Bu belgenin önceki sürümünde ve `docs/STANDARTLAR.md`'de birkaç kez *"yerel
llm_bridge zaten var, harici API veriyi dışarı taşır"* dedim. **Bu yanlıştı.**
`docs/RESUME.md:744-761`'e göre `llm_bridge.py` zaten
`--provider openai-codex -m gpt-5.6-luna` ile **Codex OAuth üzerinden owner'ın
ChatGPT/OpenAI hesabına** gidiyor — hiçbir zaman yerel/çevrimdışı olmadı.

Owner'ın gerçek durumu: bu hesabı hem mobilde hem PC'de zaten Hermes üzerinden
kullanıyor. İleride aynı Tailscale ağında kendi barındırdığı **OmniRoute**
(`aether://project/omniroute`, "Free-First AI Gateway Router" — AETHER'da kayıtlı
gerçek bir proje) üzerinden model servis edecek.

**Karar:** Katman B için şimdi **yeni bir model entegrasyonu yapılmaz**. Mevcut
Hermes gateway (zaten çalışan hesap) Katman B'nin kod üretimi için de kullanılır.
OmniRoute hazır olduğunda yönlendirme oraya taşınır — bu **ayrı bir proje, ayrı
bir zaman çizelgesi**, W6'yı beklemesi gerekmiyor. Tier list'in rastgele
üçüncü-taraf DeepSeek-Coder/GPT-4o önerisi hâlâ reddedilir — ama doğru gerekçeyle:
"yerel/ücretsiz olduğu için" değil, **"owner'ın kendi kontrolündeki router projesi
zaten yolda olduğu için."**

"Widget'larla uygulama üzerinde gezme, uygulama içi pencereler" ifadeniz **masaüstünü** işaret ediyor; W6.2 buna göre yazıldı. Pano isteniyorsa W6.2 baştan değişir — bu yüzden kod yazımından önce netleşmeli.

## 7. Açık boşluklar (tier list'te de, ilk planda da yoktu)

Denetim sırasında ortaya çıktı; W6 başlamadan cevaplanması gerekenler:

1. **Widget'ın kalıcı verisi** — widget başına ayrılmış alan mı, paylaşılan depo mu? Paylaşımlı ise yetkiyi kim veriyor?
2. **Kaçak widget** — sonsuz döngü (Worker + `terminate()` ile çözülüyor, §1b)
3. **Yaşam döngüsü** — pencere kapanınca timer/listener/Worker temizliği; bellek eşiği
4. **Bozuk sürümden dönüş** — v2 bozuksa v1'e geri alma; yayınlanan widget'ı geri çekme
5. **Çevrimdışı** — kod IndexedDB'den gelir ama capability çağrısı başarısız olur; widget bunu nasıl gösterir
6. **`sw.js` bağımlılığı** — `SHELL_FILES` Framework7'yi önbellekliyor; W6.1'de F7 atılınca bu liste güncellenmezse kullanıcılar karma sürüm görür
7. **Erişilebilirlik** — pencere klavyeyle nasıl taşınır, ekran okuyucu yığını nasıl anlatır
8. **Performans bütçesi** — telefonda aynı anda kaç pencere; ölçüm eşiği
9. **Üretilen kodun denetimi** — kayda geçmeden statik kontrol; W5 şeması ScreenSpec'i kapsıyor, serbest kodu kapsamıyor
10. **AETHER'a kayıt** — widget üretimi yönetişim hattında görünecek mi
