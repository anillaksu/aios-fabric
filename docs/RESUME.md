# Telefon AI-OS — Devam Etme Rehberi
**v0.2 · Design Constitution uygulandı · Güncellendi: 2026-08-16 ~17:30**

---

# 🎨 DESIGN CONSTITUTION — `TERMINAL MATERIAL`

> Bu bölüm **anayasadır**. Yeni ekran/özellik eklerken buraya uyulur.
> Kod karşılığı: `fabric/public/css/tokens.css` + `js/registry.js`

### Temel ilke
**Retro bir İŞLEV değil, bir KARAKTERdir.** His retro-futurist/taktik terminal; davranış modern Android.
Retro görünüm şu dördüyle gelir: **çizgi · renk · tipografi · micro-label + durum göstergesi** — ASCII çorbasıyla DEĞİL.

### Kurallar (ihlal edilmez)
| Kural | Neden |
|---|---|
| **Her şey monospace DEĞİL** | Monospace sadece sistem metadata (`AGENT`, `ONLINE`, `BAT 84%`, `TASK #4821`). Hermes'in 3 paragraflık cevabını monospace okumak eziyet → gövde metni sans-serif. |
| **TEK ikon sistemi** | Framework7 Icons. Emoji + F7 icon + özel sembol KARIŞTIRILMAZ. |
| **Köşe 8–12px** | Aşırı yuvarlak değil. |
| **Çizgi 1px / seçili 2px** | Gölge minimum. |
| **Animasyon 120–220ms** | Hızlı, mekanik. |
| **Component ham renk yazmaz** | Sadece `tokens.css` değişkenleri. |
| **Framework7 DEĞİŞTİRİLMEZ** | F7'nin kendi CSS değişkenleri `tokens.css`'te EZİLİR (yükseltmede bozulmaz). |
| **Disabled button mezarlığı YOK** | Capability yoksa seçenek görünmez (`if capability("app.freeze") show Freeze`). |
| **Android daha iyi yapıyorsa kopyalama** | Parlaklık bunun örneği — kaldırıldı. |

### Palet
`--bg #070B10` · `--s1 #0E1620` · `--s2 #152232` · primary fosfor yeşili `#4ADE80` · info cyan `#38BDF8` · warn amber `#FBBF24` · error `#F87171`

### Boru hattı (mimarinin kalbi)
```
DESIGN TOKENS → COMPONENT REGISTRY → SCREEN SPEC → DETERMINISTIC RENDERER → AI COMPOSITION
```

**EN ÖNEMLİ KARAR: LLM artık HTML üretmiyor, ScreenSpec (JSON) üretiyor.**
> "LLM görünümü tasarlamıyor. LLM **kompozisyon** yapıyor."

- ÖNCE: `LLM → HTML → sanitize → render` (tasarım dili dağılır)
- ŞİMDİ: `LLM → ScreenSpec → validate → known components → DOM`
- Kazanım: az token, hızlı üretim, sanitizer karmaşası yok, bozuk layout yok, responsive garanti, action güvenliği (beyaz liste), cache kolay
- **80% deterministic UI / 20% generative composition.** AI *hangi bilgi, hangi sıra, hangi component, hangi action* der. Buton nasıl görünür, loading nasıl görünür, navigation nasıl çalışır → **AI karışmaz.**

### Component Registry (`js/registry.js`) — AI'nin lego seti
`section` `tile` `info-card` `action-card` `task-card` `agent-card` `app-tile` `list` `list-row` `status-chip` `metric` `progress` `action-receipt` `button` `button-row` `skeleton` `empty-state` `error-state` `text`

Bu sette **olmayan bir görsel üretilemez.** Her component'in zorunlu durumları (`data-state`):
`idle · pressed · loading · pending · success · error · disabled · offline · stale`

**`action-receipt`** AI-OS'a özgüdür (klasik mobilde yok): AI "Spotify'ı açtım ve sesi düşürdüm" demekle kalmaz, adım adım makbuz gösterir (`app.open · 320ms`, `volume 12→5 · 180ms`, `EXECUTOR device/local`, gerekirse `GERİ AL`).

**`tile`** Home Assistant Tile Card modelidir: aynı component state + ana action taşır → `screens.ts` yüz tane UI tipi öğrenmez.

### Shell (değişmez)
```
micro status  →  universal command  →  PAGE  →  tabbar
HOME · ARA · UYG · AKTİF · HERMES
```
**System alt bardan ÇIKARILDI** → Control Center (sheet). System günlük bir varış noktası değil.

