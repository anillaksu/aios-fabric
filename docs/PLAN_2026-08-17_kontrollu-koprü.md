# PLAN — Kontrollü yetki kataloğu + AETHER yönetişimi + asenkron köprü
**2026-08-17 · planlama turu (kod yazılmadı, hiçbir şey dağıtılmadı)**

---

## 0. Doğrulama — Hermes'in bulguları elden geçirildi

### ✅ Kod uyumsuzluğu: GERÇEK, ama teşhis düzeltilmeli
Hermes "masaüstü v0.1, telefon v0.3, hangisi kanonik belirsiz" dedi. Ölçtüm:

| Kopya | Durum |
|---|---|
| `Desktop/.../fabric/src/` | **16 Ağustos 14:05'te donmuş anlık görüntü.** 12 dosya; `kits/envelope/undo/automations/applabels/pdf` **yok**, silinmiş `screens.ts` **var** |
| Çalışma kopyam (scratchpad) | **17 dosyanın 17'si telefonla md5 birebir aynı** |
| Telefon `~/fabric/src/` | Canlı, kanonik |

Yani belirsizlik yok: **telefon = çalışma kopyam**, masaüstündeki klasör bir arşiv.
Hermes o arşivi okuduğu için "v0.1 izleri" gördü — bulgusu haklı, sonucu (“hangisi
kanonik bilinmiyor”) yanlış.

### 🔴 Ama Hermes'in kaçırdığı, daha ciddi bir P0 var — ve sebebi benim
Kanonik kaynağım şurada duruyor:
```
C:\Users\anil\AppData\Local\Temp\claude\...\scratchpad\fabric-src\
```
**Bu bir TEMP dizini** — oturuma bağlı, temizlenebilir. Silinirse tek kopya telefonda
kalır. İki gündür buradan geliştirip telefona `scp` ile atıyorum; sürüm geçmişi yok,
geri alma yok, iki cihaz arasında `md5` dışında doğrulama yok.
**Kod uyumsuzluğundan daha acil olan bu.**

### ✅ Yetenek asimetrisi: gerçek
Telefon 38 capability · PC 5 skill. Ayrıca PC'nin `SAFE_ROOT`'u tek bir klasör.

### 🟢 AETHER: yönetişim mimarisi ZATEN VAR — inşa etmeye gerek yok
`D:\dev\aether\src\aether\mcp\http.py` okundu. İçinde tam olarak istenen şey var:

| İstenen | AETHER'da karşılığı |
|---|---|
| "Kontrolsüz erişim olmasın" | `REMOTE_TOOL_ALLOWLIST` — **fail-closed**: yerelde eklenen araç, adı buraya yazılmadıkça uzaktan erişilemez |
| "Kimlik taklit edilemesin" | Actor'ı **sunucu** belirler, bearer token'dan; çağıran `actor_id` göndererek kimlik uyduramaz |
| "Onay ekranı" | `aether.pending` (+ `aether.handoff`, `aether.append_delta`) |
| "Dışarı açık olmasın" | Loopback'e bağlanır; dışarı açmak **tünelin işi** (= Tailscale) |

Uzaktan açık araçlar: `info, handoff, context, mission, search, get, pending, append_delta`
Port: **27350** — ve **şu an çalışmıyor** (bağlantı yok).

