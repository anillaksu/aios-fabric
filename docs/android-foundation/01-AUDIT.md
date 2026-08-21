# AIOS ANDROID OS FABRIC FOUNDATION — PART 1: REPOSITORY AUDIT

Tarih: 2026-08-21
Temel checkpoint: `e0a92be`
Son kanonik regresyon: `gatecanonical-20260821-200600-ad98c654` (35/35 PASS)

Sınıflandırma anahtarı:
- **PRODUCTION_READY** — gerçek kullanıma hazır, sertleştirilmiş
- **PROVEN_SYNTHETIC** — testler geçiyor ama sentetik/mock veri ile (gerçek cihaz/ağ/kurum değil)
- **PROVEN_LIVE** — gerçek süreç/ağ/donanımla kanıtlanmış (mock değil)
- **MISSING** — hiç yok
- **WRONG_SCOPE** — var ama bu görev için yanlış katmanda/yanlış soyutlamada
- **LEGACY** — çalışıyor ama terk edilecek/konsolide edilecek
- **TECHNICAL_DEBT** — çalışıyor ama bilinen kusurlarla

---

## Bileşen Bazlı Denetim

| Bileşen | Dosya | Satır | Sınıflandırma | LIVE / SYNTHETIC / DESIGN_ONLY | Not |
|---|---|---|---|---|---|
| **runtime-console** | `desktop/runtime-console.mjs` | 601 | PRODUCTION_READY | LIVE | `RuntimeOrchestrator`, `ALLOWED_STATES`, gerçek child-process spawn ile 35 adımlık kanonik regresyonu bu oturumda gerçekten çalıştırdı (26.9 sn, hepsi PASS). Heartbeat `unref()` düzeltmesi bu oturumda doğrulandı. |
| **agent-control-plane** | `desktop/agent-control-plane.mjs` | 514 | PRODUCTION_READY | LIVE | `getCanonicalState()` tek kanonik kaynak; `/api/projection` üzerinden canlı olarak tüketiliyor (bu oturumda 3 farklı yüzeyden aynı runId doğrulandı). |
| **fabric-engine** | `desktop/fabric-engine.mjs` | 511 | PROVEN_SYNTHETIC | SYNTHETIC ağırlıklı | Task/agent orkestrasyon mantığı test paketlerinde (`test-agent-quota-resume.mjs` vb.) sentetik sağlayıcı olaylarıyla (`agent-claude hit QUOTA_LIMITED`) kanıtlanıyor — gerçek bir LLM sağlayıcı kesintisiyle değil. Mantık doğru ama "canlı" değil. |
| **fallback-graph** | `desktop/fallback-graph.mjs` | 150 | PROVEN_SYNTHETIC | SYNTHETIC | `PROVIDER_HEALTH`, `QUORUM_VERDICTS`, `FallbackGraph` sınıfı var ve testte REASSIGNABLE geçişini kanıtlıyor, ama girdi sentetik olaylardan geliyor. Node-seviyesi (cihaz kaybı) fallback `test-live-node-discovery.mjs` içinde ayrıca kanıtlanmış, o da sentetik peer discovery. |
| **node-registry** | `desktop/node-registry.mjs` | 293 | PROVEN_LIVE (mantık) / MISSING (Android native) | KARIŞIK | `NODE_POOLS.ANDROID` sabiti ve `node-android` seed kaydı mevcut; havuzlama/kapasite skorlama mantığı canlı test edilmiş. **Ama bu "Android node" bir native uygulama değil — telefon tarayıcısında açılan PWA'nın HTTP heartbeat'i.** Native cihaz entegrasyonu MISSING. |
| **A2A (fabric/src/a2a.ts)** | `fabric/src/a2a.ts` | 573 | PRODUCTION_READY | LIVE | `getAgentCard()`, `/.well-known/agent-card.json` / eski `/.well-known/agent.json` fallback zinciri kodda gerçek ve `desktop/launch.mjs`'te gerçekten tüketiliyor (`ANDROID_HOST`/`WINDOWS_HOST` fetch). Bu protokolü **yeniden icat etmeyeceğiz** — mission talimatına uygun, doğrudan reuse edilecek. |
| **attestation** | `desktop/attestation.mjs` | 235 | PRODUCTION_READY (mantıksal kimlik) / MISSING (donanım) | KARIŞIK | HMAC tabanlı deterministik node identity + tek-kullanımlık nonce/challenge-response canlı ve test edilmiş (`test-attestation.mjs`). Bu **yazılım-seviyesi mantıksal kimlik** — donanım tabanlı cihaz bütünlüğü (Play Integrity API, hardware-backed key attestation) hiç yok. Mission'ın açıkça işaretlediği "device-level attestation MISSING" doğrulandı. |
| **capabilities** | `fabric/src/capabilities.ts` | 1117 | PRODUCTION_READY | LIVE | `capabilities: Capability[]` dizisi ve `capabilityMap` — masaüstü/tarayıcı capability'leri için olgun ve büyük bir kayıt. Android'e özgü capability seti (Part 7) şu an bu listede yok; eklenmesi gerekecek, üzerine inşa edilecek doğru temel bu. |
| **EvidenceLedger** | `desktop/observer.mjs` | 233 | PRODUCTION_READY | LIVE | Hash-zincirli JSONL defter, `verifyChain()` bu oturumda `CHAIN_VALID` / 1039 olay ile doğrulandı. Tek kanonik defter — Part 8'de **ikinci bir tane oluşturulmayacak**, Android Evidence Vault bunun yerel cache/projeksiyonu olacak. |
| **SharedReality** | `desktop/shared-reality.mjs`, `desktop/phone-shared-reality.mjs` | 136+ | PROVEN_LIVE (masaüstü-tarayıcı) | LIVE ama dar kapsam | Windows Control Surface ↔ Android **tarayıcı** (PWA) arası gerçeklik paritesi kanıtlanmış. Bu, native runtime servisi değil — telefonun Chrome'da açtığı sayfanın HTTP polling'i. |
| **mobile PWA** | `desktop/renderer/` | — | PRODUCTION_READY | LIVE | Bu oturuma kadarki turlarda inşa edilen projeksiyon (ASK/REALITY/REQUESTS/RUN/EVIDENCE), 57/57 test, CDP görsel kabul 20/20. **Kalıcı olarak PWA kalacak — Part 16 gereği Android native runtime'ın yerine geçmeyecek**, ikisi aynı kanonik state'i tüketmeye devam edecek. |
| **browser node** | `desktop/adapters/browser-adapter.mjs` | ~190 | PROVEN_LIVE | LIVE | Tek dosyalık adaptör; `test-browser-node-integration.mjs` içinde kanıtlı. Native Android runtime'dan tamamen ayrı bir kavram — karıştırılmamalı. |
| **artifact lineage** | `desktop/create-first-artifact.mjs`, `desktop/create-production-artifact.mjs`, `desktop/distributed-artifact.mjs` | — | PROVEN_SYNTHETIC | SYNTHETIC | `desktop/artifacts/*.json` içindeki üç örnek artifact sentetik/demo — gerçek imza, gerçek sürüm yönetimi, gerçek rollback mekanizması yok. Part 9/10'daki "AIOS Artifact v1" şeması bunların üzerine **yeni ve tutarlı** bir model olarak inşa edilmeli, mevcut ad-hoc JSON'lar canonic değil. |
| **task lineage / checkpoint** | `desktop/runtime-console.mjs` (history), `fabric-engine.mjs` | — | PROVEN_SYNTHETIC (agent) / PROVEN_LIVE (runtime run geçmişi) | KARIŞIK | Runtime run geçmişi (`.runtime/history/*.json`) gerçek/canlı — bu oturumda arşivlenen gerçek dosyalar var. Task-seviyesi checkpoint/resume (`test-agent-quota-resume.mjs`) sentetik sağlayıcı olaylarıyla kanıtlı. |
| **secrets** | repo kökü | — | TECHNICAL_DEBT / GÜVENLİK BULGUSU | — | `chatgpt_control_plane_tunnel.txt` düz metin OpenAI API anahtarı içeriyor, `.gitignore` kapsamında değil, commit edilmedi. `secretRef` modeli (Part 19) **yok** — bugün secret yönetimi MISSING, sadece bu tek düz-metin dosya var. |
| **Android integration (native)** | — | 0 | **MISSING** | — | Repo genelinde `.kt`, `.gradle`, `Cargo.toml`, `.rs`, `AndroidManifest.xml` **sıfır**. Hiçbir native Android projesi, Rust core, JNI köprüsü mevcut değil. "Android node" bugün yalnızca bir telefonun Chrome'da açtığı PWA sekmesidir — bir OS-seviyesi endpoint değildir. |
| **device-level attestation** | — | 0 | **MISSING** (mission tarafından da işaretlendi) | — | Yazılım kimliği var (attestation.mjs), donanım kimliği yok. Fabrikasyon YAPILMAYACAK — Part 6 gereği `DeviceAttestationProvider` arayüzü `NOT_IMPLEMENTED/NOT_PROVEN` olarak dürüstçe tanımlanacak. |
| **tunnel-control** | `desktop/tunnel-control/` | — | LEGACY/WRONG_SCOPE (bu görev için) | — | ChatGPT/OpenAI tünel köprüsü — Android fabric foundation'ın kapsamı dışında, dokunulmayacak. |
| **pc-agent** | `pc-agent/` | — | WRONG_SCOPE | — | Ayrı bir TS servisi, bu görevin kapsamı dışında. |

