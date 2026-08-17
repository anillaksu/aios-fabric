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

## 1. Bir teknik düzeltme: Shadow DOM güvenlik sınırı değildir

Vizyonunuzda **"Shadow DOM veya güvenli bir iframe"** diyorsunuz. İkisi aynı şey değil ve fark bu projede kritik:

- **Shadow DOM** yalnızca **stil ve DOM kapsüllemesi** verir. İçindeki JavaScript ana sayfayla **aynı** bağlamda çalışır: `window`, `document`, `localStorage`, `fetch` — hepsine erişir. Yani üretilen bir widget, galerinizi silebilir, temayı bozabilir, `/envelope`'a doğrudan capability çağrısı atabilir.
- **`<iframe sandbox="allow-scripts">`** (dikkat: `allow-same-origin` **verilmeden**) opaque origin yaratır: `localStorage` yok, çerez yok, ana DOM'a erişim yok, aynı-origin `fetch` yok. Tek iletişim yolu `postMessage`.

> `allow-scripts` ve `allow-same-origin` **birlikte** verilirse sandbox anlamsızlaşır — iframe kendi `sandbox` niteliğini kaldırabilir. Bu ikisi asla yan yana yazılmayacak.

**Beklediğiniz faydayı (widget menüleri patlatmasın) iframe zaten veriyor; üstüne gerçek güvenlik sınırını da veriyor.** W1'de kurduğumuz risk katmanı ancak böyle istemciye kadar uzanır.

İlgili güzel yan etki: **W1.5'te CORS wildcard'ını kaldırdık.** Bu sayede opaque-origin bir iframe'in `/envelope`'a doğrudan `fetch` denemesi tarayıcı tarafından engellenir — izolasyon teoride değil, uygulamada geçerli.

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