### ⚠️ Kısıt: AETHER bana kapalı, Hermes'e açık
Bu oturumda da MCP araçları yüklü değil (üçüncü kez). Hermes AETHER'a yazabiliyor
(delta ID'leri üretti), ben yazamıyorum. Yönetişimi AETHER üzerine kurarsak
**benim de o hattı görmem gerekir**; yoksa denetim yazan taraf ile uygulayan taraf
ayrışır — bu, iki gündür düzelttiğimiz "veri var, yüzey yok" deseninin aynısı.

---

## P0 — Temeli sabitle (yeni özellik YOK)

**P0.1 Kanonik depo.** `Desktop/.../fabric-canonical/` altında **git deposu**:
- Kaynak: telefondaki canlı `~/fabric` (kanonik olan o)
- İlk commit = bugünkü hâl; `pc-agent/` de aynı depoya
- Masaüstündeki eski `fabric/` klasörü → `archive/2026-08-16-snapshot/` olarak taşınır (silinmez)
- Bundan sonra: **düzenle → build → deploy → md5 doğrula** akışı; temp dizininde geliştirme biter
- Kabul ölçütü: `git status` temiz + 17/17 md5 telefonla aynı

**P0.2 Sürüm damgası.** Agent Card'daki `version` tek elden: `package.json` → kart.
İki taraf da hangi sürümü konuştuğunu söylesin (Hermes'in yaşadığı belirsizlik bir daha olmasın).

**P0.3 AETHER hattını bana aç.** AETHER stdio MCP'sini Claude Code'a `--agent-id claude-code`
ile ekle. Üç oturumdur açık olan madde; yönetişim buna dayanacaksa önce bu.

---

## P1 — Kontrollü yetki kataloğu (kullanıcı kararı: **önce salt-okuma**)

**P1.1 `shell.run` kataloğun dışına çıkar.** Bugün pc-agent'ta duruyor ve
"uzak bağlantıya açık kabuk" demek. Kullanıcı kararı net: bir anda tüm yetki açılmayacak.
- `shell.run` → **varsayılan KAPALI**, yalnızca açık onayla ve `risk: "ask"` ile
- Yerine **isimlendirilmiş, dar** işler: `disk.free`, `proc.list`, `net.status` gibi

**P1.2 Risk katmanı — kod değil VERİ (denetim #1).**
Her capability/skill'e zorunlu alan:
```ts
risk: "safe" | "notify" | "ask"      // varsayilan: "ask"  (kanitlanmadikca en kisitli)
```
- `safe` → serbest (salt-okuma)
- `notify` → çalışır, kullanıcıya bildirim düşer
- `ask` → **çalışmadan önce onay** (AETHER `pending` kuyruğu)
- Dispatcher **zorunlu kontrol** yapar: kuralın/çağıranın istediği politika ile
  capability'nin izin verdiği azami karşılaştırılır. Bugün böyle bir kontrol **yok**.
- Aynı ilke telefondaki 38 capability'ye de uygulanır (`script.run`, `share.text`,
  `whatsapp.send` bugün sınıfsız ve dışa dönük)

**P1.3 Redaksiyon varsayılanı tersine çevir (denetim #3, düzeltilmiş gerekçe).**
Hermes/denetim "kit ekleyen `sensitive` demeyi unutur" dedi — **mekanizma öyle değil**:
kitler capability üretmiyor, mevcut capability'nin bayrağını miras alıyorlar
(`doc.create` zaten `sensitiveFields:["content","text"]`).
**Gerçek boşluk başka yerde:** `link.open` ve `intent.run`'ın `q` parametresi
redakte edilmiyor — arama terimi, telefon numarası, yarın token'lı URL. Düzeltme:
`sensitiveFields` varsayılanı "hassas kabul et", istisna açıkça yazılsın.

**P1.4 PC kataloğu v1 (salt-okuma).**
`system.info` · `fs.list` · `fs.read` · `git.status` · `disk.free` · `proc.list`
Hepsi `risk: "safe"`. Mutasyon yapan hiçbir şey yok.
**v2'de** (ayrı karar): `fs.write`, `git.commit`, `shell.run` — hepsi `risk: "ask"`.

---

## P2 — AETHER yönetişim köprüsü

Akış (kullanıcının tarif ettiği):
```
Telefon → AETHER HTTP (27350, Tailscale, bearer token)
        → allowlist kontrolü (fail-closed)
        → PC Hermes çalışır
        → sonuç `pending` kuyruğuna
        → kullanıcı VERIFY eder
```
- AETHER HTTP servisini ayağa kaldır (şu an kapalı) + Tailscale'e bağla
- Telefon AI-OS'a **"ONAY BEKLEYENLER"** yüzeyi: `aether.pending` okur, onay/ret gönderir
- `risk: "ask"` olan her iş bu kuyruktan geçer
- **Doğrudan A2A yolu kapanmaz** — `safe` işler hızlı yoldan gider; yönetişim
  yalnızca sonuçlu işler için (yoksa her pil sorgusu onay bekler, sistem kullanılmaz olur)

---

## P3 — Asenkron ("kara delik" deneyimi)

Bugünkü durum: `/envelope` `wait:true` ile **blokluyor**, `a2a.delegate` 45sn,
A2A RPC 170sn bekliyor. Telefon uyursa/bağlantı koparsa iş kaybolmuş görünür.
Oysa **journal zaten kalıcı** — eksik olan yüzey ve teslim.

- `wait:false` yolu: iş kabul edilir, `taskId` hemen döner
- Tamamlanınca **bildirim** (`notification.send`) + AKTİF sekmesinde sonuç
- Uzun A2A işleri için `contextId` ile devam; bağlantı koparsa iş sunucuda sürer
- Denetim #9 ile birleşir: `service.down` watcher aynı motoru kullanır

---

## Denetim maddelerinin bu plana yerleşimi
| Denetim # | Nereye |
|---|---|
| #1 risk katmanı | **P1.2** |
| #2 zincir döngüsü | P1.2 ile birlikte (tetikleyen kural zinciri + derinlik kesici) |
| #3 redaksiyon varsayılanı | **P1.3** (gerekçesi düzeltilerek) |
| #4 fail-open boşluğu | P0.2 yanında (son-bilinen-iyi önbellek) |
| #5 doğrulama derinliği | Her P maddesinde "çalışma zamanı kanıtı" zorunlu |
| #6 HyperOS autostart | P3 sonrası (watcher zaten haber verecek) |
| #7 DevTools filtreleri | P3 ile |
| #8 çift yönlü MCP | **P2'nin doğal devamı** — AETHER zaten MCP; Fabric'i MCP sunucusu yapmak aynı hat |
| #9 service.down watcher | **P3** |
| #10 AETHER hook | **P0.3** |
| #11 Shizuku↔MCP sınırı | Karar: *MCP ile yapılabilen hiçbir iş Shizuku'ya verilmez; Shizuku yalnızca protokolsüz uygulamalar için son çare* |

---

## Her adımda zorunlu doğrulama kapısı
İki gündür en çok zaman kaybettiren şey buydu (`--check` geçip çalışma zamanında
patlayan dosya, kapatılmamış parantez, kabuk tırnak çakışması). Bundan sonra
her deploy şu üçünü geçmeden "bitti" sayılmaz:
1. `npm run build` → `BUILD_OK`
2. Sunucu yeniden başlar ve `/` **200** döner
3. Değiştirilen davranış **canlı** tek çağrıyla kanıtlanır (statik kontrol yetmez)