---

## Kritik Bulgu (Mission'ın kendisini doğrulayan)

Mission metni "Android becomes a first-class AIOS execution endpoint" hedefini koyuyor çünkü **bugün öyle değil**. Denetim bunu doğruluyor: bugünkü "Android" varlığı yalnızca bir web sayfası sekmesidir (PWA + HTTP heartbeat). PART 2-7'nin talep ettiği L0 (native core) → L4 (artifact/package) katmanlarının **hiçbiri repo'da yok** — bu, mission'ın "DESIGN_ONLY'den PRODUCTION'a atlama yapma" uyarısına tam uyumlu bir başlangıç noktası: buradan itibaren yazılan her şey **yeni**, ve dürüstçe NOT_PROVEN olarak işaretlenecek ta ki gerçek cihazda kanıtlanana kadar.

## Yeniden kullanılacak, asla değiştirilmeyecek kanonik sözleşmeler

1. `fabric/src/a2a.ts` — Agent Card / `/.well-known/agent-card.json` protokolü (Part 5 gereği reuse)
2. `desktop/observer.mjs` — `defaultLedger`, `sha256`, `canonicalJson` (Part 8 gereği ikinci defter yok)
3. `desktop/attestation.mjs` — `calculateNodeIdentity()` hash algoritması (Part 3 gereği native core aynı algoritmayı kullanacak, yenisini icat etmeyecek)
4. `desktop/node-registry.mjs` — `NODE_POOLS`, kapasite skorlama mantığı
5. `desktop/runtime-console.mjs` — `ALLOWED_STATES`, `RuntimeOrchestrator` (task/checkpoint durum makinesi)
