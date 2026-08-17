# İŞ PLANI — A2A köprüsü, yetki katmanı, protokol uyumu
**2026-08-17 · dış denetim raporu + kod doğrulaması birleştirildi · kod yazılmadı**

Girdi: (a) `PLAN_2026-08-17_kontrollu-koprü.md` (P0–P3), (b) dış ajan raporu
(`dlt_fc17bf0f14d842c79563b320305f9696`), (c) bu depodaki kodun satır satır okunması.
Bu belge üçünü tek sıraya indirger.

---

## 0. Raporun iddiaları — kodla karşılaştırma

| Rapor ne diyor | Kodda ne var | Sonuç |
|---|---|---|
| `a2a.delegate` **executor registry'ye bağlanmamış** | `capabilities.ts:503-552` — capability **tam yazılmış**, `execute()` gerçek iş yapıyor | ❌ **Teşhis yanlış yeri gösteriyor** (aşağıda) |
| UI action'ı generic `/envelope`'a gönderiyor | `app.js:149` `sendIntent()` → `/envelope`. Doğru | ✅ ama kırık burada değil |
| Hata metni: *"yerel capability yok… POST /a2a/delegate kullanın"* | `dispatcher.ts:431` — birebir aynı metin | ✅ kaynak bulundu |
| `/.well-known/agent-card.json` → 404 | `server.ts:561` ve `pc-agent/server.ts:202` yalnızca `agent.json` sunuyor | ✅ doğru |
| Yanıt şekli pre-v1 | `server.ts:213` `state:"completed"`, `role:"agent"` — v1 `TASK_STATE_COMPLETED`/`ROLE_AGENT` değil | ✅ doğru |
| Task lifecycle yok (`GetTask` → -32601) | `server.ts:187` regex yalnızca `SendMessage\|message/send` kabul ediyor | ✅ doğru |
| Auth yok, CORS `*` | `server.ts:146`, `pc-agent/server.ts:105` — her yanıtta `Access-Control-Allow-Origin: *`, hiçbir yerde token kontrolü yok | ✅ doğru |
| `llm_bridge` MCP sunucusu değil | Yalnızca `/generate` çağrılıyor (`capabilities.ts:957`) | ✅ doğru |
| Timeout semptomlarının bir kısmı gerçek değil, UI kesiyor | Ölçüldü, zincir tutarsız (§2) | ✅ doğru, sayılarla |
| Model "sensörün yok" dememeli | `prompt.ts:26-34` bunu zaten **yasaklıyor** — ama yalnızca talimat, zorlayıcı yok | ⚠️ kısmen |

### Kök neden — raporun kaçırdığı yer

Rapor "sistem kendi ürettiği action type'ı tanıyor ama executor registry'ye bağlamamış"
diyor. Registry'ye **bağlanmış**. Kırık bir adım sonrada:

```ts
// dispatcher.ts:110-117
if (cls === "AGENT") {
  void this.executeViaAgentPlaceholder(taskId, correlationId, intent);  // ← capability HİÇ çağrılmıyor
} else {
  void this.executeCapability(taskId, correlationId, intent, capability!);
}
```

`a2a.delegate`'in `class`'ı `"AGENT"` (`capabilities.ts:513`). Dispatcher sınıfa bakıp
dallanıyor, **executor'ın var olup olmadığına bakmıyor**. Yani:

```
UI butonu → /envelope → capabilityMap.has("a2a.delegate") = TRUE (geçer)
          → dispatcher.dispatch() → cls="AGENT" → placeholder → HATA
                                                   ↑
                          capabilities.ts'teki çalışan execute() burada atlanıyor
```

Bunun üç sonucu var:
1. Düzeltme **UI'da endpoint bypass değil** (rapor bunu kendisi de önermiyor, haklı olarak).
2. Düzeltme **yeni bir A2A adapter yazmak da değil** — adapter zaten yazılmış.
3. Düzeltme dispatcher'da **üç satır**: executor varsa sınıftan bağımsız çalıştır,
   placeholder yalnızca capability **yoksa**.

