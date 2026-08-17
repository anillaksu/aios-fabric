# STANDARDİZASYON TEMELİ

**2026-08-17 · v2 (dış denetim düzeltmeleriyle)**

> "Yeni bir şeyi yoktan var etmek diye bir şey yok; her şeyin bir başlangıcı vardır, öz alınabilecek."

---

## 1. Manifesto — beş madde

1. **Standard First** — Mevcut açık standardı kullan; gerekirse adapter yaz. Yeni format **son çaredir**.
2. **Evidence First** — Kodla kanıtlanmayan özellik FACT değildir. Bu, dış iddialar kadar **kendi iddialarımız** için de geçerlidir.
3. **JSON-RPC First** — Yeni RPC wire protokolü icat edilmez. JSON-RPC 2.0 ortak **mesaj dilidir**; her sınır kendi standardının **semantiğini** korur.
4. **Deterministic Runtime** — LLM önerir, şema/politika doğrular, runtime yürütür.
5. **Reference Implementation** — Yenilik yeni protokol icat etmek değil; A2A + MCP + declarative UI + cihaz capability + kalıcılık + risk sınırının **çalışan birleşimini** göstermektir.

---

## 2. Durum tablosu — vizyon, gerçeklik ve standart aynı ekranda

Bundan sonra her mimari tablo bu üç sütunu taşır. `❌` = kodda yok, `✅` = kodda kanıtlı.

| Özellik | Kod durumu | Standart / hedef |
|---|---|---|
| A2A peer delegasyonu | ✅ `a2a.ts`, canlı doğrulandı (W0) | **A2A** — v1.0 uyumu W2'de |
| JSON-RPC 2.0 mesaj dili | ✅ `server.ts:217` | **JSON-RPC 2.0** |
| Capability registry + risk kapısı | ✅ 38 capability, `dispatcher.ts` (W1) | **MCP tool** eşlemesi — W4 |
| Kalıcı journal (SQLite WAL) | ✅ `journal.ts` | **CloudEvents** adapter — S-1 |
| Declarative UI (ScreenSpec) | ✅ `renderer.js` + `registry.js` | **A2UI** hizalaması — S-3 |
| PWA kabuk | ✅ `manifest.json` + `sw.js` | **Web App Manifest + Service Worker + offline lifecycle** |
| postMessage widget köprüsü | ❌ **0 sonuç** | **JSON-RPC 2.0 over postMessage** — TARGET (W6.4) |
| Worker izolasyonu | ❌ **0 sonuç** | **Web Worker** — TARGET (W6.K) |
| iframe sandbox | ❌ **0 sonuç** | **MCP Apps deseni** — TARGET (W6.3) |
| IndexedDB artefakt deposu | ❌ **0 sonuç** (bugün `localStorage`) | **IndexedDB** — TARGET (W6.5) |
| Pencere/grid katmanı | ❌ `renderer.js:118` tek ekran | declarative layout — TARGET (W6.2) |
| Dağıtık izleme | ❌ yok | **W3C Trace Context** — TARGET (S-2) |

---

## 3. Mesaj dili ≠ transport ≠ semantik

Önceki sürümde "tek protokol, üç sınır" yazmıştım — **fazla iddialıydı ve düzeltildi.**
A2A v1.0 birden fazla transport tanımlar (JSON-RPC 2.0 bunlardan biridir); yani A2A
"HTTP üzerindeki JSON-RPC" değildir.

Doğru ifade:

> **Transport değişebilir; message contract ve semantics değişmez.**

```
Mesaj dili      : JSON-RPC 2.0            (üç sınırda da ortak)
Transport       : HTTP · SSE · postMessage · (gRPC, REST — A2A'da tanımlı)
Semantik        : A2A (ajan)  ·  MCP (araç)  ·  AIOS Widget (arayüz)
```

Widget köprüsü bu yüzden **yeni bir protokol değil, yeni bir binding**:
`postMessage` + JSON-RPC 2.0 mesaj biçimi + AIOS'a özgü method/params semantiği.

---

## 4. Capability tek bir şeye eşlenmez

