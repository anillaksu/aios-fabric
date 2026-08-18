# AIOS — MİMARİ DEĞERLENDİRME VE STANDARTLAŞMA TEMELİ

**2026-08-17 · v1 · kaynak: owner'ın mimari değerlendirme raporu, koda sorularak sabitlendi**

> Bu belge **nasıl karar verdiğimizi** anlatır. `docs/CHECKLIST.md` **ne yapacağımızı**,
> `docs/STANDARTLAR.md` **hangi standarda dayandığımızı** anlatır. Üçü çakışırsa
> CHECKLIST kazanır — o canlı iş listesidir, bu belge gerekçedir.

---

## 0. Bu belgenin statüsü — kendi ilkesine tabidir

Bu belge owner'ın yazdığı mimari değerlendirmeden türetildi. Ham hâliyle kabul
edilmedi: **her iddiası koda soruldu (K8)**, ve doğrulanamayanlar FACT olarak
yazılmadı. Doğrulama oturumu 2026-08-17, kanıtlar bölüm bölüm alıntılı.

**İki bağlayıcı kural:**

1. **Bu belge kanıt değildir.** Hiçbir kod maddesi "MIMARI_TEMEL.md'de yazıyor"
   gerekçesiyle yazılamaz. Belge yalnızca **hangi soruyu sormamız gerektiğini**
   söyler; cevabı her zaman kod verir. Aksi K8'in dairesel ihlalidir.
2. **Taksonomiler kod enum'u değildir.** §6 ve §7'deki sınıflandırmalar düşünme
   araçlarıdır. Bugünkü ölçekte (8 artefakt) bunları `type` alanına çevirmek,
   W6.5d'de reddedilen erken mühendisliğin aynısıdır.

### 0.1 Kanıt skalası — üç değil dört seviye

Owner'ın raporu üç seviye öneriyordu (FACT / REVIEW-VERIFIED / TARGET). Elimizdeki
iki somut vaka bunun bir seviye eksik olduğunu gösterdi:

| Seviye | Tanım | Kapanması için gereken |
|---|---|---|
| **FACT** | Canlı davranış tek çağrıyla kanıtlandı (K2) | — |
| **TEST-VERIFIED** | Otomatik test kapsıyor, cihazda canlı koşmadı | **dağıtım + canlı çağrı** |
| **REVIEW-VERIFIED** | Kod yolu okundu, testi de canlı kanıtı da yok | **test + canlı çağrı** |
| **TARGET** | Mimari hedef, kodda karşılığı yok | uygulama |

Ayrımı gerektiren vakalar:

- **W6.I** (Framework7 kaldırma): `BUILD_OK` + 12/12 test geçiyor, ama telefona
  dağıtılmadı → **TEST-VERIFIED**. Kalan iş: dağıtım.
- **W3.5** ("task kaybolmaz"): `state.ts:markInterrupted` kod incelemesiyle
  doğrulandı, mid-flight crash simülasyonu yapılmadı, testi de yok →
  **REVIEW-VERIFIED**. Kalan iş: crash simülasyonu.

İkisi de "yazıldı ama canlı kanıtı yok" kutusuna giriyordu; kalan işleri ise
tamamen farklı. Ayrım bu yüzden bürokrasi değil, **iş planı**.

---

## 1. Beş anayasal ilke — yeni değil, derinleşti

Owner'ın raporundaki beş ilke `docs/CHECKLIST.md` §0'daki **K6–K10 ile birebir
aynıdır**. Bu bir tekrar değil, bağımsız bir teyittir: kurallar ilk yazıldıkları
günden bu yana yeniden türetilebiliyor.

| Rapor | Checklist | Bu belgede derinleşen tarafı |
|---|---|---|
| FÜTÜRİZM | **K6** | Framework değil Web Platform — §2'de ölçülen bedelle |
| MALİYET | **K7** | "0 token" değil, **token + gecikme + ağ + doğrulama + enerji** — §2 |
| KANIT | **K8** | Üç değil **dört** seviyeli skala — §0.1 |
| STANDART | **K9** | `docs/STANDARTLAR.md`'de zaten işlenmiş — burada çoğaltılmaz |
| ÖZ ALMA | **K10** | Sözleşme kavramı ile birleşti — §4 |

