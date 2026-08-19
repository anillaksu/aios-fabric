#!/data/data/com.termux/files/usr/bin/bash
# Termux:Widget → AIOS Bağlantı Köprüsü.
# Sahibi telefonda açıkça tetikler: SSH dinleyicisini doğrular/başlatır,
# AIOS yığınını gerekirse başlatır ve yönetim haritasını açar.
set -u

AIOS_HOME="$HOME"
LOG="$AIOS_HOME/aios-connectivity.log"
note() { printf '%s %s\n' "$(date '+%F %T')" "$*" >>"$LOG"; }
ssh_listening() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | grep -q ':8022 '
  else
    pgrep -f 'runsv sshd|/libexec/sshd' >/dev/null 2>&1
  fi
}

if ! command -v sshd >/dev/null 2>&1; then
  note "ERROR sshd komutu bulunamadı"
  termux-toast "AIOS: sshd kurulu değil" 2>/dev/null || true
  exit 1
fi

if ! ssh_listening; then
  if sshd >>"$LOG" 2>&1; then note "sshd başlatıldı"; else
    note "ERROR sshd başlatılamadı"
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
