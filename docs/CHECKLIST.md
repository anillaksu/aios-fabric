# AI-OS FABRIC — CANLI İŞ LİSTESİ

**Bu dosya tek doğruluk kaynağıdır.** Her oturum burayı okur, iş bitince burayı işaretler.
Bir madde ancak **canlı kanıtı** varsa `[x]` olur — "yazdım, çalışıyordur" sayılmaz.

Son güncelleme: 2026-08-17 · Kanonik depo: `C:\Users\anil\Desktop\aios-fabric`

**Belge haritası:** bu dosya = *ne yapacağız* · `docs/MIMARI_TEMEL.md` = *nasıl karar veriyoruz*
· `docs/STANDARTLAR.md` = *hangi standarda dayanıyoruz* · `docs/PLAN_W6_app-shell.md` = *W6 tasarımı*.
Çakışırlarsa **bu dosya kazanır.**

---

## 0. DEĞİŞMEZ KURALLAR (her madde bunlara uyar)

- [x] **K1 — Kanonik kaynak.** Telefondaki `~/fabric` ile depo birebir aynı olmalı; kanıt `deploy-to-phone.sh --check` → `✅` (29 dosya)
- [x] **K2 — Doğrulama kapısı.** Hiçbir iş şu üçü olmadan "bitti" değil: `BUILD_OK` + sunucu `/` **200** + davranışın **canlı tek çağrıyla** kanıtı
- [x] **K3 — AETHER protokolü.** Oturum `aether_info`/`aether_handoff` ile açılır, iş bitince `aether_append_delta` ile kapanır
- [x] **K4 — Yetki matrisi sahibindedir.** Onay katmanına ajan dokunmaz; `risk: "ask"` olan iş onaysız çalışmaz
- [ ] **K5 — Görünür doğrulama.** Test ederken cihazda **gerçekten görünür** eylemler tetiklenecek (kullanıcı ilerlemeyi görsün), ama **önceden haber verilerek**
- [ ] **K6 — Fütürizm.** Geleneksel/eskimiş çözüm reddedilir; modern, esnek, geleceğe uyumlu web platformu tercih edilir
- [ ] **K7 — Maliyet disiplini.** Gezinme/menü/pencere etkileşimi **sıfır token**; modele yalnızca gereken veri parçası gider
- [ ] **K8 — Kanıt ilkesi.** *Koddan kanıtlanmayan doğru kabul edilmez; kanıttan türetilmeyen kodlanamaz.* Dışarıdan gelen iddia (rapor, kıyaslama tablosu, tier list) önce koda sorulur
      · **Kanıt skalası dört seviyeli** (2026-08-17, `docs/MIMARI_TEMEL.md` §0.1): **FACT** (canlı çağrıyla kanıtlı) › **TEST-VERIFIED** (otomatik test var, cihazda koşmadı) › **REVIEW-VERIFIED** (yalnız kod okundu) › **TARGET** (kodda yok). Ayrım bürokrasi değil iş planı: kalan işleri farklı — TEST-VERIFIED dağıtım bekler, REVIEW-VERIFIED test bekler
- [ ] **K9 — Standart temeli.** *Standardizasyon temel alınmayan çökmeye mahkûmdur.* Kendi format icat etmek son çare; varsayılan mevcut standarda uymak — bkz. `docs/STANDARTLAR.md`
- [ ] **K10 — Öz alma.** *Yoktan var etme yoktur.* Her yapı için "bunun standart karşılığı ne?" sorusu sorulur; değer yeni format icat etmekte değil, birleşimin çalışan ilk örneği olmakta

---

## W0 — a2a.delegate kırığı ✅ TAMAMLANDI (commit `7d21a0c`)

- [x] W0.1 `dispatcher.ts`: sınıf-tabanlı dallanma → executor-varlığı tabanlı dallanma
- [x] W0.2 `a2a.delegate` self-fetch → süreç içi `A2AHub` çağrısı (`setA2AHub` enjeksiyonu)
- [x] W0.3 Timeout zinciri hizalandı (capability 25s < envelope 30s < UI 35s; `llm_bridge` 80s)
- [x] **Canlı kanıt:** PC'den gerçek `system.info` döndü, `taskId ff67e0b5` journal'da `task.completed`

## W1 — Yetki ve risk katmanı ✅ TAMAMLANDI (commit `faafee4`, `fe513a9`)