`class: "AGENT"` olan tek capability `a2a.delegate` olduğu için bu dal bugün
yalnızca onu vuruyor; ama kural olarak yanlış — sonraki her AGENT capability'si de
aynı duvara çarpacak.

---

## 1. Koddan çıkan, raporda ve eski planda olmayan bulgular

**B1 — `a2a.delegate` kendi sunucusuna HTTP ile geri çağrı yapıyor.**
`capabilities.ts:520` `fetch("http://127.0.0.1:9300/a2a/delegate")`, sonra `:533`
aynı sunucudan poll. Süreç içi çağrı yerine ağ üzerinden. **Sıralama uyarısı:**
peer auth (W1.4) eklendiği an bu çağrı kendi kendini 401'e düşürür. Bu yüzden
self-fetch düzeltmesi auth'tan **önce** gelmek zorunda.

**B2 — `pc-agent` JSON-RPC yolunda task hiç kaydedilmiyor.**
`pc-agent/server.ts:160` `taskId` üretiyor, yanıta koyuyor, ama `tasks.set()` yok.
REST yolu (`:222`) kaydediyor. Yani `GetTask` eklense bile JSON-RPC ile açılan
görevler **hiçbir zaman bulunamaz**. Raporun "lifecycle yok" tespitinin somut yeri.

**B3 — A2A görevleri journal'da değil, süreç belleğinde.**
`a2a.ts:108` `private tasks = new Map()`. Journal SQLite WAL ve kalıcı
(`journal.ts:11-33`), ama A2A tarafı ona bağlı değil. Sunucu yeniden başladığında
tüm A2A geçmişi gider. Raporun "task truth SQLite/journal olsun" önerisi doğru ve
altyapı **zaten mevcut** — eksik olan bağlantı.

