# AIOS Hardware-in-the-Loop (HIL) CI — Kurulum

Amaç: her commit'te **gerçek Renesas RA4M1 silikonu** üzerinde `AIOS_HARDWARE_PROOF_VERDICT=PASS`
almayı merge şartı yapmak. GitHub Actions + fiziksel kartın bağlı olduğu bir self-hosted runner.

**Git deposu kökü:** `aios/aios-fabric/` (mevcut repo, branch `master`). Workflow ve tüm
yollar bu köke görelidir: `firmware/arduino/...`, `.github/workflows/hil-proof.yml`.

## Bileşenler

| Dosya | Rol |
|---|---|
| `aios-verify.sh` | Tek komut: sync → compile → flash → seri yakalama → VERDICT assert (exit 0/1) |
| `.github/workflows/hil-proof.yml` | `firmware/**` değişince `[self-hosted, aios-hil]` runner'da çalışır |
| `AIOS_HardwareProof/` | 4 fazlı on-silicon harness (mock kanonik + gerçek UID + SCE5 TRNG + NIST subset) |

## 1. HIL makinesini hazırla (kartın bağlı olduğu Windows/Linux PC)

```bash
# Arduino CLI + Renesas çekirdeği
arduino-cli core update-index
arduino-cli core install arduino:renesas_uno
arduino-cli board list          # UNO R4 WiFi'nin portunu doğrula (ör. COM4)

# Linux/macOS runner ise seri yakalama için:
python3 -m pip install pyserial
```

Kartı USB ile bağla. Kullanıcının `dialout` (Linux) veya port erişim iznine sahip olduğundan emin ol.

## 2. Self-hosted runner'ı kaydet

GitHub repo → **Settings → Actions → Runners → New self-hosted runner**. İndirme ve
`./config.sh` adımlarını izle, sonra:

```bash
./config.sh --url https://github.com/<org>/<repo> --token <RUNNER_TOKEN> \
            --name aios-hil-01 --labels self-hosted,aios-hil --unattended
./run.sh        # veya servis olarak: ./svc.sh install && ./svc.sh start
```

Runner **her zaman aynı fiziksel kartın bağlı olduğu makinede** çalışmalı.

## 3. Repo değişkeni (opsiyonel)

Port `COM4` değilse: **Settings → Secrets and variables → Actions → Variables** →
`AIOS_HIL_PORT = COM7` (ör.).

## 4. Branch protection

Repo bir GitHub remote'una push edildikten sonra (`git remote add origin <url> && git push -u origin master`):

**Web:** Settings → Branches → Add rule (`master`) → ☑ Require status checks → **`hil-proof`**.

**gh CLI:**
```bash
gh api -X PUT repos/<org>/<repo>/branches/master/protection \
  -f 'required_status_checks[strict]=true' \
  -f 'required_status_checks[contexts][]=hil-proof' \
  -F 'enforce_admins=true' \
  -F 'required_pull_request_reviews=null' \
  -F 'restrictions=null'
```

Artık gerçek silikonda PASS almayan hiçbir PR merge edilemez. **Durum:** repo lokal
git'te (`aios/aios-fabric`, branch `master`); remote + branch protection kullanıcıda.

## 5. Lokal çalıştırma (CI olmadan)

```bash
cd aios/aios-fabric/firmware/arduino
./aios-verify.sh --port COM4
echo $?      # 0 = gerçek donanım tüm fazları geçti
```

## Git / CI kapanış sırası

**Durum:** `origin = https://github.com/anillaksu/aios-fabric.git` eklendi. Yerel
`feat/hil-deterministic-kernel-proof` dalı 6 commit (hepsi `firmware/**` + `.github/`,
`origin/master`'ın 6 fabric-only commit'iyle **çakışmasız**). Push, `gh` OAuth token'ında
`workflow` scope olmadığı için `.github/workflows/hil-proof.yml` yüzünden reddedildi.