**K9/K10'un standart eşlemeleri (A2A, MCP, JSON-RPC, CloudEvents, W3C Trace
Context, A2UI, MCP Apps) `docs/STANDARTLAR.md`'de tam ve doğrulanmış hâlde
duruyor. Burada tekrar edilmez** — iki yerde duran bir liste, biri güncellenip
diğeri unutulduğunda B-6 desenini üretir (§8).

---

## 2. Maliyet modeli — FACT ve TARGET ayrıştırılmış

Owner'ın raporundaki "0 token" listesi bugün doğru olanlarla henüz doğru
olmayanları aynı satırda topluyordu. Ayrıştırılmış hâli:

| İşlem | Durum | Kanıt / eksik |
|---|---|---|
| Sekme/ekran geçişi | **FACT** | `app.js:243 goTab()`, `:249 goSecondary()` — saf istemci, ağ çağrısı yok |
| Bilinen bileşenle çizim | **FACT** | `renderer.js:22` — 19 tip, LLM HTML üretmiyor |
| Yerel durum değişimi (tema, sekme) | **FACT** | `app.js` — `localStorage`, ağ yok |
| Pencere açma/kapatma/sürükleme | **TARGET** | pencere katmanı yok (W6.B) |
| Filtre/sıralama | **TARGET** | istemci tarafı filtre yok |
| Önbellekten ScreenSpec | **TARGET** | W6.L yazılmadı |
| Doğrulanmış artefaktın tekrar kullanımı | **TARGET** | W6.F/W6.L yazılmadı |
| Widget içi basit etkileşim | **TARGET** | widget yok (W6.3) |

**Maliyetin yalnız token olmadığı düzeltmesi kabul edildi ve önemlidir.** Telefonda
çalışan bir sistemde ölçülmesi gereken beş kalem var: *token · gecikme · ağ ·
doğrulama işi · cihaz enerjisi*. Bunların dördü bugün **hiç ölçülmüyor** — W6.7'nin
"ölçüm zorunlu" maddesi yalnızca token sayıyor. Bu, §14'te yeni bir maddeye dönüştü.

---

## 3. Runtime otorite zinciri

Sistemin çekirdek cümlesi:

> **LLM önerir. AIOS doğrular. AIOS yetkilendirir. Runtime yürütür.**

Zincir:

```
Kullanıcı / Ajan
      ↓
   Öneri            ← LLM'in yetkisi BURADA BİTER
      ↓
  Sözleşme          (§4)
      ↓
  Doğrulama         FACT · screenspec.ts (W5.1) + renderer.js validateSpec()
      ↓
  Politika          FACT · dispatcher.ts:112  `capability?.risk ?? "ask"`
      ↓
  Birleşim          TARGET (§5)
      ↓
  Yürütme           FACT · dispatcher.dispatch() — eylem yürütme kapısı
      ↓
  Journal           FACT · append-only SQLite WAL, journal.ts
      ↓
  Artefakt          KISMEN · localStorage bugün, IndexedDB hedef (W6.F)
      ↓
  Tekrar kullanım   TARGET (W6.L)
```

**LLM'in yapamadıkları — bunlar mimari invaryanttır, tercih değil:**

- politikayı atlayamaz — `dispatcher.ts:112` fail-closed: risk belirtilmemişse `ask` sayılır
- capability yaratamaz — kayıt `capabilities.ts`'te, 39 capability (18 safe · 10 notify · 11 ask)
- yetki veremez — `risk:"ask"`, geçerli **insan** approval kaydı yoksa fail-closed
  reddedilir; kayıt varsa yalnızca `dispatcher.dispatch()` politikası üzerinden ilerler.
  A2A/MCP/otomasyon approval grant edemez
- runtime gerçeği üretemez — W5.9'da bu **canlı olarak kanıtlandı**: `llm.generate`
  çağıranın `context` alanına güveniyordu, MCP üzerinden sahte pil verisi enjekte
  edilebiliyordu; `readLiveDeviceContext()` ile kapatıldı ve model gerçek veriyle cevap verdi

Son madde bu zincirin **neden yazılı bir kural değil kod olması gerektiğinin**
kanıtıdır: kural belgede vardı, kodda yoktu, ve açık gerçekti.

