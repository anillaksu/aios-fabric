#!/data/data/com.termux/files/usr/bin/sh
# AI-OS yigin otomatik baslatici - Termux:Boot her acilista calistirir.
# Hedef: ~/.termux/boot/10-aios.sh
#
# ═══ NEDEN VAR (2026-08-17) ═══
# Telefonun sarji bitti, kullanici acti ve HICBIR SEY geri gelmedi. Olcum:
#   · Termux + sshd     -> GELDI  (start-sshd.sh zaten boot'ta)
#   · Shizuku           -> GELMEDI (02-shizuku.sh calisti ama adb 5555 kapali)
#   · Fabric/llm/gateway/watchdog -> HIC DENENMEDI: boot girdisi YOKTU
# Yani AI-OS'un kendisi icin hicbir otomatik baslatma yolu yoktu; yalnizca
# kullanicinin elle Termux:Widget kisayoluna basmasiyla kalkiyordu.
#
# Isim "10-" ile baslar: Termux:Boot betikleri ALFABETIK sirayla calisir,
# yani 02-shizuku.sh'tan SONRA gelir (Shizuku varsa hazir olsun diye).

HOME=/data/data/com.termux/files/home
export HOME
FABRIC_ENV="$HOME/.config/aios/fabric.env"
if [ -r "$FABRIC_ENV" ]; then
    set -a
    . "$FABRIC_ENV"
    set +a
fi
LOG="$HOME/.termux/boot/aios-boot.log"
echo "===== $(date) AI-OS boot =====" >> "$LOG"

# Android'in surecleri oldurmesini zorlastir
termux-wake-lock 2>/dev/null

# Ag/dosya sistemi otursun (proot-distro erken kalkarsa mount hatasi veriyor)
sleep 20

# Zaten calisiyorsa DOKUNMA (kullanici elle baslatmis olabilir).
# Kalip ANKRAJLI: "src/server.ts" gecen her komut satirina - orn. bir SSH
# oturumuna - eslesmesin diye (bu hata 2026-08-16'da bir kez yasandi).
if pgrep -f '^node .*src/server\.ts' > /dev/null 2>&1; then
    echo "fabric zaten calisiyor, atlandi" >> "$LOG"
else
    cd "$HOME/fabric" 2>/dev/null && \
    nohup setsid node --experimental-strip-types src/server.ts >> "$HOME/fabric.log" 2>&1 < /dev/null &
    echo "fabric baslatildi" >> "$LOG"
fi

if pgrep -f '^python3 -m uvicorn llm_bridge' > /dev/null 2>&1; then
    echo "llm_bridge zaten calisiyor, atlandi" >> "$LOG"
else
    nohup setsid proot-distro login ubuntu -- bash -c \
      "cd /root && source hermes-agent/venv/bin/activate && python3 -m uvicorn llm_bridge:app --host 127.0.0.1 --port 9201" \
      >> "$HOME/llm_bridge.log" 2>&1 < /dev/null &
    echo "llm_bridge baslatildi" >> "$LOG"
fi

if pgrep -f 'hermes gateway run' > /dev/null 2>&1; then
    echo "gateway zaten calisiyor, atlandi" >> "$LOG"
else
    nohup setsid proot-distro login ubuntu -- bash -c \
      "cd /root/hermes-agent && source venv/bin/activate && hermes gateway run" \
      >> "$HOME/gateway.log" 2>&1 < /dev/null &
    echo "gateway baslatildi" >> "$LOG"
fi

# Watchdog EN SON: digerlerini ayakta tutan katman.
if pgrep -f "^bash $HOME/watchdog\.sh$" > /dev/null 2>&1; then
    echo "watchdog zaten calisiyor, atlandi" >> "$LOG"
else
    nohup setsid bash "$HOME/watchdog.sh" > /dev/null 2>&1 < /dev/null &
    echo "watchdog baslatildi" >> "$LOG"
fi

sleep 12
{
  printf 'saglik: '
  for p in 9300 9201 8642; do
      c=$(curl -s -o /dev/null -w '%{http_code}' -m 5 "http://127.0.0.1:$p/" 2>/dev/null)
      printf '%s=%s ' "$p" "${c:-DOWN}"
  done
  echo
} >> "$LOG" 2>&1

if [ -x "$HOME/aios-runtime-ledger.sh" ]; then
  "$HOME/aios-runtime-ledger.sh" snapshot boot-complete >> "$LOG" 2>&1 \
    || echo "runtime ledger snapshot failed" >> "$LOG"
fi
