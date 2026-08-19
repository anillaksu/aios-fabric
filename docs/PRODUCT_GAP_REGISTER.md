# AIOS — PRODUCT GAP REGISTER

> **Amaç:** Repository devrinde açık ürün/teknik borçların yeniden keşfedilmesini
> önlemek. Bu dosya yeni authority, backlog motoru veya execution yolu değildir;
> koddan türetilmiş, append-only ürün izlenebilirlik kaydıdır.

## Kanonik kurallar

- Son audit ankrajı: `28b67e8` (2026-08-19).
- `FACT = commit + test + canlı kanıt`; `TEST_VERIFIED` canlı kabul değildir.
- Bir kayıt silinmez. Durum yalnız `OPEN → IN_PROGRESS → TEST_VERIFIED →
  LIVE_VERIFIED → FACT` ya da gerekçeli `SUPERSEDED` yönünde ilerler.
- `W6.K`, `W6.L`, Runtime Ledger ve mevcut provenance/JOIN primitive'leri
  yeniden açılacak GAP değildir; bu register onların ürün yüzeylerindeki
  eksikleri taşır.
- B-9, ürün öncelik listesine dönüştürülmez; ayrı operasyonel risk olarak
  kalır.
- Devir algoritması `AIOS_DETERMINISTIC_HANDOVER.md` içindedir; bu register
  yalnız açık/kapanan ürün borcunun izidir.

## Kayıt şeması

Her aşağıdaki kayıt şu alanları taşır:

`gapId · surface · status · codeEvidence · currentBehavior · userImpact ·
existingPrimitive · missingPrimitive · acceptanceCriteria · testPlan ·
liveProofPlan · priority`

Öncelik, ekonomik değer değil, audit triage göstergesidir:
`(impact + frequency + existing-capability-leverage + confidence) / effort`.

## Açık kayıtlar

### PG-001 — Exact Formation Reuse Explorer

- **Surface / status:** Formation Memory / `IN_PROGRESS`.
- **Code evidence:** `public/js/formation-memory.js:discoverFormations()`
  exact ID/content/context/capability filtreler; `app.js:artifactCtx()` mevcut
  artifact action'ına verified formation ID ekler; `src/runtime-provenance.ts`
  completed task'tan immutable edge yazar.
- **Current behavior / user impact:** Primitive var, kullanıcı formation'ı
  bulup backing artifact'i güvenle yeniden açamaz.
- **Existing / missing primitive:** exact discovery + artifact renderer +
  dispatcher var; görünür explorer/detail/reuse confirmation eksik.
- **Acceptance:** Formation → exact artifact → explicit reuse confirmation →
  existing artifact execution → task.completed → witness → edge zinciri,
  yeni identity üretmeden görünür olur.
- **Test / live proof:** deterministic projection, exact mapping, dispatcher
  route testleri; telefonda Ses Paneli reuse + `volume.set` + `volume.read`.
- **Priority:** 8.5 / HIGH.
- **2026-08-19 implementation evidence:** uncommitted Explorer/detail/reuse
  surface eklendi; 158/158 test ve `BUILD_OK` geçti, telefon kaynak eşleşmesi
  salt-okunur md5/grep ile görüldü. İlk telefon incelemesinde ActionCard'ın
  desteklemediği `actions` alanı nedeniyle artifact kartı açılmadı; karta
  gerçek `action` ve açık reuse/aç düğmeleri bağlandı. Identity satırları,
  Canvas toolbar/zoom ve navigation route projection da düzeltildi.
  **Durum değişmez:** owner görsel kabulü ve Ses Paneli reuse → `volume.set`
  → completed → witness → immutable edge canlı zinciri olmadan `IN_PROGRESS`.

### PG-002 — Formation export/import ürün yüzeyi

- **Surface / status:** Formation portability / `OPEN`.
- **Code evidence:** `exportFormationMemoryBundle()` ve
  `importFormationMemoryBundle()` yalnız primitive/test düzeyinde.
