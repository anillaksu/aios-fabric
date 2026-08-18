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

termux-toast "AI-OS baslatiliyor..." 2>/dev/null

# Android'in surecleri oldurmesini zorlastir (tekrarlayan OOM cokme dongusu)
termux-wake-lock 2>/dev/null

pkill -9 -f 'hermes gateway run' 2>/dev/null
pkill -9 -f 'uvicorn llm_bridge' 2>/dev/null
pkill -9 -f 'src/server.ts' 2>/dev/null
pkill -9 -f watchdog.sh 2>/dev/null
# X11/Chromium artik kullanilmiyor - eski oturumdan kalan varsa temizle
pkill -9 -f 'termux-x11' 2>/dev/null
pkill -9 -f '/usr/lib/chromium/chrome' 2>/dev/null
sleep 2

# 1) Hermes gateway (8642) - A2A agent delegasyonu (Fabric'in /a2a yolu)
nohup setsid proot-distro login ubuntu -- bash -c "cd /root/hermes-agent && source venv/bin/activate && hermes gateway run" > "$HOME/gateway.log" 2>&1 < /dev/null &
disown

# 2) LLM koprusu (9201) - Hermes'in Codex OAuth istemcisi sadece Python'da
nohup setsid proot-distro login ubuntu -- bash -c "cd /root && source hermes-agent/venv/bin/activate && python3 -m uvicorn llm_bridge:app --host 127.0.0.1 --port 9201" > "$HOME/llm_bridge.log" 2>&1 < /dev/null &
disown

# 3) Fabric (9300) - TypeScript omurga + AI-OS arayuzu (PWA).
# Termux'un KENDI Node'unda: capability'ler Termux:API binary'lerini ve
# `am`/`pm`'i dogrudan cagiriyor (proot'ta rish/izinler bozuluyor).
nohup setsid bash -c "cd '$HOME/fabric' && node --experimental-strip-types src/server.ts" > "$HOME/fabric.log" 2>&1 < /dev/null &
disown
sleep 5

# 4) Watchdog
nohup bash "$HOME/watchdog.sh" > "$HOME/watchdog_stdout.log" 2>&1 < /dev/null &
disown

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
  am start -a android.intent.action.VIEW -d http://localhost:9300 > "$HOME/aios-launcher.log" 2>&1 || {
    echo "$(date): AIOS ACTION_VIEW baslatilamadi" >> "$HOME/aios-launcher.log"
    termux-toast "AI-OS hazir, ana ekrandaki AIOS simgesinden ac" 2>/dev/null
  }
else
  echo "$(date): Fabric 9300 17sn icinde hazir olmadi; UI acilmadi" >> "$HOME/aios-launcher.log"
  termux-toast "AI-OS henuz hazir degil" 2>/dev/null
fi