- [x] W1.1 `Capability.risk` alanı (`safe|notify|ask`, varsayılan `ask`)
- [x] W1.2 38 capability sınıflandırıldı (17 safe · 10 notify · 11 ask)
- [x] W1.3 Dispatcher'da zorunlu risk kapısı — `ask` onaysız çalışmaz, `task.failed` olarak journal'a düşer
- [x] W1.4 Otomasyon kuralı `ask` hedefleyemez (400) + zincir derinliği kesici (`MAX_CHAIN_DEPTH=3`)
- [x] W1.5 Peer başına Bearer token (fail-closed) + CORS wildcard kaldırıldı
- [x] W1.6 `pc-agent`: `shell.run` varsayılan KAPALI; `disk.free` + `proc.list` eklendi
- [x] W1.7 `link.open`/`intent.run` girdi (`q`) **ve** çıktı redaksiyonu
- [x] W1.8 `GATEWAY_KEY` → `FABRIC_GATEWAY_KEY` env
- [x] W1.9 **(sırasında bulundu)** A2A `capability:` kısayolu risk kapısını atlıyordu → kapatıldı
- [x] W1.10 **(sırasında bulundu)** `/a2a/delegate` ucu auth'suz ve risk kapısısızdı → 403
- [x] W1.11 **(sırasında bulundu)** Çalışan `pc-agent` kanonik depodan değil, eski oturum klasöründen koşuyordu → düzeltildi
- [x] **Canlı kanıt:** token'sız 401 · `ask` reddi · otomasyon 400 · `shell.run` kapalı · journal'da arama terimi yok

## W1.5-EK — Kanoniklik açığı ✅ TAMAMLANDI (commit `38ec46a`)

- [x] `aios.html`, `css/*`, `sw.js`, `manifest.json`, `vendor/`, `icons/` depoya alındı (hiçbiri izlenmiyordu)
- [x] `deploy-to-phone.sh` dağıtım + doğrulama kapsamı 17 → **29 dosya**
- [x] `.gitattributes`: ikili varlıklar `binary`, metin varlıklar LF
- [x] SSH restart askıda kalma sorunu düzeltildi (üç dağıtımda üst üste takılmıştı)

---

## W2 — A2A v1.0 protokol uyumu ✅ TAMAMLANDI (commit `3d61479`)

- [x] W2.1 `/.well-known/agent-card.json` (iki tarafta); `agent.json` alias kalır
- [x] W2.2 Agent Card tek kaynaktan üretilsin: `version` ← `package.json`, `skills` ← capability registry, **yalnızca `risk:"safe"` olanlar dışa duyurulur**
- [x] W2.3 v1 alanları: `protocolVersion`, `supportedInterfaces`, `TASK_STATE_*`, `ROLE_*`
- [x] W2.4 `GetTask` / `ListTasks` / `CancelTask` + `pc-agent`'ta JSON-RPC task kaydı (**bulundu**: hiç kaydedilmiyordu → düzeltildi)
- [x] W2.5 A2A görevlerini journal'a bağla (`a2a.task.snapshot` event'i, boot'ta replay)
- [x] W2.6 İstemci canonical yolu önce denesin (`agent-card.json` → `agent.json`)
- [x] **Canlı kanıt:** iki tarafta da `agent-card.json` 200 (`version:"0.1.0"`, B-1 kapandı) · `SendMessage`→`TASK_STATE_COMPLETED`/`ROLE_AGENT` · `GetTask`/`ListTasks` pc-agent'ta **artık buluyor** (eskiden bulamazdı) · sunucu yeniden başlatıldıktan **sonra** aynı `taskId` hâlâ sorgulanabiliyor · `CancelTask` tamamlanmış işi doğru reddediyor (`-32002`) · legacy `agent.json` alias hâlâ 200
- [x] **(sırasında bulundu)** `pollPeerTask()` ve `detectSkill()`/`execSkill()` ölü kod → silindi (B-2 kapandı)

## W3 — Asenkron teslim ✅ TAMAMLANDI (commit `c8bb47b`)

- [x] W3.1 `wait:false` yolu: iş kabul edilir, `taskId` hemen döner (**zaten vardı** — `server.ts:430`)
- [x] W3.2 Task tamamlandığında bildirim → AKTİF sekmesinde sonuç (`notifyOnComplete` + `notification.send`)
- [x] W3.3 Kalan sınırsız `fetch`'e `AbortSignal.timeout` — `a2a.ts:363` (gelen A2A'nın serbest-metin yolu, Hermes gateway'e giden çağrı, 90s)
- [x] W3.4 SSE yalnızca canlı görüntüleme; doğruluk ve nihai durum journal/task state'ten (**zaten böyleydi**, `S.tasks` `/state`'ten geliyor)
- [x] W3.5 Restart / offline / screen-locked durumda task kaybolmaz — journal replay + `markInterrupted` (**önceden vardı**); reconnect'te `/state` anında tazeleniyor (`app.js` SSE onState)
- [x] **Canlı kanıt:** `wait:false` ile gönderilen `sensor.battery.read` (`taskId 51d7e364`) anında `{ok:true,taskId}` döndü · task tamamlanınca journal'da otomatik `notification.send` task'ı görüldü (`title:"İş tamamlandı"`, `origin:system`) · `deploy --check` → 29 dosya birebir aynı
- [x] **(not)** W3.5'in "task kaybolmaz" kısmı bu oturumda YAZILMADI — `state.ts:markInterrupted` önceden mevcuttu; kod incelemesiyle doğrulandı, mid-flight crash simülasyonu (risk:ask olmayan yavaş bir capability yokluğu nedeniyle) zorlanmadı

## W4 — MCP cihaz sunucusu ✅ TAMAMLANDI (commit `9480f6f`)

