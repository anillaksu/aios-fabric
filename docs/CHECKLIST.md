# AI-OS FABRIC — CANLI İŞ LİSTESİ

**Bu dosya tek doğruluk kaynağıdır.** Her oturum burayı okur, iş bitince burayı işaretler.
Bir madde ancak **canlı kanıtı** varsa `[x]` olur — "yazdım, çalışıyordur" sayılmaz.

Son güncelleme: 2026-08-17 · Kanonik depo: `C:\Users\anil\Desktop\aios-fabric`

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

## W4 — MCP cihaz sunucusu ⬜ SIRADAKİ

- [ ] W4.1 Capability registry → `tools/list`; `/mcp` Streamable HTTP
- [ ] W4.2 Fail-closed: yalnızca `risk:"safe"` + açıkça izinli olanlar dışa açılır
- [ ] **Kabul:** harici bir MCP istemcisi `tools/list` çekip `risk:safe` bir aracı çalıştırabiliyor

## W5 — Deterministik action bus ⬜

- [ ] W5.1 `llm.generate` çıktısına **sunucu tarafında** JSON şema doğrulaması
- [ ] W5.2 Doğrulama istemciden (`renderer.js`) sunucuya taşınsın — bugün A2A ve otomasyon yolları onu atlıyor
- [ ] W5.3 Model "cihaz bilgisi" uydurmasın: `prompt.ts:26` kuralı zorlayıcıya dönüşsün

---

## W6 — YENİ ARAYÜZ: App Shell + Pencere/Widget Sistemi ⬜ (kullanıcı vizyonu, 2026-08-17)

> Ayrıntılı tasarım: `docs/PLAN_W6_app-shell.md`
> **Zamanlama kararı: EN SONA.** W2–W5 bittikten sonra başlanır (kullanıcı: "en son bitişte").

**Kullanıcının şartları — hiçbiri atlanmayacak:**

- [ ] W6.A **Sıfır-token gezinme.** Menü açma, pencere oluşturma, widget sürükleme tamamen istemci JS. Hermes'in haberi olmayacak
      *(not: sekme/ekran geçişi bugün de sıfır token — `app.js:208`; eksik olan pencere/sürükleme katmanı)*
- [ ] W6.B **Boş kanvas + pencere yöneticisi.** Android benzeri masaüstü: çok pencereli, sürüklenebilir, z-index yönetimi
- [ ] W6.C **Boş kanvas enjeksiyonu.** Kabuk boş bir kutu açar, Hermes'e yalnızca "bu kutunun içi" için üretim yaptırılır
- [ ] W6.D **Mikro-artefakt.** Tüm sayfa değil, yalnızca ilgili widget üretilir
- [ ] W6.E **İzolasyon.** Üretilen widget ana tasarımı/menüleri patlatamaz
      *(teknik düzeltme: Shadow DOM stil izolasyonu verir ama **güvenlik sınırı değildir** — `iframe sandbox` + `postMessage`; gerekçe plan dosyasında)*
- [ ] W6.F **Kalıcı galeri + önbellek.** Üretilen widget `IndexedDB`'ye yazılır; tekrar açılışta **yapay zekaya sorulmaz**, sıfır gecikme/sıfır maliyet
      *(bugün: `localStorage` + sabitlenmemişlerde 30 kayıt sınırı — `app.js:43`)*
- [ ] W6.G **Uygulamaya dönüştürme.** Galeriden ana ekrana sürükle → kalıcı "uygulama"; yayınlama yolu
- [ ] W6.H **Dar context.** Widget içi işlemde modele yalnızca o widget'ın verisi gider, tüm uygulama durumu değil
- [ ] W6.I **Framework7'yi at.** 1.5 MB yükleniyor, yalnızca `toast` + `sheet` için kullanılıyor — native `<dialog>` + Popover API
- [ ] W6.J **Fütürist temel.** Web Components + CSS Container Queries + View Transitions API + `dvh`/`env()` (zaten kısmen var)

**Tier list denetiminden gelen ekler (2026-08-17):**