- **Current behavior / user impact:** Portable paket kanıtlanmış, kullanıcı
  bunu ürün yüzeyinden alamaz veya geri yükleyemez.
- **Existing / missing primitive:** canonical bundle + JOIN var; read-only
  export ve fail-closed import kullanıcı akışı eksik.
- **Acceptance:** explicit bundle export/import, exact parent doğrulaması,
  duplicate/order replay aynı projection; capability execution yok.
- **Test / live proof:** export/import contract + iki ortam hash eşitliği.
- **Priority:** 6.5 / HIGH.

### PG-003 — Guided Capability Action Catalog

- **Surface / status:** Capabilities / `OPEN`.
- **Code evidence:** `src/capabilities.ts` 39 kayıt; `screens.js:capabilitiesScreen()`
  listeyi generic satır olarak gösterir.
- **Current behavior / user impact:** Capability vardır ama anlamı, payload'ı ve
  uygun ürün eylemi çoğu kez yoktur.
- **Existing / missing primitive:** registry + dispatcher + ScreenSpec var;
  yalnız parametresi kanıtlı capability'ler için semantic action surface eksik.
- **Acceptance:** seçilen gerçek capability için açık payload, policy sonucu ve
  receipt; belirsiz capability gösterişli ama çalıştırılabilir kart olmaz.
- **Test / live proof:** validator/dispatcher + telefon capability sonucu.
- **Priority:** 5.7 / HIGH.

### PG-004 — Discovery catalog coverage

- **Surface / status:** KEŞFET / `OPEN`.
- **Code evidence:** `workspace-catalog.js` sabit metadata girdileri ve
  `searchWorkspaceEntries()` literal include eşlemesi kullanır.
- **Current behavior / user impact:** Registry ve artifact gücünün çoğu 12
  statik giriş dışında doğal biçimde keşfedilemez.
- **Existing / missing primitive:** deterministic metadata/search var;
  mevcut yüzeylerin eksiksiz deterministic projection'ı eksik.
- **Acceptance:** yeni yüzey veya capability önce mevcut kategori/tag ile
  bulunur; LLM semantic search eklenmez.
- **Test / live proof:** Türkçe kısa sorgular + telefon kategori→hedef akışı.
- **Priority:** 5.7 / HIGH.

### PG-005 — Device Status action bridge

- **Surface / status:** Cihaz Durum Merkezi / `OPEN`.
- **Code evidence:** `app.js` yalnız `sensor.battery.read`, `wifi.info`,
  `app.list` mapping'i yapar.
- **Current behavior / user impact:** gerçek veri gösterilir fakat ilgili
  mevcut eyleme doğal geçiş sınırlıdır.
- **Existing / missing primitive:** safe read/action capability'leri ve
  dispatcher var; ölçümden türeyen düşük-riskli action affordance eksik.
- **Acceptance:** yalnız ölçülen gerçek state'e bağlı mevcut eylem; veri yoksa
  action uydurulmaz.
- **Test / live proof:** state mapping + cihaz üzerinde sonuç.
- **Priority:** 5.0 / HIGH.

### PG-006 — Canvas semantic traversal

- **Surface / status:** Formation Canvas / `OPEN`.
- **Code evidence:** `formation-canvas.js` root/reuse links üretir;
  `formation-canvas-view.js` pan/zoom/node select sağlar.
- **Current behavior / user impact:** graph doğrudur fakat parent/child/reuse
  arasında kullanıcı odaklı gezinme sınırlıdır.
- **Existing / missing primitive:** read-only projection ve drawer var;
  relation focus/traversal eksik.
- **Acceptance:** mevcut edge/formation verisiyle read-only traversal; graph
  mutation veya yeni engine yok.
- **Test / live proof:** deterministic graph + telefon pan/detail/back.
- **Priority:** 5.0 / HIGH.
- **2026-08-19 implementation evidence:** mobile toolbar çakışması ve dar
  zoom-out ilk telefon gözleminde bulundu; wide Formationlar control ve
  `0.24` zoom lower bound kodlandı. Telefon görsel kabulü gelmeden bu kayıt
  kapanmaz.

