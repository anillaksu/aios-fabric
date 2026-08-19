# AIOS — AKTİF İŞ KUYRUĞU (2026-08-19)

Bu dosya, dağınık oturum isteklerini uygulanabilir iş sırasına çeviren
**planlama indeksidir**. Kanıt kaynağı değildir: bir iş ancak commit + test +
canlı kanıt zinciriyle `CHECKLIST.md` ve handoff içinde FACT olur.

## 0. Bugünkü çalışma ağacı sınırı

Başlangıçtaki çalışma ağacı kanıt kümelerine ayrıldı. Aşağıdaki commitler
birbirinin canlı kabulünü miras almaz; her satır kendi kanıt seviyesindedir.

| Küme | Kod alanı | Durum |
|---|---|---|
| Güvenli execution yüzeyi | `8237ba9` · `a2a.ts`, `capabilities.ts`, `dispatcher.ts`, `read-policy.ts`, `server.ts`, ilgili testler | TEST-VERIFIED; canlı B-13 zincirine yeni davranış eklemeden önce ayrı denetim gerekir |
| Ortak atmosfer / başlatıcı / provisioning | `a4b7b2d` · launcher, boot, watchdog, deployment ve provisioning widget | FACT: Widget canlı başarı, `fabric.env` mode 600, authenticated Gateway 200; B-9 survivability yine açık risktir |
| Phone Workspace dock / clipboard / Operator Deck | `385a7ed` · `workspace-dock.js`, `clipboard-import.js`, app/navigation/screen/CSS ve testler | TEST-VERIFIED; telefon ekranında görünür kabul bekler |
| Eski yüzey temizliği | `8237ba9` içinde `src/ui.ts` silinmesi ve agent-surface denetimi | TEST-VERIFIED |

## 1. Önce kanonikleşecek operasyon işleri

1. **Provisioning canlı zinciri**
   - Kod: `scripts/provision-fabric-gateway-key.sh` yalnız Hermes'in
     `gateway.platforms.api_server.extra.key` canonical store'una ve Termux
     `FABRIC_GATEWAY_KEY` ortamına yazar.
   - Canlı kabul: Termux:Widget operatör komutu başarıyla çalıştı.
   - 2026-08-19 canlı ölçüm: `fabric.env` mode `600`; anahtar ekrana/loga
     yazılmadan Gateway `/v1/models` authenticated yanıtı `200` döndü.
   - Kanonik commit: `a4b7b2d`; bu operational FACT B-9'un MIUI/HyperOS
     survivability riskini kapatmaz.

2. **B-9 operasyon ayrımı**
   - Anlık servis sağlığı ölçülür; MIUI/HyperOS'un gelecekte süreç öldürmeme
     garantisi değildir.
   - Otomatik restart/wake-lock kodu vardır; fiziksel Android güç ayarı ve
     zaman içindeki survivability ayrı canlı risktir.

3. **Çalışma ağacını kanonik commitlere ayırma**
   - Her küme için: diff → dar test → build → telefon dağıtımı → canlı kanıt →
     commit → handoff. Önceki kanıt zinciri squash/rebase edilmez.

## 2. Telefonun günlük çalışma yüzeyi — görünür öncelik

| İş | Mevcut kod kanıtı | Eksik minimum yeterli ürün dilimi | Durum |
|---|---|---|---|
| HOME + KEŞFET | Deterministik katalog, Türkçe tag araması, kategoriler, `app.list`/artifact/ApplicationEntry projection | Gerçek cihazda kategori → uygulama → geri → HOME akışının uçtan uca kabulü ve kanonikleşme | TEST-VERIFIED / canlı kabul bekler |
| Android uygulama başlatıcı | `app.list`, `app.open`, `androidAppsScreen`, long-press app sheet | Listeleme/arama/açma/geri akışının tek görünür launcher yüzeyinde telefon kabulü | TEST-VERIFIED / canlı kabul bekler |
| Kaydırılabilir medya paneli | `scroll-region → stack → range`, local state, release'te `volume.set`, dispatcher | Zaten referans FACT; metadata/playback state yalnız gerçek capability gelirse eklenir | FACT sınırı korunur |
| Cihaz Durum Merkezi | Battery/Wi-Fi/app list mapping, loading/empty/error | Verisi olan yeni read capability'ler varsa yalnız deterministic mapping; veri uydurulmaz | Mevcut referans FACT; genişletme TARGET |
| Artifact / ApplicationEntry | Kalıcı artifact, launcher identity, recent/pin, WindowManager | Application lifecycle'nin kendi telefon UI kabulü ve kanonikleşme | TEST-VERIFIED |

## 3. Android / cross-platform iletişim temeli

Amaç: kullanıcı telefondan AIOS/Linhx'e doğrudan yazabilsin, konuşabilsin ve
standart girişlerden bağlam aktarabilsin. Bu, yeni bir LLM execution yolu veya
ayrı wire protocol değildir.

### Kodda bugün var

- PWA composer → `llm.generate` intent → envelope → dispatcher.
- PWA Share Target (`manifest.json`) → URL parametreleri → `ask()`.
- `SpeechRecognition` / `webkitSpeechRecognition` ile sesli giriş (secure
  origin şartı); PWA shortcut ile açılabiliyor.
- Termux launcher, Android standart `ACTION_VIEW` ile localhost PWA'yı açıyor.
- `share.text`, `tts.speak`, `speech.listen`, `clipboard.get/set`, bildirim ve
  Android app/deeplink capability'leri dispatcher/policy altında mevcut.

