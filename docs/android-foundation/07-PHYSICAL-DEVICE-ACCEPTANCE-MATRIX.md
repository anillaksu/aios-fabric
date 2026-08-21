# PART 1.7 — PHYSICAL-DEVICE ACCEPTANCE MATRIX (Part 15 + Part 23 + Part 24)

Durum: bu oturumda hiçbir madde ölçülmedi. Bu matris, dikey dilim (vertical slice) gerçek bir Android cihaza kurulduğunda doldurulacak **boş şablon**dur. Şu an dolduruyor gibi yapmak "false proven" ihlali olurdu.

## Fonksiyonel kabul (her 10 artifact için, Part 23 doctrine)

| Adım | Ölçüt | Xiaomi (mevcut node) | Samsung (adayı — DEFERRED) |
|---|---|---|---|
| BUILD | Derleme hatasız tamamlanır mı | NOT_MEASURED | N/A (onboard edilmedi) |
| INSTALL | APK gerçek cihaza kurulur mu, ACTIVE'e geçer mi | NOT_MEASURED | N/A |
| VERIFY | signature+digest+compat+policy 4 şartı geçer mi | NOT_MEASURED | N/A |
| RUN | Runtime Service process-death/reboot/network-loss/agent-loss sonrası kurtarır mı | NOT_MEASURED | N/A |
| OBSERVE | CLI/Control Surface/PWA aynı node'u aynı anda gösteriyor mu | NOT_MEASURED | N/A |
| EVIDENCE | Evidence Vault yerel append + kanonik senkron doğrulanabiliyor mu | NOT_MEASURED | N/A |
| ROLLBACK | Başarısız update otomatik rollback yapıyor mu, hiçbir ara durum ACTIVE raporlanmıyor mu | NOT_MEASURED | N/A |

## Performans kıyası (Part 15 — Macrobenchmark + Baseline Profile)

| Metrik | Hedef (henüz doğrulanmadı) | Ölçüm aracı |
|---|---|---|
| startup (cold) | ölçülecek | Macrobenchmark `StartupTimingMetric` |
| time-to-interactive | ölçülecek | Macrobenchmark |
| frame jank | ölçülecek | Macrobenchmark `FrameTimingMetric` |
| memory | ölçülecek | Macrobenchmark `MemoryUsageMetric` |
| battery impact | ölçülecek | Battery Historian / `dumpsys batterystats` |
| IPC latency (JNI çağrı gecikmesi) | ölçülecek | özel mikro-benchmark, native core golden-vector testinin yan ürünü |
| native execution latency | ölçülecek | Rust `criterion` benchmark |

Baseline Profile ve startup profile, dikey dilim ilk defa gerçek cihazda ACTIVE olduktan **sonra** üretilecek — henüz üretilecek bir APK yok.

## Kabul çizgisi

Bir madde yalnızca gerçek cihazda, gerçek APK ile, gerçek ölçüm aracıyla test edildiğinde `MEASURED`/`PASS` olarak işaretlenebilir. Bugün hepsi `NOT_MEASURED`/`NOT_PROVEN` — bu, mission'ın "Do not claim performance gains without measurements" ve "Do not claim this as proven until tested" kurallarının doğrudan uygulanmasıdır.
