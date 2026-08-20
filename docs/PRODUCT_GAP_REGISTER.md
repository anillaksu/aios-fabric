# AIOS — PRODUCT GAP REGISTER

> **Amaç:** Repository devrinde açık ürün/teknik borçların yeniden keşfedilmesini
> önlemek. Bu dosya yeni authority, backlog motoru veya execution yolu değildir;
> koddan türetilmiş, append-only ürün izlenebilirlik kaydıdır.

## Kanonik kurallar

- Son audit ankrajı: `28b67e8` (2026-08-19); `PG-022`/`PG-023` bulguları `8fbbbf8`
  HEAD'i ve 2026-08-20 canlı telefon gözlemi üzerine eklendi.
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
- **2026-08-20 ürün yüzeyi tamamlama:** detay yüzeyi altı ayrı bloğa ayrıldı
  (`FORMATION` / `ARTIFACT` / `CAPABILITIES` / `CONTEXT` / `EXECUTIONS` /
  `KİMLİK VE KANIT`); ham hash yığını ana yüzeyden alınıp `ui.formationIdentity`
  teknik sheet'ine taşındı; formation detayından Canvas'a bağ eklendi (Canvas →
  detay zaten vardı); liste satırına exact kimlik özeti kondu (canlı veride aynı
  başlıklı iki `El Feneri` ancak böyle ayrışıyor). `CONTEXT` yalnız kaynaktaki
  `provenanceKind` / `capabilitySetVersion` / `parents` değerlerini taşır.
  `lastVerifiedUseAt` bilerek `null`: `createRuntimeWitness` gövdesi zaman alanı
  taşımaz, uydurulmaz. Yerel ve telefon `npm test` **168/168**, `BUILD_OK`,
  `deploy-to-phone.sh` md5 **depo == telefon (107 dosya)**.
- **2026-08-20 canlı deneme — BAŞARISIZ, Explorer nedeniyle değil:** Ses
  Paneli'nin kendi contract'ıyla ve exact `formationId` ile gerçek `volume.set`
  gönderildi; cihaz gerçekten değişti (`music 106 → 60 → 106`, iki kez bağımsız
  `volume.read` ile doğrulandı), task'lar tamamlandı
  (`cc41d5b5-110a-4ad2-91ff-8589c287fbdc`, `cec0d5b3-20b4-43f1-bce0-ac2d6790177f`).
  **Yeni provenance edge oluşmadı (15 → 15); yeni formation da oluşmadı (22 → 22).**
  Engel `PG-022`'dir. `volume.read` için edge yazılmaması ise doğru davranıştır:
  o capability Ses Paneli formation contract'ında yok
  (`completed capability parent formation sozlesmesinde degil`).
  Bu nedenle `PG-001` `IN_PROGRESS` kalır; `LIVE_VERIFIED`/`FACT` yazılmadı.
- **2026-08-20 (ikinci tur) — provenance yarısı canlı doğrulandı:** `PG-022`
  düzeltmesinden sonra aynı zincir gerçek cihazda çalıştı: exact Ses Paneli
  parent'ı üzerinde `volume.set` → `task.completed` → `RuntimeWitness` →
  immutable provenance edge, **yeni identity üretmeden** (formation 22 → 22,
  edge 15 → 16, ardından ikinci reuse ile 16 → 17). Ürün yüzeyi tarafı
  `TEST_VERIFIED` + telefon dağıtım paritesi (174/174, `BUILD_OK`, md5 107
  dosya). **Eksik kalan tek şey:** owner'ın telefonda Explorer → Formation
  Detail → REUSE → artefakt → slider yolunu fiziksel olarak görmesi. PC'den
  PWA sürülemiyor (düz HTTP secure context olmadığı için `crypto.subtle` yok,
  `OTURUM_2026-08-20.md §5`), bu yüzden görsel kabul yalnız cihazda alınabilir.
  Kayıt bu nedenle `IN_PROGRESS` kalır; `FACT` için tek kapı owner görsel
  kabulüdür.

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