1. **Remote'a push** (kullanıcı — token'a workflow scope ekle, sonra push):
   ```bash
   gh auth refresh -h github.com -s workflow      # tarayıcıda ~10 sn
   cd aios/aios-fabric
   git push -u origin feat/hil-deterministic-kernel-proof
   gh pr create --base master --head feat/hil-deterministic-kernel-proof \
     --title "AIOS deterministic RA4M1 kernel + HIL proof" \
     --body-file firmware/arduino/HARDWARE_PROOF.md
   ```
2. **Self-hosted runner'ı yalnızca HIL donanımına yetkilendir:** runner'ı fiziksel
   kartın bağlı olduğu makinede kur, `--labels self-hosted,aios-hil`. Repo →
   Settings → Actions → Runners → runner grubunu bu repoya (veya org'da sadece
   bu repoya) kısıtla. `hil-proof` job'ı yalnızca `[self-hosted, aios-hil]` etiketli
   runner'da koşar.
3. **CI'da `CONDITIONAL_PASS` kabulünü açıkça tanımla:** `aios-verify.sh` zaten
   `AIOS_HARDWARE_PROOF_VERDICT=(CONDITIONAL_)?PASS` ile exit 0 verir ve
   `^(AIOS|PHASE)_[A-Z0-9_]+=FAIL` gördüğünde exit 1. Workflow'un son adımı
   (`Assert VERDICT=PASS`) da `PASS|CONDITIONAL_PASS` kabul eder — değiştirme.
4. **`hil-proof`'u zorunlu status check yap** — *önce* dal push edilmeli ve workflow
   en az bir kez koşmalı (yoksa tüm PR'lar "Expected" ile takılır). `hil-proof` job'ı
   `firmware/**` değişmeyen PR'larda `ubuntu-latest`'te trivial pass verir (runs-on
   ternary), o yüzden fabric-only PR'ları bloklamaz.
   ```bash
   gh api -X PUT repos/anillaksu/aios-fabric/branches/master/protection \
     -H "Accept: application/vnd.github+json" \
     -f 'required_status_checks[strict]=false' \
     -f 'required_status_checks[checks][][context]=hil-proof' \
     -F 'enforce_admins=false' -F 'required_pull_request_reviews=null' \
     -F 'restrictions=null'
   ```
   Artık herhangi bir release gate `=FAIL` → `hil-proof` fail → PR merge edilemez.
   **Bu komut bu oturumda çalıştırılmadı** — workflow henüz push edilmediğinden
   etkinleştirilmesi tüm master PR'larını bloklardı.
5. **Fiziksel S3 E2E tamamlanınca** (`BRIDGE_S3_E2E_PLAN.md`): `PHASE_7_REAL_S3_SILICON_E2E`
   `PASS` olur, `.ino` verdict'i otomatik `PASS` basar; release verdict'ini o koşunun
   `hardware_proof_serial.log`'u ile yeniden üret ve `hardware_proof_report.json`'u güncelle.

## Notlar / sınırlamalar

- UNO R4 WiFi seri portu açılınca **reset olmaz**; `aios-verify.sh` `upload`
  sonrası kartın kendiliğinden reset'iyle çalışan tek seferlik raporu yakalar.
  Port meşgulse (`access denied`) önceki seri işlemleri kapat.
- Runner tek kart kullandığı için `concurrency: cancel-in-progress: false` —
  iki job aynı anda flash yapamaz.
- Proof yapımı hâlâ `-DAIOS_ARDUINO_PROOF` guard'larını kullanıyor (raw TRNG
  register / SCI2 / fiziksel matris sürüşü hariç). Bkz. `HARDWARE_PROOF.md` §2.
- Tam NIST SP 800-22 (15 test) ve dieharder off-device çalıştırılmalı; on-device
  battery bir "sağlık kontrolü" alt kümesidir (Monobit, Runs, Block Freq,
  Longest Run, Byte χ², non-repetition).
