#!/data/data/com.termux/files/usr/bin/bash
# AIOS operator console — Widget varsayılanı dokunmatik PWA Operator Deck'tir.
# `--cli` yalnız gerçek terminal bakımında kullanılabilir; yeni execution veya
# authority yolu değildir.
set -u

HOME=/data/data/com.termux/files/home
export HOME

if [ "${1:-}" != "--cli" ]; then
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:9300/ 2>/dev/null || true)"
  if [ "$code" != "200" ]; then
    bash "$HOME/start_hermes_os.sh" --no-open
  fi
  am start -a android.intent.action.VIEW -d 'http://localhost:9300?tab=komut&screen=operator' > "$HOME/aios-launcher.log" 2>&1 || exit 1
  exit 0
fi

cyan='\033[38;5;51m'; pink='\033[38;5;213m'; lime='\033[38;5;118m'
amber='\033[38;5;220m'; red='\033[38;5;203m'; dim='\033[38;5;250m'
violet='\033[38;5;141m'; reset='\033[0m'; bold='\033[1m'

line() { printf '%b%s%b\n' "$violet" '════════════════════════════════════════════════' "$reset"; }
title() { printf '%b%b%s%b\n' "$bold$cyan" "$pink" "$1" "$reset"; }
ok() { printf '%b● ONLINE%b' "$lime" "$reset"; }
down() { printf '%b● OFFLINE%b' "$red" "$reset"; }
wait_key() { printf '\n%bENTER%b ile konsola dön…' "$dim" "$reset"; IFS= read -r _ || true; }

status() {
  local fabric='OFFLINE' llm='OFFLINE' gateway='OFFLINE' watchdog='OFFLINE' code='—'
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:9300/ 2>/dev/null || true)"
  [ "$code" = '200' ] && fabric='ONLINE'
  pgrep -f '^python3 -m uvicorn llm_bridge' >/dev/null 2>&1 && llm='ONLINE'
  pgrep -f 'hermes-agent/venv/bin/hermes gateway run' >/dev/null 2>&1 && gateway='ONLINE'
  pgrep -f "^bash $HOME/watchdog\\.sh$" >/dev/null 2>&1 && watchdog='ONLINE'
  printf '  %-18s ' 'FABRIC :'; [ "$fabric" = ONLINE ] && ok || down; printf '  %bHTTP %s%b\n' "$dim" "$code" "$reset"
  printf '  %-18s ' 'LLM BRIDGE :'; [ "$llm" = ONLINE ] && ok || down; printf '\n'
  printf '  %-18s ' 'HERMES GATEWAY :'; [ "$gateway" = ONLINE ] && ok || down; printf '\n'
  printf '  %-18s ' 'WATCHDOG :'; [ "$watchdog" = ONLINE ] && ok || down; printf '\n'
}

screen() {
  clear 2>/dev/null || true
  printf '%b' "$cyan"
  printf '╔══════════════════════════════════════════════╗\n'
  printf '║      AIOS // NIGHT CITY OPERATOR CONSOLE     ║\n'
  printf '╚══════════════════════════════════════════════╝\n'
  printf '%b' "$reset"
  printf '%b  LOCAL DEVICE · TERMUX · OWNER SURFACE%b\n\n' "$pink" "$reset"
  status
  printf '\n'; line
  printf '%b [1]%b Canlı durumu yenile       %b[2]%b Son loglar\n' "$cyan" "$reset" "$cyan" "$reset"
  printf '%b [3]%b Stack güvenli yeniden başlat %b[4]%b AIOS PWA aç\n' "$cyan" "$reset" "$cyan" "$reset"
  printf '%b [5]%b Gateway anahtarını kur      %b[6]%b Çıkış\n' "$cyan" "$reset" "$cyan" "$reset"
  line
  printf '%bSeçim › %b' "$lime" "$reset"
}

show_logs() {
  clear 2>/dev/null || true
  title 'AIOS // CANLI İZLER'
  line
  for item in 'Fabric|fabric.log' 'LLM bridge|llm_bridge.log' 'Hermes gateway|gateway.log' 'Watchdog|watchdog.log'; do
    label="${item%%|*}"; file="$HOME/${item#*|}"
    printf '\n%b[%s]%b\n' "$pink" "$label" "$reset"
    if [ -r "$file" ]; then tail -n 8 "$file"; else printf '%bKayıt henüz yok.%b\n' "$dim" "$reset"; fi
  done
  wait_key
}

restart_stack() {
  clear 2>/dev/null || true
  title 'AIOS // GÜVENLİ YENİDEN BAŞLATMA'
  printf '%bMevcut launcher gerçek süreç kontrolleriyle çalışacak. Gizli değer gösterilmez.%b\n\n' "$amber" "$reset"
  bash "$HOME/start_hermes_os.sh" --no-open
  wait_key
}

open_pwa() {
  am start -a android.intent.action.VIEW -d 'http://localhost:9300?tab=komut&screen=management' > "$HOME/aios-launcher.log" 2>&1 || {
    printf '%bPWA açılamadı; %s/aios-launcher.log dosyasını kontrol et.%b\n' "$red" "$HOME" "$reset"; wait_key; return;
  }
  printf '%bAIOS PWA öne getirildi.%b\n' "$lime" "$reset"
  sleep 1
}

while true; do
  screen
  IFS= read -r choice || exit 0
  case "$choice" in
    1|'') : ;;
    2) show_logs ;;
    3) restart_stack ;;
    4) open_pwa ;;
    5) bash "$HOME/provision-fabric-gateway-key.sh"; wait_key ;;
    6|q|Q) clear 2>/dev/null || true; printf '%bAIOS operator console kapatıldı.%b\n' "$dim" "$reset"; exit 0 ;;
    *) printf '%bGeçersiz seçim.%b\n' "$red" "$reset"; sleep 1 ;;
  esac
done