### PG-007 — Canvas large graph discovery

- **Surface / status:** Formation Canvas / `OPEN`.
- **Code evidence:** `projectFormationCanvas()` ilk `limit=48` formation'ı
  seçer, yalnız `omittedFormations` sayısını döndürür.
- **Current behavior / user impact:** görünmeyen kayıt bulunamaz.
- **Existing / missing primitive:** deterministic limit var; page/viewport
  discovery eksik.
- **Acceptance:** rastgele örnekleme olmadan omitted kayıtlar keşfedilir.
- **Test / live proof:** 48+ fixture + telefonda erişim.
- **Priority:** 5.0 / HIGH.

### PG-008 — Canvas adaptive layout

- **Surface / status:** Formation Canvas / `OPEN`.
- **Code evidence:** iki sütun + sabit `250` satır aralığı; çok edge'li root
  sonraki satıra taşabilir.
- **Current behavior / user impact:** graph büyüdükçe ilişki okunabilirliği
  düşer.
- **Existing / missing primitive:** deterministic positions var; edge-aware
  deterministic layout eksik.
- **Acceptance:** aynı input aynı layout; node overlap yok; yeni graph engine yok.
- **Test / live proof:** çok edge fixture + telefon görünür kabul.
- **Priority:** 5.0 / HIGH.

### PG-009 — ApplicationEntry lifecycle product depth

- **Surface / status:** Uygulamalarım / `OPEN`.
- **Code evidence:** `application-model.js` update/remove/order taşır;
  `app.js:paintApplications()` temel aç/düzenle/kaldır sunar.
- **Current behavior / user impact:** lifecycle teknik olarak var, uygulama
  yönetimi günlük kullanım bağlamında sığdır.
- **Existing / missing primitive:** model + storage var; ürün seviyesinde
  lifecycle/metadata açıklığı eksik.
- **Acceptance:** artifact ≠ ApplicationEntry ayrımı korunarak görünür yönetim.
- **Test / live proof:** lifecycle contract + telefon akışı.
- **Priority:** 4.7 / MEDIUM.

### PG-010 — Android app workspace depth

- **Surface / status:** Telefon Uygulamaları / `OPEN`.
- **Code evidence:** `app.list` + `app.open`; `androidAppsScreen()` grid sunar.
- **Current behavior / user impact:** uygulamalar açılır ama bağlam/kategori ve
  günlük workspace ilişkisi sınırlıdır.
- **Existing / missing primitive:** gerçek app list/open var; product grouping
  ve continuation eksik.
- **Acceptance:** mevcut Android paketleri ApplicationEntry ile karışmadan
  daha doğal bulunur/açılır.
- **Test / live proof:** app list/open + telefon kabulü.
- **Priority:** 4.7 / MEDIUM.

### PG-011 — Runtime Ledger human-readable UX

- **Surface / status:** Runtime / `OPEN`.
- **Code evidence:** `runtime-provenance.ts` witness üretir; management/runtime
  screen yalnız anlık servis projeksiyonu verir.
- **Current behavior / user impact:** kanıt var fakat kullanıcı yaşam çizgisini
  anlayamaz.
- **Existing / missing primitive:** ledger/witness/journal var; redakte edilmiş
  okunabilir timeline eksik.
- **Acceptance:** hash zincirini bozmadan status/recovery/edge bağlamı görünür.
- **Test / live proof:** invalid chain fail-closed + telefon okunabilirlik kabulü.
- **Priority:** 4.7 / MEDIUM.

### PG-012 — Media metadata depth

- **Surface / status:** Medya / `OPEN`.
- **Code evidence:** referans panel volume read/set ve `media.control` kullanır;
  parça/sanatçı/position capability kaynağı yoktur.
- **Current behavior / user impact:** ses kontrolü güçlü, medya bağlamı sığdır.
- **Existing / missing primitive:** mevcut control var; gerçek metadata kaynağı
  veya mapping yok.
