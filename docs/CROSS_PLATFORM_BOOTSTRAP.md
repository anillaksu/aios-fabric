# AIOS — CROSS-PLATFORM BOOTSTRAP

> **Bu belge bir platformu olduğundan güçlü göstermez.** Aynı repository üç
> ayrı rolü destekler: portable observer, Windows PC A2A peer ve Android/Termux
> device runtime. Bunlar aynı Node işlemi veya aynı capability seti değildir.

## 1. Önce rolü seç

| Rol | Windows | Ubuntu/Linux | Android/Termux | Kanıt seviyesi |
|---|---|---|---|---|
| Read-only observer CLI | Destekli | Destekli | Destekli | Windows + Termux canlı; Ubuntu kod/test düzeyi |
| Source test/build | Destekli | Destekli | Destekli | Node 22.6+ contract |
| PC A2A peer | Mevcut | Kod taşınabilir, canlı kabul yok | Uygun değil | Windows kaynak/kod yolu |
| Android device runtime | Hayır | Hayır | Mevcut referans runtime | Termux canlı |
| Desktop native capability runtime | Hayır | Hayır | Hayır | TARGET |

`observer` rolü capability çalıştırmaz, peer eklemez veya token üretmez.
`termux-runtime` ise Termux:API/Android araçları ve owner'ın ayrı Hermes
kurulumuna bağlıdır. Bir Linux checkout'ını device runtime diye ilan etmek
yanlıştır.

**Önemli sınır:** `fabric/src/server.ts` journal/artifact/token depolarını
`$HOME` altında Termux deployment düzenine göre kurar. Windows/Ubuntu source
checkout'ında bunun generic data-root konfigürasyonu yoktur. Bu yüzden bu
runbook Windows/Ubuntu'da `npm test`/build/observer'ı destekler; yerel Fabric
device runtime başlatmayı desteklenen fresh-install yolu diye sunmaz.

## 2. Her platform için ortak, sıfırdan checkout

Önkoşul: **Node.js 22.6+**. Fabric bağımlılık listesi boş olduğu için bu
checkout'ta `npm install` zorunlu bir adım değildir; `npm test` ve `npm run
build` yalnız Node'un yerleşik modüllerini kullanır.

```text
git clone <owner-provided-repository-url> aios-fabric
cd aios-fabric
node --version
cd fabric
npm test
npm run build
```

Kabul: test `fail 0`, build `BUILD_OK`. Bu yalnız source contract kabulüdür;
telefon capability'si veya canlı endpoint kanıtı değildir.

Herhangi bir role başlamadan önce salt-okunur preflight çalıştırılır:

```text
# PowerShell
node .\fabric\bin\aios-setup-doctor.mjs --role observer

