# AI-OS Fabric — kanonik kaynak depo

AIOS Phone Workspace, deterministic capability runtime ve Formation Memory
kaynak deposu. Repository bugün üç rolü ayırır: portable **observer CLI**,
Windows odaklı **PC A2A peer** ve **Android/Termux device runtime**. Bunlar
aynı capability seti değildir; güncel destek matrisi için
[`docs/CROSS_PLATFORM_BOOTSTRAP.md`](docs/CROSS_PLATFORM_BOOTSTRAP.md) okunur.

## Neden bu depo var (2026-08-17)

İki gün boyunca kaynak, oturuma bağlı bir **geçici dizinde** tutuldu
(`AppData\Local\Temp\claude\...\scratchpad\`) ve telefona `scp` ile atıldı.
Sürüm geçmişi yoktu, geri alma yoktu, iki cihaz arasında `md5` dışında
doğrulama yoktu — ve o dizin temizlense tek kopya telefonda kalacaktı.

Ayrıca `Desktop/Telefon_AI_Agent_Session_2026-08-16/fabric/` altında
**16 Ağustos 14:05'te donmuş bir anlık görüntü** duruyordu. PC'deki Hermes
denetim yaparken o klasörü okudu ve haklı olarak "masaüstü v0.1, telefon v0.3,
hangisi kanonik?" diye sordu. Bu depo o soruyu ortadan kaldırıyor.

## Kanoniklik ve devir kuralı

**Repository değişikliğin kaynağıdır; telefon deployment hedefidir.** Telefon
ile eşitlik yalnız `scripts/deploy-to-phone.sh --check` md5 çıktısıyla
kanıtlanır. Çalışma ağacı kirliyse HEAD, deployment veya belge tek başına
kanonik gerçek değildir.

Bundan sonra akış tek yönlü:
```
bu depoda düzenle → telefona deploy → md5 doğrula → commit
```
Telefonda doğrudan düzenleme yapılırsa depo geride kalır; o durumda önce
`scripts/sync-from-phone.sh` ile geri çekilmeli.

## İlk doğrulama

```text
node --version                     # >= 22.6
cd fabric && npm test && npm run build
node ./bin/aios-setup-doctor.mjs --role observer
```

Kapsamlı rol bazlı kurulum, bağlantı değişkenleri ve kabul matrisi:

- [`docs/CROSS_PLATFORM_BOOTSTRAP.md`](docs/CROSS_PLATFORM_BOOTSTRAP.md)
- [`docs/AIOS_DETERMINISTIC_HANDOVER.md`](docs/AIOS_DETERMINISTIC_HANDOVER.md)
- [`docs/PRODUCT_GAP_REGISTER.md`](docs/PRODUCT_GAP_REGISTER.md)

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

## Bağlantı

Endpoint, host veya token değerleri kaynakta paylaşılmaz. Observer `AIOS_URL`
veya `--url`; Fabric/PC agent ise sırasıyla `FABRIC_SELF_URL` ve
`PC_AGENT_SELF_URL` ile açıkça yapılandırılır. A2A v1.0 JSON-RPC kullanılır;
yeni wire protocol yoktur.
