#!/data/data/com.termux/files/usr/bin/bash
# AI-OS v0.1-beta baslatici - ana ekran kisayolundan (Termux:Widget) calistirilir.
#
# ═══ 2026-08-16 ZEMIN DEGISIKLIGI ═══
# X11 + Chromium-in-Termux KALDIRILDI. Nedeni: uc gercek hata ayni koke
# baglaniyordu -> klavye IME'si calismiyor (yazi girilemiyor), mikrofon
# erisimi yok (sesli giris imkansiz), ve ~1GB RAM yiyor.
# Yerine: arayuz artik telefonun KENDI Chrome'unda bir PWA olarak aciliyor.
#   -> native klavye, native dokunma, Web Speech API (tr-TR!), ~1GB serbest
#
# KURULUM (bir kez): telefonda Chrome ile  http://localhost:9300  ac
#   -> menu -> "Ana ekrana ekle" -> tam ekran uygulama olarak kurulur
# NOT: Mutlaka `localhost` kullan. Tailscale IP'si (100.75.177.88) "guvenli
# baglam" sayilmaz; mikrofon ve PWA kurulumu orada CALISMAZ.
HOME=/data/data/com.termux/files/home
export HOME
FABRIC_ENV="$HOME/.config/aios/fabric.env"
# Yalnizca operator provisioning betiginin yazdigi 0600 env dosyasi okunur.
# Dosya yoksa eski davranis korunur; yeni Fabric surumu ise A2A metin yolunu
# fail-closed kapatir, sirri kaynakta varsaymaz.
if [ -r "$FABRIC_ENV" ]; then
  set -a
  . "$FABRIC_ENV"
  set +a
fi

PROVISIONED=0
[ "${1:-}" = "--provisioned" ] && PROVISIONED=1

ink() { printf '\033[%sm%s\033[0m\n' "$1" "$2"; }
stage() { printf '\033[38;5;81m[%s]\033[0m %-42s' "$1" "$2"; }
ok() { ink '38;5;84' 'OK'; }
warn() { ink '38;5;214' 'SINIRLI'; }
wait_for() {
  local tries="$1" check="$2" i=0
  while [ "$i" -lt "$tries" ]; do
    if eval "$check" >/dev/null 2>&1; then return 0; fi
    i=$((i + 1)); sleep 1
  done
  return 1
}

show_status() {
  local fabric="OFFLINE" llm="OFFLINE" gateway="OFFLINE" watchdog="OFFLINE"
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 1 http://127.0.0.1:9300/)" = "200" ] && fabric="ONLINE"
  pgrep -f '^python3 -m uvicorn llm_bridge' > /dev/null 2>&1 && llm="ONLINE"
  pgrep -f 'hermes-agent/venv/bin/hermes gateway run' > /dev/null 2>&1 && gateway="ONLINE"
  pgrep -f "^bash $HOME/watchdog\.sh$" > /dev/null 2>&1 && watchdog="ONLINE"
  printf '  Fabric       : %s\n' "$fabric"
  printf '  LLM bridge   : %s\n' "$llm"
  printf '  Hermes A2A   : %s\n' "$gateway"
  printf '  Watchdog     : %s\n' "$watchdog"
}

open_aios() {
  local target="${1:-http://localhost:9300}"
  am start -a android.intent.action.VIEW -d "$target" > "$HOME/aios-launcher.log" 2>&1 || {
    echo "$(date): AIOS ACTION_VIEW baslatilamadi" >> "$HOME/aios-launcher.log"
    printf '\nAIOS acilamadi. Ana ekrandaki AIOS simgesini kullanabilir veya logu inceleyebilirsin.\n'
    return 1
  }
  printf '\nAIOS aciliyor...\n'
}

clear 2>/dev/null || true
ink '38;5;81' '╔══════════════════════════════════════════╗'
ink '38;5;81' '║       🌃 AIOS · ADMIN BOOT CONSOLE ⚡      ║'
ink '38;5;81' '╚══════════════════════════════════════════╝'
[ "$PROVISIONED" -eq 1 ] && printf '  Güvenli gateway anahtarı eşlendi; doğrulanmış yeniden başlatma başlıyor.\n'
printf '  Yerel servis ağı hazırlanıyor. Her aşama canlı kontrolle kapanır.\n\n'

stage '01/06' '🔋 Cihaz çalışma kilidi alınıyor'
if termux-wake-lock 2>/dev/null; then ok; else warn; fi
termux-toast "AI-OS baslatiliyor..." 2>/dev/null || true