### Eksik, sırayla yapılacak minimum ürün dilimleri

1. **Unified ingress surface** — composer, Share Target, voice shortcut ve
   Android intent bağlamı aynı görünür "Linhx'e gelen" kartta kaynak etiketiyle
   görünür; tümü mevcut `ask()`/envelope hattını kullanır. **TARGET.**
2. **Konuşma turu** — kullanıcı isteği → görünür transcript → güvenli mevcut
   Hermes yanıtı → kullanıcı isterse `tts.speak` dispatch. TTS varsayılan
   otomatik çalışmaz; bu `notify` capability'dir. **TARGET.**
3. **Platform adapter sınırı** — PWA/Web Share/Web Speech destekliyse native
   kullanır; Android Termux yalnız intent/notification/capability adaptörüdür.
   Masaüstü diğer cihazlar aynı PWA, Share API ve klavye üzerinden çalışır.
   Native Android uygulaması, yeni websocket/protocol veya Cloudflare execution
   bu dilimin dışındadır. **TARGET.**

## 4. AIOS Access Gate — ilk kullanıcı güvenlik artefaktı

Bu, yeni bir biyometrik sistem veya AIOS'un sakladığı insan verisi değildir.
Kullanıcının oluşturacağı kalıcı giriş yüzeyi, mevcut ayrımları korur:

```text
ApplicationEntry (kişisel launcher kimliği)
  → Access Gate artifact (karşılama / yönlendirme yüzeyi)
  → WebAuthn passkey (Android/cihaz doğrulayıcısı)
  → server session (Fabric endpoint enforcement)
  → kişisel Phone Workspace
```

- **Biyometri:** AIOS/Hermes/artefact'a girmez; WebAuthn yalnız cihazın
  doğrulama sonucunu ve imzalı kanıtını kullanır.
- **Kurtarma:** ayrı owner kararı sonrası, sunucu tarafında salt + bellek-zor
  türetme ile doğrulanan parola faktörü olabilir; düz metin, istemci hash'i,
  LLM erişimi veya görünür secret yoktur.
- **Artifact sınırı:** Access Gate oturum authority'si değildir. Yalnız gerçek
  auth contract'ının görünür, kişiselleştirilebilir ApplicationEntry yüzeyidir.
- **Bugünkü kod gerçeği:** WebAuthn, login/session veya tüm Fabric endpoint
  enforcement henüz yok; PWA HTTP localhost/Tailscale originlerinde çalışıyor.
  Bu nedenle yalnız dekoratif bir kilit ekranı yazılmayacak. **TARGET.**

### Uygulama sırası

1. Sabit güvenli HTTPS origin ve origin/cihaz paylaşım sınırı.
2. WebAuthn registration/assertion + server challenge/credential public-key
   deposu; AIOS biyometrik veri saklamaz.
3. Kısa ömürlü server session ve korunan Fabric endpointleri; doğrudan HTTP
   isteği ekranı atlayarak yetki kazanamaz.
4. Owner'ın seçtiği kurtarma faktörü ve rate-limit/oturum kapatma semantiği.
5. Ancak bundan sonra Layer A ile Access Gate artifact + ApplicationEntry
   karşılama seremonisi ve telefon canlı kabulü.

Bu madde, mevcut Operator Deck görünür kabulü ve çalışma ağacının
kanonikleşmesinden **sonra**, unified phone ingress'ten ise **önce** ele
alınacak güvenlik paketi olarak sıralanmıştır.

## 5. Görünür kalite ve erişilebilirlik kuyruğu

- Her metin/kart/list öğesi: wrap veya tam ayrıntı açılışı; sessiz ellipsis ile
  anlam kaybı yok.
- Her action: aria-label, touch target, pressed/disabled/working/hata geri
  bildirimi.
- Navigation: secondary ekranın gerçek geri dönüşü, arama bağlamının korunması,
  modal ile navigation ayrımı, Android back/browser history.
- Motion: native View Transition varsa kısa/purposeful transition;
  `prefers-reduced-motion` tam fallback.
- Tema: merkezi tokenlar, Night City dahil tüm temalarda kontrast/okunabilirlik.

Bunlar ayrı "CSS paketi" değil; her görünür ekranın telefon kabul kriteridir.

## 6. Bilinçli olarak açılmayacak dallar

Bu maddeler gerçek kullanım zorunluluğu ya da owner'ın yeni açık kararı olmadan
başlatılmaz:

- Layer B sandbox, iframe/origin, widget postMessage bridge.
- Generic state store, shared widget state, pub/sub, persistent widget state.
- Artifact compiler/DAG optimizer, büyük component paketi.
- W6.N/O/P/V/Z'nin bağımsız altyapı sürümleri.
- Cloudflare Worker/D1/R2, paylaşım, ekonomi, token, değer transferi.
- AETHER'in execution'a bağlanması.

## 7. Sıralı çalışma kuralı

```text
operasyonel güvenlik kanıtı
  → mevcut uncommitted kümeleri kanonikleştir
  → HOME/Discover/launcher görünür kabulü
  → Access Gate güvenlik paketi
  → unified phone ingress (yazı/share/voice)
  → gerçek kullanıcı ihtiyacından çıkan tek yeni primitive
  → test + build + telefon + canlı kanıt + commit + handoff
```

Bu kuyrukta "tamamlandı" yalnız testten sonra değil, ilgili telefon yüzeyinde
kullanıcı tarafından görülüp kullanıldığında yazılır.