- [x] W4.1 Capability registry → `tools/list`; `/mcp` Streamable HTTP (tek endpoint, POST+GET+DELETE; spec doğrulandı: modelcontextprotocol.io/specification/2025-03-26)
- [x] W4.2 Fail-closed: yalnızca `risk:"safe"` + açıkça izinli olanlar dışa açılır (`MCP_DENYLIST` genişleme noktası)
- [x] W4.3 `tools/list` ve `tools/call` **aynı** `isMcpExposed()` fonksiyonunu paylaşır
- [x] W4.4 Yetkilendirme (Bearer token + `Mcp-Session-Id`) `risk:safe` filtresinden **ayrı katman** — fail-closed, W1.5 ile aynı desen
- [x] W4.5 `tools/call` `dispatcher.dispatch()` üzerinden yürütülür — sonuç journal/task lifecycle'a bağlı
- [x] W4.6 `risk:"ask"` capability hem discovery'de yok hem doğrudan çağrıda `-32602` — **canlı doğrulandı**
- [x] W4.7 Origin doğrulaması, oturum yönetimi, GET/DELETE→405 — **canlı doğrulandı**
- [x] W4.8 Protokol hatası (`-32602`) ile tool çalışma hatası (`isError:true`) ayrımı — spec'ten doğrulanıp uygulandı
- [x] **Canlı kanıt (10 test):** auth'suz→401 · initialize→200+`Mcp-Session-Id` · oturumsuz `tools/list`→400 · `tools/list` tam 17 `safe` capability döndü (`script.run`/`whatsapp.send`/`a2a.delegate` yok) · `wifi.info` çağrısı gerçek veriyle `isError:false` · `script.run` çağrısı `-32602` (execution error DEĞİL, protokol hatası) · bilinmeyen tool `-32602` · journal'da `origin.source:"mcp"` · `GET /mcp`→405 · sahte `Origin` header→403
- [x] **(kapsam kararı, bilinçli)** Tam SSE/resumability yazılmadı — spec'in izin verdiği tek-JSON-yanıt modu seçildi; gerekçe: dışa açılan tek şey `risk:safe` (tanımı gereği hızlı/salt-okuma), SSE'nin çözdüğü "uzun süren çağrıyı güvenle tamamlama" problemi burada yok
- [x] **W4-KALICI** (commit `215e700`, `bf6b23f`) — `fabric/test/mcp.test.ts`: 4 sözleşme testi (`node:test`, dış bağımlılık yok) — tools/list↔isMcpExposed() üç yoldan tutarlılık, risk:ask ne listede ne çağrıda, protokol hatası (`-32602`) vs `isError:true` ayrımı, oturum zorunluluğu. `deploy-to-phone.sh`'e **4b) Sözleşme testleri** adımı eklendi — build'den sonra, restart'tan önce çalışır, başarısız olursa dağıtım orada durur. **Bulunan gerçek açık:** `package.json` deploy kapsamında hiç yoktu — test kapısı bunu ilk denemede yakaladı (sessizce geçmedi), kapsam düzeltildi (32 dosya)

## W5 — Deterministik action bus ✅ TAMAMLANDI (commit sıradaki)

