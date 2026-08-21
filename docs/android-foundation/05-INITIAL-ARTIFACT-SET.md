# PART 1.11 — INITIAL ARTIFACT SET (Specification, not built)

Durum: **DESIGN_ONLY**. Aşağıdaki 10 artifact için henüz `sha256`/`signature`/`buildId` yok — bunlar gerçek build sonrası `schemas/artifact-v1.schema.json`'a uyan gerçek manifestlerle değiştirilecek. Burada yalnızca mission Part 11'in istediği taslak alanlar tanımlanır.

| # | artifactId (taslak) | version | security_class | Bağımlılık | capabilities (deklare edilecek) | Doğrulama kriteri |
|---|---|---|---|---|---|---|
| 1 | `art-core-native` | 0.1.0-design | CRITICAL | — | (yok — capability sağlamaz, yalnızca fonksiyon sağlar) | Golden-vector cross-language hash testi (bkz. 03-NATIVE-CORE-BOUNDARY.md) |
| 2 | `art-runtime-service` | 0.1.0-design | CRITICAL | 1 | — | Process-death sonrası recovery testi, reboot sonrası recovery testi |
| 3 | `art-node-agent` | 0.1.0-design | HIGH | 1, 2 | `aios.status`, `aios.reality` | `/.well-known/agent-card.json` gerçek A2A istemcisiyle karşılıklı okunabilir mi |
| 4 | `art-control-surface` | 0.1.0-design | LOW | 3 | (sunum, capability yok) | Semantik parite testi — PWA ile aynı `semanticSlotHash` |
| 5 | `art-evidence-vault` | 0.1.0-design | HIGH | 1 | — | append/verify/export/compact/replay'in her biri birim test edilmiş mi |
| 6 | `art-artifact-store` | 0.1.0-design | HIGH | 7, 10 | — | Katalog şema doğrulaması geçiyor mu |
| 7 | `art-installer` | 0.1.0-design | CRITICAL | 1 | — | 04-INSTALL-UPDATE-ROLLBACK.md'deki 4-şart testi (signature/digest/compat/policy) |
| 8 | `art-secrets-boundary` | 0.1.0-design | CRITICAL | — | — | Statik tarama: hiçbir secret değeri git/ledger/artifact/UI/log'a yazılmıyor mu |
| 9 | `art-capability-bridge` | 0.1.0-design | HIGH | 2, 3 | `network.diagnostics.read`, `device.diagnostics.read`, `sensor.battery.read` | Her capability DECLARED→TESTED→VERIFIED zincirini geçmiş mi |
| 10 | `art-artifact-catalog` | 0.1.0-design | LOW | — | — | JSON Schema doğrulaması + `catalogDigest` tutarlılığı |

## Neden bu sırayla üretilecek (Faz eşlemesi)

Bu tablo `PART 22 — FIRST RELEASE PLAN` fazlarıyla birebir örtüşür: Faz 2 → #1, Faz 3 → #2, Faz 4 → #3, Faz 5 → #5, Faz 6 → #10, Faz 7 → #6, Faz 8 → #7, Faz 9 → #4. (#8 ve #9 yanal/erken katkı gerektirir, en geç Faz 4-5 arasında native core ve node agent ile birlikte olgunlaşır.)

## Dürüstlük notu

Hiçbiri şu an `VERIFIED` değil, hepsi kavramsal olarak `DISCOVERED` öncesi — yani henüz bir build pipeline'ı bile yok. Bu belge bir **sipariş listesi**dir, bir **tamamlanma iddiası** değildir.
