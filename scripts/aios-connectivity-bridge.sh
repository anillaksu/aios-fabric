#!/data/data/com.termux/files/usr/bin/bash
# Termux:Widget → AIOS Bağlantı Köprüsü.
# Sahibi telefonda açıkça tetikler: SSH dinleyicisini doğrular/başlatır,
# AIOS yığınını gerekirse başlatır ve yönetim haritasını açar.
set -u

AIOS_HOME="$HOME"
LOG="$AIOS_HOME/aios-connectivity.log"
note() { printf '%s %s\n' "$(date '+%F %T')" "$*" >>"$LOG"; }
ssh_listening() {
  # Android/Termux'ta ss/netstat bazı cihazlarda dinleyiciyi göstermeyebilir.
  # Aynı ağ yığını üzerinden yapılan TCP probe, burada süreç adı tahmininden
  # daha güçlü kanıttır: bağlantı kurulmadan "hazır" yazılmaz.
  if command -v nc >/dev/null 2>&1; then
    nc -z -w 1 127.0.0.1 8022 >/dev/null 2>&1
  elif bash -c '</dev/tcp/127.0.0.1/8022' >/dev/null 2>&1; then
    return 0
  elif command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | grep -q ':8022 '
  elif command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | grep -q ':8022 '
  else
    return 1
  fi
}

start_sshd() {
  # Termux-services kuruluysa sshd'nin sahibı runit'tir. Duz `sshd` daemon'u
  # ilk anda donse bile supervisor olmadiginda Android/oturum altinda kaybolabilir.
  local service="${PREFIX:-/data/data/com.termux/files/usr}/var/service/sshd"
  if [ -x "$service/run" ] && command -v sv >/dev/null 2>&1; then
    sv up "$service" >>"$LOG" 2>&1 || return 1
    note "sshd runit service up istendi"
  else
    sshd >>"$LOG" 2>&1 || return 1
    note "sshd dogrudan baslatma istendi (runit service yok)"
  fi
  local attempt=0
  while [ "$attempt" -lt 8 ]; do
    ssh_listening && return 0
    attempt=$((attempt + 1)); sleep 1
  done
  return 1
}

if ! command -v sshd >/dev/null 2>&1; then
  note "ERROR sshd komutu bulunamadı"
  termux-toast "AIOS: sshd kurulu değil" 2>/dev/null || true
  exit 1
fi

if ! ssh_listening; then
  if start_sshd; then note "sshd dinliyor"; else
    note "ERROR sshd baslatma sonrasi 8022 dinleyicisi yok"
    termux-toast "AIOS: SSH başlatılamadı" 2>/dev/null || true
    exit 1
  fi
else
  note "sshd zaten dinliyor"
fi

if ! curl -fsS --max-time 3 http://127.0.0.1:9300/ >/dev/null 2>&1; then
  note "Fabric offline; AIOS stack başlatılıyor"
  "$AIOS_HOME/start_hermes_os.sh" --no-open >>"$LOG" 2>&1 || exit 1
fi

if [ -x "$AIOS_HOME/aios-runtime-ledger.sh" ]; then
  "$AIOS_HOME/aios-runtime-ledger.sh" snapshot connectivity-bridge >>"$LOG" 2>&1 || note "ERROR runtime ledger snapshot"
fi

termux-toast "AIOS bağlantı köprüsü hazır" 2>/dev/null || true
am start -a android.intent.action.VIEW \
  -d 'http://127.0.0.1:9300/?tab=komut&screen=system-map' >>"$LOG" 2>&1