- [ ] W6.K **Web Worker çekirdeği.** Üretilen kod Worker'da koşar (izole + `terminate()` edilebilir → kaçak widget telefonu kilitlemez); Worker `ScreenSpec` üretir, çizimi ana thread yapar
- [ ] W6.L **Prompt→kod önbelleği.** SHA-256 (`crypto.subtle`) ile eşleme; **normalizasyon zorunlu** (ham hash kırılgan) ve hash'e **capability sürümü** katılır
- [ ] W6.M **Deterministik prompt şablonları.** Serbest istek değil, sınırları çizilmiş görev; sabit iskelet + değişken yuvalar
- [ ] W6.N **Pub/sub yetki modeli.** Widget A, widget B'nin olaylarını dinleyebilir mi? Kanal başına izin — "secure" kelimesinin karşılığı
- [ ] W6.O **Widget kalıcı verisi.** Widget başına alan mı, paylaşılan depo mu; paylaşımlıysa yetkiyi kim verir
- [ ] W6.P **Yaşam döngüsü ve bellek.** Pencere kapanınca timer/listener/Worker temizliği + bellek eşiği
- [ ] W6.R **Bozuk sürümden dönüş.** v2 bozuksa v1'e geri alma; yayınlanan widget'ı geri çekme
- [ ] W6.S **Çevrimdışı davranış.** Kod yerelden gelir ama capability çağrısı başarısız olur — widget bunu nasıl gösterir
- [ ] W6.T **`sw.js` güncellemesi.** `SHELL_FILES` Framework7'yi önbellekliyor; W6.I ile birlikte güncellenmezse kullanıcı karma sürüm görür
- [ ] W6.U **Erişilebilirlik.** Pencere klavyeyle taşınabilmeli; ekran okuyucu yığını anlatabilmeli
- [ ] W6.V **Performans bütçesi.** Telefonda aynı anda kaç pencere — sayı konmadan "iframe ağır" tartışmasının hakemi yok
- [ ] W6.Y **Üretilen kodun denetimi.** Kayda geçmeden statik kontrol (W5 şeması ScreenSpec'i kapsıyor, serbest kodu kapsamıyor)
- [ ] W6.Z **AETHER'a kayıt.** Widget üretimi yönetişim hattında görünsün

**Kod yazımından ÖNCE cevaplanacak açık kararlar:**

- [ ] **KARAR-1 — Pano mu, masaüstü mü?** Gridstack ızgaraya oturtur (pano), sizin tarifiniz serbest pencere (masaüstü). İkisi farklı ürün; W6.2 buna göre değişir
- [ ] **KARAR-2 — Serbest kod üretimi (Katman B) varsayılan açık mı, `ask` mı?** "Bir anda tüm yetki açılmayacak" kararınızla tutarlı olan `ask`, ama akışı yavaşlatır
- [ ] **KARAR-3 — Model seçimi.** Tier list harici API (DeepSeek/GPT-4o) öneriyor; sistemde yerel `llm_bridge` var. Harici API veriyi dışarı taşır, çevrimdışını bitirir, maliyeti artırır — mimariye gömülmemeli, ayrı karar

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

## Bilinen borçlar (henüz sıraya girmedi)

- [x] B-1 `pc-agent` Agent Card sürümü `0.3.0`, `package.json` `0.1.0` — W2.2 ile kapandı, ikisi de artık `0.1.0`
- [x] B-2 `a2a.ts:pollPeerTask()` ölü kod — W2 sırasında silindi
- [ ] B-3 `fabric/public/js/components.css` ile `fabric/public/css/components.css` **birebir kopya** (21.428 bayt, ikisi de) — hangisinin yüklendiği `aios.html:17` → `/css/`; `js/` altındaki ölü
- [ ] B-4 `vendor/` + `icons/` md5 doğrulama kapsamı dışında (nadiren değişir, bilinçli)
- [ ] B-5 PC agent `SAFE_ROOT` artık kanonik depo — eski oturum klasöründeki `pc-agent` kopyası hâlâ diskte duruyor, karışıklık riski
