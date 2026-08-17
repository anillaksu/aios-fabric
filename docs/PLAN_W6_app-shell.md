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
| S · DeepSeek/GPT-4o | **Ertelendi** | Model seçimi mimariye gömülmemeli; yerel `llm_bridge` zaten var, harici API veriyi dışarı taşır |
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

## 5. Açık karar (W6 başlarken sorulacak)

- **Katman B'nin varsayılan durumu:** serbest kod üretimi baştan açık mı, yoksa `risk:"ask"` gibi açık onayla mı çalışsın? Sizin "bir anda tüm yetki açılmayacak" kararınızla tutarlı olan ikincisi — ama üretim akışını yavaşlatır. W6.3'e gelindiğinde karar verilecek.

## 6. Açık karar — pano mu, masaüstü mü?

Tier list `Gridstack.js / Muuri` öneriyor. Bunlar **ızgara** kütüphaneleri: bileşenleri hücrelere oturturlar, çakışmayı engellerler, otomatik yeniden dizerler. Sizin tarif ettiğiniz şey ise **pencere**: serbest konum, üst üste binme, z-index, "Android gibi". Bunlar farklı ürünler ve ikisi aynı anda olmaz:

| | Pano (Gridstack) | Masaüstü (kendi WindowManager) |
|---|---|---|
| Yerleşim | ızgaraya oturur, çakışma yok | serbest, üst üste binebilir |
| Kod | ~50 KB dış bağımlılık | ~250 satır kendi kodumuz |
| Uygun olduğu iş | sürekli görünen göstergeler | açılıp kapanan mini uygulamalar |
| Bağımlılık ölçütü | F7'yi 1.5 MB diye atarken yeni paket eklemek tutarsız olur | sıfır bağımlılık |

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