Önceki sürümdeki `capability → MCP tool` eşlemesi **birebir değildi, düzeltildi**.
Bir AIOS capability'si bağlama göre birden fazla şeye karşılık gelebilir:

```
AIOS Capability
   ├── MCP Tool            (çağrılabilir eylem: script.run, doc.create)
   ├── MCP Resource        (okunabilir içerik: app.list, wifi.info)
   ├── A2A Skill           (dışa duyurulan yetenek: Agent Card)
   ├── Device Capability   (kamera, konum, bildirim, paylaşım, bluetooth)
   └── Worker Capability   (widget'ın sandbox içinden isteyebildiği)
```

`camera`, `location`, `notifications`, `bluetooth`, `share` gibi cihaz yetenekleri
MCP Tool kalıbına tam oturmaz — eşleme katman katman yapılır.

---

## 5. correlationId ≠ traceparent

Önceki sürümde bunları eşdeğer saymıştım — **yanlıştı, düzeltildi.** Farklı kavramlar
ve **birlikte** bulunabilirler:

| Alan | Ne anlatır | Kaynak |
|---|---|---|
| `correlationId` | Aynı iş akışına ait olaylar | event sourcing / AIOS |
| `causationId` | Bu olaya hangi olay sebep oldu | event sourcing / AIOS |
| `traceparent` | Dağıtık çağrı zinciri (span) | **W3C Trace Context** |
| `tracestate` | Satıcıya özgü izleme verisi | **W3C Trace Context** |

Hedef zarf:

```json
{ "correlationId": "…", "causationId": "…", "traceparent": "00-…", "tracestate": "…" }
```

Doğru cümle: *AIOS trace context → W3C Trace Context'e map edilir.*
Yanlış cümle: ~~correlationId = traceparent~~

---

## 6. Araştırma bulguları: A2UI ve MCP Apps

Bu iki referans doğrulandı ve ikisi de bağımsız olarak vardığımız kararları teyit ediyor.

### 6.1 A2UI — ScreenSpec'in standart karşılığı

[A2UI](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/),
ajan güdümlü arayüzler için açık bir **declarative UI** projesi. Tanımı birebir bizim
mimarimizi anlatıyor:

> *"A2UI declarative bir veri formatıdır, çalıştırılabilir kod değil. İstemci uygulaman
> güvenilir, önceden onaylanmış UI bileşenlerinden oluşan bir **katalog** tutar ve ajan
> yalnızca o katalogdan bileşen istemesini talep edebilir."*

Bizdeki karşılığı **zaten yazılmış durumda**:

| A2UI kavramı | Bizdeki kod |
|---|---|
| Güvenilir bileşen kataloğu | `renderer.js:22` `ALLOWED_TYPES = new Set(Object.keys(REGISTRY))` |
| Ajan yalnızca katalogdan isteyebilir | `renderer.js:38` `validateSpec()` — bilinmeyen tip elenir |
| Çalıştırılabilir kod yok | `renderer.js:1-17` "LLM artık HTML üretmiyor" |
| Yapılandırılmış eylem | `cleanAction()` — yalnızca izinli capability |

**Bu, ilke 5'in (Reference Implementation) en güçlü kanıtı:** deseni bağımsız keşfetmişiz,
şimdi standarda hizalamak kalıyor (S-3).

### 6.2 MCP Apps — widget sandbox'ının standart karşılığı

[MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) (SEP-1865, spec
2026-01-26) MCP'nin **ilk resmi uzantısı**; MCP-UI yaratıcıları ile OpenAI ve Anthropic
birlikte geliştirdi. Kararlarımızla örtüşen üç noktası:

| MCP Apps kuralı | Bizim W6 kararımız |
|---|---|
| Görünümler sandboxed iframe'de çalışır, Host'un DOM/çerez/deposuna erişemez | W6.3 — aynı |
| İletişim yalnızca `postMessage`, denetlenebilir JSON-RPC ile | W6.4 + S-4 — aynı |
| UI'den başlatılan tool çağrıları **kullanıcı onayı** ister | W1 risk kapısı — **zaten çalışıyor** |