# bash / zsh / Termux
node ./fabric/bin/aios-setup-doctor.mjs --role observer
```

Exit code: `0` kabul, `2` kullanım hatası, `3` eksik prerequisite. Doctor
servis başlatmaz, token/peer/capability oluşturmaz.

## 3. Windows: observer veya PC A2A peer

### Observer

```powershell
$env:AIOS_URL = 'http://<fabric-host>:9300'
node .\fabric\bin\aios-setup-doctor.mjs --role observer
node .\fabric\bin\aios.mjs --url $env:AIOS_URL node doctor
node .\fabric\bin\aios.mjs --url $env:AIOS_URL --json formations
```

`node doctor` sırasıyla Agent Card, runtime status ve capability discovery
okur. Birisi başarısızsa exit `3` verir; node kabulü, peer kaydı veya execution
yapmaz.

### PC A2A peer

Bu peer source içinde `pc-agent/` altındadır. Gerçek çalışma kökü ve erişilebilir
URL owner tarafından açıkça belirlenir; örnek IP/port koda gömülü varsayım
olarak kullanılmaz.

```powershell
$env:PC_AGENT_PORT = '9310'
$env:PC_AGENT_SELF_URL = 'http://<reachable-host>:9310'
$env:PC_AGENT_SAFE_ROOT = (Get-Location).Path
node .\fabric\bin\aios-setup-doctor.mjs --role pc-agent
Set-Location .\pc-agent
node --experimental-strip-types server.ts
```

İlk çalıştırma peer tokenını `PC_AGENT_SAFE_ROOT/.pc-agent-token` içine
üretir; dosya paylaşılmaz, Git'e eklenmez. Fabric tarafına peer ekleme ayrı
bir insan onaylı dispatcher eylemidir; doctor/onboarding bunu yapmaz.

## 4. Ubuntu/Linux: desteklenen bugün = observer ve source doğrulama

```bash
export AIOS_URL='http://<fabric-host>:9300'
node ./fabric/bin/aios-setup-doctor.mjs --role observer
node ./fabric/bin/aios.mjs --url "$AIOS_URL" node doctor
node ./fabric/bin/aios.mjs --url "$AIOS_URL" status
```

İsteğe bağlı PC peer aynı `pc-agent/server.ts` Node kaynak contract'ını
kullanabilir; fakat mevcut `pc-agent/skills.ts` Windows/PowerShell araçlarına
dayanır. Ubuntu'da live peer kabulü ve Linux-native skill adapter'ı yoktur.

`systemd` unit, desktop capability adapter veya otomatik peer onboarding bu
repository'de bulunmaz. Bunları bir bash kopyasıyla varmış gibi yazmak yerine
ayrı, owner-onaylı hedef rol olarak açmak gerekir.

## 5. Android / Termux: mevcut device runtime

Bu yol source checkout + aşağıdaki platform bağımlılıklarını gerektirir:

```text
Termux Node 22.6+
Termux:API komutları: battery, wifi, volume, toast, wake-lock vb.
Android araçları: am, pm
Termux servisleri: sshd; tercihen runit/sv
proot-distro (Ubuntu)
owner tarafından kurulmuş Hermes gateway + llm_bridge çalışma alanı
Termux:Widget ve Termux:Boot (başlatıcı/boot yüzeyi için)
isteğe bağlı Shizuku/rish (yalnız ayrıcalıklı capability'ler için)
```

Önce yalnız eksikleri gör:

```bash
node ~/fabric/bin/aios-setup-doctor.mjs --role termux-runtime
```

Bu doctor, Hermes gateway/LLM bridge'i kaynakta varmış gibi kurmaz; bu iki
external çalışma alanı bu repository'nin içinde değildir. Bu nedenle **tam
Android runtime'ın source-only fresh install FACT'i yoktur.** Eksik bağımlılık
bir `TARGET/OPEN` olarak kalır; rastgele kurulum veya secret üretimi yapılmaz.

Mevcut owner runtime için kanonik başlatıcılar:

```text
~/start_hermes_os.sh                 # stack başlatıcı
~/.shortcuts/start_hermes_os.sh      # Termux:Widget kısayolu
~/.shortcuts/aios-connectivity-bridge.sh
~/.shortcuts/aios-admin-console.sh
~/.termux/boot/10-aios.sh
```

PWA telefon yüzeyi `http://localhost:9300` origininden açılır. Tailscale/IP
adresi aynı PWA için yönetim/uzak erişim yüzeyi olabilir, fakat browser secure
context gerektiren Web Crypto/mikrofon/PWA davranışı için localhost kanıtının
yerine geçmez.

Telefon dağıtımı yalnız owner'ın yetkilendirdiği bağlantıyla yapılır:

```bash
PHONE_HOST='<termux-user>@<host>' PHONE_KEY='<private-key-path>' \
  bash scripts/deploy-to-phone.sh --check
```

`--check` salt-okunur md5 karşılaştırmasıdır. Normal deploy dosya kopyalar,
build/test çalıştırır ve Fabric'i yeniden başlatır; canlı kullanıcı kabulünü
kendiliğinden oluşturmaz. Private key/ACL/config bu repository'nin kurulumu
değildir ve dokümantasyon hiçbir key değeri içermez.

## 6. Bağlantı ve kimlik sınırları

| Bağlantı | Konfigürasyon | Güvenlik sınırı |
|---|---|---|
| Observer → Fabric | `AIOS_URL` veya `--url` | salt-okunur HTTP discovery |
| Fabric inbound A2A | `FABRIC_SELF_URL`, A2A token dosyası/env | Bearer zorunlu, fail-closed |
| PC peer inbound | `PC_AGENT_SELF_URL`, `PC_AGENT_TOKEN` veya yerel token | Bearer zorunlu, safe root |
| Telefon deploy | `PHONE_HOST`, `PHONE_KEY` | owner kontrolündeki SSH; repo secret taşımaz |
| Hermes/LLM bridge | owner Termux/proot kurulumu | repo dışında; execution authority değildir |

Tailscale erişimi authorization yerine geçmez. A2A/MCP/dispatcher/policy
sınırları aynı kalır. Yeni peer otomatik eklenmez.

## 7. Fresh-install kabul matrisi

Bir platform “kuruldu” demeden önce aşağıdaki rolüne uygun kanıt gerekir:

```text
checkout → setup doctor → npm test → BUILD_OK
  → (observer) node doctor + read-only endpoint
  → (peer) Agent Card + authenticated round trip
  → (Termux device runtime) runtime health + gerçek capability + PWA canlı kabul
```

Bu tabloya uygun canlı kanıt yoksa sonuç `TEST-VERIFIED` veya `OPEN` kalır.
Özellikle Ubuntu desktop runtime, macOS runtime, headless ARM runtime,
cross-user onboarding ve public package/release signing bugün TARGET'tır.

## 8. Kaçaklar ve takip kayıtları

Bu runbook'un doğruladığı açıklar `PRODUCT_GAP_REGISTER.md` içinde kalır:

- Termux-only capability/provider katmanı → native desktop runtime değildir.
- `deploy-to-phone.sh` owner environment varsayılanları taşır; `PHONE_HOST`
  ve `PHONE_KEY` override edilmeden genel dağıtım aracı değildir.
- `FABRIC_SELF_URL` ve `PC_AGENT_SELF_URL` defaultları owner ağından gelir;
  fresh node bunları explicit set etmelidir.
- Hermes gateway/LLM bridge provisioning source checkout'a dahil değildir.
- Fabric runtime storage root'u Termux deployment varsayımına bağlıdır;
  Windows/Ubuntu source checkout için generic storage-root contract yoktur.
- Lockfile, signed release/public package ve platform CI matrisi yoktur.

Bu maddeler çözülmeden “tüm platformlarda kurulum tamam” FACT'i yazılmaz.