**B4 — Sunucu tarafı dış çağrılarda timeout yok.**
`capabilities.ts:957` (llm_bridge) ve `a2a.ts:289` (peer'a delegasyon) `AbortSignal`
taşımıyor. İstemci 25-30 s'de kesiyor, sunucudaki `fetch` asılı kalıyor, task
sonsuza dek `running`. Raporun "task state bağımsız devam ediyor" gözleminin
mekanizması bu. (`resolveRpcUrl` 8 s ile tek istisna, `a2a.ts:344`.)

**B5 — Agent Card gerçeği anlatmıyor.**
`a2a.ts:140-151` elle yazılmış **5 skill**; gerçek capability sayısı **38**.
Sürüm: kart `"0.3.0"` (`a2a.ts:138`), `package.json` `"0.1.0"` — pc-agent'ta da
aynı çelişki (`pc-agent/server.ts:49` vs `pc-agent/package.json`). Eski planın
P0.2'si hâlâ açık; kanıtı bu.

**B6 — `link.open` / `intent.run` hem girdide hem çıktıda redaksiyonsuz.**
`sensitiveFields` yok (`capabilities.ts:391`, `:414`) ve sonuç `data:{kit, uri}`
olarak dönüyor (`:409`) → arama terimi **ve** tam URI `task.completed` payload'ıyla
diske yazılıyor. Eski plan P1.3 yalnızca girdiyi işaret ediyordu; çıkış tarafı da var.

**B7 — Otomasyon zincir derinliği kesicisi yok.**
`automations.ts:129` `automation.*` event'lerini eliyor, `:135` cooldown uyguluyor.
Ama kural A → capability → event → kural B → capability → kural A zinciri
mümkün; yalnızca 60 s'de bir dönen yavaş bir döngü olur. Denetim #2 açık.

**B8 — Gateway anahtarı depoda düz metin.**
`a2a.ts:60` `const GATEWAY_KEY = "local-retro-os-9f2c"`. Yerel gateway anahtarı,
ama artık git geçmişinde.

**B9 — Ölü kod:** `a2a.ts:363` `pollPeerTask()` hiçbir yerden çağrılmıyor (eski
özel REST biçiminden kalma).

---

## 2. Ölçülen timeout zinciri — tutarsız

| Katman | Süre | Dosya |
|---|---|---|
| UI `read`/`postJSON` | 25 s | `api.js:16` |
| UI `sendIntent` | 30 s (`script.run` 60 s) | `api.js:67`, `app.js:152` |
| `/envelope` `wait` | ≤120 s (varsayılan 30 s) | `server.ts:364` |
| `a2a.delegate` capability iç poll | **45 s** | `capabilities.ts:530` |
| A2A JSON-RPC inbound bekleme | 170 s | `server.ts:201` |
| Peer timeout varsayımı | 180 s | `server.ts:201` yorumu |
| `llm.generate` → llm_bridge | **∞** | `capabilities.ts:957` |
| Peer'a delegasyon fetch | **∞** | `a2a.ts:289` |

Kural olması gereken: **UI ≥ envelope ≥ capability ≥ dış çağrı.** Bugün
capability (45 s) envelope'un varsayılanından (30 s) uzun; kullanıcı "zaman aşımı"
görürken iş arka planda sürüyor ve sonucu kimse toplamıyor.

---

## 3. İş sırası

Raporun önerdiği sıradan **tek sapma**: rapor auth'u 7. sıraya koyuyor. Bugün
tailnet'teki herhangi bir cihaz, token olmadan PC'de PowerShell çalıştırabiliyor
(`pc-agent/skills.ts:117`) ve telefonda `whatsapp.send` / `clipboard.set` /
`script.run` tetikleyebiliyor. Sahibin kararı da zaten "önce salt-okuma, yetki bir
anda açılmayacak" idi. Auth ve risk katmanı **2. sıraya** alındı.

### W0 — Kanıtlanmış kırığı kapat  ·  ~30 dk  ·  bloklayıcı yok

| # | İş | Dosya |
|---|---|---|
| W0.1 | Dispatcher: `capability?.execute` varsa sınıftan bağımsız çalıştır; placeholder yalnızca capability yoksa | `dispatcher.ts:110-117` |
| W0.2 | `a2a.delegate` self-fetch → doğrudan `A2AHub` çağrısı (B1) | `capabilities.ts:515-551` |
| W0.3 | Timeout zincirini hizala: capability 25 s < envelope 30 s < UI 35 s | `capabilities.ts:530`, `api.js`, `app.js:152` |

**Kabul (canlı kanıt, statik kontrol yetmez):**
`npm run build` → `BUILD_OK` · sunucu restart · `/` 200 ·
UI'de `a2a.delegate` butonu → PC `system.info` çıktısı ekranda ·
`/journal?type=task.completed` içinde aynı `taskId` görünüyor.

### W1 — Yetki ve risk katmanı  ·  eski plan P1.1+P1.2+P1.3 + raporun auth maddesi

| # | İş | Dosya |
|---|---|---|
| W1.1 | `risk: "safe" \| "notify" \| "ask"` alanını `Capability` tipine ekle, varsayılan `"ask"` | `types.ts:88` |
| W1.2 | 38 capability'yi sınıflandır (okuma → `safe`; `script.run`/`share.text`/`whatsapp.send`/`clipboard.set`/`a2a.delegate` → `ask`) | `capabilities.ts` |
| W1.3 | Dispatcher'da **zorunlu kapı**: `ask` olan iş onaysız çalışmaz (W2'ye kadar: reddet + gerekçe) | `dispatcher.ts:81-119` |
| W1.4 | Otomasyon kuralları capability'nin azami riskini aşamaz + zincir derinliği kesici (B7) | `automations.ts` |
| W1.5 | Peer başına bearer token; CORS wildcard'ı kaldır (UI same-origin, peer'lar token'la) | `server.ts:146`, `pc-agent/server.ts:105` |
| W1.6 | `pc-agent`: `shell.run` varsayılan **KAPALI** (env ile açılır), yerine dar işler: `disk.free`, `proc.list` | `pc-agent/skills.ts:117` |
| W1.7 | Redaksiyon: `link.open`/`intent.run` girdi **ve** çıktı (B6); `sensitiveFields` varsayılanı "hassas kabul et" | `capabilities.ts:391,414` |
| W1.8 | `GATEWAY_KEY` env'e taşı (B8) | `a2a.ts:60` |

