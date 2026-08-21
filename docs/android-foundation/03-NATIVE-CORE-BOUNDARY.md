# PART 1.3 — NATIVE CORE (L0) BOUNDARY

Durum: **DESIGN_ONLY**. Repo'da `.rs`/`Cargo.toml` yok (bkz. 01-AUDIT.md). Bu doküman kod yazmadan önceki sözleşmedir.

## Teknoloji

Rust, `#[no_mangle] extern "C"` FFI sınırı, Android tarafında JNI üzerinden Kotlin'den çağrılır (`uniffi-rs` veya elle yazılmış JNI köprüsü — karar Faz 2'de netleşecek, ikisi de FFI sınırını değiştirmez).

## Sorumluluklar (mission Part 3'ten, genişletilmeden)

| Fonksiyon | Kanonik kaynak (icat edilmeyecek) | Durum |
|---|---|---|
| canonical serialization | `desktop/observer.mjs` → `canonicalJson()` | Rust'ta **byte-birebir aynı** deterministik JSON key-sıralama algoritması yeniden implemente edilecek — algoritma kopyalanacak, yeni bir tane tasarlanmayacak |
| hashing | `desktop/observer.mjs` → `sha256()` | SHA-256, aynı önek/format kuralları (`node-`, `art-`, `req-` vb. prefix şeması korunur) |
| artifact digesting | Part 9 `AIOS Artifact v1` şeması | sha256 üzerinden |
| lineage verification | `desktop/attestation.mjs` → `calculateNodeIdentity()` | HMAC + deterministik JSON payload aynı alan adlarıyla |
| task state transitions | `desktop/runtime-console.mjs` → `ALLOWED_STATES` | Native core bu 8 durumun **dışında yeni bir durum üretmez** — genişletme gerekirse önce JS tarafında canonic olarak eklenir |
| capability policy evaluation | `fabric/src/capabilities.ts` | Capability adları ve DECLARED→TESTED→VERIFIED→AVAILABLE akışı (Part 7) |
| checkpoint verification | `runtime-console.mjs` history şeması | JSON alan adları birebir |
| evidence envelope validation | `desktop/observer.mjs` hash-zincir kuralı (`previousHash`/`currentHash`) | Zincir doğrulama mantığı JS'teki `verifyChain()` ile aynı algoritma |

## FFI sınırı (taslak imza seti — henüz derlenmedi, NOT_IMPLEMENTED)

```
core_canonical_json(payload: &[u8]) -> Result<Vec<u8>, CoreError>
core_sha256(bytes: &[u8]) -> [u8; 32]
core_verify_evidence_chain(entries: &[u8]) -> ChainVerifyResult   // { ok, status, events, latest_hash }
core_verify_artifact_digest(artifact: &[u8], expected_sha256: &str) -> bool
core_verify_signature(payload: &[u8], signature: &[u8], pubkey_ref: &str) -> bool
core_task_state_transition(current: TaskState, event: TaskEvent) -> Result<TaskState, TransitionError>
core_calculate_node_identity(metadata: &[u8]) -> String   // "node-" + sha256(canonicalJson(metadata))
```

Tüm fonksiyonlar **saf** olmalı (yan etkisiz, IO yapmaz) — IO/ağ/dosya erişimi L1 (Runtime Service) sorumluluğundadır. Bu ayrım, native core'un birim test edilebilirliğini ve gelecekteki AOSP/APEX taşınabilirliğini korur (Part 17).

## Yasak

- Linux kernel kodu YAZILMAYACAK (mission açık talimatı).
- APK'nın bir OS çekirdeği olduğu iddia edilmeyecek.
- Yeni hash/kimlik semantiği icat edilmeyecek — yukarıdaki JS kaynaklarıyla bit-birebir uyum zorunlu, aksi halde iki node aynı `nodeId`/`artifactId`'i farklı hesaplar ve kanonik gerçeklik böler.

## Kabul kriteri (Faz 2'de doğrulanacak, bugün NOT_PROVEN)

Rust tarafında üretilen `sha256(canonicalJson({...}))` çıktısı, aynı payload için Node.js `desktop/observer.mjs` çıktısıyla **birebir eşleşmeli** — cross-language altın test (golden vector testi) olmadan bu katman ACTIVE sayılamaz.