**Dar `/read` istisnası (FACT, 2026-08-18 canlı doğrulandı):** `/read` genel bir
execution endpoint'i değildir. Yalnız capability kaydında birlikte `risk:"safe"`
ve `readOnly:true` olan salt-okuma capability'leri kabul eden özel facade'dır;
bugünkü set `sensor.battery.read` ve `wifi.info`'dur. Bu dar yol doğrudan
`cap.execute()` çağırır; maliyetsiz gerçek cihaz okuması için dispatcher task/journal
yaşam döngüsü üretmez. Bunun dışındaki capability execution yolları dispatcher'dan
geçer. `torch.set`, `sensor.location.read` ve `script.run` `/read` üzerinde 403
fail-closed olarak canlı doğrulandı.

---

## 4. Sözleşme (Contract) — belgenin en değerli yeni kavramı

Bir artefakt `{name, type}` değildir. Kavramsal sözleşme alanları:

```
Input · Output · Event · Capability · Policy · Lifecycle · Version · Provenance
```

### 4.2 Layer A deklaratif UI — FACT (2026-08-18)

Katman A serbest HTML/JS değildir: güvenilir ScreenSpec contract'ı native Web
Platform karşılıklarına render edilir. İlk canlı referans dilimi `stack`,
`scroll-region` ve native `<input type="range">` ile kanıtlandı. `range`
`input` olayında yalnız widget-yerel değeri değiştirir; `change` olayında
`valueKey` action payload'a eklenir ve mevcut UI → envelope →
`dispatcher.dispatch()` → policy zincirinden tek eylem geçer. Bu nedenle
sürükleme boyunca capability çalıştırılmaz, bırakışta tek `volume.set` oluşur.

`reference-sound-panel-v1` kalıcı artefact'ı gerçek
`scroll-region → stack → range` yapısı ve `volume.set({stream:"music", value})`
binding'iyle telefonda doğrulandı. Deterministik kabul `meetsUiRequirements()`
yalnız yapısal requirement'ları (`scroll-region`, `range`,
`range-change-action`, `capability:volume.set`) arar; doğal dil sınıflandırıcısı
değildir. Server/client validator ve registry drift testi aynı sözleşme setini
korur. Bu Layer A kanıtı Layer B/sandbox, pub/sub, shared state veya
compiler/DAG için yetki ya da gereksinim üretmez.

**Dar device-state mapping (FACT, 2026-08-18):** `reference-sound-panel-v1`
açılırken genel bir widget state deposu kurulmaz. UI, mevcut envelope yolu ile
`volume.read` dispatch eder; `termux-volume` cevabından yalnız doğrulanmış
`music.volume`/`music.max_volume` alınır ve saf mapping mevcut ScreenSpec
range'in `label`/`value`/`max` alanlarını türetir. Bu görünüm artefact'ın
kalıcı spec'ine yazılmaz; yeniden açılış yeni bir gerçek cihaz okumasıdır.
Geçersiz ya da `music` içermeyen cevapta sahte değer yerine `empty-state`
render edilir. Böylece cihaz state'i → deterministik mapping → ScreenSpec →
native renderer zinciri korunurken execution yine dispatcher/policy'dedir.
Bu kanıt medya metadata'sı, playback state/position, kalıcı widget state veya
pub/sub için genelleme yetkisi vermez.

Bunun değeri şudur: **AIOS iki yapının birleşip birleşemeyeceğini LLM'e sormadan
karara bağlayabilir.** Bugün böyle bir soru sorulmuyor çünkü birleşim yok; ama
W6'nın widget/galeri katmanı geldiğinde soru kaçınılmaz olarak ortaya çıkacak.

### 4.1 Sözleşmenin bugünkü kısmi karşılığı

Sözleşme sıfırdan icat edilecek bir şey değil — parçaları kodda dağınık hâlde var:

| Sözleşme alanı | Bugünkü karşılığı | Durum |
|---|---|---|
| Capability | `capabilities.ts` kaydı + `risk` alanı | **FACT** |
| Policy | `dispatcher.ts:112` risk kapısı | **FACT** |
| Input/Output | `screenspec.ts` şema doğrulaması (yalnız UI için) | **KISMEN** |
| Event | journal olay tipleri (`task.created` … `task.undoable`) | **FACT** |
| Lifecycle | task durumları + `MAX_CHAIN_DEPTH=3` (`automations.ts:125`) | **KISMEN** |
| Version | `package.json` → Agent Card (W2.2) | **KISMEN** — artefakt sürümü yok |
| Provenance | journal `origin` alanı | **KISMEN** |