- **Acceptance:** yalnız cihazdan gelen metadata; uydurma alan yok.
- **Test / live proof:** gerçek capability cevabı + cihaz medya kabulü.
- **Priority:** 4.7 / MEDIUM.

### PG-013 — Automation product clarity

- **Surface / status:** Otomasyonlar / `OPEN`.
- **Code evidence:** `src/automations.ts` olay→koşul→eylem çalıştırır;
  `screens.js` üç preset gösterir ve eski yorum “yok” der.
- **Current behavior / user impact:** gerçek motor keşfedilmez, ürün dili çelişir.
- **Existing / missing primitive:** rule motoru var; doğru açıklama ve güvenli
  yönetim derinliği eksik.
- **Acceptance:** mevcut rule semantiği görünür; yeni generic workflow engine yok.
- **Test / live proof:** event→rule→dispatcher→journal canlı zinciri.
- **Priority:** 4.3 / MEDIUM.

### PG-014 — Capability risk visibility

- **Surface / status:** Capabilities / `OPEN`.
- **Code evidence:** `/capabilities` `risk` döndürür; UI chip yalnız `class`
  gösterir.
- **Current behavior / user impact:** kullanıcı onay gereksinimini keşiften önce
  anlayamaz.
- **Existing / missing primitive:** mevcut risk metadata; görünür projection eksik.
- **Acceptance:** risk gösterilir, authorization değişmez.
- **Test / live proof:** endpoint/UI contract + telefon görünümü.
- **Priority:** 6.0 / HIGH.

### PG-015 — readOnly metadata visibility

- **Surface / status:** Capabilities / `OPEN`.
- **Code evidence:** capability kaydında `readOnly` var; `/capabilities`
  yalnız name/class/risk serialize eder.
- **Current behavior / user impact:** `/read` facade sınırı kullanıcıya
  açıklanamaz.
- **Existing / missing primitive:** server metadata var; safe read projection eksik.
- **Acceptance:** yalnız metadata görünür; `/read` policy değişmez.
- **Test / live proof:** route/schema test + UI kabul.
- **Priority:** 5.5 / HIGH.

### PG-016 — Projection identity visibility

- **Surface / status:** Canvas / `OPEN`.
- **Code evidence:** Canvas `canonicalJson(projection)` zorlar fakat kullanıcıya
  canonical projection hash vermez.
- **Current behavior / user impact:** iki görünümün aynı canonical graph olup
  olmadığını kullanıcı karşılaştıramaz.
- **Existing / missing primitive:** canonical serialization var; read-only hash
  projection eksik.
- **Acceptance:** hash ekonomik skor değildir; yalnız identity/equality kanıtıdır.
- **Test / live proof:** same input hash + iki ortam doğrulaması.
- **Priority:** 5.5 / HIGH.

### PG-017 — Canvas deep-link/share boundary

- **Surface / status:** Canvas / `OPEN`.
- **Code evidence:** navigation yalnız `screen=formation-canvas`; seçili node
  URL state'i yok.
- **Current behavior / user impact:** belirli formation/edge bağlamı geri
  açılamaz veya paylaşılmaz.
- **Existing / missing primitive:** navigation state + exact formation ID var;
  bounded deep-link eksik.
- **Acceptance:** exact ID ile read-only detail; export veya mutation yok.
- **Test / live proof:** browser back/deep link + telefon kabulü.
- **Priority:** 5.5 / HIGH.

### PG-018 — A2A peer UX

- **Surface / status:** A2A / `OPEN`.
- **Code evidence:** peer add `risk:ask`; telefon UI peer eklemeyi bilinçli kapatır.
- **Current behavior / user impact:** peer görünür ama onboarding ürünü yok.
- **Existing / missing primitive:** A2A + approval var; owner kararli peer UX eksik.
- **Acceptance:** yeni peer protocol/authority olmadan açık owner kararıyla ilerler.
- **Test / live proof:** approval + gerçek peer kabulü.
- **Priority:** 3.7 / MEDIUM.

### PG-019 — PWA offline data boundary