### PG-022 — Runtime Ledger yazıcı/okuyucu sözleşme sapması

- **Surface / status:** Runtime Ledger → Formation Memory provenance köprüsü /
  **`FACT`** (2026-08-20, owner onaylı düzeltme + T1-T6 + canlı kanıt). Kayıt
  bulgunun tam izini taşımaya devam eder; silinmez.
- **Code evidence:**
  - Yazıcı `scripts/aios-runtime-ledger.sh:46-58` (`process_witness()`): süreç
    pid'i yoksa veya `/proc/<pid>/stat` okunamıyorsa **beş alanı birden** `-`
    yazar (`pid`, `start`, `commandHash`, `sourceHash`, `processWitness`).
    `:121-128` `pid = '-'` ve önceki kayıt canlıysa `status="missing"` üretir.
  - Okuyucu `src/runtime-provenance.ts:68-72` (`verifyRuntimeLedgerText`): `commandHash` ve
    `processWitness` için **koşulsuz** `HASH` (`^[0-9a-f]{64}$`) ister; `-`
    değerine yalnız `sourceHash` için izin verir.
  - Çağrı zinciri `src/server.ts:154-172` `onTaskCompleted` →
    `recordCompletedRuntimeProvenance` → `captureRuntimeCheckpoint` →
    `verifyRuntimeLedgerText`.
- **Exact invariant farkı** (yazıcının ürettiği ↔ okuyucunun kabul ettiği):

  | Alan | Yazıcı `started`/`replaced`/`stable` | Yazıcı `missing` | Okuyucu kabulü | Sonuç |
  |---|---|---|---|---|
  | `pid` | gerçek pid | `-` | boş olmamalı | uyumlu |
  | `start` | `/proc/<pid>/stat` 22. alan | `-` | boş olmamalı | uyumlu |
  | `commandHash` | `sha256(cmdline)` | `-` | **HASH zorunlu** | **SAPMA** |
  | `sourceHash` | `sha256(kaynak)` ya da `-` | `-` | `-` veya HASH | uyumlu |
  | `processWitness` | `sha256(role\|pid\|start\|cmd\|source)` | `-` | **HASH zorunlu** | **SAPMA** |
  | `previousHash` | `GENESIS` veya HASH | aynı | `GENESIS` veya HASH | uyumlu |
  | `eventHash` | HASH | HASH | HASH | uyumlu |

  Sapma **tam olarak iki alandadır**: `commandHash` ve `processWitness`.

  **Düzeltmenin dokunmaması gereken invaryantlar:**
  - `eventPayload` = ilk 10 alanın `|` ile birleşimi; `eventHash = sha256(eventPayload)`.
  - `previousHash` zinciri `GENESIS`'ten itibaren kesintisiz.
  - `checkpointFrom` (`src/runtime-provenance.ts:82-87`): `role === "fabric"` **ve**
    `status ∈ {started, replaced, stable}` **ve** `sourceHash !== "-"`. Bu kapı
    sayesinde bir `missing` satırı hiçbir koşulda RuntimeWitness'a dönüşemez.
  - Ledger append-only'dir; geçmiş satır düzeltilmez veya yeniden yazılmaz.
- **Current behavior / user impact:** `verifyRuntimeLedgerText` dosyanın **tamamını** önce
  doğruladığı için tek bir `missing` satırı o andan sonraki **her** provenance
  yazımını fail-closed düşürür. Telefonda `2026-08-20T00:42:42Z` tarihli iki
  `connectivity-bridge` satırı (`gateway missing`, `watchdog missing`; dosya
  satırı 127-128) bu durumu yarattı. Satırlar hash-zincirli ve append-only
  olduğundan durum kendiliğinden düzelmez. Kullanıcı hiçbir hata görmez: task
  başarıyla tamamlanır, yalnız `fabric.log` `runtime ledger gecersiz alan: 127`
  yazar. Doğrulanmış yeniden kullanım izi büyümeyi durdurur.
