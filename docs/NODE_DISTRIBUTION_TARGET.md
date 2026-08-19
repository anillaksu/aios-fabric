# AIOS Node dağıtımı — mevcut gerçek ve hedef sınır

Bu belge bir yayın/paketleme iddiası değildir. Dağıtım öncesi her makinenin
aynı kanıt zinciriyle değerlendirilmesi için mevcut koddan türetilmiş sınırı
anlatır.

## Bugün çalışan taşınabilir çekirdek

`fabric/bin/aios.mjs`, Node **22.6+** üzerinde çalışan, salt-okunur bir CLI
istemcisidir. Ortak sözleşmesi kabuk değil `argv`, STDOUT, STDERR ve exit
code'dur. Bu yüzden PowerShell/CMD, bash, zsh ve Termux shell'i yalnızca
çağırma katmanıdır.

```text
0  → bütün read-only kontroller geçti
2  → kullanım/argüman hatası
3  → endpoint veya admission doğrulanamadı
```

### Başlatma / inceleme

Bir kaynak checkout'ında:

```bash
# Linux, macOS, Termux
node ./fabric/bin/aios.mjs --url http://HOST:9300 node doctor

# Windows PowerShell
node .\fabric\bin\aios.mjs --url http://HOST:9300 node doctor
```

Yerel Fabric çalışıyorsa `--url` gerekmez (`http://127.0.0.1:9300`).
`node doctor`, sırasıyla standart A2A Agent Card'ı, `/runtime-status` ve
`/capabilities` uçlarını okur. Üçü de geçmeden node "kabul edildi" yazmaz;
hiçbir peer, token, capability veya Formation kaydı oluşturmaz.

Diğer read-only komutlar:

```text
aios status
aios agent-card
aios capabilities
aios artifacts
aios formations
```

Bugün paket `private:true` olduğundan public npm yayını **TARGET**tır. Bir
checkout içinden `node .../bin/aios.mjs` gerçek ve desteklenen başlangıç
yoludur; public registry/package name/sürüm imzası varmış gibi davranılmaz.

## Bugünkü roller

| Rol | Gerçek durum | Taşınabilirlik |
|---|---|---|
| Observer client | CLI + HTTP/A2A discovery | Node 22.6+ olan tüm hedefler için kod düzeyinde taşınabilir |
| Formation reader | `/formation-memory` export/projection | HTTP erişimi olan hedeflerde salt-okunur |
| A2A peer | Mevcut `pc-agent/`, A2A v1.0 Agent Card | Kod var; genel kurulum/onboarding paketi yok |
| Android device runtime | Fabric + Termux:API + `am`/`pm`/`rish` | Termux adapter'ına bağlı |
| Linux/macOS/Windows device runtime | Yerel native capability sağlayıcı | TARGET — mevcut registry bunu sağlamaz |

## Kanıtlanan sınır

`fabric/src/capabilities.ts` sabit Termux binary yoluna ve `termux-*`, `am`,
`pm`, `rish` komutlarına dayanır. Bu nedenle Fabric'i Linux veya Windows'a
kopyalamak, aynı cihaz capability'lerinin oluştuğu anlamına gelmez.

Mevcut standart karşılıkları zaten vardır:

- agent discovery/iş yaşam döngüsü: **A2A v1.0** Agent Card + JSON-RPC;
- dış araç discovery: mevcut **MCP** yüzeyi, yalnız safe/izinli araçlar;
- gerçek eylem: mevcut **dispatcher → policy → journal**;
- taşınabilir kanıtlı oluşum: mevcut Formation Memory canonical export/JOIN.

Bu yüzden dağıtım için yeni wire protocol veya “global node registry” bu
aşamada gerekli değildir.

## Gerçek eksikler — TARGET

1. **Platform adapter sınırı:** Termux capability kodu ile Linux/macOS/Windows
   sağlayıcıları arasında bir interface yok. Önce hangi gerçek desktop
   capability'lerinin owner tarafından isteneceği seçilmelidir; `shell.run`
   varsayılan açılmaz.
2. **Node kurulum paketi:** public package adı, lisans, sürümleme, imzalı
   release/provenance ve Node sürüm matrisi yok. Bunlar olmadan global npm
   dağıtımı FACT değildir.
3. **Servis yaşam döngüsü:** Termux Widget/Boot adapter'ları vardır; systemd,
   launchd ve Windows Task Scheduler adapter'ları yoktur. Bunlar aynı
   runtime'ın kopyası değil, platform-özel supervisor adapter'ları olmalıdır.
4. **Güvenli katılım:** A2A inbound token fail-closed'dur; fakat farklı
   kullanıcıların node kurulum/anahtar paylaşımı için owner-onaylı onboarding
   akışı henüz yok. Otomatik peer ekleme yoktur ve eklenmeyecektir.
5. **Taşınabilir canlı matris:** Windows observer ve Termux runtime canlı
   kanıtlıdır. Linux, macOS, headless ARM, tablet ve ayrı kullanıcı/agent
   kombinasyonlarında canlı kabul yoktur.
6. **Fiziksel capability beyanı:** Agent Card bugün safe dış discovery'yi
   taşır, fakat donanım/izin/availability için standartlaştırılmış attestation
   projection yoktur. LLM veya title eşleşmesi bunun yerine geçemez.

## Sonraki güvenli dilim

Önce owner bir hedef rol seçer:

- yalnız Linux/Windows **observer + A2A peer** mi,
- yoksa seçilmiş gerçek desktop **native capability adapter** mı?

İlk seçenek mevcut standart ve risk sınırlarıyla daha küçüktür. İkinci seçenek
ancak capability listesi, risk sınıfı, native sağlayıcı ve canlı cihaz kabulü
birlikte belirlendikten sonra açılır. Formation Canvas, ekonomi, public port,
otomatik peer kaydı ve yeni graph protokolü bu karara ait değildir.