- **Surface / status:** PWA / `OPEN`.
- **Code evidence:** `sw.js` yalnız shell cache'ler; API/capability verisi ağdan gelir.
- **Current behavior / user impact:** ağ yoksa shell açılabilir, canlı veri yüzeyi
  çalışmaz.
- **Existing / missing primitive:** service worker ve server-first storage var;
  doğruluk koruyan offline projection kararı eksik.
- **Acceptance:** eski cihaz verisi canlıymış gibi gösterilmez.
- **Test / live proof:** offline/read boundary + telefon PWA kabulü.
- **Priority:** 3.0 / MEDIUM.

### PG-020 — B-9 Android runtime survivability

- **Surface / status:** Runtime continuity / `OPEN` (operasyonel risk).
- **Code evidence:** watchdog üç süreci izler; OS watchdog'u da öldürebilir.
- **Current behavior / user impact:** anlık sağlık vardır, MIUI/HyperOS altında
  kalıcı yaşam garantisi yoktur.
- **Existing / missing primitive:** watchdog/ledger/bridge var; owner OS ayarı
  ve kesintisiz devralma kanıtı eksik.
- **Acceptance:** ayrı operasyonel kabul; otomatik ürün işine çevrilmez.
- **Test / live proof:** kontrollü gerçek süreç/OS yaşam testi.
- **Priority:** ayrı risk / HIGH.

### PG-021 — Cross-platform runtime admission and fresh-install completeness

- **Surface / status:** Distribution / `TEST_VERIFIED` (observer admission only).
- **Code evidence:** `fabric/bin/aios-setup-doctor.mjs` role bazlı, salt-okunur
  checkout admission yapar; `capabilities.ts` ve Termux launcherları Android
  binary/pathlarına bağlıdır; `deploy-to-phone.sh` owner `PHONE_HOST`/
  `PHONE_KEY` varsayılanları taşır; `server.ts`/`pc-agent/server.ts` self URL
  override destekler.
- **Current behavior / user impact:** Windows observer checkout'ı doctor ile
  kabul edilir; Windows PC peer ve Termux device runtime ayrı roller olarak
  belgelenir. Ubuntu desktop-native runtime, generic Hermes/LLM provisioning,
  generic Fabric storage-root, signed release/lockfile/CI matrisi ve
  cross-user onboarding yoktur.
- **Existing / missing primitive:** Node 22.6+, portable read-only CLI,
  A2A Agent Card ve setup doctor var; platform-native adapter/release
  infrastructure yok.
- **Acceptance:** her hedef rolde clean checkout → doctor → test → build →
  role-uygun canlı admission; device runtime için gerçek capability/PWA,
  peer için authenticated round trip. Eksik external Hermes dependency
  açıkça raporlanır, uydurulmaz.
- **Test / live proof:** `setup-doctor.test.ts`; Windows observer doctor canlı
  çıktı. Ubuntu/Termux fresh-install ve PC peer runbook kabulü henüz yok.
- **Priority:** 5.5 / HIGH.

### DOC-001 — Canonical documentation synchronization

- **Surface / status:** Devir belgeleri / `OPEN`.
- **Code evidence:** `CHECKLIST.md` W6.K/W6.L FACT iken `STANDARTLAR.md`
  hâlâ TARGET; handoff Canvas canlı kabulünü henüz taşımaz.
- **Current behavior / user impact:** yeni ajan eski kararları tekrar açabilir.
- **Existing / missing primitive:** canonical docs var; commit/test/live bağını tek
  güncel tabloda hizalama eksik.
- **Acceptance:** her FACT commit/test/live referansı ve canonical HEAD ile
  handoff/checklist/archive uyumlu.
- **Test / live proof:** documentation review + final commit zinciri.
- **Priority:** bu blok kapanışında zorunlu.

## İlk blok devir izi

`PG-001` bu dosyanın oluşturulduğu committe yalnız `IN_PROGRESS` olur.
Telefon reuse kabulü, provenance edge ve final canonical commit görülmeden
`LIVE_VERIFIED` veya `FACT` yazılmaz.