Yani sözleşme **yeni bir katman değil, dağınık olanın adının konması**. K10'a
uygun olan da budur.

---

## 5. Birleşim (Composition) — düzeltilmiş biçim

### 5.1 DÜZELTME: uyumluluk da bağlama bağlıdır

Owner'ın raporunda iki formül var ve **aralarında bir tutarsızlık vardı**:

```
(F)  CanCompose(A, B)          = S ∧ C ∧ P ∧ L ∧ V      ← ikili predicate
(G)  Compose(A, B, Γ, P)       → C                       ← bağlam + politika parametreli
```

Eğer *birleşim* Γ (runtime bağlamı) ve politika ortamına bağlıysa, *birleşebilirlik*
de bağlı olmak zorundadır. Aksi hâlde `CanCompose` true döner, `Compose` çalışma
zamanında patlar — çünkü Γ'da o capability yoktur. Düzeltilmiş hâl:

```
CanCompose(A, B, Γ, Π) = S ∧ C ∧ Π ∧ L ∧ V
Compose(A, B, Γ, Π)    → C
```

Aynı iki artefakt farklı cihazda veya farklı izin ortamında **farklı sonuç verir** —
ve bu bir kusur değil, doğru davranıştır.

### 5.2 DÜZELTME: `P` harfi iki farklı şeydi

Raporda `P` hem "Policy compatibility" (formülün terimi) hem "policy/capability
ortamı" (fonksiyonun parametresi) anlamında kullanılıyordu. Ayrıştırıldı:

- **Π** = politika ortamı (parametre) — bu cihazda, bu kullanıcı için neye izin var
- **P** = politika uyumluluğu (terim) — A ve B'nin politika gereksinimleri çelişiyor mu

### 5.3 Adapter, formülün dışında değil içindedir

K10 "gerektiğinde adapter yaz" diyor. Saf konjonksiyon (`S ∧ C ∧ …`) ise tek bir
uyumsuzlukta birleşimi reddeder. İkisi çelişmez, ama sıralama önemlidir:
**önce adapter uygulanır, sonra uyumluluk adapte edilmiş çift üzerinde ölçülür.**
Aksi hâlde adapter yazılabilecek her durum gereksiz yere "birleşemez" görünür.

### 5.4 Hedef "her şey birleşsin" değildir

```
Olası birleşimler → uyumluluk → politika → GEÇERLİ birleşimler
```

Bu ayrım korunmalı. "Universal composability" bir hedef değil, bir **risk**tir:
sözleşmesi doğrulanmamış iki şeyin birleşmesine izin veren sistem, W1'de kurulan
risk sınırını istemci tarafında kaybeder.

---

## 6. Kalıcı Artefakt ve Geçici Yürütme Grafı

Raporun en yararlı ayrımlarından biri:

| | Kalıcı Artefakt | Geçici Yürütme Grafı |
|---|---|---|
| Örnek | `BatteryDiagnostics.v2` | `BatteryReader → Threshold → Notification` |
| Ömür | kalıcı, yeniden kullanılır | görev bitince yok olabilir |
| Depolama | galeri (IndexedDB, W6.F) | journal'da iz, nesne olarak yok |

**Her yürütme artefakta dönüşmek zorunda değildir.** Yalnızca tekrar kullanılabilir,
doğrulanmış ve anlamlı olduğu **ölçülen** biçimler terfi eder:

```
Geçici graf → (ölçülen tekrar kullanım) → Kalıcı artefakt
```

Bu, galerinin şişmesini önleyen asıl fikirdir ve W6.5d'deki erteleme kararıyla
tutarlıdır.

### 6.1 DÜZELTME: bu greenfield değil

"Geçici yürütme grafı" sıfırdan kurulacak bir şey gibi sunuluyordu. Kodda
**sınırlı bir hâli zaten var**:

- her iş bir `taskId` + `correlationId` taşıyor (`dispatcher.ts:83-84`)
- otomasyon zincirleri **graf gibi** dallanıyor ve `MAX_CHAIN_DEPTH = 3` ile
  kesiliyor — çapraz tetikleme dahil (`automations.ts:125,156`)