**Search = Start Menu + Spotlight + terminal + assistant** (Kvaesitso fikri: launcher'ın temel etkileşimi liste değil ARAMA). Uygulama + komut + capability + AI aynı alanda.

**Home = NOW**, dashboard değil: selamlama → çalışan görevler → son kullanılan → önerilen → cihaz özeti. AI sadece `NOW/SUGGESTED/CONTEXT` bölümlerini değiştirir, shell deterministik kalır.

---

## v0.2'de eklenenler
- `css/tokens.css`, `css/components.css` — tasarım dili
- `js/registry.js` — 19 component, zorunlu durumlarla
- `js/renderer.js` — ScreenSpec validator + deterministik renderer (action beyaz listesi capability'lerden geliyor)
- `js/screens.js` — Home/NOW, Apps, Activity Center, Device Center, Agents, Capability Explorer
- `js/app.js` — shell, dispatcher, global search, Control Center, app context sheet, Hermes, ses
- **PWA shortcuts** — ikona uzun bas → Hermes / Sesli komut / Uygulamalar / Aktivite
- **Share Target** — YouTube/GitHub/foto → Paylaş → **AI-OS** → doğrudan Hermes'e düşer

## v0.2.1 — AI COMPOSITION BAĞLANDI (2026-08-16 ~17:40)

**Artefakt sistemi çalışıyor ve ekran görüntüsüyle kanıtlandı.** Hermes artık sohbette
gerçek, dokunulabilir arayüz üretiyor.

| Sorun | Kök neden | Çözüm |
|---|---|---|
| "Hermes ChatGPT gibi cevaplıyor" | `call_llm`'e **hiç sistem promptu gönderilmiyordu** | `src/prompt.ts` — Hermes kimliği + cihaz bağlamı + artefakt dilbilgisi, her çağrıda gönderiliyor |
| Artefakt yok | AI composition bağlanmamıştı | Model ` ```aios ` bloğunda **ScreenSpec (JSON)** üretiyor → `validateScreen` → Component Registry → canlı arayüz. HTML üretmiyor. |
| Betik çalıştırılamıyor | Yetenek yoktu | `script.run` capability (yıkıcı kalıplar reddedilir, çıktı sohbete `action-receipt` + metin olarak düşer) |
| "Tema çok can sıkıcı" | Tek palet | `css/themes.css` — **5 tema**: phosphor / amber / ice / synth / paper. Control Center'dan seçilir, localStorage'da kalır. Anayasa bozulmaz: sadece renk katmanı değişir. |
| Klavye yazmıyor | X11 IME (v0.1'de çözüldü) | PWA + native Chrome klavyesi — ekran görüntüsüyle doğrulandı |

**Kanıt (17:36 ekran görüntüsü):** "pil ve ağ durumunu panel olarak göster" →
Hermes canlı durumu bilerek cevapladı (%58, şarjda, VODAFONE_435851) ve
ARTEFAKT paneli çizdi: PİL metriği + progress, ŞARJ OLUYOR chip'i, sıcaklık
kartı, Wi-Fi kartı, çalışan YENİLE butonları.

### Uygulama ikonları — dürüst durum
`src/appicons.ts` APK'dan raster ikon çıkarıyor (`pm path` + `unzip`), eşzamanlılık
3 ile sınırlı, pozitif/negatif sonuçlar diske önbellekleniyor. **Ama kapsam düşük:
9 uygulamadan 2'si** (Spotify, Telegram). Sebep: modern uygulamalar ikonu **saf
vektör (adaptive icon XML)** olarak taşıyor, APK'da hiç raster yok (Claude, WhatsApp,
Instagram, Netflix, YouTube böyle). Rasterize etmek Android render bağlamı gerektirir.
Kalanlar harf-avatara düşüyor. **Alternatif (kullanıcı onayı bekliyor):** Play Store'dan
ikon çekmek kapsamı ~%100'e çıkarır ama kurulu uygulama listesini Google'a gönderir.

### android/skills değerlendirmesi (2026-08-16)
Google'ın resmi deposu, **Kotlin ile Android uygulaması yazan** AI ajanları için
(Compose, CameraX, Wear, TV, AGP). AI-OS bir Android uygulaması değil — PWA + Node/TS.
- `device-ai/appfunctions` kavramsal olarak en yakını: Android'in "AI ajanları uygulama
  işlevlerini çağırsın" API'si. **Kullanılamıyor**: Android 16+ gerekiyor (telefon 15),
  ayrıca çağıran taraf sistem/asistan uygulaması olmalı. Bizim `capability` modelimiz
  aynı fikrin farklı katmanda uygulanmış hali.
- Geri kalanı (Compose/CameraX/Wear/TV/build) bu projeye uygulanmıyor.
- **Alınabilecek tek gerçek fikir**: `SKILL.md` biçimi — Hermes'e AI-OS görevleri için
  modüler beceri dosyaları vermek. Yapılmadı, öneri olarak duruyor.

## v0.3 — SHELL YENİDEN KURULDU (P0 tamam, 2026-08-16 ~18:00)

Kullanıcının P0/P1/P2 yol haritası ve **sert kuralları** uygulandı:
> 1 ekran = 1 ana amaç · 1 ekran = 1 ana GİRİŞ yüzeyi · 1 komut = 1 net durum akışı ·
> 1 sonuç = 1 birincil artefakt · FAB sadece zorunluysa

### P0 — tamamlandı
| # | İş | Ne yapıldı |
|---|---|---|
| 1 | **Tek input** | Üst bar artık input DEĞİL (sadece durum + Control Center ikonu). Tek giriş: alttaki composer. **Mic composer'ın içinde**, ayrı FAB **kaldırıldı**. "Desktop kokan CTRL" gitti. |
| 2 | **Klavye/safe-area** | `100vh` → **`100dvh`**; tabbar'a `env(safe-area-inset-bottom)`; composer sabit yükseklik; **`visualViewport`** ile klavye tepkisi (klavye açılınca tabbar gizlenir, composer klavyenin üstünde kalır, shell yüksekliği kısılır) |
| 3 | **Tekrar kaldırıldı** | Prompt'a "1 SONUÇ = 1 BİRİNCİL ARTEFAKT" + "artefakt üretiyorsan metin EN FAZLA BİR CÜMLE, içindekileri tekrar anlatma" kuralı; istemci de artefakt varsa metni ilk paragrafa kırpıyor |
| 4 | **Boş ekranlara öneri** | Hermes boş ekranı artık siyah alan değil: **aktif işler + son artefaktlar + "ŞUNU DENE" hızlı komutları** |

### P1 — tamamlandı (artefakta bağlı olduğu için birlikte yapıldı)
| # | İş | Ne yapıldı |
|---|---|---|
| 5 | **Artefakt galerisi** | Yeni **ARTEFAKT sekmesi**: sabitlenenler + son üretilenler, localStorage'da kalıcı, sekmede sayaç rozeti |
| 7 | **Hızlı aksiyonlar** | Her artefaktın altında **YENİLE** (aynı prompt ile yeniden üret) · **SABİTLE** (HOME'a çıkar) · **SİL** |

### Alt bar değişti
`HOME · KOMUT · ARTEFAKT · AKTİF · HERMES` — **UYG sekmesi kaldırıldı**.
Uygulamalar KOMUT'un içinde (boş sorguda hızlı komutlar + tüm uygulama ızgarası,
arayınca filtreleniyor) ve HOME'da "son kullanılan" olarak. Kvaesitso ilkesi:
launcher'ın temel etkileşimi liste değil **arama**.

### Durumsal HOME (P2'den erken alındı)
Öneriler artık sabit değil: pil <%25 ise "pil azalıyor", sıcaklık >42°C ise
"cihaz ısındı", gece 22:00-07:00 arası "gece modu / sesi kıs", son artefakt varsa
"aç ve devam et". Sabitlenen artefaktlar HOME'da canlı panel olarak görünüyor.

### Kalan (P2)
9. **Mini-app üretimi** — "bana hızlı not uygulaması yap" → artefakt olarak kaydet → sekmeye ekle
10. **Universal intent history** — ne dedi / sistem ne anladı / ne yaptı / ne üretti
6b. Aktif işlerde **iptal/yeniden dene** düğmeleri (görünürlük var, kontrol yok)

## v0.3.1 — GERÇEK KULLANIM HATALARI (2026-08-16 ~21:00)

Kullanıcı uygulamada 30 artefakt üretip bol bol konuştu ve hata yakaladı. İnceleme:

### Önce gözlem boşluğu kapatıldı
Hataların **hiçbiri hiçbir yere kaydedilmiyordu**: UI çoğu şeyi `/read` ile yapıyor,
okumalar da bilerek journal'a yazılmıyordu. Journal'daki son olay saatler öncesindendi,
Hermes oturumları boştu (AI-OS Hermes'in agent döngüsünü atlıyor), pano geçmişi de
Gboard'un özel deposunda okunamıyor.
- **Düzeltme 1:** başarısız `/read` çağrıları artık `read.failed` olayı olarak journal'a
  düşüyor, SSE ile yayılıyor ve **AKTİF sekmesinde "HATALAR" bölümünde** görünüyor.
- **Düzeltme 2:** artefaktlar artık sunucuya senkronlanıyor (`~/fabric-artifacts.json`),
  hem yedek hem inceleme için. Açılışta ve her değişiklikte.

### Kullanıcının kilit içgörüsü
> "benim yazdıklarım istekler, artefaktlar da sonuçlar, niyet çıkar ortaya"

Doğru — ve veri **zaten mevcut**. Her artefakt `prompt` alanını taşıyor. P2 #10
(universal intent history) için yeni veri toplamaya gerek yok, sadece görünür kılmak
gerekiyor.

### Bulunan gerçek hatalar
| Hata | Kök neden | Düzeltme |
|---|---|---|
| **"Component gerekli (paket/.Activity)"** | `activity.start` SADECE `component` kabul ediyordu. Hermes "Spotify'da Mabel Matiz çal" için **doğru** şeyi yapıp deep-link intent'i (`action=VIEW` + `data=spotify:search:...`) üretiyordu — model doğru düşünüyordu, **capability dardı**. | `activity.start` tam intent desteği aldı (`action`/`data`/`component`/`pkg`/`mime`/`extras`), ayrıca yeni **`deeplink.open`** capability'si. Test: Spotify gerçekten Mabel Matiz aramasıyla açıldı. |
| Hermes yanlış payload üretiyor | Prompt capability **isimlerini** listeliyordu ama **argüman şekillerini** değil → tahmin etmek zorundaydı | Prompt'a tam şema referansı + `script.run` yazım kuralları + deep-link URI örnekleri eklendi |
| `script.run` bozuk kabuk üretimi (29 kullanımdan çoğu) | Uzun `while`/`for` döngüleri, bozuk URL (`http://127.0.0. $p`) | Prompt'a "tek satır, kısa, tırnakla, çıktıyı kırp" kuralı |
| **Uygulama ikonları hiç görünmüyordu** | `<img>` DOM'a **eklenmeden** `loading="lazy"` ile yükleniyordu; tarayıcı belgede olmayan öğe için lazy yüklemeyi hiç başlatmaz → `onload` asla tetiklenmedi | img artık DOM'da, harf-avatar altta, yüklenince opacity ile üstünü kapatıyor |
| İkon kapsamı %22 | Modern uygulamalar saf vektör ikon taşıyor | Kullanıcı bilgilendirilmiş onayla ağ yolunu açtı: **9/9 kapsam**. Önce APK (çevrimdışı), sonra ağ, kalıcı önbellek, Control Center'dan kapatılabilir |

### Ağ ikonları hakkında dürüst not
Tek tek çekmek **anonimlik sağlamaz** — istekler aynı IP'den çıkar, korelasyon
IP+zaman üzerinden kurulur. Kabul edilebilir olmasının sebebi başka: cihazda Google
Play Services var ve Play kurulu uygulama listesini zaten biliyor, yani marjinal ifşa
~sıfır. Varsayılan **kapalı**, kullanıcı açtı, istediği an kapatabilir.

## v0.3.2 — MEDYA KONTROLÜ + SHIZUKU CANLI (2026-08-16 ~21:05)

### "Çal" gerçekten çalıyor artık
Kullanıcı haklıydı: `spotify:search:` sadece **arama sayfası** açıyordu, şarkı çalmıyordu.
Ölçülen gerçekler:
- `am start -a android.media.action.MEDIA_PLAY_FROM_SEARCH` → Spotify bunu **sadece arama**
  olarak yorumluyor, çalmıyor
- `am broadcast MEDIA_BUTTON` → Spotify yok sayıyor
- Termux'tan `/system/bin/input` → **SecurityException** (`monkey` ile aynı sebep)
- **Çalışan tek yol:** Shizuku üzerinden gerçek dokunma/tuş olayı

### ⚡ SHIZUKU ARTIK CANLI — nasıl başlatıldı (tekrar gerekirse)
```bash
ADB="C:/Users/anil/AppData/Local/Microsoft/WinGet/Packages/Google.PlatformTools_*/platform-tools/adb.exe"
APKDIR=$("$ADB" -s 100.75.177.88:5555 shell "pm path moe.shizuku.privileged.api" | head -1 | sed 's/package://' | sed 's|/[^/]*$||' | tr -d '\r')
"$ADB" -s 100.75.177.88:5555 shell "nohup $APKDIR/lib/arm64/libshizuku.so > /dev/null 2>&1 &"
# doğrulama:
ssh ... "RISH_APPLICATION_ID=com.termux rish -c 'echo ALIVE'"
```
Shizuku canlı olduğu için **uygulama dondurma da artık çalışıyor** (uzun bas menüsünde görünür).
Telefon yeniden başlatılırsa Shizuku ölür, bu komut tekrar gerekir.

### Yeni capability'ler
| Capability | İş |
|---|---|
| `deeplink.open` | `{"uri":"spotify:search:..."}` — uygulama içinde içeriğe git |
| `activity.start` | Tam intent: `action`/`data`/`component`/`pkg`/`mime`/`extras` |
| `media.play_search` | `{"query":"Mabel Matiz Gel"}` — ara **ve gerçekten çal** (Shizuku ile ilk sonuca dokunur) |
| `media.control` | `{"action":"toggle\|play\|pause\|next\|prev\|stop"}` |
| `ui.tap` | `{"x":360,"y":471}` — genel otomasyon (Shizuku gerekir) |

`media.play_search` varsayılanları: `pkg=com.spotify.music`, `waitMs=3500`, ilk sonuç
koordinatı `x=360,y=471` (1080x2400 ekran). **Kırılgan nokta:** sabit koordinat —
Spotify arayüzü değişirse veya farklı uygulamada kullanılırsa ayar gerekir.

---

# 🔴 YENİ OTURUMDA BURADAN DEVAM

## ✅ Denetim düzeltmeleri DAĞITILDI ve DOĞRULANDI (2026-08-17 08:00)

11 kusurun tamamı düzeltildi, telefona dağıtıldı, çalışan sistemde test edildi.
`BUILD_OK` · 35 capability · 14 kit · tüm servisler ayakta · 1918 MB boşta.

## 🔋 Şarj bitip yeniden açılma — soğuk açılış denetimi

Telefonun şarjı bitti ve kullanıcı yeniden açtı. Bu, planlanmamış ama çok değerli bir
dayanıklılık testi oldu. **Ölçüm: hiçbir şey kendiliğinden geri gelmedi.**

| Katman | Kendiliğinden geldi mi? | Neden |
|---|---|---|
| Wi-Fi | ✅ | Android |
| **Tailscale** | ❌ | Otomatik bağlanmıyor — kullanıcı elle açtı |
| Termux + sshd | ✅ | `start-sshd.sh` boot'ta kayıtlı |
| **Shizuku** | ❌ | `02-shizuku.sh` çalıştı ama `adb 127.0.0.1:5555 connection refused` |
| **Fabric / llm_bridge / gateway / watchdog** | ❌ | **Boot girdisi hiç yoktu** |

Yani AI-OS'un kendisi için otomatik başlatma yolu **hiç yoktu**; yalnızca Termux:Widget
kısayoluna elle basınca kalkıyordu. Watchdog da Termux'tan başladığı için o da ölüydü —
"watchdog her şeyi ayakta tutar" güvencesi **cihaz yeniden başlayınca geçersiz**.

### Düzeltme: `~/.termux/boot/10-aios.sh` (kuruldu ve test edildi)
Fabric + llm_bridge + gateway + watchdog'u açılışta başlatır. Özellikleri:
- **İdempotent**: çalışan servise dokunmaz (test edildi: hepsini "zaten çalışıyor" diye atladı)
- **Ankrajlı pgrep** (`^node .*src/server.ts`) — SSH oturumlarına yanlış eşleşme hatası tekrarlanmasın
- `10-` öneki: Termux:Boot alfabetik çalıştırır, Shizuku'dan (`02-`) sonra gelir
- Sağlık sonucunu `~/.termux/boot/aios-boot.log`'a yazar

### Hâlâ elle gereken iki şey
1. **Tailscale** — Android ayarlarından "her zaman açık VPN" + "önyüklemede başlat" açılmalı,
   yoksa PC'den erişim her yeniden başlatmada kopar (telefonun kendi PWA'sı `localhost`
   kullandığı için ondan etkilenmez).
2. **Shizuku** — aşağıdaki bölüme bak; otomasyon çalışıyor, tek eksik ADB TCP anahtarı.

## 🔬 Shizuku otomasyonu — ölçülmüş gerçek (2026-08-17)

Önce "insan müdahalesi gerekiyor" dedim, kullanıcı itiraz etti ve **haklıydı**: otomasyon
kurulu ve çalışıyor. Ölçtüğümde kusurun daha dar olduğu çıktı.

**Kanıtlar:**
| Ölçüm | Sonuç |
|---|---|
| Termux kimliği | `uid=10322 untrusted_app_27` — normal uygulama sandbox'ı |
| Root | **yok** (`su` sadece arayan stub, gerçek binary bulunamıyor) |
| `/system/bin/setprop service.adb.tcp.port 5555` | **"Failed to set property"** |
| `settings put global adb_wifi_enabled` | WRITE_SECURE_SETTINGS yok (Shizuku verirdi → tavuk-yumurta) |
| `adbd` | **çalışıyor**, ama USB modunda |
| `service.adb.tcp.port` / `.tls.port` | **ikisi de boş** = TCP dinleyici yok |
| ADB eşleşmesi | **kalıcı** (`adb_known_hosts.pb`, 18 Mayıs) |

Yani `02-shizuku.sh`'ın ADB self-loop'u doğru; **yalnızca adbd TCP dinlerken** çalışıyor.
O dinleyiciyi sandbox içinden açmanın yolu yok — açan tek şey Geliştirici Seçenekleri'ndeki
kablosuz hata ayıklama anahtarı (ya da USB'yle PC).

**Betikte bulduğum iki gerçek hata (ikisi de düzeltildi):**
1. **Sabit port 5555.** Android 11+ kablosuz hata ayıklamada port **rastgeledir** ve
   `service.adb.tls.port` property'sine yazılır. Artık port **keşfediliyor**, varsayılmıyor.
   (5555 yalnızca daha önce PC'den `adb tcpip 5555` yapıldıysa açılır — reboot'ta kapanır.)
2. **Tek deneme.** Açılıştan 25sn sonra bir kez deneyip pes ediyordu; kullanıcı anahtarı
   genelde daha sonra açıyor, o an betik çoktan ölmüştü. Artık **~20 dk bekleyen döngü**:
   anahtar ne zaman açılırsa Shizuku o an kendiliğinden kalkıyor ve bildirim gönderiyor.

**Ayrıca AI-OS içine taşındı** (Termux'a girmeye gerek yok):
- `shizuku.status` — canlı mı, ADB portu var mı, ne yapılmalı
- `shizuku.start` — tek dokunuşla başlatır
- **Ayarlar ekranında** "SHIZUKU · AÇIK/KAPALI" kutusu + BAŞLAT düğmesi + durum açıklaması

**Kalan tek insan adımı:** Geliştirici Seçenekleri > Kablosuz hata ayıklama'yı açmak.
Cihaz bu anahtarı yeniden başlatmalar arasında koruyorsa **hiç insan adımı kalmaz**.
Bu adım root'suz bir sandbox'tan yapılamıyor — Android'in kasıtlı sınırı.

**Shizuku'suz ne kaybediliyor** (ölçüldü, sağlıklı bozuluyor):
- Çalışmayan: `media.control`, `ui.tap`, `app.freeze/unfreeze`, `media.play_search`'ün
  otomatik çalma kısmı, `brightness.set`'in yedek yolu
- Etkilenmeyen: diğer 30 capability (pil, ağ, uygulama listesi, fener, belge, kit'ler,
  paylaşım, betik, LLM — hepsi test edildi, sorunsuz)

---

# 🤝 PC ↔ TELEFON: %100 ORGANİK İŞBİRLİĞİ (2026-08-17) — çalışıyor

**Prompt hazır:** `PC_HERMES_PROMPT.md` (kopyala-yapıştır + nasıl başlatılır)

## ⚠️ Düzeltilen hatam: kendi biçimimi uydurmuştum
Kullanıcı baştan beri **A2A v1.0 standardı** istemişti. Ben Fabric'e özel bir REST
biçimi (`POST /a2a/tasks` + `{text}`) yazmıştım. Çalışıyordu — ama **yalnızca kendi
istemcimizle.** PC'deki Hermes standart JSON-RPC konuşunca `HTTP 404` aldı.
Çoklu platform ancak standartla mümkün; doğru düzeltme istemciyi değil **bizi**
standarda uydurmaktı.

Şimdi **her iki yön de** A2A v1.0 JSON-RPC:
| Taraf | Gelen | Giden |
|---|---|---|
| Telefon (Fabric) | ✅ `SendMessage` RPC | ✅ RPC + Agent Card'dan adres çözümü |
| PC (pc-agent) | ✅ `SendMessage` RPC | — |
| PC Hermes | — | ✅ kendi `a2a` araç seti (yerel) |

Agent Card'a `protocolVersion: "1.0"` + `supportedInterfaces` eklendi (adres artık
tahmin edilmiyor, spec'e göre çözülüyor). Eski REST ucu geriye dönük uyum için duruyor
ama **yeni entegrasyonlar onu kullanmamalı**.

## PC artık akıllı
Kullanıcı PC Hermes'e telefondakiyle **aynı ChatGPT aboneliğiyle** giriş yaptı
(`openai-codex: logged in`). Varsayılan sağlayıcı hâlâ kapalı `omniroute` olduğu için
çağrılarda `--provider openai-codex -m gpt-5.6-luna` gerekiyor.

## Çözülen asıl kusur: uzak ajan cihaza iş yaptıramıyordu
Gelen her A2A görevi doğrudan Hermes gateway'ine gidiyordu. Ama Hermes **yanıt
üretirken capability çalıştıramaz** — PC "pil kaç?" dediğinde telefon
*"bilgi bulunamadı"* diyordu. Simetrik açık biçim eklendi:

```
capability: <ad> | <json payload>      → telefonda GERÇEKTEN çalışır
serbest metin                          → telefondaki Hermes düşünür
```
(pc-agent tarafındaki `skill: <ad> | <arg>` ile aynı desen.)

## Doğrulanmış uçtan uca
| Test | Sonuç |
|---|---|
| PC Hermes → `a2a_discover` | Agent Card okundu, 5 skill |
| PC Hermes → `capability: sensor.battery.read` | **"Pil yüzde 100, sıcaklık 32.2°C"** |
| Telefon → `skill: shell.run \| Get-Date` | PC'de komut çalıştı |
| **İki adımlı işbirliği** | PC kendi terminaliyle hostname aldı → telefona A2A ile bildirim gönderdi → telefonda bildirim çıktı |

## 📌 PARK EDİLDİ (kullanıcı kararı, ileride)
**Omniroute + Tailscale ile ortak model havuzu.** Modelleri bir API ucundan paylaşıp
tüm cihazlarda **ortak fallback mekanizması** olarak kullanmak. Bugün yapılmadı;
yapıldığında PC/telefon/tablet aynı model havuzunu ve aynı fallback zincirini
kullanır, tek cihaza bağımlılık kalkar.

**Ek kimlik doğrulama bilinçli olarak YAPILMADI** — Tailscale ağı dışından erişim
zaten mümkün değil. Ürünleştirme kararı verilirse yeniden değerlendirilecek.

---

# 🔗 PC ajanının araç katmanı (aynı gün, daha önce)

## Mimari karar: SSH üzerine yeni protokol İNŞA EDİLMEDİ
Kullanıcı "SSH ile iki Hermes organik konuşsun" dedi. SSH'ı transport yapmak
yerine **zaten var olan A2A** kullanıldı, çünkü A2A görev yaşam döngüsü,
journal kaydı ve AKTİF sekmesi görünürlüğü getiriyor; SSH bunların hiçbirini
vermeden ikinci bir yol açardı. SSH operasyon kanalı olarak kaldı.

## Ölçülen gerçek: "iki model karşılıklı konuşsun" bugün mümkün değil
| Taraf | Durum |
|---|---|
| Telefon Hermes | ✅ çalışıyor (Codex OAuth → gpt-5.6-luna, gateway 8642) |
| PC Hermes CLI | kurulu (v0.20.1) ama **model sağlayıcısı omniroute :20128 KAPALI** |
| PC ajanı (9310) | çalışıyordu ama **stub'dı** (system.info, fs.list, echo) |

PC'ye ikinci bir beyin koymak yerine **PC araç tarafına alındı** — bu, kullanıcının
kendi yol haritasındaki *"cihaz seçme, capability seç"* maddesiyle birebir aynı:
**tek beyin (telefon), iki gövde.**

## Yapılanlar
**1. `pc-agent` stub'dan gerçeğe** (`pc-agent/skills.ts`, yeni)
| Yetenek | Ne yapar |
|---|---|
| `system.info` | OS/CPU/bellek/uptime |
| `fs.list` | dizin listeler |
| `fs.read` | dosya okur (60KB'a kadar) |
| `shell.run` | PowerShell komutu çalıştırır |
| `git.status` | depo durumu |

Telefondaki `script.run` derslerinin aynısı uygulandı:
- **Yıkıcı kalıp reddi** — test edildi: `Remove-Item -Recurse C:/` → REDDEDİLDİ
- **Yol kaçışı engeli** — test edildi: `../../../Windows/System32/...` → ENGELLENDİ
- SAFE_ROOT dışına çıkılamıyor, çıktılar kırpılıyor, her çağrı loglanıyor
- Anahtar-kelime tahmini yerine **açık biçim**: `skill: <ad> | <arg>`
  (tahmin, yanlış yeteneği sessizce çalıştırıyordu)

**2. `a2a.delegate` capability'si eklendi.** A2A vardı ama yalnızca HTTP ucu olarak;
Hermes bir artefakt içinden başka cihaza iş veremiyordu. Artık normal bir buton eylemi.

**3. Prompt yazıldı** — PC'nin yetenekleri, zorunlu biçim, ne zaman devredip ne zaman
etmeyeceği, ve sınırları.

## Yol boyunca bulunan asıl kusur: Hermes "yaptım" sanıyordu
İlk testte Hermes *"PC ajanına erişemiyorum, bağlantı kurulamadı"* dedi —
**ama hiç denememişti.** Üretim sırasında hiçbir capability çalışmıyor; Hermes
yalnızca metin ve artefakt üretiyor, işi kullanıcı butona basınca sistem yapıyor.
Prompt bunu hiç söylemiyordu, model de yaptığını sanıyordu.

Eklenen en temel kural: *"SEN HİÇBİR ŞEYİ ÇALIŞTIRMAZSIN"* + yasak cümle listesi
("kontrol ediyorum", "denedim", "erişemedim"). Bu yalnızca A2A'yı değil, tüm
etkileşimi düzeltir — model artık uydurmak yerine çalışan düğme üretiyor.

## Doğrulanmış uçtan uca zincir
Telefon → Tailscale → PC → gerçek araç → geri:
```
"PC'de ne kadar boş disk var?"
  → Hermes artefakt üretti (a2a.delegate butonlu, uydurma yok)
  → buton çalıştırıldı
  → {"ok":true,"reply":"[shell.run] OK  C  Used 247027589120  Free 7952502784"}
```

## Kalan / karar bekleyen
- **PC'ye kendi beyni** istenirse: omniroute'u ayağa kaldırmak, ya da PC Hermes'i
  telefonun `llm_bridge`'ine (çalışan Codex OAuth) Tailscale üzerinden bağlamak.
  İkincisi tek model lisansıyla iki cihaza beyin verir.
- **pc-agent elle başlatılıyor** — Windows'ta otomatik başlatma (Görev Zamanlayıcı)
  kurulmadı; PC yeniden başlarsa köprü kopar.
- `shell.run` Tailscale ağındaki cihazlara açık bir kabuktur. Şu an kimlik doğrulama
  YOK; ağ sınırı tek koruma. Peer'a paylaşılan bir anahtar eklenmeli.

---

# 🔍 BAĞIMSIZ DENETİM RAPORU (2026-08-17)

Kendi özetime güvenmeyip dağıtılmış koda bakarak denetledim. **9 gerçek kusur** çıktı;
üçü kendi "tamamlandı" iddialarımın yanlış olduğunu gösterdi.

## En ciddi bulgu: zarf değişikliği gizlilik gerilemesi yarattı

`task.completed` olayı capability sonucunu **olduğu gibi** journal'a yazıyor. Arayüz
eylemlerini zarfa alınca (yani dispatcher'dan geçirince) bu şu anlama geldi:

| Capability | Journal'a kalıcı yazılan şey |
|---|---|
| `clipboard.get` | **pano içeriği** — parola, 2FA kodu, token |
| `speech.listen` | **ses dökümü** |
| `script.run` | **kabuk çıktısı** — env değişkeni, dosya içeriği |
| `llm.generate` | **model yanıtı** — kullanıcının özel metni |

Zarf değişikliğinden **önce** bu veriler journal'a hiç girmiyordu (UI `/read` kullanıyordu,
görev oluşmuyordu). Yani bunu ben yol açtım ve dün raporlamadım. Journal append-only ve
**budanmıyor** — veri süresiz kalıyor.

**Düzeltme:** `sensitiveResult` işareti + `redact()`. Journal'a yalnızca özet düşer
(`{redacted:true, stdout:"21 karakter"}`), gerçek değer süreç belleğinde tutulur ve arayüze
oradan verilir — ekranda tam görünür, diske düşmez. Dört senaryoda sızıntı testi yapıldı.

Aynı sınıftan ikinci bulgu: `clipboard.set` geri alması **önceki pano içeriğini** journal'a
yazıyordu. Artık `sensitive: true` — bellekte tutulur, journal'a girmez. Takas: sunucu
yeniden başlarsa o geri alma kaybolur ve bunu açıkça söylüyor.

## Bulgular

| # | Bulgu | Ciddiyet | Durum |
|---|---|---|---|
| 1 | **"Her giriş tek kapıdan" iddiam yanlıştı** — Hermes'in kendi `llm.generate` çağrısı `read()` kullanıyordu, dispatcher'ı atlıyordu; sohbetler ne AKTİF'te ne DevTools'ta görünüyordu | Yüksek | Düzeltildi |
| 2 | `/capabilities` bir kez yüklenemezse `ACTIONABLE` boş kalır → **her artefakt reddedilir** (fail-closed) | Yüksek | Fail-open yapıldı |
| 3 | `http(s)` kit şablonlarında değer URL-kodlanmıyor → boşluk sorguyu bozuyor, `&` parametre enjekte ediyor. **Spotify'da düzelttiğim hatanın ters yönde tekrarı** | Orta | Şema-duyarlı `buildUri()` |
| 4 | Tüm `read.failed` olayları sabit `correlationId:"read"` ile yazılıyordu → DevTools'ta **tek satıra çöküyorlardı**; hata ayıklayıcı tam da en çok lazım olduğu hata sınıfında kördü | Yüksek | Her hata kendi akışı |
| 5 | `retry()` `origin` taşımıyordu → yeniden denenen iş HEDEF'ini ve kaynağını kaybediyor, "ne/neden" dili boşalıyordu | Orta | Düzeltildi |
| 6 | Otomasyon `dispatch`'i `origin` taşımıyordu → kural tetikli işler "sistem içi" görünüyordu | Orta | Kural adı taşınıyor |
| 7 | `automation.fired` olayları da sabit correlationId ile çakışıyordu | Düşük | Düzeltildi |
| 8 | **Pano içeriği journal'a yazılıyordu** (geri alma yakalaması) | **Kritik** | Bellekte tutuluyor |
| 9 | **Hassas capability ÇIKTILARI journal'a yazılıyordu** (yukarıdaki tablo) | **Kritik** | Redaksiyon |
| 10 | **Hassas capability GİRDİLERİ journal'a yazılıyordu** — 9'un düzeltmesi yarımdı | **Kritik** | `sensitiveFields` |
| 11 | Shizuku yokken kullanıcıya ham kabuk hatası gösteriliyordu; açıklayıcı mesaj hiç tetiklenmiyordu | Düşük | Düzeltildi |

### Bulgu 10 — kendi düzeltmemin yarım olduğunu test ortaya çıkardı
9'u düzelttikten sonra gerçek bir sırla test ettim: panoya `SIRPAROLA-...` yazdım.
Journal API'de **hâlâ 1 kez** çıktı, diskteki WAL dosyasında **29 kez**. Sebep: yalnızca
`task.completed`'in *sonucunu* redakte etmiştim; asıl sızıntı *girdideydi* ve zarf
değişikliği onu üç olaya birden yaymıştı:
`task.created` + `intent.understood` + `intent.dispatched`.

Düzeltme: `sensitiveFields` (capability başına alan adı listesi) — `clipboard.set{text}`,
`share.text{text}`, `whatsapp.send{text,phone}`, `doc.create{content}`, `tts.speak{text}`,
`notification.send{content}`, `llm.generate{prompt,history,context}`. Gerçek değer yalnızca
yürütmeye ve belleğe gider; "tekrar dene"/"geri al" onu bellekten okur.

**Doğrulama (canlı, gerçek sırla):** journal API `0`, WAL dosyası `0`,
kayıt `{"text":"28 karakter"}`, arayüz gerçek değeri almaya devam ediyor
(`script.run` çıktısı ekranda tam, journal'da `"stdout":"18 karakter"`).

`script.run{cmd}` bilerek redakte EDİLMEDİ: komutu görmek DevTools'un tam da dün
düzelttiğimiz betik hataları sınıfı için kritik. Bu bilinçli bir takas.

## Denetimde DOĞRU çıkanlar (kontrol edildi, sorun yok)
- PDF çok sayfa: 150 satır → 4 sayfa, `/Count` tutarlı, **tüm xref offsetleri geçerli**,
  Türkçe folding uygulanmış, ham UTF-8 sızıntısı yok
- Kit kod enjeksiyonu reddi, şablon-sadece kısıtı
- Geri alma yakalama mantığı (ses 3→5→geri al→3)
- Artefakt sözleşmesi sınıflandırması (4 senaryo)
- `llm.generate` THOUGHT sınıfı dispatcher'da doğru işleniyor
- 10 ekranın hepsi geçerli spec üretiyor

## Düzeltilmeyen, bilinçli bırakılanlar
- **Journal budanmıyor** (INSERT var, DELETE/vacuum yok). Zarf değişikliğiyle her UI eylemi
  ~6 olay yazıyor; eskiden 0'dı. Acil değil ama büyüme hızı arttı — rotasyon gerekecek.
- `/journal` `total` alanı 5000'de kırpılıyor, gerçek toplam değil.
- Kullanıcı kiti gömülü bir kitin id'sini ezebilir (örn. `doc/pdf`) — özelleştirme olarak
  tasarlandı ama PDF üretecini sessizce şablona çevirebilir. Ayak kaydırma potansiyeli var.
- `wakelock.acquire` açılışta hâlâ `read()` ile çağrılıyor (dispatcher'ı atlıyor) — tutarsız
  ama zararsız.
- Periyodik `refresh()` (pil/wifi) bilerek `/read`'de bırakıldı; zarfa alınsa journal her
  yenilemede şişerdi.

## Oturum sonu durumu (2026-08-16 21:45 — doğrulandı)
| Bileşen | Durum |
|---|---|
| Fabric (9300) | ✅ çalışıyor, **yeni kod servis ediliyor** |
| llm_bridge (9201) | ✅ 200 · retry + timeout + **dosya logu** |
| Hermes gateway (8642) | ✅ 200 |
| **Shizuku** | ✅ ALIVE (telefon yeniden başlarsa ADB ile tekrar gerekir) |
| Capability sayısı | **35** (26 → +9: share/whatsapp/doc/link/intent/kit/file + ikon+etiket) |
| Kit sayısı | **16** (6 belge formatı · 6 deeplink · 2 intent · +kullanıcı kitleri) |
| Uygulama adları | **52 / 63 gerçek ad** (önce hepsi paket adından türetiliyordu) |
| Ekranlar | home, komut, hermes, activity, device, agents, capabilities **+ journal, connections, settings, miniapps, automations, devtools** |
| Yeni dosyalar | `kits.ts` `envelope.ts` `undo.ts` `automations.ts` `applabels.ts` `pdf.ts` |
| Silinen ölü kod | `screens.ts` + `/screens` ucu |
| Artefakt yedeği | `~/fabric-artifacts.json` · 30 kayıt |
| İkon önbelleği | `~/.cache/aios-icons` · **30 ikon** |
| Watchdog | ✅ **tek** örnek (28943), ankrajlı pgrep |
| Yedekler | `~/backup-2026-08-16-fix/` (değişen her dosyanın öncesi) |

**İlk komut (yeni oturumda):** SSH koptuysa ADB ile Termux'u öne getirip `sshd` yaz.
Servisler düştüyse: `bash ~/.shortcuts/start_hermes_os.sh`


## ✅ 30 artefaktın tamamı okundu — kök nedenler bulundu ve düzeltildi

30 artefaktın 18'i (#11–#28) tek bir başarısızlık sarmalıydı. Altı ayrı kök neden vardı:

| # | Artefakt | Belirti | **Gerçek kök neden** | Düzeltme | Test |
|---|---|---|---|---|---|
| F1 | 28,29,30 | `llm_bridge 500` | Tek deneme, retry yok; hata sebebi hiçbir yere yazılmıyor | 3 deneme + backoff, `/root/llm_bridge.log`, hata gövdesi istemciye | ✅ |
| F2 | 26,27,29 | **"devam et" demeden donma** | `read()`'te **hiç timeout yok** → LLM takılınca fetch asla dönmüyor, kart sonsuza dek dönüyor. Kullanıcının yazması yeni istek başlattığı için "canlanıyor" görünüyordu | `AbortController` (LLM 90sn, diğer 25sn), köprüde 60sn, hata kartında **TEKRAR DENE** | ✅ |
| F3 | 17–21 | `npm start`/`build` patlıyor | `script.run`'ın **çalışma dizini yok** (HOME'da koşuyor); ayrıca 9300'ü öldürüp **arayüzün kendisini** çökertiyor | `cwd` desteği (varsayılan `~/fabric`) + intihar komutu reddi | ✅ |
| F4 | 12,13 | `http://127.0.0. $p` | Sunucuda hiçbir ön kontrol yok, bozuk komut sessizce koşuyor | `bash -n` sözdizimi kontrolü + bozuk URL kalıbı reddi | ✅ |
| F5 | 1,2 | Spotify çalmıyor | Prompt `%20`'li URI öğretiyordu; Spotify onu birebir arıyor | `deeplink.open`'da `spotify:search:` kod çözme + prompt düzeltmesi | ✅ |
| F6 | 5,10 | WhatsApp aktarımı yarım | Paylaşım intent'i (`ACTION_SEND`) **capability olarak hiç yoktu** | `share.text` + `whatsapp.send` eklendi, prompt'a kural | ✅ |
| F7 | — | Fabric ölüyken watchdog onu "ayakta" sanıyor | `pgrep -f 'src/server.ts'` **SSH komut satırlarına da eşleşiyordu** (bugün kanıtlandı: 3 PID, 2'si sahte) | Ankrajlı kalıp `^node .*src/server.ts` | ✅ |

**Doğrulanmış davranış değişiklikleri (gerçek istek, gerçek yanıt):**
- "Mabel Matiz'den bir şarkı çal" → artık `media.play_search` (önce `%20`'li deeplink'ti)
- "WhatsApp'tan gönder" → artık `share.text` (önce `clipboard.set` + `app.open`'dı)
- `npm run build` → `BUILD_OK` (fabric'te **`build` betiği hiç yokmuş** — eklendi; #20/#21'in asıl sebebi buydu)

**Kapanan artefakt maddeleri:** #1,#2 (F5) · #5,#10 (F6) · #11–#21 (F3+F4) · #22–#25 (kaçış işaretiydi, kök neden F3/F4 — çözüldü) · #26–#30 (F1+F2)

### ⚠️ Kapanmayan tek madde
**Artefakt #5'in PDF yarısı.** "A4 → PDF" için belge üretme capability'si **yok**; sadece
paylaşma yarısı (F6) çözüldü. PDF üretimi ayrı bir iş — istenirse yapılır.

### 🔎 Yol boyunca öğrenilen, kaydedilmesi gereken şey
`max_tokens` **üst akış tarafından yok sayılıyor** (12 istendi, model 50'ye kadar saydı).
Yani kesilme (`finish_reason: length`) pratikte olmuyor; donmanın sebebi kesilme değil
**timeout yokluğuydu**. Otomatik-devam mantığı yine de emniyet ağı olarak duruyor.

## Sonra: P2 kalanları
- **Mini-app üretimi** — "bana not uygulaması yap" → artefakt → kalıcı giriş
- **Universal intent history** — veri zaten var (`prompt` + `spec`), sadece görünür kılınacak
- **Aktif işlerde iptal/yeniden dene** (Hermes'te TEKRAR DENE eklendi; aktif işlerde henüz yok)
- **`media.play_search` koordinat kırılganlığı** — Spotify dışı uygulamalar için çözüm
- **PDF/belge üretimi** — artefakt #5'in kapanmayan yarısı

## ✅ Açık işler (v0.3) — HEPSİ KAPANDI (2026-08-16 22:15)

| # | Madde | Durum |
|---|---|---|
| 1 | AI composition bağlanmadı | **Madde eskimişti** — bağlı ve çalışıyor, 30 artefakt bu yolla üretilmiş |
| 2 | Uygulama adları paket adından türetiliyor | ✅ **Çözüldü** — 63 uygulamanın **52'si gerçek adıyla** |
| 3 | 5 ekran yapılmadı | ✅ **Beşi de yazıldı ve doğrulandı** |
| 4 | `src/screens.ts` ölü kod | ✅ **Silindi** (`/screens` ucu da kaldırıldı, artık 404) |

### Madde 2 — gerçek uygulama adları (`src/applabels.ts`, yeni dosya)
Android etiketi düz metin vermiyor (ölçüldü: `pm dump` yalnızca `ApplicationInfo{…}` yazıyor,
etiket `resources.arsc` içinde ikili kaynak; `aapt` Termux'ta yok, `dumpsys` izin istiyor).
Dört katmanlı çözüm: **önbellek → gömülü tablo (35 uygulama) → Play `og:title` → `deriveName()`**.

Sonuç: `Bard` → **Google Gemini**, `Kapisi` → **e-Devlet Kapısı**, `Selfservis` → **Vodafone Yanımda**,
`Adm`/`Bbs` gibi anlamsız adlar gitti. Ayarlar'da **EKSİK ADLARI ÇÖZ** düğmesi var.

İki tuzak yol boyunca yakalandı ve kapatıldı:
- **Olumsuz sonuç önbelleklenmiyordu** → Play'de olmayan paketler (sistem/yan yüklenen) her
  basışta yeniden sorgulanıyordu (ölçüldü: 2. turda 15 isteğin 10'u boşuna). `.miss` işareti
  eklendi; şimdi `remaining: 0` ve tekrar basınca **sıfır istek**.
- Ad kelime ortasından kesiliyordu ("AnyDesk Uzak Masaüstü Yazılı") → kelime sınırında kırpma.

### Madde 3 — beş yeni ekran (`public/js/screens.js`)
| Ekran | Ne yapar |
|---|---|
| **Event Journal** | Journal'ı okunabilir kılar; tür filtresi + hata sayacı. Yeni `GET /journal` ucu — önceden yalnızca canlı SSE vardı, uygulama açılmadan önce olanlar görülemiyordu |
| **Bağlantılar** | Servisler (9300/9201/8642) + A2A peer'lar + `localhost` uyarısı |
| **Ayarlar** | Tema, ağ anahtarı (yeni `appicons.network` capability'si), eksik adları çöz, sistem kısayolları |
| **Mini Apps** | Sabitlenen artefaktlar = mini uygulamalar (ayrı depo yok) |
| **Otomasyonlar** | **Dürüst boş durum**: kural motoru yok, ne eksik olduğunu söyler — var gibi göstermez |

Hepsi Komut ekranından aranabilir. Altısı da (journal'ın filtreli hâli dahil) sahte veriyle
`validateScreen`'den geçirildi: **bölüm ve çocuk sayıları > 0, hiçbiri boş çizmiyor**.

## ✅ P0 MİMARİ İŞLERİ TAMAMLANDI (2026-08-16 gece)

### 1. Universal Intent Envelope — `src/envelope.ts` + `POST /envelope`
**Tek giriş kapısı.** Ses, paylaş menüsü, Hermes, UI butonu, A2A peer, sensör, otomasyon —
hepsi aynı gövdeyle gelir: `{source, raw, understood:{type,payload,by}}`.
Her aşama journal'a düşer: `intent.received → understood → dispatched` (ya da `rejected`).

**Yol boyunca çıkan asıl bulgu:** arayüz eylemleri `/read`'i doğrudan çağırıyordu ve
**o yol dispatcher'ı tamamen atlıyordu** — yani UI'dan yapılan hiçbir iş için görev
oluşmuyor, AKTİF sekmesinde ve journal'da görünmüyordu. `sendIntent()` ile hepsi zarfa
alındı; `wait:true` sayesinde sonuç yine anında dönüyor (script.run çıktısı vb. bozulmadı).

### 2. AKTİF sekmesi = kontrol merkezi, "ne/neden" dilinde
`task.*` olayları insan diline eşlendi (`VERB` tablosu, eşleşme yoksa okunabilir yedek):

| Önce | Sonra |
|---|---|
| `sensor.battery.read · REFLEX · completed` | **Pil %33 okundu** — ekrandan dokunduğun için |
| `torch.set · running` | **Fener açıldı…** — sesli istediğin için · "feneri ac" → torch.set · model yorumladı |
| `script.run · failed` | **Betik çalıştı: x — olmadı** — Hermes'e söylediğin için · hata: sözdizimi |

Her kart: HEDEF (ham ifade) · NEDEN · NE ANLADI · KİM YORUMLADI · ŞU AN NEREDE · SONUÇ.
Butonlar: **İPTAL** (çalışanlar) · **TEKRAR DENE** (başarısızlar) · **GERİ AL** (tamamlananlar).

### 3. Geri alma — `src/undo.ts` + `POST /task/undo`
Zor kısım: bir eylemin tersi her zaman kendinden belli değil. `volume.set`'in tersi
**önceki ses seviyesidir** ve o değer eylem çalıştıktan sonra okunamaz. Bu yüzden defterde
iki alan var: `capture` (eylem ÖNCESİ durumu okur) + `invert` (ters intent'i üretir).

Uçtan uca doğrulandı: ses 3 → 5 yapıldı → yakalanan `{stream:"music",value:3}` → geri al → **3**.
`app.open`, `script.run`, `share.text` gibi geri alınamaz işlerde **buton hiç çıkmıyor** —
sahte bir "geri al" sunmaktansa sunmamak doğru.

### 4. Intent DevTools (eski "niyet geçmişi")
Kullanıcı geçmişi değil **hata ayıklayıcı**. Olaylar `correlationId` üzerinden birleştirilip
tek zaman çizgisi oluyor: **NE SÖYLENDİ → NE ANLADI → KİM YAPTI → NE ÜRETTİ**.
"SADECE HATA" filtresi var. Bu oturumda 30 artefaktın neden battığını bulmak için dosya
dosya gezmek gerekti — bu ekran tam olarak o işi ortadan kaldırmak için var.

### 5. Artefakt sözleşmesi (sizin kuralınız)
> "Üretilen her şema en az bir REFLEX/AGENT capability'sine bağlanmak zorunda;
> salt-bilgi kartları reddedilsin."

İki katmanda uygulandı: **prompt** (model baştan doğru üretsin) + **istemci doğrulaması**
(ihlal ederse kart hiç gösterilmez, kullanıcıya neden reddedildiği ve "iş ekleyerek tekrar
üret" düğmesi çıkar). THOUGHT (`llm.generate`) ve `ui.*` gezinme eylemleri **sayılmaz**.
Dört durumda test edildi: salt-bilgi / sadece-gezinme / sadece-llm → RED, gerçek eylem → KABUL.
Canlı model testi: "pil kartı yap" → artık `sensor.battery.read` butonlu kart üretiyor.

### 6. KİT DEFTERİ — sizin "bu sistemin native özelliği olmalı" itirazınızın karşılığı
İlk sürüm `doc.pdf` diye bir capability yazmıştı. İtirazınız doğruydu ve asıl mesele
formatlar değil **irtifaydı**: bu sistemde yeni bir ihtiyaç çıkınca her seferinde üç yer
elle değişiyordu (capability + prompt + arayüz), biri unutulunca özellik "var ama model
bilmiyor" ya da "model biliyor ama buton yok" oluyordu.

`src/kits.ts` bunu tersine çevirdi: **ihtiyaç artık veri, kod değil.**

| Tür | Ne ekler | Şu an |
|---|---|---|
| `doc` | belge formatı | pdf, md, txt, csv, json, html |
| `link` | deeplink hedefi | spotify, youtube, harita, web, tel, whatsapp |
| `intent` | Android intent | alarm kur, sayaç başlat |

Kanıt (çalışan sisteme, **yeniden başlatmadan, kod yazmadan**):
- vCard formatı eklendi → anında `doc.create format:vcf` çalıştı, geçerli .vcf üretti
- Wikipedia arama hedefi eklendi → `link.open kit:wiki.search` hazır
- `renderer` (kod) içeren kit **reddedildi** — kit'ler şablondur, ifade değil; diske yazılan
  ve arayüzden eklenebilen bir dosyaya çalıştırılabilir kod koymak en kolay ayak kaydırma
  noktası olurdu

Prompt format listesini defterden üretiyor — yeni kit ekleyince model kendiliğinden öğreniyor.

### 7. Otomasyon kural motoru — `src/automations.ts`
OLAY → KOŞUL → EYLEM. Journal akışını dinler (`SseHub.onEvent`), eşleşen kural bir capability
çalıştırır. Sonsuz döngüyü iki şey engeller: `automation.*` olayları kural tetiklemez +
kural başına bekleme süresi. Hazır kurallar: hata olunca titret, görev başarısız olunca
bildir, pil %20 altına inince uyar. Kurallar `~/fabric-automations.json`'da.

**Kasıtlı sınır:** kurallar tek olay tipi + tek eşik kontrolü yapar. Genel ifade dili
(eval/JSONLogic) **bilerek yok** — kullanıcının cihazında keyfi kod çalıştıran bir kural
deposu en kolay ayak kaydırma noktası olurdu.

### 8. Belge üretimi + dosya paylaşımı (artefakt #5 tamamen kapandı)
`pdf.ts` bağımlılıksız A4 PDF üretiyor (~130 satır; Helvetica gömülü olduğu için font
gerekmiyor). Yapısal olarak doğrulandı: xref girdilerinin hepsi gerçek nesne offsetine
işaret ediyor. `file.share` → `termux-open --send` ile gerçek Android paylaşım akışı.

**Not:** `pdf.ts` derlenmiyordu — içinde `import`/`export` görmediği bir .ts dosyasını Node
önce CommonJS sanıp ilk tür açıklamasında patlıyor. İlk ifade `export` yapılınca çözüldü.

## Kalan (P1/P2 — sizin yol haritanızdan)
- **Proactive Fabric** — deterministik tetikleyiciler + policy (IGNORE/NOTIFY/SUGGEST/
  EXECUTE_SAFE/ASK_USER). Otomasyon motoru bunun ilk yarısı; eksik olan policy katmanı
- **Mini-app manifest** — `MiniAppManifest` şeması + storage capability'leri
  (şu an: üretim + otomatik sabitleme var, manifest/kalıcı depo yok)
- **Capability-based multi-device routing** — cihaz değil yetenek seç
- **Hermes'i sekme olmaktan çıkar** — yer değil sistem zekâsı (buffer'da)
- **Offline model**

### `media.play_search` koordinat kırılganlığı — düzeltildi
Önceki sürüm doğrudan sabit bir noktaya dokunuyordu (360,471 = 1080x2400'de ilk sonuç satırı).
Üç kırılgan varsayım: yalnızca Spotify, yalnızca bu çözünürlük, yalnızca arayüz değişmediği sürece.
Artık **önce koordinatsız yol** deneniyor (`KEYCODE_MEDIA_PLAY` — her uygulamada, her
çözünürlükte aynı); olmazsa dokunmaya düşülüyor ve sonuçta hangi yolun kullanıldığı
(`via`) dönüyor. Not: ikisi de Shizuku gerektiriyor, bu sınır değişmedi.

---

> Bu dosya kronolojik günlük DEĞİL. Önce **şu an doğru olan** yazılır, sonra kararlar, sonra sıkıştırılmış tarihçe. Yeni oturumda önce bunu oku.

## ⚡ KULLANIM (en önemli bilgi)

Telefonda **Chrome ile `http://localhost:9300`** aç → menü → **"Ana ekrana ekle"** → tam ekran uygulama olarak kurulur.

**Mutlaka `localhost` kullan.** Tailscale IP'si (`100.75.177.88:9300`) "güvenli bağlam" sayılmaz → mikrofon ÇALIŞMAZ, PWA kurulamaz. Tailscale IP'si sadece PC'den bakmak için.

---

## 1. ŞU AN NE VAR (doğrulanmış mimari)

```
Telefon (Xiaomi 13 Lite, Android 15, 7.4GB RAM, Tailscale 100.75.177.88)
│
├── Termux (kendi Node v26 + Python 3.14)
│   ├── fabric/ ················ TypeScript omurga + AI-OS arayüzü      :9300
│   │     ├── src/ ············ journal, state, capabilities, dispatcher, a2a
│   │     ├── public/ ········· aios.html (Framework7), manifest, sw, ikonlar
│   │     └── Termux'un KENDİ Node'unda (proot'ta DEĞİL - rish/izinler için)
│   └── watchdog.sh ··········· fabric + llm_bridge keepalive + wake-lock
│
├── proot Ubuntu (Python 3.12 + Node 22)
│   ├── hermes-agent/ ········· Hermes v0.20.1, gpt-5.6-luna, Codex OAuth
│   ├── llm_bridge.py ········· ~50 satır LLM köprüsü                    :9201
│   └── hermes gateway run ···· A2A/agent delegasyonu                    :8642
│
└── Arayüz: telefonun KENDİ Chrome'unda PWA (X11/Chromium YOK)
```

**X11 + Chromium-in-Termux kaldırıldı** (v0.1-beta). Üç gerçek hata aynı köke bağlanıyordu: klavye IME'si çalışmıyor (yazı girilemiyor), mikrofon erişimi yok, ~1GB RAM. PWA'ya geçişle üçü birden çözüldü ve bellek 1.5GB → 1.9GB'a çıktı.

**PC (DESKTOP-G34P4EC, Tailscale 100.109.236.30)**
- `pc-agent/server.ts` — A2A test peer (:9310), elle çalıştırılır
- Docker var ama Open WebUI **kaldırıldı** (karar: bkz §2)

### Portlar
| Port | Ne | Nerede |
|---|---|---|
| 9300 | **Fabric** — AI-OS v2 UI + orchestration | Termux Node |
| 9201 | llm_bridge — Codex OAuth → LLM | proot Python |
| 8642 | Hermes gateway — A2A/agent | proot Python |
| 9310 | pc-agent (A2A peer) | PC, elle |

### Fabric HTTP yüzeyi
| Yol | İş |
|---|---|
| `GET /` | AI-OS v2 arayüzü (`fabric/public/aios.html`, her istekte diskten okunur) |
| `GET /screens` | Deterministik ekran kayıt defteri (istemci 1 kez çeker, sonra tüm navigasyon 0ms) |
| `POST /read` | **Salt-okuma** capability, doğrudan await (~200ms), journal'a girmez |
| `POST /intent` | **Mutasyon** — journal'a yazılır, iyimser projeksiyon, taskId döner, sonuç SSE'den |
| `GET /events` | SSE olay akışı |
| `GET /state` | Mevcut projeksiyon |
| `GET /panel` | Fabric debug kontrol paneli (eski ana sayfa) |
| `/.well-known/agent.json`, `/a2a/*` | A2A: Agent Card, task lifecycle, peer yönetimi, delegasyon |

---

## 2. ALINAN KARARLAR (kullanıcı onaylı, 2026-08-16)

| Karar | Sonuç |
|---|---|
| **AI-OS render modeli** | **Deterministik kabuk + LLM sadece içerik.** Menü/navigasyon/geçiş/canlı veri = 0ms. LLM yalnızca kullanıcı açıkça istediğinde, iskelet anında gösterilerek. |
| **Open WebUI** | **Tamamen bırakıldı.** Hem telefondan hem PC'den kaldırıldı. AI-OS v2 zaten istenen arayüz; ayrı bir sohbet katmanı gereksiz karmaşa + telefonda OOM sebebiydi. |
| **retro_os_server.py (9200)** | **Emekli edildi.** 400 satırlık Python render motoru silindi; render/state/karar mantığı Fabric'e (TypeScript) taşındı. Yerine sadece ~50 satırlık `llm_bridge.py` kaldı — çünkü Hermes'in Codex OAuth istemcisi **yalnızca Python'da** var. |
| **Shizuku'nun rolü** | **Opsiyonel ayrıcalık katmanı.** Varsayılan artık Termux-native. Shizuku ölüyse sistem çalışmaya devam eder, sadece `app.freeze` gibi birkaç capability hata döner. |

---

## 3. DAĞILMA GÜNLÜĞÜ — nerede yoldan çıktım (kullanıcı haklıydı)

Kullanıcı 5. oturumda "istediklerimi atlıyorsun, biriktirdiğim fikirleri karıştırıp kayıyorsun" dedi. Taradım, doğruladım:

1. **Shizuku'yu merkeze koydum, Termux'u görmezden geldim.** Watchdog her 30sn `am start` ile Shizuku ekranını açıyordu — üstelik hiçbir zaman düzeltemeyeceği bir şey için (Shizuku *servisi* ADB/uid=shell ister). Tek etkisi ekranı çalmaktı. Ayrıca parlaklık için Shizuku kullanmışım (`termux-brightness` varken), aktivite başlatmak için PC'den ADB kullanmışım (Termux'un kendi `am`'i çalışırken).
2. **AI-OS'u "her dokunuşta LLM tüm ekranı üretsin" diye kurdum.** 23sn→9sn indirip bitti sandım. Ama OS için dokunuş başına 9sn + 3 seyrek buton = kullanılamaz. Kullanıcının baştan koyduğu "neredeyse anlık" kısıtını karşılamadan mimariyi sabitledim.
3. **Fabric'i yazdım ama hiçbir şeye bağlamadım.** TS omurga çalışıyordu ama AI-OS onu tamamen atlıyordu → yetim kontrol paneli.
4. **Open WebUI'yi iki ayrı ada yaptım.** Kullanıcı "ortak olsun" dedi, ben iki bağımsız veritabanı kurdum (hesap taşınmıyor). Üstelik telefondaki kurulum OOM zincirini tetikledi → Termux öldü → Shizuku öldü → sshd öldü.
5. **Servis enflasyonu.** 7.4GB telefonda 6 servise çıktım, hiç budamadım → tekrarlayan çöküşler.
6. **Token israfı.** Ekran görüntüsü döngüsüne girdim, uyarıldım, kısmen düzelttim, sonra tekrar kaydım.

---

## 4. TERMUX vs SHIZUKU — doğrulanmış gerçek

**Termux-native çalışıyor (Shizuku YOK, ADB YOK, izin YOK):**
`am start` (aktivite başlatma) · `pm list packages` · `termux-vibrate` · `termux-volume` · `termux-torch` · `termux-wifi-connectioninfo` · `termux-clipboard-get/set` · `termux-battery-status` · `termux-location` · `termux-notification` · `termux-tts-speak` · `termux-speech-to-text` · `termux-dialog` · `termux-camera-photo` · `termux-sensor` · `termux-wake-lock` · (toplam 80+ komut)

**Elle bir kez izin gerekiyor:** `termux-brightness` → WRITE_SETTINGS "role-managed", `pm grant` ile verilemiyor (denendi, `SecurityException`). Ayarlar'dan elle açılmalı, yoksa Shizuku'ya düşer.

**Gerçekten Shizuku gerektiren:** pratikte sadece `pm disable-user` / `pm enable` (uygulama dondurma).

**Shizuku'nun şu anki durumu: ÖLÜ** ("Server is not running"). Gerekirse PC'den ADB ile tek seferlik başlatılmalı. Sistem onsuz çalışıyor.

---

## 4b. v0.1-beta — ARAŞTIRMA BULGULARI ve NE DEĞİŞTİ

Kullanıcı v0.2-alpha'yı denedi ve üç somut hata bildirdi: uygulamalar açılmıyor, klavye yazmıyor, ses İngilizce algılıyor. Ayrıca "her şeyi sıfırdan yazma, açık kaynak projelerden al" dedi. Araştırma sonuçları:

**① Üç hatanın ortak kök nedeni: yanlış zemin (X11+Chromium).**
- Klavye: Termux:X11'de IME köprüsü güvenilir değil → yazı girilemiyor
- Ses: `termux-speech-to-text`'in **dil seçeneği HİÇ YOK** (`-h` çıktısı doğrulandı) → her zaman İngilizce
- Çözüm: **PWA, telefonun kendi Chrome'unda.** Native klavye, native dokunma, `Web Speech API` ile `lang='tr-TR'`, artı ~1GB RAM tasarrufu. Güvenli bağlam gerektiği için `localhost` şart.

**② Uygulama açma — çalışan yöntem bulundu.** Denenen ve BAŞARISIZ olanlar:
- `am start -n <pkg>/.MainActivity` → çoğu uygulamada aktivite adı bu değil; ayrıca `am` başarısızken bile exit 0 dönüyor
- `monkey -p ...` → `/system/bin/monkey` bir `app_process` sarmalayıcı, Termux PATH'inden çalışmıyor ("Unable to connect to window manager")
- `am start -a MAIN -c LAUNCHER <pkg>` → intent çözülemiyor
- `cmd package resolve-activity` → Termux'tan `SecurityException`

**ÇALIŞAN:** `pm dump <pkg>` çıktısında MAIN+LAUNCHER filtresine bağlı **tüm** bileşenleri topla, sırayla `am start -n` ile dene, ilk çalışanı önbelleğe al. Çoklu aday şart: Spotify 5 activity-alias tanımlıyor (ikon varyantları) ve çoğu **devre dışı**; ProtonVPN'de 8 aday denendi. Doğrulandı: Spotify, Claude, Grok, ProtonVPN hepsi açılıyor.

**③ UI sıfırdan yazılmadı: Framework7 v9.1.2** (`fabric/public/vendor/`, yerelleştirildi, build adımı yok). Kullanılan hazır bileşenler: Navbar, Tabbar, List View, Searchbar, Range slider, Toggle, Toast, FAB, Preloader, Pull-to-refresh ve **Messages + Messagebar** (Hermes sohbeti). Native Material görünüm ve donanım hızlandırmalı geçişler hazır geliyor.

**④ Parlaklık kaldırıldı** — kullanıcı kararı: Android'in kendi hızlı ayarlar kaydırması zaten yapıyor.

### Bilinen sınırlar (beta)
- **Uygulama adları paket adından türetiliyor** (`com.google.android.apps.adm` → "Adm"). Gerçek etiketler (`Find My Device`) `pm`'den izinsiz alınamıyor. İşlevsel ama kozmetik olarak kusurlu.
- **Uygulama ikonları yok** — harf tabanlı renkli avatar kullanılıyor. Gerçek ikonlar APK'dan çıkarma gerektirir.
- `pm dump` ilk açılışta yavaş (~1-2sn/uygulama), sonrası önbellekli ve anlık.

---

## 5. AI-OS arayüzü — nasıl çalışıyor

**Kod:** `fabric/src/screens.ts` (ekranlar VERİdir) + `fabric/public/aios.html` (renderer)

- **Ekranlar veri olarak tanımlı** — yeni ekran eklemek `screens.ts`'e bir nesne eklemektir.
- **Blok tipleri:** `live` (canlı cihaz verisi), `nav` (anlık geçiş), `actions` (capability butonları), `slider`, `toggle`, `appgrid` (gerçek kurulu uygulamalar), `ask` (LLM), `text`.
- **Navigasyon 0ms** — istemci `/screens`'i bir kez çeker, sonra her geçiş yerel + CSS animasyonlu (slide+fade 220ms).
- **Canlı veri ~200ms** — `/read` ile doğrudan, önbellekten anında boyanıp tazeleniyor.
- **LLM sadece "SOR" ekranında** — iskelet (shimmer) anında, cevap ~9sn'de dolar. Kullanıcı boş ekran beklemiyor.
- **Mimari çizgi:** okumalar `/read` (senkron, journal'sız — durum değiştirmiyorlar), mutasyonlar `/intent` (journal + iyimser projeksiyon + SSE reconcile).
- **Görsel:** retro/8-bit his, ama zengin — status bar (saat/pil/ağ/bağlantı), header + geri, alt navigasyon çubuğu (5 sekme), dolan çubuklar, animasyonlu kartlar.

**Chromium ayarı (kritik):** `--window-size=1080,2080` (X11 tuvalinin `xrandr` ile doğrulanmış GERÇEK çözünürlüğü) ve `--force-device-scale-factor` **KULLANILMAZ** — aksi halde pencere tuvale oturmuyor, ekranın sağı kesiliyor. Dokunma-dostu büyütme `aios.html` içinde `body{zoom:2.6}` ile.

---

## 6. BAĞLANTI / GERİ YÜKLEME

```bash
# SSH (Tailscale sabit IP - DHCP değişimlerinden etkilenmez)
ssh -p 8022 -i keys/phone_termux_key u0_a322@100.75.177.88

# ADB
adb connect 100.75.177.88:5555
# adb.exe: C:\Users\anil\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_*\platform-tools\adb.exe

# Tüm yığını başlat (widget da bunu çağırır)
bash ~/.shortcuts/start_hermes_os.sh

# Sağlık
curl http://127.0.0.1:9300/screens   # fabric
curl http://127.0.0.1:9201/health    # llm_bridge
curl http://127.0.0.1:8642/health    # gateway
```

**SSH ölürse** (Android sshd'yi öldürmüş olabilir — OOM'da sık): ADB ile Termux'u öne getir, `sshd` yaz, Enter.

**Tailscale IP'leri:** telefon `100.75.177.88`, PC `100.109.236.30`.

**Bilinen kırılganlık:** ağır iş (büyük pip kurulumu vb.) + tüm yığın aynı anda → Android Termux'u komple öldürüyor. `termux-wake-lock` artık başlangıçta ve watchdog'da alınıyor, bu riski azaltır ama sıfırlamaz.

---

## 7. SIRADAKİ (yapılmadı)

1. **Widget'ı gerçek dokunuşla test et** — `start_hermes_os.sh` yeniden yazıldı, SSH'tan çalıştığı doğrulandı ama ana ekran widget'ına fiziksel dokunuşla henüz test edilmedi.
2. **AI-OS ekranlarını zenginleştir** — `screens.ts`'e yeni ekranlar eklemek artık ucuz (sadece veri). Kullanıcı hangi ekranları istiyorsa: notlar, takvim, medya kontrolü, dosya gezgini, sensör paneli...
3. **LLM'in ekran ÜRETMESİ (opt-in)** — v1'deki "AI ekran yapsın" fikri tamamen çöpe atılmadı; ama artık varsayılan değil, kullanıcının açıkça istediği bir eylem olmalı ("bana X için bir ekran yap" → LLM `screens.ts` şemasına uygun JSON üretir → deterministik renderer çizer). Bu, hızı bozmadan "yaşayan OS" hissini geri getirir.
4. **Fabric'i PC'de de çalıştır** — aynı kod, `FABRIC_SELF_URL` env ile. Platform bağımsızlık hedefi (telefon/PC/Android TV/Linux) için bir sonraki adım.
5. **`fabric/src/ui.ts` (debug paneli)** hâlâ ölü `screen.render` butonları içeriyor — zararsız ama temizlenmeli.
6. **Shizuku'yu ADB'den başlatma akışını script'le** — gerekirse tek komutla.

---

## 8. SIKIŞTIRILMIŞ TARİHÇE (1.-4. oturum)

- Termux + proot Ubuntu + Hermes v0.20.1 (Codex OAuth) + Shizuku + Termux:X11 + Chromium kiosk kuruldu.
- **Tailscale kalıcı IP** bulundu (`100.75.177.88`) — DHCP değişim sorunu bitti.
- **MIUI "arka planda pencere açma" engeli** — kullanıcı Ayarlar'dan Termux + Shizuku için elle açtı, `am start` artık gerçekten öne geçiyor.
- **Termux:Widget** kuruldu (F-Droid sürümü); widget script'inde `cd X && ./script` çalışmıyordu → mutlak yol + `bash "$HOME/..."` ile düzeltildi.
- **Watchdog kök-neden hatası**: `pgrep -f moe.shizuku.privileged.api` Android process izolasyonu yüzünden Termux'tan asla başarılı olamaz → her 30sn gereksiz Shizuku relaunch. (5. oturumda tamamen kaldırıldı.)
- **Ekran taşması**: `--force-device-scale-factor` + yanlış `--window-size` → sağ taraf kesiliyordu. `xrandr` ile gerçek çözünürlük (1080x2080) bulunup birebir eşitlendi, büyütme CSS zoom'a taşındı.
- **Fabric** (TypeScript orchestration spine) yazıldı: SQLite WAL journal, deterministik reducer'lar, crash recovery, REFLEX/THOUGHT/AGENT sınıfları, A2A (Agent Card + task lifecycle + peer delegasyonu). **PC round-trip kanıtlandı**: telefon → Tailscale → PC → gerçek Windows sistem bilgisi → telefon.
- **Open WebUI** kuruldu (PC Docker + telefon pip), telefonda OOM zincirine yol açtı, 5. oturumda tamamen kaldırıldı.
