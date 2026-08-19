# AIOS — DETERMINISTIC HANDOVER PROTOCOL

> **Amaç:** Bir ajan, sohbet geçmişi veya model belleği olmadan yalnız
> repository üzerinden aynı sistem bağlamını, kanıt seviyesini ve güvenli
> sonraki adımı yeniden kurabilsin.
>
> Bu belge ürün davranışının kaynağı değildir. Kaynak sırası aşağıdadır;
> çelişkide daha aşağıdaki ve daha somut kaynak kazanır.

## 1. Kanonik gerçeklik sırası

```text
çalışan kod + test + canlı kanıt
  > commit içeriği
  > CHECKLIST maddesi
  > CURRENT HANDOFF / oturum kaydı
  > araştırma veya chat özeti
```

Bir agent hiçbir eski iddiayı bu zincirden bağımsız FACT kabul etmez.

## 2. Zorunlu başlangıç algoritması

Her oturumda, kod yazmadan önce sırayla:

```text
1. git rev-parse HEAD
2. git status --short
3. git log --oneline --decorate -40
4. docs/AIOS_HANDOFF_CURRENT.md
5. docs/PRODUCT_GAP_REGISTER.md
6. docs/CHECKLIST.md
7. docs/MIMARI_TEMEL.md ve docs/STANDARTLAR.md
8. en güncel docs/OTURUM_YYYY-MM-DD.md
9. ilgili kod + ilgili test
```

Sonra aşağıdaki tablo çıkarılır; tahminle doldurulmaz.

| Alan | Zorunlu kanıt |
|---|---|
| HEAD | `git rev-parse HEAD` çıktısı |
| Worktree | `git status --short` çıktısı |
| Kod davranışı | exact source path + call-site |
| Test seviyesi | ilgili test komutu ve sonuç |
| Canlı seviye | tarih, cihaz/yüzey, gerçek response/journal veya owner kabulü |
| Açık iş | `PRODUCT_GAP_REGISTER.md` `gapId` |

**Çelişki işlemi:** Kod/test/canlı kanıt bir belgeyle uyuşmazsa agent önce
çelişkiyi handoff'a `DOCUMENTATION DRIFT` olarak kaydeder. Eski belgeyi
sessizce FACT gibi yeniden yazmaz.

## 3. Kanıt durum makinesi

```text
TARGET
  → REVIEW-VERIFIED       (yalnız kod incelemesi)
  → TEST-VERIFIED         (implementation + otomatik test)
  → LIVE-VERIFIED         (aynı sürüm, gerçek cihaz/yüzey)
  → FACT                  (commit + test + canlı kanıt + belge bağlantısı)
```

`SUPERSEDED` yalnız yeni karar eski kararın neden ve etkisini açıkça
taşıdığında kullanılır. Kayıt silinmez. `FACT` bir sıfat değil, izlenebilir
kanıt paketidir.

## 4. Değişmez runtime ve authority haritası

```text
LLM proposal
  → ScreenSpec / schema validation
  → policy + human approval
  → dispatcher.dispatch()
  → capability execution
  → journal
  → Runtime Ledger
  → RuntimeWitness
  → Formation Memory / immutable provenance JOIN
```

- LLM yalnız önerir; approval, execution, FACT, provenance veya ekonomik
  değer authority'si değildir.
- `dispatcher.dispatch()` UI, MCP, A2A ve otomasyon yan-etkilerinin kapısıdır.
- `/read` genel execution değildir: yalnız `risk:"safe" + readOnly:true`
  capability için dar facade'dır.
- AETHER governance/evidence sürekliliğidir; execution engine değildir.
- Formation Canvas ve Explorer read-only projection'tır; formation/edge mutate
  edemez.
- `reuse(existing formation)` yeni formation değildir; yalnız gerçek execution
  sonrası witness + immutable provenance edge oluşabilir.

## 5. Kod topoğrafyası: kullanıcı amacı → kod → kanıt

| Ürün amacı | Birincil kod | Test ankrajı | Canlı kanıt sınırı |
|---|---|---|---|
| Capability execution / policy | `fabric/src/dispatcher.ts`, `capabilities.ts`, `approval.ts` | `action-bus`, `approval`, `read-policy` | gerçek device capability/journal |
| A2A/MCP sınırı | `a2a.ts`, `mcp.ts`, `server.ts` | `action-bus`, `mcp`, `a2a-idempotency` | gerçek endpoint/journal |
| ScreenSpec Layer A | `screenspec.ts`, `public/js/registry.js`, `renderer.js` | `registry-drift`, `screenspec-ui-expressiveness` | telefon render/interaction |
| Artifact/Application/Window | `artifact-contract.js`, `application-model.js`, `windowmanager.js` | ilgili model/window testleri | launcher/lifecycle telefon kabulü |
| Phone Workspace / discovery | `screens.js`, `workspace-catalog.js`, `navigation-state.js` | `workspace-catalog`, `navigation-state` | gerçek mobil navigation |
| Runtime evidence | `journal.ts`, `runtime-status.ts`, `scripts/aios-runtime-ledger.sh` | `runtime-status`, `runtime-provenance` | process/port/journal |
| Formation Memory | `formation-memory.js`, `runtime-provenance.ts` | `formation-memory`, `runtime-provenance` | real completed task → witness → edge |
| Formation projection | `formation-canvas.js`, `formation-canvas-view.js`, `formation-explorer.js` | `formation-canvas`, `formation-explorer` | phone visual/reuse acceptance |
| Portable read-only node tools | `bin/aios`, `scripts/aios-connectivity-bridge.sh` | `portable-cli`, `termux-bridge` | target platform CLI/bridge proof |