- **Bağımsız doğrulama (2026-08-20):** telefondaki 145 satırlık ledger çekilip
  okuyucunun kuralları ayrıca uygulandı: reddedilen satır sayısı **2** (127, 128),
  ikisi de `status=missing`, bozuk alanlar yalnız `commandHash` ve
  `processWitness`. Zincir bütünlüğü ve **tüm** event-hash'ler bağımsız hesapla
  **geçerli** bulundu; `aios-runtime-ledger.sh verify` de `LEDGER_OK` döndürür.
  Yani sorun zincir bütünlüğü değil, okuyucunun alan regexidir.
- **Existing / missing primitive:** hash-zincirli ledger, `checkpointFrom`
  uygunluk kapısı ve fail-closed doğrulama var; eksik olan, okuyucunun
  `missing` statüsü için yazıcının gerçek sözleşmesini tanıması.
- **Acceptance criteria (owner onayı geldiğinde):**
  1. `verifyRuntimeLedgerText`, `status === "missing"` satırında `commandHash` ve
     `processWitness` için `-` kabul eder; diğer statülerde HASH zorunluluğu
     **aynen** kalır.
  2. Zincir ve event-hash doğrulaması hiç değişmez; kırık zincir/hash hâlâ
     fail-closed reddedilir.
  3. `checkpointFrom` değişmez; `missing` satırı witness olamaz.
  4. Hiçbir geçmiş ledger satırı değiştirilmez, silinmez veya yeniden yazılmaz.
