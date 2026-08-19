#!/data/data/com.termux/files/usr/bin/bash
# AI-OS servis watchdog'u.
#
# ═══ 2026-08-16 KRITIK DUZELTME ═══
# Onceki surumler Shizuku olu oldugunda `am start -n moe.shizuku.privileged.api/
# ...MainActivity` cagiriyordu. Bu HER 30 SANIYEDE BIR EKRANI CALIYORDU ve
# hicbir zaman sorunu cozmuyordu, cunku:
#   Shizuku *servisi* uid=shell (ADB) gerektirir - Shizuku uygulamasinin
#   ekranini acmak servisi BASLATMAZ. Yani sonsuz, faydasiz, zararli dongu.
# Cozum: watchdog Shizuku'ya HIC dokunmaz. Shizuku artik opsiyonel bir
# ayricalik katmani (sadece app.freeze); olu ise ilgili capability aciklayici
# hata doner, sistemin geri kalani calismaya devam eder.
# Shizuku gerekiyorsa PC'den tek seferlik: adb shell (Shizuku baslatma akisi).
#
# 2026-08-16 IKINCI DUZELTME: pgrep kaliplari ANKRAJLI (^) olmali. Once
# `pgrep -f src/server.ts` yaziyordu; bu kalip, icinde o metin gecen HERHANGI
# bir komut satirina - ornegin bir SSH oturumundaki `bash -c ...server.ts...` -
# eslesiyordu. Sonuc: fabric gercekten olmusken watchdog onu "ayakta" sanip
# yeniden baslatmiyordu ve arayuz dakikalarca erisilmez kaliyordu (bugun yasandi).
#
# Ayrica: "servis ayakta mi" kontrolu ONCE pgrep ile yapilir. Sadece HTTP
# koduna bakmak, yavas acilan servisleri "cokmus" sanip UST USTE kopyalar
# baslatiyordu (ayni SQLite'i es zamanli migrate eden 3 kopya gorulmustu).

HOME=/data/data/com.termux/files/home
export HOME
FABRIC_ENV="$HOME/.config/aios/fabric.env"
if [ -r "$FABRIC_ENV" ]; then
  set -a
  . "$FABRIC_ENV"
  set +a
fi
LOG="$HOME/watchdog.log"

while true; do
  # 1) Fabric (9300) - TypeScript omurga + AI-OS arayuzu
  if ! pgrep -f '^node .*src/server.ts' > /dev/null 2>&1; then
    echo "$(date): fabric down, restarting" >> "$LOG"
    cd "$HOME/fabric" && nohup setsid node --experimental-strip-types src/server.ts > "$HOME/fabric.log" 2>&1 < /dev/null &
    disown
    cd "$HOME"
  fi

  # 2) LLM koprusu (9201)
  if ! pgrep -f '^python3 -m uvicorn llm_bridge' > /dev/null 2>&1; then
    echo "$(date): llm_bridge down, restarting" >> "$LOG"
    nohup setsid proot-distro login ubuntu -- bash -c "cd /root && source hermes-agent/venv/bin/activate && python3 -m uvicorn llm_bridge:app --host 127.0.0.1 --port 9201" > "$HOME/llm_bridge.log" 2>&1 < /dev/null &
    disown
  fi

  # 3) Hermes gateway (8642) - A2A agent delegasyonu (Fabric'in /a2a yolu)
  # ═══ 2026-08-18 BULUNDU (B-9 arastirmasi sirasinda) ═══
  # Bu surec HIC izlenmiyordu - watchdog yalnizca fabric+llm_bridge'i kontrol
  # ediyordu. Gateway tek basina olurse (digerleri ayakta kalsa bile) watchdog
  # bunu fark etmiyor, bir sonraki manuel start_hermes_os.sh'e kadar olu kaliyordu.
  if ! pgrep -f 'hermes-agent/venv/bin/hermes gateway run' > /dev/null 2>&1; then
    echo "$(date): hermes gateway down, restarting" >> "$LOG"
    nohup setsid proot-distro login ubuntu -- bash -c "cd /root/hermes-agent && source venv/bin/activate && hermes gateway run" > "$HOME/gateway.log" 2>&1 < /dev/null &
    disown
  fi

  # NOT: X11/Chromium izlenmiyor - arayuz artik telefonun kendi Chrome'unda
  # PWA olarak calisiyor (bkz start_hermes_os.sh). Tarayiciyi kullanici acar,
  # watchdog'un isi sadece arka plan servislerini ayakta tutmak.

  # 4) Wake-lock'u canli tut (Android'in surecleri oldurmesini zorlastirir)
  termux-wake-lock 2>/dev/null

  sleep 45
done