Bu tablo exhaustive source listesi değildir; agent ilgili yüzeye girmeden önce
`rg --files fabric/src fabric/public/js fabric/test scripts` ile gerçek sınırı
yeniden tarar.

## 6. Ürün nesneleri birbirine dönüştürülmez

```text
Artifact          = reusable declarative work unit + contract/provenance
ApplicationEntry  = persistent launcher identity → artifactId
WindowManager     = open/focus/layout lifecycle projection
Secondary screen  = ephemeral browser-history navigation surface
Capability         = registry'de policy kontrollü device/runtime function
Formation          = deterministic verified identity
Provenance edge    = immutable verified relationship
```

Bir UI iyileştirmesi bu ayrımı bozuyorsa önce owner kararı gerekir.

## 7. Product Gap Register işletim kuralı

`docs/PRODUCT_GAP_REGISTER.md` açık ürün borcunun append-only kaydıdır.
Her kayıt şunları taşır:

```text
gapId → surface → codeEvidence → currentBehavior → userImpact
      → existingPrimitive → missingPrimitive → acceptanceCriteria
      → testPlan → liveProofPlan → priority → status
```

Yeni iş başlamadan önce ilgili gap bulunur. Yoksa önce kaydı açılır; ancak
doğrulanmış ihtiyaç ve code evidence olmadan “gelecekte lazım olur” kaydı
açılmaz. Kapanışta kayıt silinmez; commit/test/live proof bağlantısı eklenir.

## 8. Güvenli değişiklik ve kabul algoritması

```text
product need
  → exact code trace
  → existing primitive reuse
  → smallest sufficient implementation
  → focused tests
  → npm test + BUILD_OK + diff check
  → B-9 read-only health check before phone test
  → deploy
  → real device behavior + journal/response where applicable
  → docs + GAP state
  → canonical commit
```

- B-9 anlık sağlık kontrolüdür; MIUI/Termux survivability kanıtı değildir.
- Deploy, test veya kaynak eşleşmesi canlı kullanıcı kabulü yerine geçmez.
- UI için owner'ın gerçek telefon gözlemi kanıttır; kaydedilen hatalar yeni
  `OPEN`/`IN_PROGRESS` gap veya mevcut gap'e ek evidence olur.
- Yeni RPC, generic state store, graph database, Layer B, economy veya AETHER
  execution mevcut primitive yetersizliği koddan gösterilmeden eklenmez.

## 9. Bu handoff anının dürüst çalışma sınırı

- **HEAD:** her devralmada komutla okunur; belge içindeki hash cache değildir.
- **Worktree:** Explorer/UI ve Product Gap Register için uncommitted çalışma
  vardır; ilgili test/build başarılı olsa bile telefon görsel kabulü ve
  canonical commit tamamlanmadan FACT değildir.
- **B-9:** önceki tarihli anlık sağlık kanıtı tarihseldir. Yeni telefon
  kontrolünde runtime-status Fabric + watchdog online, `llm_bridge` + Hermes
  gateway down gözlemlenmiştir; bu, eski kanıtı silmez ama bugünkü sağlığı
  kanıtlamaz.
- **Sabit FACT'ler:** W6.K ve W6.L yeniden açılmaz. Runtime Ledger → Formation
  Memory provenance primitive'leri ve ikinci reuse/portability kabulü yeniden
  tasarlanmaz; ürün yüzeyleri `PRODUCT_GAP_REGISTER` üzerinden ilerler.

## 10. Devir bitiş kaydı

Her değişiklik/commit sonrasında aşağıdaki beş belge aynı turda gözden
geçirilir:

```text
docs/CHECKLIST.md
docs/AIOS_HANDOFF_CURRENT.md
docs/KARARLAR_MIMARI_OZET_2026-08-18.md
docs/ARASTIRMA_ARSIVI.md
docs/PRODUCT_GAP_REGISTER.md
```

`OTURUM_YYYY-MM-DD.md` ham kronolojidir; yalnız tarihi/komutu/canlı sonucu
ekler. Handoff karar indeksidir; session notu yerine geçmez.
