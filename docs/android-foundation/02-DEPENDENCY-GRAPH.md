# PART 1.2 — ANDROID ARTIFACT DEPENDENCY GRAPH

10 ilk artifact ve katman (L0-L7) eşlemesi. Ok yönü "bağımlıdır" anlamına gelir.

```
                         ┌───────────────────────────┐
                         │  10. AIOS Artifact Catalog │  (schema + canonical list, veri değil kod)
                         └─────────────┬─────────────┘
                                        │ tüketir
                         ┌─────────────▼─────────────┐
                         │  6. AIOS Artifact Store    │  L6
                         └─────────────┬─────────────┘
                    kullanır ┌─────────┴─────────┐ kullanır
                             ▼                   ▼
                 ┌───────────────────┐  ┌──────────────────────┐
                 │ 7. Installer/      │  │ 4. Control Surface    │  L5
                 │    Updater         │  │    (Compose)          │
                 └─────────┬─────────┘  └──────────┬────────────┘
                            │ doğrular              │ görüntüler
                            ▼                       ▼
                 ┌───────────────────────────────────────────┐
                 │            3. AIOS Node Agent               │  L2
                 │  (agent-card.json, heartbeat, capability)   │
                 └───────────────────┬─────────────────────────┘
                                      │ üzerine kurulu
                 ┌────────────────────▼────────────────────────┐
                 │          2. AIOS Runtime Service              │  L1
                 │  (node lifecycle, task intake, checkpoint)    │
                 └────────────────────┬────────────────────────┘
                                      │ FFI/JNI çağırır
                 ┌────────────────────▼────────────────────────┐
                 │           1. AIOS Core Native                 │  L0
                 │  (hashing, digest, lineage verify, ser.)      │
                 └────────────────────┬────────────────────────┘
                                      │ yazar/okur
                 ┌────────────────────▼────────────────────────┐
                 │           5. AIOS Evidence Vault               │  L3
                 │  (yerel cache/projeksiyon, canonical DEĞİL)    │
                 └───────────────────────────────────────────────┘

                 ┌───────────────────────────────────────────────┐
                 │        8. AIOS Secrets Boundary                │  (yanal — herkes tüketir, hiçbiri sahiplenmez)
                 └───────────────────────────────────────────────┘

                 ┌───────────────────────────────────────────────┐
                 │        9. AIOS Device/Capability Bridge         │  L7
                 │  (sensor.battery.read vb. — Runtime Service     │
                 │   üzerinden Node Agent'a capability sağlar)     │
                 └───────────────────────────────────────────────┘
```

## Bağımlılık kuralları

| # | Artifact | Bağımlı olduğu | security_class | Neden bu sırayla |
|---|---|---|---|---|
| 1 | AIOS Core Native | (yok — kök) | CRITICAL | Hiçbir üst katman kendi hash/serileştirme icat edemez; hepsi buradan geçmeli |
| 2 | AIOS Runtime Service | 1 | CRITICAL | Task state makinesi native core'un doğrulama fonksiyonlarını çağırır |
| 3 | AIOS Node Agent | 1, 2 | HIGH | Heartbeat + agent-card, runtime service üstünde çalışan ince bir katman |
| 4 | AIOS Control Surface | 3 (durum okur), asla 1'i doğrudan çağırmaz | LOW (sunum) | Yalnızca projeksiyon tüketir — semantik karar vermez |
| 5 | AIOS Evidence Vault | 1 (hash doğrulama) | HIGH | Kanonik defterin yerel projeksiyonu; kendi zincirini icat etmez |
| 6 | AIOS Artifact Store | 7, 10 | HIGH | Kataloğu okur, installer'ı tetikler |
| 7 | AIOS Installer/Updater | 1 (imza/digest doğrulama) | CRITICAL | Atomik install/rollback — native core'un digest/signature doğrulamasına bağımlı |
| 8 | AIOS Secrets Boundary | (yok — yanal, herkese hizmet eder) | CRITICAL | Hiçbir katman secret değerini doğrudan tutmaz; `secretRef` üzerinden dolaylı erişim |
| 9 | AIOS Device/Capability Bridge | 2, 3 | HIGH | Runtime Service üzerinden capability dispatch |
| 10 | AIOS Artifact Catalog | (yok — saf şema/veri) | LOW | Makine-okunur JSON şema; kod değil |

## Döngü kontrolü

Döngü yok (DAG doğrulandı elle): 1←2←3←{4,9}, 1←5, {7,10}←6, 1←7, 8 tüm katmanlar tarafından tüketilir ama hiçbirine bağımlı değildir (yaprak/yanal düğüm).
