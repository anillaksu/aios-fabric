# PART 1.4 — INSTALL / UPDATE / ROLLBACK MODEL (Part 12)

Durum: **DESIGN_ONLY**. Mevcut `desktop/artifacts/*.json` örnekleri (bkz. 01-AUDIT.md) bu modele uymuyor — sentetik demo verisi, canonic değil.

## Atomik durum makinesi (artifact instance başına, cihaz üzerinde)

```
DISCOVERED → VERIFIED → AVAILABLE → INSTALLED → ACTIVE
                                          │
                                          ▼
                                     SUPERSEDED (yeni sürüm ACTIVE olunca)
                                          │
                                          ▼
                                    ROLLED_BACK (geri alma tetiklenirse)

Herhangi bir aşamada doğrulama başarısız → REVOKED (asla ACTIVE olamaz)
```

## ACTIVE olma ön koşulu (mission Part 12, değiştirilmeden)

Bir artifact yalnızca şu **dördü de** true ise ACTIVE olabilir:

1. `signature valid` — Part 18 imza doğrulaması, native core `core_verify_signature()`
2. `digest valid` — `sha256(artifact_bytes) === manifest.sha256`
3. `compatibility valid` — `manifest.minRuntime` ≤ cihazın runtime sürümü VE `manifest.dependencies` hepsi ACTIVE durumda
4. `policy valid` — capability seti Part 7'deki VERIFIED/AVAILABLE listesinin dışına taşmıyor

Bu dördünden biri bile false ise: **ACTIVE olamaz**, ara durum "yarı kurulu" olarak ACTIVE gibi raporlanamaz (mission: "No half-installed state may be reported as ACTIVE").

## Install akışı

```
1. DISCOVERED   — katalogdan/store'dan manifest indirildi, henüz doğrulanmadı
2. VERIFIED     — digest + signature + compatibility geçti (henüz cihaza yazılmadı)
3. AVAILABLE    — cihazda, kurulum bekliyor (kullanıcı onayı burada — Human Gate paralel semantiği)
4. INSTALLED    — dosyalar yazıldı, henüz aktive edilmedi (staged)
5. ACTIVE       — çalışan/etkin sürüm; installer bu geçişi ATOMIK yapar (ya tam geçer ya hiç geçmez)
```

Adım 4→5 geçişi başarısız olursa: durum **INSTALLED**'de kalır (ACTIVE'e geçmez), önceki ACTIVE sürüm bozulmaz. Bu, gerçek atomikliğin kanıtı — iki sürüm asla aynı anda ACTIVE olamaz.

## Rollback tetikleyicileri

| Tetikleyici | Aksiyon |
|---|---|
| İmza/digest doğrulama başarısız | `REVOKED`, kurulum hiç başlamaz |
| ACTIVE geçişi sırasında çökme/crash-loop | otomatik `ROLLBACK` → önceki ACTIVE sürüme dön |
| Manuel `rollbackTarget` çağrısı | belirtilen önceki artifactId'e dön (yalnızca daha önce ACTIVE olmuş bir sürüme) |
| Revocation kaydı (Part 18) | çalışan sürüm anında `REVOKED`'e düşürülür, otomatik rollback |

## rollbackTarget alanı

Her artifact manifestinde `rollbackTarget: artifactId | null` — kurulumdan önce hesaplanır (o an ACTIVE olan sürümün id'si). Rollback bu alana atıfla yapılır, "bir önceki her ne ise" gibi belirsiz bir referansla değil — deterministik.

## Evidence bağı

Her durum geçişi (`INSTALLED→ACTIVE`, `→ROLLED_BACK`, `→REVOKED`) yerel Evidence Vault'a (Part 8) bir olay olarak yazılır; `evidenceRefs` alanı artifact manifestinde bu olaylara işaret eder. Vault, kanonik EvidenceLedger'ın bir projeksiyonudur — bu olaylar arkaplanda kanonik deftere de senkronize edilir (Runtime Service üzerinden), yerelde ikinci bir "gerçek" kaynak oluşturulmaz.

## Test edilebilirlik matrisi (Part 23 doctrine, her artifact için)

```
BUILD → INSTALL → VERIFY → RUN → OBSERVE → EVIDENCE → ROLLBACK
```
Bugün: hiçbiri fiziksel cihazda çalıştırılmadı → tüm artifact'ler için bu zincir **NOT_PROVEN**.
