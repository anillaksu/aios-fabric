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