- **Test plan (kabul testi tanımı):**
  - **T1** 11 kolonlu, `status=missing`, beş alanı `-`, `previousHash`/`eventHash`
    geçerli satır → `verifyRuntimeLedgerText` **geçirir**.
  - **T2** aynı satırın `status`'u `stable` yapılırsa → `verifyRuntimeLedgerText`
    `gecersiz alan` ile **reddeder** (gevşeme yalnız `missing`'e özgüdür).
  - **T3** son `fabric` kaydı `missing` ise → `checkpointFrom`
    `witness olmaya uygun degil` ile **reddeder**.
  - **T4** `missing` satırından **sonra** gelen geçerli `fabric` + `stable` +
    `sourceHash != "-"` satırı checkpoint seçilir ve `createRuntimeWitness`
    başarılı olur.
  - **T5** `missing` satırının `eventHash`'i bozulursa yine **reddedilir**
    (regex gevşemesi hash kapısını gevşetmiyor).
  - **T6** regresyon: bugünkü gerçek 145 satırlık ledger tam parse edilir,
    satır sayısı 145 gelir, seçilen fabric checkpoint `stable` olur.
- **Live proof plan:** telefonda Ses Paneli reuse → gerçek `volume.set` →
  `task.completed` → `fabric.log` içinde
  `[fabric:runtime-provenance] recorded <edgeId>` → `/formation-memory` edge
  sayısı `15 → 16`, parent tam olarak
  `formation:53542f33a1a45543997d705cf281598acf4cfb08ab3984f01d4dbecdc030c655`,
  formation sayısı **22'de kalır** → `aios-runtime-ledger.sh verify` yine
  `LEDGER_OK`.
- **Priority:** `PG-001`'in blocker'ıydı; kapandı.
- **2026-08-20 düzeltme ve canlı kabul (owner onaylı, dar kapsam):**
  `verifyRuntimeLedgerText` içindeki alan doğrulaması yazıcının gerçek
  sözleşmesine hizalandı: `commandHash` ve `processWitness` için `-` **yalnız**
  `status === "missing"` satırında kabul edilir. Değişmeyen her şey ölçüldü:
  `checkpointFrom()` dokunulmadı, `previousHash` zinciri ve `eventHash`
  SHA-256 doğrulaması dokunulmadı, yazıcı sözleşmesi dokunulmadı,
  `src/` altında yalnız `runtime-provenance.ts` değişti (+15/-2, tamamı bu
  koşul bloğu ve gerekçe yorumu).

  **T1-T6 önce başarısız, sonra yeşil:** düzeltmeden önce 19 testin 5'i düştü
  (T1, T3, T4, T5, T6 — T2 zaten geçiyordu çünkü reddi doğruluyor); düzeltmeden
  sonra **19/19**. T5 özellikle anlamlı: gevşemeden önce satır alan regexinde,
  gevşemeden sonra `event hash gecersiz` ile düşüyor — yani hash kapısı
  gevşemedi. T6 için 2026-08-20'nin gerçek 145 satırlık ledger'ı
  `test/fixtures/runtime-ledger-2026-08-20.tsv` olarak donduruldu; telefonda
  fixture bulunmadığından canlı ledger'a düşer (production call-site testindeki
  aynı desen).

  **Kapı:** yerel ve telefon `npm test` **174/174**, `BUILD_OK`,
  `git diff --check` temiz, `deploy-to-phone.sh` md5 **depo == telefon
  (107 dosya)**.

  **Canlı kanıt — başarı kriterlerinin tamamı:**

  | Kriter | Ölçüm |
  |---|---|
  | formation 22 → 22 | ✓ yeni kimlik üretilmedi, kimlikler birebir aynı |
  | provenance edge 15 → 16 | ✓ `provenance-edge:92f10d9609eb4337…` |
  | parent = exact Ses Paneli | ✓ `formation:53542f33a1a45543…c030c655` |
  | `aios-runtime-ledger.sh verify` | ✓ `LEDGER_OK events=151` |
  | geçmiş 145 satır değişmemiş | ✓ ilk 145 satır fixture ile **byte eşit**; dosya yalnız append aldı (145 → 151) |

  Witness `runtime-witness:9562590f96d92912…`, task
  `6fa9b709-6bcb-496a-a14b-e79db1f60490`, capability `volume.set`; cihaz
  gerçekten değişti (`music 106 → 72`, bağımsız `volume.read` ile doğrulandı).
  `fabric.log`: `[fabric:runtime-provenance] recorded provenance-edge:92f10d96…`.
  **İkinci bağımsız reuse** aynı exact root üzerinde tekrarlandı (edge
  **16 → 17**, task `54bb5674-b134-4a72-a686-041dcd0bd033`, formation yine 22,
  ses 106'ya geri alındı) — reuse'un derived olmadığı canlıda iki kez görüldü.

### PG-023 — Termux launcher kopyası kanoniklik kapsamı dışında

- **Surface / status:** Runtime continuity / dağıtım / `OPEN` — **BUG/RISK
  (drift)**. Bu turda düzeltilmedi.
- **Code evidence:** `scripts/deploy-to-phone.sh` `phone_md5()`/`repo_md5()`
  `~/watchdog.sh`'i `launcher/watchdog` olarak doğrular ve diğer beş widget'ı
  `~/.shortcuts/` altında karşılaştırır; **`~/.shortcuts/watchdog.sh` bu listede
  yoktur**. `src/runtime-status.ts:54` yalnız `^bash $HOME/watchdog\.sh$`
  desenini arar; `scripts/start_hermes_os.sh:52` aynı deseni kullanır.
- **Current behavior / user impact:** 2026-08-20 03:4x'te telefonda çalışan
  watchdog `~/.shortcuts/watchdog.sh` idi (md5 `1130a903…`, 3352 bayt); kanonik
  `~/watchdog.sh` (md5 `6e367f00…`, 3807 bayt, repo `scripts/watchdog.sh` ile
  **birebir**) çalışmıyordu. Eski kopyanın tek farkı, Runtime Ledger
  `observe watchdog-cycle` bloğunun **eksik** olmasıdır. Sonuç: widget'tan
  başlatılan watchdog (a) `/runtime-status` ve `start_hermes_os.sh` sağlık
  satırında **"down"** görünür, (b) ledger sürekliliğini beslemez. Bu, handoff'un
  B-9 kuralının uyardığı "özellik mi bozuk, backend mi ölü" karışıklığını üretir.
  03:52:41Z'de stack `start_hermes_os.sh` ile yeniden başlatılınca kanonik
  watchdog (PID 19779) devraldı ve `runtime-status` `online` döndü — sorun geçti,
  **kalıp durmaya devam ediyor**.
- **Existing / missing primitive:** deploy md5 kapsamı ve `.shortcuts` widget
  kopyalama zaten var; `watchdog.sh`'in `.shortcuts` kopyası kapsama alınmamış.
- **Acceptance:** `.shortcuts/watchdog.sh` ya kanonikle birebir eşitlenip md5
  kapsamına alınır ya da bilinçli olarak kaldırılır — hangisi olacağı owner
  kararıdır; ajan başlatıcı/yetki matrisine kendiliğinden dokunmaz.
- **Test / live proof:** `deploy-to-phone.sh --check` farkı göstermeli; widget'tan
  başlatılan watchdog sonrası `runtime-status` `online` ve ledger'da yeni
  `watchdog-cycle` satırı görülmeli.
- **Priority:** B-9 (`PG-020`) ile aynı sınıf operasyonel risk; ürün önceliğine
  çevrilmez.

### PG-024 — Service worker precache tam degildi (offline ilk oturum kirikligi)

- **Surface / status:** PWA / offline / **`FACT`** (2026-08-20, premium audit ilk
  bulgusu, code+test+build+phone kanitli; offline fiziksel kabul owner'a aciktir).
- **Code evidence:** `public/sw.js:SHELL_FILES` yalniz 5/30 `public/js/*.js`
  dosyasini precache ediyordu (`app.js`, `api.js`, `registry.js`, `renderer.js`,
  `screens.js`); `formation-explorer.js`, `windowmanager.js`,
  `application-model.js`, `artifact-contract.js`, `navigation-state.js` ve 20
  diger modul listede yoktu. `app.js:14-38` nerdeyse tum modulleri STATIK
  import eder.
- **Current behavior / user impact:** fetch handler network-first oldugu icin
  ilk ONLINE oturum TAMAMLANDIKTAN sonra eksik dosyalar firsatci onbelleklenir
  — ama SW `install` event'i bitip ilk online oturum tamamlanmadan (orn.
  kurulum sirasinda kesintili baglanti, ya da kurulumdan hemen sonra ucak
  modu) cevrimdisiya gecen kullanici, onbellekte olmayan bir modulun import
  edilememesi yuzunden bos/olu bir ekranla kalirdi (goal §12'nin acikca
  yasakladigi durum).
- **Existing / missing primitive:** service worker + network-first/cache-
  fallback stratejisi zaten var; eksik olan yalniz precache listesinin gercek
  modul grafigiyle eslesmesiydi.
- **Fix (dar kapsam):** `SHELL_FILES` gercek `public/js`/`public/css`
  dizinlerinin TAM icerigine genisletildi (30 js + 3 css + vendor + manifest +
  icon), `SHELL` versiyonu `v6 → v7`. Davranissal invaryant degismedi: `/read`,
  `/intent`, `/events`, `/a2a`, `/state` hicbir zaman onbelleklenmez.
- **Test (regresyon, registry-drift.test.ts ile ayni desen):**
  `test/sw-shell.test.ts` — `SHELL_FILES`'i gercek dosya sistemiyle karsilastirir,
  hem eksik hem hayalet (silinmis dosyaya referans) sapmayi yakalar. Eski
  `sw.js` uzerinde calistirilip **once dustugu** dogrulandi (2/5 fail), sonra
  **5/5 gecti**. Tam suite: yerel+telefon `npm test` **179/179**, `BUILD_OK`.
- **Live proof:** telefonda `GET /sw.js` → `aios-shell-v7` dogrulandi; listedeki
  **33 varlik tek tek** `curl` ile `200` dondugu goruldu (bu, `caches.addAll()`
  atomik oldugu icin kritik — tek bir 404 tum `install` event'ini fail-closed
  patlatirdi). `deploy-to-phone.sh` md5 depo == telefon (108 dosya).
  **Eksik kalan:** gercek ucak modu/offline fiziksel kabul yalnizca telefonda
  yapilabilir (PC'den PWA surulemiyor, `OTURUM_2026-08-20.md §5`); bu FACT
  server-tarafi ve test kanitina dayanir, fiziksel offline testi owner'a acik
  bir ek dogrulamadir.
- **Priority:** P1 (premium/offline guvenilirlik), kapandi.

### PG-025 — Okuma ekranlarında fetch hatası "boş veri" ile karışıyordu

- **Surface / status:** Capabilities, Event Journal, Otomasyonlar, Intent
  DevTools / **`FACT`** (2026-08-20, premium audit ikinci iterasyon).
- **Code evidence:** `public/js/api.js:getJSON()` her ağ hatasında sessizce
  `null` döner (`catch { return null; }`). `capabilitiesScreen()`,
  `journalScreen()`, `automationsScreen()`, `intentHistoryScreen()` bunu
  `(await getJSON(...)) || []`/`|| {}` ile varsayılana indirgiyor,
  `null` (fetch başarısız) ile gerçekten boş veri arasındaki farkı kaybediyordu.
  `connectionsScreen()`/`managementScreen()` bu ayrımı zaten doğru yapıyordu —
  bu bulgu var olan deseni tutarlı hale getirir, yeni bir mimari eklemez.
- **Current behavior / user impact:** Fabric'e ulaşılamadığında (B-9'un
  tetiklediği tam da bu durum) kullanıcı "0 capability", "Kural yok",
  "Journal boş" görür — gerçekten boş bir sistemle ayırt edilemez. Intent
  DevTools için bu özellikle ironik: tam da "neden başarısız oldu?" sorusuna
  cevap vermesi gereken hata ayıklama aracı, kendi fetch hatasını gizliyordu.
- **Existing / missing primitive:** `error-state` bileşeni ve
  `connectionsScreen`/`managementScreen`'deki referans desen zaten var; eksik
  olan bu desenin diğer dört okuma ekranına tutarlı uygulanmasıydı.
- **Fix (dar kapsam, yalnız okuma yüzeyi):** yeni `fetchFailedSection()`
  yardımcı fonksiyonu (`screens.js`), dört ekranda `getJSON` sonucunu
  varsayılana indirgemeden önce `null` mı yoksa geçerli veri mi olduğunu
  yakalar. `capabilitiesScreen`: registry sabit ~39 kayıt, production'da hiç
  boş dönmez — `!Array.isArray || length===0` güvenle "arıza" sayılır (mevcut
  `connections`/`management` deseniyle aynı mantık). `automationsScreen`/
  `journalScreen`/`intentHistoryScreen`: kural/olay listesi GERÇEKTEN boş
  olabileceğinden yalnız kesin `=== null` (fetch hatası) sinyali kullanılır,
  sayı temelli tahmin yapılmaz. Hiçbir capability/policy/execution davranışı
  değişmedi; yalnız okuma ekranlarının hata görünürlüğü değişti.
- **Test:** `test/screens-error-state.test.ts` — `globalThis.fetch` stub'ıyla
  hem "fetch reddedilir" hem "gerçekten boş veri döner" senaryoları ayrı ayrı
  test edilir (yanlış negatif VE yanlış pozitif ikisi de). Eski `screens.js`
  üzerinde **önce çalıştırıldı ve 5/5 düştü**; düzeltmeden sonra 5/5 geçti.
  Tam suite: yerel+telefon `npm test` **184/184**, `BUILD_OK`.
- **Live proof:** telefonun gerçek `/capabilities` (39), `/automations` (4),
  `/journal` (3369 olay) uçları canlı çağrıldı — yeni mantığın bunları
  yanlışlıkla "arıza" saymadığı doğrulandı. `deploy-to-phone.sh` md5 depo ==
  telefon (109 dosya). **Dürüst sınır:** gerçek "backend gerçekten ulaşılamaz"
  senaryosu canlıda sahnelenmedi — Fabric'i kasten durdurmak, owner uyurken
  bağımlı diğer süreçleri (Hermes gateway vb.) etkileyebilecek yıkıcı bir
  eylem olurdu; bu FACT test+server-tarafı kanıta dayanır.
- **Priority:** P1 (premium/error-recovery, §18), kapandı.

### PG-026 — İzinler paneli fetch hatasında yanlış onay durumu gösteriyordu

- **Surface / status:** Control Center / İZİNLER / **`FACT`** (2026-08-20,
  premium audit üçüncü iterasyon).
- **Code evidence:** `public/js/app.js:openControlCenter()` içindeki İZİNLER
  bloğu `getJSON("/approvals")` sonucunu `const state = approvals || {};` ile
  varsayılana indirgiyordu. `getJSON` ağ hatasında `null` döner
  (`api.js:getJSON`); bu durumda `state = {}` olup **her** `risk:"ask"`
  capability satırı `state[cap]` bulunamadığı için varsayılan
  `["idle", "ONAY BEKLİYOR"]` gösteriyordu.
- **Current behavior / user impact:** kullanıcının **daha önce gerçekten
  onayladığı** bir capability (örn. bugün canlıda `script.run`,
  `clipboard.set`, `whatsapp.send` onaylı), yalnızca `/approvals` isteği ağ
  hatası yüzünden başarısız olduğunda "ONAY BEKLİYOR" (henüz onaylanmamış)
  gibi görünüyordu. Gerçek dispatcher/approval durumu **değişmiyordu** —
  yalnız kullanıcı arayüzünde yanlış görünüyordu. B-13'ün özenle kurduğu
  "insan onayı" güven modelinde bu tür bir yanlış gösterim, tam da modelin
  var olma sebebi olan şeffaflığı zedeler (goal §5/§18).
- **Existing / missing primitive:** `PG-025`'te kurulan
  `null` (fetch hatası) ↔ gerçek boş veri ayrımı ilkesi zaten var; eksik olan
  bu ilkenin `screens.js` dışındaki (Control Center, raw DOM) bir yüzeye de
  taşınmasıydı.
- **Fix (dar kapsam):** `getJSON("/approvals")` çağrısı `renderApprovals()`
  adlı yeniden-çağrılabilir bir fonksiyona alındı; `approvals === null` açıkça
  yakalanıp `.c-error` (registry'nin `ErrorState` bileşeniyle CSS'te birebir
  aynı sınıf) ile "Onay durumu okunamadı" + TEKRAR DENE gösterilir, hiçbir
  capability satırı çizilmez. Yalnız `approvals !== null` olduğunda gerçek
  `state` okunur ve mevcut grant/revoke akışı **hiç değişmeden** çalışır.
- **Test:** `test/app-approvals-ui.test.ts` — `app.js` Node'da çalıştırılamadığı
  için (`window`'a top-level bağlı, B-6 notu) `formation-explorer.test.ts` ile
  aynı desen: kaynak metin okunup yapısal desen doğrulanır (`null` kontrolünün
  `state` okumasından önce geldiği, hata dalında "ONAY BEKLİYOR" YAZILMADIĞI,
  retry'ın aynı fonksiyonu tekrar çağırdığı). Eski `app.js` üzerinde **önce
  çalıştırıldı ve 2/2 düştü**; düzeltmeden sonra 2/2 geçti. Tam suite:
  yerel+telefon `npm test` **186/186**, `BUILD_OK`.
- **Live proof:** telefonun gerçek `/approvals` ucu çağrıldı — bugün canlıda
  6 gerçek onaylı kayıt var (`script.run`, `clipboard.set`, `clipboard.get`,
  `file.share`, `ui.tap`, `whatsapp.send`); yeni kod bunları `null` sanıp
  hataya düşürmüyor. `deploy-to-phone.sh` md5 depo == telefon (110 dosya).
  **Dürüst sınır:** gerçek fetch-hatası senaryosu (backend'i kasten durdurup
  panelin doğru hata gösterdiğini görsel olarak izlemek) canlıda
  sahnelenmedi — aynı gerekçeyle (`PG-025`), Fabric'i owner uyurken kasten
  durdurmak yıkıcı olurdu.
- **Priority:** P1 (güven/premium, B-13'ün şeffaflık invaryantını korur),
  kapandı.

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