- [x] W5.1 `llm.generate` çıktısına **sunucu tarafında** doğrulama — `fabric/src/screenspec.ts` (yeni), `renderer.js`'in aynı kuralları (bilinmeyen bileşen → elenir, izinsiz action → kaldırılır, derinlik sınırı) sunucuda tekrarlıyor; istemci kopyası **kaldırılmadı** (iki katmanlı savunma, bilinçli)
- [x] W5.2 **(bulundu ve düzeltildi)** A2A'nın `capability: X | Y` yolu hâlâ `cap.execute()`'u **doğrudan** çağırıyordu (W1.9 yalnızca aynı kontrolün bir kopyasını eklemişti, tam yolu değiştirmemişti) — artık `dispatcher.dispatch()` üzerinden yürüyor, W4'te MCP için kurulan **aynı desen**. UI/A2A/MCP/otomasyon artık tek bus'tan geçiyor
- [x] W5.3 Model "cihaz bilgisi" uydurması — enforcement **mimari**: dispatcher yalnızca gerçek `capability.execute()` sonucuna güvenir, model metnine asla; `prompt.ts:26` bunu talimat seviyesinde pekiştiriyor (LLM'e teknik olarak dayatılamaz, mimari sınır asıl garanti)
- [x] W5.4 Action şemasında capability/risk/hedef doğrulaması — `screenspec.ts`'teki `actionAllowed()` yapısal geçerliliği kontrol eder (capability var mı), risk kapısı **ayrı bir sınır** olarak dispatcher'da kalır (bilinçli ayrım, aşağıya bak)
- [x] W5.5 Protokol hatası vs execution hatası ayrımı W4'ten buraya da taşındı — `app.open` param eksikliği `task.failed` (execution), bilinmeyen capability/risk:ask reddi ayrı
- [x] W5.6 `validate → authorize → dispatch → journal` zinciri — tek bus (`dispatcher.dispatch`) zaten bunu; A2A'nın düzeltilmesiyle **tüm** yollar aynı zincirden geçiyor
- [x] W5.7 İdempotency — dispatcher zaten destekliyordu (`idempotencyKey`), A2A'ya bağlandı (`"a2a:"+task.id`). **Bilinen sınır (kalıcılaştırıldı, gizlenmedi):** bu yalnızca A2AHub süreci içi tekrarı engeller; çağıranın kendi `messageId`'sini taşıması gerçek uçtan-uca idempotency için gerekli, henüz plumbing edilmedi
- [x] W5.8 **Canlı+otomatik kanıt (`fabric/test/action-bus.test.ts`, 8 test):** geçerli action (kit.list tamamlandı) · eksik parametre (app.open→"pkg gerekli", yan etkisiz) · sahte cihaz bilgisi (bilinmeyen bileşen elendi, bozuk JSON bloğu silindi) · yetkisiz capability (script.run→"onay gerektirir") · doğrudan A2A action (kit.list dispatcher'dan geçti, journal'da `origin.source:"a2a"`) · A2A'dan risk:ask reddi
- [x] **W5.9 (bulundu, commit `ec331fd`)** `llm.generate` çağıranın gönderdiği `context` alanına köru köre güveniyordu — `risk:"safe"` olduğu için MCP'den dışarıdan da çağrılabiliyor (W4), yani bir MCP istemcisi sahte cihaz durumu enjekte edip modelin bunu gerçekmiş gibi kabul etmesini sağlayabilirdi. `readLiveDeviceContext()` eklendi: bağlam artık **yalnızca sunucunun kendi** `sensor.battery.read`/`wifi.info` çağrılarından geliyor, çağıranın iddiası tamamen yok sayılıyor. **Canlı kanıt:** MCP üzerinden `context:"UYDURMA-PIL-999-TAMAMEN-SAHTE"` gönderildi, model gerçek veriyle cevap verdi (`"Pil %18 ve şarj oluyor"`) — uydurma veri sisteme hiç girmedi. Regresyon testi: `fetch` yakalanıp llm_bridge'e giden gerçek istek gövdesinde sahte string'in olmadığı doğrudan kanıtlanıyor

---

## W6 — YENİ ARAYÜZ: App Shell + Pencere/Widget Sistemi ⬜ (kullanıcı vizyonu, 2026-08-17)

> Ayrıntılı tasarım: `docs/PLAN_W6_app-shell.md`
> **Zamanlama kararı: EN SONA.** W2–W5 bittikten sonra başlanır (kullanıcı: "en son bitişte").

**Kullanıcının şartları — hiçbiri atlanmayacak:**

- [ ] W6.A **Sıfır-token gezinme.** Menü açma, ızgara→tam ekran odaklanma tamamen istemci JS. Hermes'in haberi olmayacak
      *(not: sekme/ekran geçişi bugün de sıfır token — `app.js:243`; eksik olan ızgara/odaklanma katmanı. **DÜZELTME (2026-08-17):** "widget sürükleme" KARAR-1'de reddedildi — masaüstü tarzı üst üste binen pencere yok, bkz. W6.B)*
- [~] W6.B **Boş kanvas + pencere yöneticisi.** **DÜZELTME (2026-08-17, `PLAN_W6_app-shell.md §W6.2`):** madde ilk yazıldığında "çok pencereli, sürüklenebilir, z-index yönetimi" diyordu — bu, KARAR-1'in **reddettiği** masaüstü modeliydi. Düzeltilmiş kapsam: sabit **ızgara** (Android widget gibi, çakışma yok) + dokununca **odaklı tam ekrana** açılma; `WindowManager` çekirdeği (open/close/focus/persist) yüzeyden ayrık yazılır — sürükleme/boyutlandırma/z-index yığını **yok**
      · **TEST-VERIFIED** — `fabric/public/js/windowmanager.js` yazıldı: `register/focus/unfocus/remove/pin/list/onChange`, `localStorage`'a kalıcılık (enjekte edilebilir depo — Node'da bellek-içi depoyla test edildi, DOM'a **hiç dokunmadığı** kanıtlandı). 7 test: kayıt/tekil-id, odak geçişi (kayıt silinmez), kaldırma, sabitleme sıralaması, kalıcılık (yeniden yükleme), değişiklik bildirimi, **statik kanıt** — dosyada `fetch`/`XHR`/`WebSocket` çağrısı yok (K7 yapısal garanti, çalışma zamanı ölçümü değil)
      · **Güncelleme ✅ FACT (2026-08-17, aynı gün):** bir yüzeye bağlı ve **canlı kanıtlandı** — bkz. W6.C. `focus/unfocus` gerçek bir artefaktı gerçek cihazda açtı/kapattı, regresyon yok. Kalan: ızgara yerleşiminin kendisi (bugün hâlâ liste/kart görünümü, KARAR-1'in ızgarası değil) — bu W6.C'nin ikinci diliminde ele alınacak
- [~] W6.C **Boş kanvas enjeksiyonu.** Kabuk boş bir kutu açar, Hermes'e yalnızca "bu kutunun içi" için üretim yaptırılır
      · **İlk dilim ✅ FACT (2026-08-17):** W6.B'nin yüzeyden bağımsız `WindowManager`'ı **gerçek yüzeye** bağlandı — `openArtifact(id)` artık `wm.register()` + `wm.focus()` çağırıyor, geri dönüş `wm.unfocus()` çağırıyor. **Yeni üretim yok** — var olan `artifactBlock()`/`render()` aynen kullanıldı. **Canlı kanıt, gerçek cihaz, gerçek artefakt ("Kablosuz Hata Ayıklama", Hermes'in bu oturumda ürettiği):** owner açtı → başlık/geri-oku/içerik doğru tam ekranda görüntülendi (ekran görüntüsü) → geri okuna dokundu → ızgaraya sorunsuz döndü ("evet oluyor"). Açılış-kapanış döngüsü ikisi de doğrulandı, regresyon yok
      · **Yan bulgu (bu doğrulama sırasında ortaya çıktı, ayrıca değerli):** `llm_bridge.py` + `watchdog.sh` Android tarafından arka planda öldürülmüştü (gateway logu: *"exited UNCLEANLY — SIGKILL/OOM/VM death"*) — telefonun daha önce 10 dk erişilemez olmasıyla aynı desen. `start_hermes_os.sh` ile yeniden başlatıldı, `llm.generate` canlı `/intent` çağrısıyla kanıtlandı (`status:"completed"`, 3.5s). **Bu W6 kapsamı dışında ama gerçek bir operasyonel risk — Android'in arka plan süreç öldürmesi tekrarlanabilir, kalıcı bir izleme/otomatik-yeniden-başlatma mekanizması yok** → yeni borç: B-9
      · **Kalan iş — orijinal kapsam:** "boş kutu + Hermes'in yalnızca içini üretmesi" akışı henüz yok — bugünkü iş var olan artefaktların lifecycle'ını taşıdı, yeni artefakt üretim akışını WindowManager'a bağlamadı
- [ ] W6.D **Mikro-artefakt.** Tüm sayfa değil, yalnızca ilgili widget üretilir
- [ ] W6.E **İzolasyon.** Üretilen widget ana tasarımı/menüleri patlatamaz
      *(teknik düzeltme: Shadow DOM stil izolasyonu verir ama **güvenlik sınırı değildir** — `iframe sandbox` + `postMessage`; gerekçe plan dosyasında)*
- [ ] W6.F **Kalıcı galeri + önbellek.** Üretilen widget `IndexedDB`'ye yazılır; tekrar açılışta **yapay zekaya sorulmaz**, sıfır gecikme/sıfır maliyet
      *(bugün: `localStorage` + sabitlenmemişlerde 30 kayıt sınırı — `app.js:43`)*
- [ ] W6.G **Uygulamaya dönüştürme.** Galeriden ana ekrana sürükle → kalıcı "uygulama"; yayınlama yolu
- [ ] W6.H **Dar context.** Widget içi işlemde modele yalnızca o widget'ın verisi gider, tüm uygulama durumu değil
- [x] W6.I **Framework7'yi at.** ✅ **FACT** — tam kanıtlandı (2026-08-17)
      · Canlı ölçüm (telefon `:9300`, HTTP 200): sayfada `framework7-bundle` referansı **0**; kabuk yükü **1.444 KB → 150 KB (%90 düşüş)**. `app.toast`/`app.sheet` çağrısı kodda **0**, `Framework7` kelimesi **0**
      · `BUILD_OK` + 12/12 sözleşme testi (PC'de **ve** telefonda), md5 birebir (34 dosya)
      · **Görsel kanıt (K5):** owner telefonda Control Center'a dokundu, panel açıldı → native `<dialog>.showModal()` Android 15 WebView'de çalışıyor. Eski Framework7 `sheet`'i ~30 satır native kodla birebir değiştirildi
      · Not: bundle dosyaları telefonun diskinde **duruyor** (`vendor/` bilinçli olarak md5 kapsamı dışı — B-4); sayfa yüklemiyor ama sunulabiliyorlar → B-8
- [ ] W6.J **Fütürist temel.** Web Components + CSS Container Queries + View Transitions API + `dvh`/`env()` (zaten kısmen var)

**Tier list denetiminden gelen ekler (2026-08-17):**

- [ ] W6.K **Web Worker çekirdeği.** Üretilen kod Worker'da koşar (izole + `terminate()` edilebilir → kaçak widget telefonu kilitlemez); Worker `ScreenSpec` üretir, çizimi ana thread yapar
      · **Sınır (zaten karar, `PLAN_W6_app-shell.md §1b` adım 4'te yazılı — burada çapraz referans için tekrarlanıyor):** Worker yalnızca compute/transform/parse yapar, **privileged capability çağıramaz**. Üç yol ayrı kalır: `UI → sandbox/native çizim` · `compute → Worker` · `privileged capability → dispatcher/policy`. Worker capability *ister*, W1 risk kapısından geçirilmeden asla çalışmaz — W6.4'ün postMessage köprüsüyle aynı kural
- [ ] W6.L **Prompt→kod önbelleği.** SHA-256 (`crypto.subtle`) ile eşleme; **normalizasyon zorunlu** (ham hash kırılgan) ve hash'e **capability sürümü** katılır. **(2026-08-17 eklendi)** Kayıt `{structureHash, structure, parameters}` — aynı yapı farklı başlık/renkle tekrar istenince yalnızca parametre değişir, yapı yeniden üretilmez
- [ ] W6.M **Deterministik prompt şablonları.** Serbest istek değil, sınırları çizilmiş görev; sabit iskelet + değişken yuvalar
- [ ] W6.N **Pub/sub yetki modeli.** Widget A, widget B'nin olaylarını dinleyebilir mi? Kanal başına izin — "secure" kelimesinin karşılığı
- [ ] W6.O **Widget kalıcı verisi.** Widget başına alan mı, paylaşılan depo mu; paylaşımlıysa yetkiyi kim verir
- [ ] W6.P **Yaşam döngüsü ve bellek.** Pencere kapanınca timer/listener/Worker temizliği + bellek eşiği
- [ ] W6.R **Bozuk sürümden dönüş.** v2 bozuksa v1'e geri alma; yayınlanan widget'ı geri çekme
- [ ] W6.S **Çevrimdışı davranış.** Kod yerelden gelir ama capability çağrısı başarısız olur — widget bunu nasıl gösterir
- [x] W6.T **`sw.js` güncellemesi.** ✅ **FACT** (2026-08-17) — canlı `GET /sw.js` telefondan: `SHELL = "aios-shell-v6"` (v5'ten yükseltildi), `SHELL_FILES`'tan iki F7 bundle'ı çıkarıldı. Sürüm yükseltmesi şart: `activate` handler'ı `SHELL`'den farklı tüm cache'leri siliyor, yani eski v5 önbelleğindeki 1.27 MB bundle bir sonraki açılışta temizlenir — karma sürüm riski kapandı
- [ ] W6.U **Erişilebilirlik.** Pencere klavyeyle taşınabilmeli; ekran okuyucu yığını anlatabilmeli
- [ ] W6.V **Performans bütçesi.** Telefonda aynı anda kaç pencere — sayı konmadan "iframe ağır" tartışmasının hakemi yok
- [ ] W6.Y **Üretilen kodun denetimi.** Kayda geçmeden statik kontrol (W5 şeması ScreenSpec'i kapsıyor, serbest kodu kapsamıyor)
- [ ] W6.Z **AETHER'a kayıt.** Widget üretimi yönetişim hattında görünsün
- [ ] W6.W **(Artifact Compiler önerisinden alınan, 2026-08-17)** Capability minimal closure — üretilen widget yalnızca gerçekten kullandığı capability'leri bildirir (statik tarama, `screenspec.ts`'e geçiş)

**Artifact Compiler/Optimizer — kapsam kararı (2026-08-17):** Kullanıcı tam bir derleyici hattı önerdi (canonical IR, DAG, terfi yaşam döngüsü, çok aşamalı GC, maliyet-tabanlı reuse). Ölçüldü: telefonda **8 artefakt, 5.9 KB**. Karar: **ERTELENDİ, silinmedi** — ayrıntı ve yeniden gözden geçirme tetikleyicisi `docs/PLAN_W6_app-shell.md` §W6.5d'de. Ucuz/gerçek değerli üç parça şimdi alındı: exact dedup (zaten W6.L'de vardı), structure+parameters ayrımı (W6.L'ye eklendi), capability minimal closure (yukarıda W6.W).

**Kod yazımından önce cevaplanan kararlar — ÜÇÜ DE ÇÖZÜLDÜ (2026-08-17):**

- [x] **KARAR-1 — ÇÖZÜLDÜ: Hibrit.** Ana ekran sabit izgara (Android widget'ı gibi, çakışma yok); bir widget'a dokununca **odaklı tam ekrana** açılır (masaüstü tarzı üst üste binen pencere yok — telefon ekranına uygun). `WindowManager` mantığı yüzeyden ayrık yazılır (surface-agnostic) — gelecekte başka bir yüzey eklenirse bu karar tek başına değişebilsin diye, ekstra iş değil sadece doğru modül sınırı
- [x] **KARAR-2 — ÇÖZÜLDÜ: tek-seferlik onay + kapsam-değişince-yeniden-sor.** Owner'ın ikili "ask/notify" çerçevemi düzelttiği model: `NEW ARTIFACT → validate → risk=ask → USER APPROVAL → persist artifact+approval-scope → future reuse → NO NEW ASK`. Aynı doğrulanmış artefakt tekrar açılırsa **0 token, 0 tekrar onay**; widget YENİ bir capability istemeye başlarsa (kapsam genişlerse) **onay tekrar sorulur**. Mobil uygulama izin modeliyle aynı mantık; W6'nın sıfır-token hedefiyle uyumlu — onay maliyeti yalnızca GERÇEK yeni riskte ödenir
- [x] **KARAR-3 — ÇÖZÜLDÜ (2026-08-17).** ~~"Yerel llm_bridge zaten var, harici API veriyi dışarı taşır"~~ **YANLIŞ İDDİAYDI, düzeltildi:** `docs/RESUME.md:744-761`e göre `llm_bridge.py` zaten `--provider openai-codex -m gpt-5.6-luna` ile Codex OAuth üzerinden kullanıcının ChatGPT/OpenAI hesabına gidiyor — **hiç yerel değil**, zaten harici. Owner: bu hesabı hem mobilde hem PC'de zaten kullanıyor; ileride aynı Tailscale ağında barındırılan **OmniRoute** (`aether://project/omniroute`, "Free-First AI Gateway Router") üzerinden model servis edecek. **Karar:** Katman B için şimdi yeni bir model entegrasyonu YAPILMAZ — mevcut Hermes gateway (zaten çalışan hesap) kullanılır; OmniRoute hazır olduğunda yönlendirme oraya taşınır (ayrı proje, ayrı zaman çizelgesi). Tier list'in rastgele üçüncü-taraf DeepSeek/GPT-4o önerisi hâlâ reddedilir — ama gerekçe "yerel/ücretsiz" değil, "kullanıcının kendi kontrolündeki router projesi zaten yolda"

---

## S — Standardizasyon maddeleri ⬜ (`docs/STANDARTLAR.md`)

- [ ] **S-1** CloudEvents **adapter** — journal iç formatını korur, dışa açılırken map edilir ("yeni event standardı icat ettik" denmez)
- [ ] **S-2** W3C Trace Context — `traceparent`/`tracestate` zarfa **eklenir**; `correlationId`/`causationId` yerine geçmez (farklı kavramlar)
- [ ] **S-3** ScreenSpec ↔ **A2UI** hizalaması — A2UI'nin "güvenilir bileşen kataloğu" deseni bizde zaten var (`renderer.js:22`); adapter yazılırsa FACT, yazılmazsa TARGET
- [ ] **S-4** Widget köprüsü: JSON-RPC 2.0 **mesaj biçimi** + postMessage **binding** + AIOS widget **semantiği** (yeni wire protokol yok)
- [ ] **S-5** ScreenSpec'ler MCP **resource / App** olarak yayınlansın (W4 ile)
- [ ] **S-6** Her mimari tablo **üç sütunlu** olsun: özellik · gerçek kod durumu · standart/hedef
- [ ] **S-7** Capability eşlemesi **katmanlı** olsun: MCP Tool / MCP Resource / A2A Skill / Device Capability / Worker Capability — birebir `capability = MCP tool` değil
- [ ] **S-8** Sandbox için **ayrı origin** ayrılsın — MCP Apps şartı (`allow-scripts allow-same-origin` ancak farklı origin'de güvenli); W6.3 gereksinimi

## M — Mimari temelden doğan maddeler ⬜ (`docs/MIMARI_TEMEL.md`, 2026-08-17)

> Owner'ın mimari değerlendirme raporu koda soruldu (K8) ve sabitlendi. Aşağıdakiler
> o denetimden **yeni** çıkan işler; raporun geri kalanı mevcut K6-K10 ve S-1..S-8'i
> teyit etti (yeni iş doğurmadı). **M-7/M-8:** owner'ın 2026-08-17 ikinci turdaki
> denetimi (Artifact Contract'ın kapı olması, ephemeral/persistent ayrımının
> koda yansıması) — M-5'i tamamlıyor, bkz. aşağı.

- [ ] **M-1** Mevcut maddeler dört seviyeli kanıt skalasına göre yeniden etiketlensin (§0.1) — başlangıç: W6.I `TEST-VERIFIED`, W3.5 `REVIEW-VERIFIED`
- [x] **M-2** **B-6 kapandı** — bkz. B-6 detayı. W6 kod yazımı artık drift korumasıyla başlıyor
- [ ] **M-3** Maliyet ölçümü **beş kalemli** olsun: token · gecikme · ağ · doğrulama işi · cihaz enerjisi. W6.7 bugün yalnızca token sayıyor; K7'nin gerçek konusu beşi birden
- [ ] **M-4** Korpus artefaktları `provenance: "corpus"` ile işaretlensin ve W6.5d'nin **200 artefakt tetikleyicisinden hariç tutulsun** — aksi hâlde sentetik korpus kendi tetikleyicisini ateşler ve ertelenen derleyiciyi erken açtırır (§11)
- [ ] **M-5** Artefakt sözleşme alanları W6.F şemasına girsin: `approvalScope` (KARAR-2) + `capabilities` (W6.W) + `version` + `provenance` (§4). **Onay kaydı W6.L'nin hash'ine kilitlensin:** `approvalScope`, `{structureHash, capabilitySetVersion}` ikilisine bağlı saklanır — capability sürümü değişince (W6.L zaten hash'e katıyor) eski onay **otomatik geçersiz** sayılır, KARAR-2'nin "kapsam genişleyince yeniden sor" kuralı bunsuz neyin değiştiğini bilemez
- [ ] **M-6** `CanCompose` **bağlam ve politika parametreli** tanımlansın: `CanCompose(A,B,Γ,Π)`; adapter uyumluluk ölçümünden **önce** uygulansın (§5.1, §5.3)
- [ ] **M-7 (owner katkısı, 2026-08-17)** **Sözleşme yalnızca alan değil, kapı olsun.** M-5 alanları (`Input/Output/Event/Capability/Policy/Lifecycle/Version/Provenance`, §4) şemaya yazılmakla yetinmesin — her mikro-artefakt galeriye kaydedilmeden **ve** yeniden kullanılmadan önce bu alanlara karşı makinece doğrulansın (şema kontrolü, W5.1'in `screenspec.ts`'i yaptığı gibi). Aksi hâlde sözleşme yalnızca dokümantasyon olur, gerçek bir sınır olmaz
- [ ] **M-8 (owner katkısı, 2026-08-17)** **Geçici yürütme ↔ kalıcı artefakt iki ayrı aşama olsun.** Bugün W6.F/W6.L "üret → doğrudan IndexedDB'ye yaz" akışını tarif ediyor; §6'daki ayrım ("her yürütme artefakta dönüşmek zorunda değil") kod düzeyinde bir kapıya çevrilmemiş. Akış: `üretim → geçici çalıştırma (galeriye YAZILMAZ) → ölçülen tekrar kullanım/kullanıcı onayı → terfi → kalıcı galeri`. W6.F'nin "kabul" ölçütü buna göre güncellenmeli: yalnızca *doğrulanmış* üretim kalıcı olur, her deneme değil

## Bilinen borçlar (henüz sıraya girmedi)

- [x] B-1 `pc-agent` Agent Card sürümü `0.3.0`, `package.json` `0.1.0` — W2.2 ile kapandı, ikisi de artık `0.1.0`
- [x] B-2 `a2a.ts:pollPeerTask()` ölü kod — W2 sırasında silindi
- [ ] B-3 `fabric/public/js/components.css` ile `fabric/public/css/components.css` **birebir kopya** (21.428 bayt, ikisi de) — hangisinin yüklendiği `aios.html:17` → `/css/`; `js/` altındaki ölü
- [ ] B-4 `vendor/` + `icons/` md5 doğrulama kapsamı dışında (nadiren değişir, bilinçli)
- [ ] B-5 PC agent `SAFE_ROOT` artık kanonik depo — eski oturum klasöründeki `pc-agent` kopyası hâlâ diskte duruyor, karışıklık riski
- [x] B-6 ✅ **KAPANDI (2026-08-17)** — MCP'deki desenin aynısı: **test kapısı** ile bağlandı, tek kaynağa geçirilmedi (o daha büyük bir refactor, W6 sırasında değerlendirilebilir; öncelik olan drift riskiydi, o kapandı)
      · `screenspec.ts`'teki `ALLOWED_TYPES`/`UI_META_ACTIONS` **export edildi**; istemci tarafındaki eşdeğeri `app.js` içinden bağımsız bir modüle (`public/js/ui-actions.js`) çıkarıldı — çünkü `app.js` top-level'da `window`'a bağlı (satır 766), Node testi onu doğrudan import edemezdi
      · Yeni `fabric/test/registry-drift.test.ts`: iki tip listesini (19 bileşen) ve iki eylem listesini (15 `ui.*`/`cap.test`) karşılaştırır
      · **FACT — kanıtlandı iki yönlü:** (a) listeye sahte bir eleman eklenip testin **patladığı** görüldü, geri alınca 2/2 geçti — test gerçekten drift'i yakalıyor; (b) canlı `:9300` `200`, `/js/ui-actions.js` `200`, telefonda 14/14 test (12 eski + 2 yeni), md5 birebir (36 dosya)
- [ ] B-8 **(2026-08-17'de bulundu)** Framework7 bundle'ları (`framework7-bundle.min.js` 808 KB + `.css` 486 KB) depodan silindi ama **telefonun diskinde duruyor ve `:9300` üzerinden hâlâ 200 dönüyor** — `vendor/` bilinçli olarak md5 kapsamı dışı (B-4). Sayfa artık yüklemiyor (canlı doğrulandı), ama ölü 1.27 MB duruyor; `deploy-to-phone.sh`'e bir "vendor temizliği" adımı gerekiyor
- [ ] B-7 A2A idempotency yalnızca süreç-içi (`"a2a:"+task.id`) — çağıranın `messageId`'si henüz taşınmıyor, gerçek uçtan-uca dedup yok (W5.7)
- [ ] B-9 **(2026-08-17'de bulundu, W6.C doğrulaması sırasında)** Android arka planda **tüm Termux oturumunu** (`llm_bridge` + `watchdog.sh` + eski `fabric`) öldürebiliyor — bugün **iki kez** gözlendi (`gateway.log`: *"exited UNCLEANLY — SIGKILL/OOM/VM death"*). `watchdog.sh` kendisi de aynı anda ölüyor, kendini yeniden başlatamıyor — gözcünün gözcüsü yok. `termux-wake-lock` yeterli gelmiyor. Kalıcı çözüm yok; `Termux:Boot` / foreground service / daha agresif pil istisnası araştırılmalı