- tüm yaşam döngüsü journal'da: `task.created · running · completed · failed ·
  cancelled · interrupted · optimistic · undoable`

Yani bugün elimizde **isimlendirilmemiş, derinliği sınırlı, kalıcılaştırılmayan bir
yürütme grafı** var. Eksik olan graf değil, **terfi mekanizması ve ölçüm**. Bu,
işi küçülten bir tespittir.

---

## 7. Artefakt yalnız UI değildir

Sınıflar: UI · Data · Action · Workflow · Automation · Device · Application.

**Uyarı — paralel sözlük riski:** bu sınıfların bir kısmı kodda **başka adla zaten
var**: Action ≈ intent/capability, Automation ≈ `automations.ts`, Device ≈
capability. Yeni bir taksonomi bunları yeniden adlandırırsa, iki sözlük oluşur ve
belge kodla birlikte çürür. **Kural: yeni sınıf adı ancak kodda karşılığı olmayan
bir şey için kullanılır; olan için mevcut ad korunur.**

Merdiven (`Primitive → Component → Composite → Functional Artifact → Workflow →
Application → Composite Application → Workspace`) katı bir hiyerarşi değildir; bir
Application da daha üst bir birimin parçası olabilir. Bugünkü karşılığı:
**ortası FACT (19 bileşen), iki ucu TARGET.** Sekiz seviyeli taksonomiyi bugün
koda gömmek, 8 artefaktlık ölçekte W6.5d'nin reddettiği hatanın aynısıdır.

---

## 8. Tek gerçek ilkesi — ve kodda bilinen bir ihlali

Raporun W4–W5'ten çıkardığı ders, bu projenin en sağlam mimari sezgisi:

> **Bir capability'nin keşif yüzeyi ile yürütme yüzeyi farklı kod yolları olsa
> bile aynı tekil capability/policy gerçeğine dayanmalıdır.**

Kanıtları (**FACT**):

| Yer | Keşif yüzeyi | Yürütme yüzeyi | Bağlanma kanıtı |
|---|---|---|---|
| MCP | `tools/list` | `tools/call` | `mcp.test.ts` — "tools/list, isMcpExposed() ile aynı seti döndürür (drift olamaz)" |
| A2A | Agent Card `skills` | `capability:` yolu | `dispatcher.dispatch()`; `risk:ask` geçerli insan approval'ı ile aynı policy'den geçer (2026-08-18 canlı) |
| İstemci | `REGISTRY` | `ALLOWED_TYPES` | `renderer.js:22` — `new Set(Object.keys(REGISTRY))`, türetme |

### 8.1 İhlal: B-6 bir "borç" değil, invaryant ihlalidir

`docs/CHECKLIST.md` B-6: `screenspec.ts`'teki `ALLOWED_TYPES`/`UI_META_ACTIONS`
ile `registry.js`/`app.js`'teki eşdeğerleri **elle senkron tutulan iki ayrı
listedir.** Sunucu ile istemci farklı şeyi geçerli sayabilir.

Bu, yukarıdaki ilkenin **tam olarak ihlal ettiği durumdur** — ve W1.9/W1.10
deseninin (bir yol düzeltildi, ikizi atlandı) tekrarıdır. İlke netleştiği için
B-6'nın statüsü değişiyor: *"sıraya girmemiş borç"* değil, **bilinen bir mimari
invaryant ihlali**. Önceliği buna göre yükseltildi (§14).

---

## 9. AETHER'ın yeri — DÜZELTME

Owner'ın raporu (Bölüm I) AETHER'ı yürütme yoluna koyuyordu:

```
AIOS → Composition proposal → Execution Graph → Aether → Dispatcher/Sandbox → Device
```

**Bu kabul edilmedi. Üç bağımsız kanıt aksini söylüyor:**

1. **AETHER'ın kendi yetki beyanı** (`aether_info`, 2026-08-17 bu oturumda çağrıldı):
   `read_canonical: true` · `append_unverified_metadata: true` ·
   **`write_canonical: false` · `promote: false` · `execute: false`**.
   AETHER'ın kendi sunucu talimatı da açık: *"passive shared semantic memory…
   It cannot write canonical memory, promote anything, or execute anything."*
2. **Kodun kendisi.** `fabric/src` içinde AETHER'a tek bir import yok; yalnızca
   **iki yorum satırı** var (`types.ts:128`, `dispatcher.ts:108`) ve ikisi de aynı
   şeyi söylüyor: *"AETHER onay kuyruğu bağlanana kadar"*. Yani kod AETHER'ı
   **onay kuyruğu = politika girdisi** olarak bekliyor, yürütücü olarak değil.
   `pc-agent`'ta hiç geçmiyor.
3. **Offline-first.** AIOS telefonda, ağsız çalışmak zorunda (`STANDARTLAR.md §7`).
   AETHER yürütme yolunda olsaydı, telefon AETHER'a ulaşamadığında **hiçbir şey
   çalıştıramazdı**. Bu oturumda telefonun 10 dakika içinde erişilemez hâle
   gelmesi bunun teorik bir kaygı olmadığını gösteriyor.

**Düzeltilmiş konumlandırma:**

```
        AIOS (cihaz · offline-first · yürütmenin tek sahibi)
        öneri → sözleşme → doğrulama → politika kapısı → dispatcher → cihaz
                                            ▲                    │
                                     onay kuyruğu              journal
                                            │                    ▼
              ┌─────────────────────────────┴────────────────────────┐
              │  AETHER — pasif yönetişim belleği                    │
              │  okur · kaydeder · YÜRÜTMEZ · terfi ettirmez         │
              └──────────────────────────────────────────────────────┘
