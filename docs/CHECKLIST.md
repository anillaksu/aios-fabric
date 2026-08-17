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

## W2 — A2A v1.0 protokol uyumu ⬜ SIRADAKİ

- [ ] W2.1 `/.well-known/agent-card.json` (iki tarafta); `agent.json` alias kalır
- [ ] W2.2 Agent Card tek kaynaktan üretilsin: `version` ← `package.json`, `skills` ← capability registry, **yalnızca `risk:"safe"` olanlar dışa duyurulur**
- [ ] W2.3 v1 alanları: `protocolVersion`, `supportedInterfaces`, `TASK_STATE_*`, `ROLE_*`
- [ ] W2.4 `GetTask` / `ListTasks` / `CancelTask` + `pc-agent`'ta JSON-RPC task kaydı (bugün hiç kaydedilmiyor)
- [ ] W2.5 A2A görevlerini journal'a bağla (bugün süreç belleğinde, restart'ta uçuyor)
- [ ] W2.6 İstemci canonical yolu önce denesin (`agent-card.json` → `agent.json`)
- [ ] **Kabul:** `agent-card.json` 200 · `GetTask` = journal kaydı · **restart sonrası** task hâlâ sorgulanabiliyor

## W3 — Asenkron teslim ⬜

- [ ] W3.1 `wait:false` yolu: iş kabul edilir, `taskId` hemen döner
- [ ] W3.2 Tamamlanınca `notification.send` + AKTİF sekmesinde sonuç
- [ ] W3.3 Kalan sınırsız `fetch`'lere `AbortSignal.timeout`
- [ ] W3.4 SSE yalnızca görüntüleme; doğruluk kaynağı journal
- [ ] **Kabul:** telefon kilitliyken başlatılan uzun iş, ekran açılınca bildirimle geliyor

## W4 — MCP cihaz sunucusu ⬜

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

---

## Bilinen borçlar (henüz sıraya girmedi)

- [ ] B-1 `pc-agent` Agent Card sürümü `0.3.0`, `package.json` `0.1.0` — iki tarafta da çelişik (W2.2 kapatacak)
- [ ] B-2 `a2a.ts:pollPeerTask()` ölü kod — hiçbir yerden çağrılmıyor
- [ ] B-3 `fabric/public/js/components.css` ile `fabric/public/css/components.css` **birebir kopya** (21.428 bayt, ikisi de) — hangisinin yüklendiği `aios.html:17` → `/css/`; `js/` altındaki ölü
- [ ] B-4 `vendor/` + `icons/` md5 doğrulama kapsamı dışında (nadiren değişir, bilinçli)
- [ ] B-5 PC agent `SAFE_ROOT` artık kanonik depo — eski oturum klasöründeki `pc-agent` kopyası hâlâ diskte duruyor, karışıklık riski
