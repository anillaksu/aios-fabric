#!/data/data/com.termux/files/usr/bin/bash
# Termux:Widget → mevcut AIOS PWA'daki Sistem Haritası.
# Yeni Android execution modeli oluşturmaz; yalnız localhost PWA köprüsünü açar.
set -u

AIOS_HOME="$HOME"
LOG="$AIOS_HOME/aios-launcher.log"
if ! curl -fsS --max-time 3 http://127.0.0.1:9300/ >/dev/null 2>&1; then
  "$AIOS_HOME/start_hermes_os.sh" --no-open >>"$LOG" 2>&1 || exit 1
fi

am start -a android.intent.action.VIEW \
  -d 'http://127.0.0.1:9300/?tab=komut&screen=system-map' >>"$LOG" 2>&1