```

**Owner'ın asıl sezgisi doğru, konumu yanlıştı:** AETHER'ın birleşim hikâyesinde
gerçek bir rolü var — ama *politika ve yönetişim* tarafında (onay kuyruğu, karar
kaydı, W6.Z'deki "widget üretimi yönetişim hattında görünsün"), *yürütme*
tarafında değil. Eylem yürütmenin sahibi `dispatcher.dispatch()` olarak kalır;
yalnız yukarıdaki dar, `safe + readOnly` `/read` facade'ı genel yürütme yolu
değildir.

---

## 10. Sandbox politikanın uygulama noktasıdır, kutu değil

Sandbox "LLM kodunu iframe'e koymak" değildir. Görevi: **yürütme grafındaki daha
riskli düğümleri sistemin geri kalanına karşı sınırlamak.**

Dört kavram birbirinin yerine geçmez:

| Kavram | Sorusu | Bugünkü yeri |
|---|---|---|
| **Risk** | Bu iş ne kadar tehlikeli? | `capabilities.ts` `risk` alanı — **FACT** |
| **Capability** | Bu iş neyi yapabiliyor? | capability kaydı — **FACT** |
| **Authorization** | Bu çağıran bunu yapabilir mi? | `dispatcher.ts:112` + peer Bearer — **FACT** |
| **Isolation** | Kaçarsa neye ulaşır? | Worker/iframe — **TARGET** (W6.K, W6.3) |

İlk üçü çalışıyor, dördüncüsü yok. W6'nın izolasyon işi bu yüzden "güvenlik
ekleme" değil, **var olan sınırı istemciye kadar uzatma**dır.

---

## 11. Artefakt korpusu — ve tetikleyici kirlenmesi uyarısı

Küçük bir korpus kurmanın amacı sistemi doldurmak değil, **birleşim ve tekrar
kullanım davranışını gözlemlemek** olmalı. Katmanlı tek bir aile bunu verir:

```
Battery Primitive → Battery Card → Battery Panel → Battery Diagnostics → Device Health
```

**UYARI — mekanik yan etki (yeni tespit):** `PLAN_W6_app-shell.md §W6.5d` Artifact
Compiler'ı **"artefakt sayısı 200'ü geçerse"** tetikleyicisine bağladı. Sentetik
korpus artefaktları bu sayaca girerse, **korpusun kendisi tetikleyiciyi ateşler**
ve ertelenmesine karar verdiğimiz derleyiciyi erken açtırır — üstelik ölçmek
istediğimiz gerçek tekrar kullanım sinyalini de bozar.

**Kural: korpus artefaktları `provenance: "corpus"` ile işaretlenir ve W6.5d
tetikleyici sayımından hariç tutulur.** Sayaç yalnızca kullanıcının gerçek
kullanımından doğan artefaktları sayar.

---

## 12. Teorik referansların statüsü

Category Theory · Universal Composability · Holon · Emergence.

**Statüleri: yönlendirici referans. FACT değil, TARGET de değil.** Bunlar
uygulama standardı değil, tasarımı düşünme çerçeveleridir.

**Bağlayıcı alıntılama kuralı:** hiçbir kod maddesi bu çerçevelerden birine
dayanarak gerekçelendirilemez. "Category theory'de böyle" bir gerekçe değildir;
gerekçe her zaman ya kod ya ölçüm olmalıdır. Bu çerçeveler yalnızca **soruyu
biçimlendirir**, cevabı vermez.

---

## 13. Karar filtresi

Bundan sonraki her AIOS kararı bu sorulardan geçer:

1. Bu gerçekten mevcut bir standart değil mi? *(K9/K10 — `STANDARTLAR.md`)*
2. Bunu kodda kanıtlayabiliyor muyuz? *(K8 — hangi seviye: FACT / TEST / REVIEW?)*
3. Bunu deterministik yapabilir miyiz? *(model gerçekten gerekli mi)*
4. Bu yapı daha küçük mevcut yapıların birleşimi olabilir mi? *(K10)*
5. Bu birleşim hangi sözleşme üzerinden gerçekleşiyor? *(§4)*
6. Capability gerçekten gerekli mi? *(minimal closure — W6.W)*
7. Politika bu birleşime izin veriyor mu? *(§5, Π)*
8. Bu geçici yürütme mü, kalıcı artefakt mı? *(§6)*
9. Tekrar kullanımı **ölçebiliyor** muyuz? *(ölçülemeyen terfi ettirilemez)*
10. **Bugünkü ölçek bu altyapıyı gerçekten gerektiriyor mu?** *(W6.5d dersi)*

Onuncu soru diğer dokuzunu ezer: cevap "hayır" ise, fikir **silinmez —
tetikleyici koşulla ertelenir.**

---

## 14. Bu belgeden doğan yeni maddeler

Bunlar `docs/CHECKLIST.md`'ye eklendi:

- **M-1** Kanıt skalası dörde çıkarıldı (FACT / TEST-VERIFIED / REVIEW-VERIFIED /
  TARGET); mevcut maddeler bu skalaya göre yeniden etiketlenecek — W6.I
  TEST-VERIFIED, W3.5 REVIEW-VERIFIED
- **M-2** **B-6'nın önceliği yükseltildi** — "borç" değil, §8'deki tek-gerçek
  invaryantının bilinen ihlali; W6 kod yazımından önce kapatılmalı, çünkü W6
  bu iki listeyi de büyütecek
- **M-3** Maliyet ölçümü beş kalemli olsun (token · gecikme · ağ · doğrulama ·
  enerji) — W6.7 bugün yalnızca token sayıyor
- **M-4** Korpus artefaktları `provenance: "corpus"` ile işaretlenir ve W6.5d'nin
  200 tetikleyicisinden **hariç tutulur** (§11)
- **M-5** Artefakt sözleşmesi alanları (§4) W6.F şemasına girer: `approvalScope`
  (KARAR-2) + `capabilities` (W6.W) + `version` + `provenance`
- **M-6** `CanCompose` bağlam ve politika parametreli tanımlanır (§5.1); adapter
  uyumluluk ölçümünden **önce** uygulanır (§5.3)

---

## 15. Bu belgede düzeltilenler

`STANDARTLAR.md §9`'un kuralı burada da geçerli: kendi kaynak metnimizin hataları
da yazılır.

1. **AETHER yürütme katmanı değildir** (§9) — `execute: false`, kodda sıfır import,
   ve offline-first bunu zaten imkânsız kılar. Doğru yeri: politika/yönetişim.
2. **`CanCompose` ikili predicate olamaz** (§5.1) — Γ ve Π almalı, yoksa
   `Compose` ile tutarsız.
3. **`P` iki anlamda kullanılıyordu** (§5.2) — Π (ortam) ve P (uyumluluk) ayrıldı.
4. **"0 token" listesi FACT ile TARGET'ı karıştırıyordu** (§2) — üçü FACT, beşi TARGET.
5. **Geçici yürütme grafı greenfield değil** (§6.1) — task + correlationId +
   `MAX_CHAIN_DEPTH` zaten sınırlı bir graf; eksik olan terfi ve ölçüm.
6. **Kanıt skalası eksikti** (§0.1) — TEST-VERIFIED seviyesi elimizdeki iki
   vakadan türetildi.
7. **Korpus kendi tetikleyicisini ateşleyebilirdi** (§11) — hariç tutma kuralı eklendi.
8. **Taksonomiler paralel sözlük riski taşıyor** (§7) — kodda karşılığı olan
   kavram yeniden adlandırılmaz.