**Ve bir düzeltme getiriyor.** W6 planında *"`allow-scripts` ve `allow-same-origin` asla
yan yana yazılmayacak"* demiştim. MCP Apps ikisini birlikte **zorunlu** kılıyor — ama tek
bir şartla: **Host ve Sandbox farklı origin'de olmalı.** O zaman "same origin" sandbox'ın
kendi origin'idir, host'unki değil; iframe kendi depolamasını kullanabilir ama host'unkine
erişemez.

Benim ifadem **aynı origin'de `srcdoc`** kullanıldığında doğru, ama genel kural olarak
fazla kesindi. Doğru kural:

- Sandbox **ayrı origin'de** barındırılıyorsa → `allow-scripts allow-same-origin` **doğru**
- Sandbox **aynı origin'de** (`srcdoc`) ise → `allow-same-origin` **verilmemeli**

Bizim için pratik sonucu: telefon bugün tek origin sunuyor (`:9300`). MCP Apps desenine
uymak için sandbox'a **ayrı bir origin** (farklı port ya da hostname) ayrılmalı — bu
W6.3'e giren yeni bir gereksinim.

---

## 7. Konumlandırma

```
A2A · MCP · MCP Apps · A2UI · JSON-RPC 2.0 · CloudEvents · W3C Trace Context · Web Platform
                                    │
                                    ▼
                    ┌──────────────────────────────┐
                    │            AIOS              │
                    │  Offline-first               │
                    │  Device capabilities         │
                    │  Persistent journal          │
                    │  Generative UI               │
                    │  Risk / policy boundary      │
                    │  Local artifact runtime      │
                    └──────────────────────────────┘
```

> **AIOS yeni bir internet protokolü değildir. AIOS, mevcut açık standartların cihaz
> üzerinde birleştiği referans runtime'dır.**

**"Dünyada ilk" iddiası yapılmaz.** Önceki sürümde *"bu üçünü birleştiren bir katman yok"*
yazmıştım — bu, doğrulayamayacağım bir dış dünya iddiasıydı ve **kendi ilke 2'mize aykırıydı**
(bütün repoların koduna sahip değiliz). Düzeltilmiş hâli:

> AIOS, bu standartların offline-first, device-capability-aware ve persistent generative
> runtime içindeki birleşimini **çalışan bir referans uygulama olarak hedefler.**

Çalışan sistem ortaya çıktığında kapsamlı bir tarama yapılıp gerçekten ilk olup olmadığına
ayrıca bakılır.

---

## 8. Checklist'e giren maddeler

- **S-1** CloudEvents adapter — journal iç formatını korur, dışa açılırken map edilir
- **S-2** W3C Trace Context — `traceparent`/`tracestate` zarfa **eklenir** (correlationId yerine geçmez)
- **S-3** ScreenSpec ↔ **A2UI** hizalaması; adapter yazılırsa FACT, yazılmazsa TARGET
- **S-4** Widget köprüsü: JSON-RPC 2.0 mesaj biçimi + postMessage binding + AIOS widget semantiği
- **S-5** ScreenSpec'ler MCP **resource**/App olarak yayınlansın
- **S-6** Kıyaslama tabloları üç sütunlu olsun: özellik · kod durumu · standart/hedef
- **S-7** Capability eşlemesi katmanlı olsun (tool / resource / skill / device / worker)
- **S-8** Sandbox için **ayrı origin** ayrılsın (MCP Apps şartı) — W6.3 gereksinimi

---

## 9. Bu belgede düzeltilen kendi hatalarım

İlke 2 kendi iddialarımıza da uygulanır; v1'de dört hata vardı:

1. "Tek protokol, üç sınır" → A2A çoklu transport tanımlar; mesaj dili/transport/semantik ayrıldı
2. `capability = MCP tool` → birebir değil, katmanlı eşleme yapıldı
3. `correlationId = traceparent` → farklı kavramlar, birlikte bulunurlar
4. "Bu birleşimi yapan yok" → doğrulanamaz dış iddia, kaldırıldı
5. "`allow-same-origin` asla" → ayrı origin şartıyla MCP Apps bunu zorunlu kılıyor
