# AI-OS Fabric — kanonik depo

Telefon (Xiaomi 13 Lite / Termux) üzerinde çalışan AI-OS ve PC tarafındaki
A2A ajanının **tek doğruluk kaynağı**.

## Neden bu depo var (2026-08-17)

İki gün boyunca kaynak, oturuma bağlı bir **geçici dizinde** tutuldu
(`AppData\Local\Temp\claude\...\scratchpad\`) ve telefona `scp` ile atıldı.
Sürüm geçmişi yoktu, geri alma yoktu, iki cihaz arasında `md5` dışında
doğrulama yoktu — ve o dizin temizlense tek kopya telefonda kalacaktı.

Ayrıca `Desktop/Telefon_AI_Agent_Session_2026-08-16/fabric/` altında
**16 Ağustos 14:05'te donmuş bir anlık görüntü** duruyordu. PC'deki Hermes
denetim yaparken o klasörü okudu ve haklı olarak "masaüstü v0.1, telefon v0.3,
hangisi kanonik?" diye sordu. Bu depo o soruyu ortadan kaldırıyor.

## Kanoniklik kuralı

**Telefondaki `~/fabric` canlı sistemdir; bu depo onun birebir aynısıdır.**
İlk commit, telefondan çekilip `md5` ile doğrulanarak oluşturuldu (17/17 aynı).

Bundan sonra akış tek yönlü:
```
bu depoda düzenle → telefona deploy → md5 doğrula → commit
```
Telefonda doğrudan düzenleme yapılırsa depo geride kalır; o durumda önce
`scripts/sync-from-phone.sh` ile geri çekilmeli.

## Yapı

| Dizin | Ne |
|---|---|
| `fabric/` | Telefonda çalışan AI-OS (TypeScript omurga + PWA arayüzü) |
| `pc-agent/` | PC'deki A2A araç ajanı (A2A v1.0 JSON-RPC) |
| `scripts/` | Boot betikleri, watchdog, başlatıcı |
| `docs/` | RESUME (oturum belleği), planlar, PC Hermes promptu |

## Doğrulama kapısı

Hiçbir değişiklik şu üçünü geçmeden "bitti" sayılmaz:
1. `npm run build` → `BUILD_OK`
2. Sunucu yeniden başlar, `/` **200** döner
3. Değişen davranış **canlı tek çağrıyla** kanıtlanır — statik kontrol yetmez

Gerekçe: bu projede `node --check` geçip çalışma zamanında patlayan dosya da,
kapatılmamış parantez de, kabuk tırnak çakışması da yaşandı. Üçü de yalnızca
3. adımda yakalanırdı.

## Cihazlar

| Cihaz | Adres | Rol |
|---|---|---|
| Telefon | `100.75.177.88:9300` | AI-OS, 38 capability, gerçek model (gpt-5.6-luna) |
| PC ajanı | `100.109.236.30:9310` | A2A araç ajanı, dil modeli yok |
| PC Hermes | — | Gerçek model + terminal/tarayıcı/MCP araçları |

İkisi de **A2A v1.0 JSON-RPC** konuşur (özel biçim yok).
