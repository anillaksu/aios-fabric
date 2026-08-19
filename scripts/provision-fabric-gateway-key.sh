#!/data/data/com.termux/files/usr/bin/bash
# Termux:Widget operator komutu. Fabric <-> Hermes gateway Bearer anahtarini
# cihazda, ekrana/loğa yazmadan kurar veya mevcut iki taraf arasinda esler.
#
# Bu bir LLM veya A2A eylemi degildir; yerel operator provisioning isidir.
# PWA/MCP bu sirri okuyamaz ya da uretemez.
set -euo pipefail

HOME=/data/data/com.termux/files/home
export HOME
CONFIG_DIR="$HOME/.config/aios"
FABRIC_ENV="$CONFIG_DIR/fabric.env"
LOG="$HOME/aios-provision.log"

log() { printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >> "$LOG"; }
ink() { printf '\033[%sm%s\033[0m\n' "$1" "$2"; }
stage() { printf '\033[38;5;81m[%s]\033[0m %-42s' "$1" "$2"; }
ok() { ink '38;5;84' 'OK'; }
fail() { ink '38;5;203' 'HATA'; }

clear 2>/dev/null || true
ink '38;5;81' '╔══════════════════════════════════════════╗'
ink '38;5;81' '║   🌃 AIOS · GÜVENLİ BAĞLANTI KURULUMU 🔐 ║'
ink '38;5;81' '╚══════════════════════════════════════════╝'
printf '  Hermes Gateway ↔ Fabric · yerel operator akışı\n\n'

mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"

if ! command -v proot-distro >/dev/null 2>&1; then
  log 'FAIL proot-distro bulunamadi; anahtar olusturulmadi'
  termux-toast 'AIOS anahtar kurulumu basarisiz: proot-distro yok' 2>/dev/null || true
  printf 'HATA: proot-distro bulunamadi; anahtar olusturulmadi.\n'
  exit 1
fi

# Hermes'in mevcut canonical store'u config.yaml icindeki
# `gateway.platforms.api_server.extra.key` alanidir; Hermes'in kendi config CLI'i
# ile yazilir. Betik anahtar degerini Termux terminaline yazmaz. Bir taraf
# varsa onu source of truth kabul eder; iki farkli mevcut anahtar gorurse
# rotasyon yapmayip operatoru durdurur.
stage '01/04' '🔎 Güvenli store ve proot denetleniyor'
if ! mode="$(proot-distro login ubuntu -- bash -s -- "$FABRIC_ENV" 2>>"$LOG" <<'PROOT'
set -euo pipefail
fabric_env="$1"
source /root/hermes-agent/venv/bin/activate
umask 077
mkdir -p "$(dirname "$fabric_env")"
chmod 700 "$(dirname "$fabric_env")"

read_value() {
  local file="$1" key="$2" line
  [ -f "$file" ] || return 0
  line="$(grep -m1 "^${key}=" "$file" || true)"
  [ -n "$line" ] && printf '%s' "${line#*=}"
}

valid_key() {
  [[ "$1" =~ ^[A-Za-z0-9._-]{16,}$ ]]
}

fabric_key="$(read_value "$fabric_env" FABRIC_GATEWAY_KEY)"
# Hermes CLI yalniz value yazar; stdout command substitution icinde kalir ve
# hicbir zaman operator terminaline/loguna aktarilmaz.
hermes_key="$(hermes config get gateway.platforms.api_server.extra.key 2>/dev/null || true)"
if [ -n "$fabric_key" ] && ! valid_key "$fabric_key"; then printf 'invalid-fabric\n'; exit 20; fi
if [ -n "$hermes_key" ] && ! valid_key "$hermes_key"; then printf 'invalid-hermes\n'; exit 21; fi
if [ -n "$fabric_key" ] && [ -n "$hermes_key" ] && [ "$fabric_key" != "$hermes_key" ]; then
  printf 'mismatch\n'; exit 22
fi

key="$hermes_key"
mode=existing
if [ -z "$key" ]; then key="$fabric_key"; fi
if [ -z "$key" ]; then
  key="$(openssl rand -hex 32)"
  mode=created
fi

set_value() {
  local file="$1" key_name="$2" value="$3" tmp
  tmp="$(mktemp "${file}.tmp.XXXXXX")"
  { [ -f "$file" ] && grep -v "^${key_name}=" "$file" || true; } > "$tmp"
  printf '%s=%s\n' "$key_name" "$value" >> "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$file"
}

# Konfigürasyonun kendi CLI'i atomik/semantik yazma sahibidir; ham YAML
# düzenleme veya secret değerini echo ile taşımak yapılmaz.
hermes config set gateway.platforms.api_server.extra.key "$key" >/dev/null
set_value "$fabric_env" FABRIC_GATEWAY_KEY "$key"
printf '%s\n' "$mode"
PROOT
)"; then
  fail
  log 'FAIL Hermes/Termux anahtar esleme komutu hata verdi'
  termux-toast 'AIOS anahtar kurulumu basarisiz; loga bak' 2>/dev/null || true
  printf 'HATA: anahtar esleme calismadi. Log: %s\n' "$LOG"
  exit 1
fi
ok

case "$mode" in
  created) message='Yeni anahtar üretildi; iki taraf atomik yazıldı.' ;;
  existing) message='Mevcut anahtar eşlendi; rotasyon yapılmadı.' ;;
  mismatch) log 'FAIL mevcut Fabric ve Hermes anahtarlari uyusmuyor; degisiklik yok'; termux-toast 'AIOS anahtar uyusmazligi; degisiklik yok' 2>/dev/null || true; stage '02/04' 'Anahtar bütünlüğü'; fail; printf 'Fabric ve Hermes anahtarlari farkli; hicbir sey degistirilmedi.\n'; exit 1 ;;
  invalid-*) log 'FAIL mevcut anahtar bicimi reddedildi; degisiklik yok'; termux-toast 'AIOS anahtar bicimi gecersiz; degisiklik yok' 2>/dev/null || true; stage '02/04' 'Anahtar biçimi'; fail; printf 'Mevcut anahtar bicimi guvenli degil; hicbir sey degistirilmedi.\n'; exit 1 ;;
  *) log "FAIL bilinmeyen provisioning sonucu: $mode"; termux-toast 'AIOS anahtar kurulumu basarisiz; loga bak' 2>/dev/null || true; stage '02/04' 'Provisioning sonucu'; fail; printf 'Provisioning basarisiz (%s).\n' "$mode"; exit 1 ;;
esac

log "OK gateway anahtari $mode; deger loglanmadi"
stage '02/04' '🔐 Gateway ve Fabric anahtarları'; ok
printf '         %s\n' "$message"
stage '03/04' '🛡️  Gizlilik sınırı'; ok
printf '         Anahtar terminale ve günlük kaydına yazılmadı.\n'
stage '04/04' '⚡ Servisler yeniden başlatılıyor'; ok
termux-toast 'AIOS gateway anahtari hazir; servisler yeniden baslatiliyor.' 2>/dev/null || true

# Yeni env ancak yeni surecte okunur. Kanonik launcher tum katmanlari
# yeniden baslatir ve Fabric hazir olmadan PWA'yi one getirmez.
"$HOME/start_hermes_os.sh" --provisioned