**Kabul:** token'sız istek **401** · `shell.run` kapalıyken **403** · `ask` işi
onaysız reddediliyor · journal'da arama terimi/URI **grep ile bulunamıyor**.

### W2 — A2A v1.0 uyumu  ·  raporun P1'i

| # | İş | Dosya |
|---|---|---|
| W2.1 | `/.well-known/agent-card.json` (iki tarafta da); `agent.json` alias kalır | `server.ts:561`, `pc-agent/server.ts:202` |
| W2.2 | Kart tek kaynaktan üretilsin: `version` ← `package.json`, `skills` ← capability registry, yalnızca `risk:"safe"` olanlar dışa duyurulur (B5, eski P0.2) | `a2a.ts:118-153` |
| W2.3 | v1 alanları: `protocolVersion`, `supportedInterfaces` (telefonda yok), `TASK_STATE_*`, `ROLE_*` | `server.ts:207-220` |
| W2.4 | `GetTask` / `ListTasks` / `CancelTask`; `pc-agent`'ta JSON-RPC task'ını kaydet (B2) | `server.ts:187`, `pc-agent/server.ts:160` |
| W2.5 | A2A görevlerini journal'a bağla — kalıcılık (B3) | `a2a.ts:108`, `journal.ts` |
| W2.6 | İstemci tarafı da canonical yolu denesin (`agent-card.json` → `agent.json` sırası) | `a2a.ts:343` |

**Kabul:** `agent-card.json` **200** · `GetTask` sonucu journal kaydıyla birebir ·
**sunucu yeniden başlatıldıktan sonra** aynı `taskId` hâlâ sorgulanabiliyor.

### W3 — Asenkron teslim  ·  eski plan P3 + raporun P2'si

- `wait:false` yolu: iş kabul edilir, `taskId` hemen döner
- Tamamlanınca `notification.send` + AKTİF sekmesinde sonuç
- Bütün dış `fetch`'lere `AbortSignal.timeout` (B4) — asılı task kalmasın
- SSE yalnızca görüntüleme kanalı; doğruluk kaynağı journal

**Kabul:** telefon kilitliyken başlatılan uzun iş, ekran açıldığında bildirimle geliyor.

### W4 — MCP cihaz sunucusu  ·  denetim #8, raporun P1'i

- Capability registry → `tools/list`; `/mcp` Streamable HTTP
- **Fail-closed:** yalnızca `risk:"safe"` ve açıkça izinli olanlar dışa açılır
  (AETHER'ın `REMOTE_TOOL_ALLOWLIST` deseninin aynısı)

### W5 — Deterministik action bus  ·  raporun "asıl mimari kırık" maddesi

- `llm.generate` çıktısına JSON şema doğrulaması → typed intent → executor
- Bugün doğrulama **istemcide** (`renderer.js:38 validateSpec`) — sunucuya taşınmalı,
  yoksa kural istemciyi atlayan her yolda (A2A, otomasyon) uygulanmıyor
- Model "cihaz bilgisi" uydurmasın: prompt kuralı (`prompt.ts:26`) **zorlayıcıya** dönüşsün

---

## 4. Reddedilen öneri

**UI'da endpoint bypass** (`if (type === "a2a.delegate") return postJSON("/a2a/delegate", …)`).
Rapor bunu "kısa vadede çalışır ama ana çözüm değil" diye sunuyor; burada tamamen
düşürüyorum. `/envelope` journal, receipt, retry, undo ve DevTools hattının tek
giriş kapısı; bypass bu işi görünmez kılar. W0.1 zaten üç satır — geçici çözüme
gerek yok.

## 5. Her adımda zorunlu doğrulama kapısı (değişmedi)

1. `npm run build` → `BUILD_OK`
2. Sunucu yeniden başlar ve `/` **200** döner
3. Değiştirilen davranış **canlı tek çağrıyla** kanıtlanır
4. Telefona dağıtım öncesi `scripts/deploy-to-phone.sh --check` → depo/telefon birebir