# Android'in surecleri oldurmesini zorlastir (tekrarlayan OOM cokme dongusu)
stage '02/06' '🧹 Önceki yerel süreçler kapatılıyor'
pkill -9 -f 'hermes gateway run' 2>/dev/null
pkill -9 -f 'uvicorn llm_bridge' 2>/dev/null
pkill -9 -f 'src/server.ts' 2>/dev/null
pkill -9 -f watchdog.sh 2>/dev/null
# X11/Chromium artik kullanilmiyor - eski oturumdan kalan varsa temizle
pkill -9 -f 'termux-x11' 2>/dev/null
pkill -9 -f '/usr/lib/chromium/chrome' 2>/dev/null
sleep 2
ok

# 1) Hermes gateway (8642) - A2A agent delegasyonu (Fabric'in /a2a yolu)
stage '03/06' '🛰️  Hermes gateway başlatılıyor'
nohup setsid proot-distro login ubuntu -- bash -c "cd /root/hermes-agent && source venv/bin/activate && hermes gateway run" > "$HOME/gateway.log" 2>&1 < /dev/null &
disown
if wait_for 12 "pgrep -f 'hermes-agent/venv/bin/hermes gateway run'"; then ok; else warn; fi

# 2) LLM koprusu (9201) - Hermes'in Codex OAuth istemcisi sadece Python'da
stage '04/06' '🧠 LLM bridge başlatılıyor'
nohup setsid proot-distro login ubuntu -- bash -c "cd /root && source hermes-agent/venv/bin/activate && python3 -m uvicorn llm_bridge:app --host 127.0.0.1 --port 9201" > "$HOME/llm_bridge.log" 2>&1 < /dev/null &
disown
if wait_for 12 "pgrep -f '^python3 -m uvicorn llm_bridge'"; then ok; else warn; fi

# 3) Fabric (9300) - TypeScript omurga + AI-OS arayuzu (PWA).
# Termux'un KENDI Node'unda: capability'ler Termux:API binary'lerini ve
# `am`/`pm`'i dogrudan cagiriyor (proot'ta rish/izinler bozuluyor).
stage '05/06' '⬡  Fabric çalışma alanı başlatılıyor'
nohup setsid bash -c "cd '$HOME/fabric' && node --experimental-strip-types src/server.ts" > "$HOME/fabric.log" 2>&1 < /dev/null &
disown
if wait_for 12 "[ \"\$(curl -s -o /dev/null -w '%{http_code}' --max-time 1 http://127.0.0.1:9300/)\" = 200 ]"; then ok; else warn; fi

# 4) Watchdog
stage '06/06' '◉  Süreç gözcüsü bağlanıyor'
nohup bash "$HOME/watchdog.sh" > "$HOME/watchdog_stdout.log" 2>&1 < /dev/null &
disown
if wait_for 5 "pgrep -f '^bash $HOME/watchdog\\.sh$'"; then ok; else warn; fi

# Widget komutu bir terminal islemi degil, AIOS baslaticisidir. Fabric gercekten
# hazir olmadan tarayiciyi one getirmeyiz; aksi halde bos/baglanamiyor ekranini
# kullanici gorur. Paket veya activity adi tahmin edilmez: standart ACTION_VIEW
# Android'in localhost URL'sini kayitli PWA/uygun tarayici yuzeyine yonlendirir.
ready=0
for _ in $(seq 1 12); do
  # Fabric'in health route'u yoktur; PWA shell'i olan GET /, gercek baslangic
  # yuzeyidir. 200 yaniti hem Node dinleyicisini hem de statik shell'i kanitlar.
  if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 1 http://127.0.0.1:9300/)" = "200" ]; then
    ready=1
    break
  fi
  sleep 1
done

if [ "$ready" -eq 1 ]; then
  termux-toast "AI-OS hazir" 2>/dev/null
  ink '38;5;84' '\nAIOS HAZIR · Yerel çalışma alanı doğrulandı.'
  show_status
  printf '\nYonetim Merkezi aciliyor...\n'
  # Widget operator girisidir; gunluk PWA simgesi HOME'u acar. Burada dogrudan
  # gercek servis/gorev/izin yuzeyine gideriz, kucuk sabit terminal menusuyle
  # sahte bir yonetim modeli kurmayiz.
  open_aios "http://localhost:9300?tab=komut&screen=management"
else
  echo "$(date): Fabric 9300 17sn icinde hazir olmadi; UI acilmadi" >> "$HOME/aios-launcher.log"
  termux-toast "AI-OS henuz hazir degil" 2>/dev/null
  printf '\nFabric henuz hazir degil. Loglar: %s/fabric.log, %s/watchdog.log\n' "$HOME" "$HOME"
fi
