#!/data/data/com.termux/files/usr/bin/sh
# Shizuku otomatik baslatici - Termux:Boot her acilista calistirir.
# Hedef: ~/.termux/boot/02-shizuku.sh
#
# ═══ 2026-08-17 DUZELTMESI ═══
# Onceki surum sarj bitip telefon yeniden acildiginda BASARISIZ oldu:
#     failed to connect to '127.0.0.1:5555': Connection refused
# Iki ayri kusur vardi:
#
#  1) SABIT PORT. Betik 5555'e baglaniyordu. Bu port yalnizca birisi daha once
#     PC'den `adb tcpip 5555` calistirdiysa acilir. Android 11+ "kablosuz hata
#     ayiklama" ise RASTGELE bir port kullanir ve onu `service.adb.tls.port`
#     property'sine yazar. Artik port KESFEDILIYOR, varsayilmiyor.
#
#  2) TEK DENEME. Betik acilistan 25sn sonra bir kez deneyip pes ediyordu.
#     Ama kullanici kablosuz hata ayiklamayi genelde DAHA SONRA aciyor -
#     o an betik coktan olmustu. Artik belli bir sure boyunca BEKLIYOR:
#     kullanici anahtari ne zaman acarsa Shizuku o an kendiliginden kalkiyor.
#
# ═══ NEDEN HALA BIR INSAN DOKUNUSU GEREKEBILIYOR ═══
# Termux `untrusted_app` sandbox'inda calisiyor (uid=10322), cihaz ROOTLU DEGIL:
#   · /system/bin/setprop service.adb.tcp.port 5555 -> "Failed to set property"
#   · settings put global adb_wifi_enabled 1        -> WRITE_SECURE_SETTINGS yok
# Yani ADB TCP dinleyicisini sandbox ICINDEN acmanin yolu yok; onu ancak
# Gelistirici Secenekleri'ndeki anahtar (ya da USB ile PC) acar. Anahtar bir kez
# acildiginda bu betigin geri kalani TAMAMEN otomatiktir - ve cihaz kablosuz
# hata ayiklamayi acik tutuyorsa yeniden baslatmada da insan mudahalesi gerekmez.

HOME=/data/data/com.termux/files/home
export HOME
LOG="$HOME/.termux/boot/shizuku.log"
echo "===== $(date) shizuku boot =====" >> "$LOG"

termux-wake-lock 2>/dev/null
sleep 25          # boot otursun

# Shizuku ayakta mi? (rish calisiyorsa servis var demektir)
shizuku_alive() {
    RISH_APPLICATION_ID=com.termux timeout 8 rish -c "id" 2>&1 | grep -qv "Server is not running" &&
    RISH_APPLICATION_ID=com.termux timeout 8 rish -c "id" 2>&1 | grep -q "uid="
}

# ADB'nin dinledigi portu KESFET (varsaymadan).
#   service.adb.tcp.port -> klasik `adb tcpip <port>` modu
#   service.adb.tls.port -> Android 11+ kablosuz hata ayiklama (rastgele port)
adb_port() {
    p=$(getprop service.adb.tcp.port 2>/dev/null)
    [ -n "$p" ] && { echo "$p"; return; }
    p=$(getprop service.adb.tls.port 2>/dev/null)
    [ -n "$p" ] && { echo "$p"; return; }
    echo ""
}

start_shizuku() {
    port="$1"
    adb start-server >/dev/null 2>&1
    adb connect "127.0.0.1:$port" >> "$LOG" 2>&1 || return 1
    sleep 2
    APK=$(pm path moe.shizuku.privileged.api 2>/dev/null | head -1 | sed 's/^package://')
    [ -z "$APK" ] && { echo "APK bulunamadi" >> "$LOG"; return 1; }
    nohup adb -s "127.0.0.1:$port" shell \
        "CLASSPATH=$APK exec /system/bin/app_process -Djava.class.path=$APK /system/bin --nice-name=shizuku_server moe.shizuku.starter.ServerStarter" \
        >> "$LOG" 2>&1 &
    sleep 6
    return 0
}

# ── BEKLEYEN DONGU ──
# 40 tur x 30sn = ~20 dakika. Kullanici bu sure icinde kablosuz hata ayiklamayi
# acarsa Shizuku kendiliginden kalkar; acmazsa betik sessizce biter (eskisi gibi
# ekrani calan/pil yiyen bir dongu birakmaz - bu ders 2026-08-16'da alinmisti).
i=0
while [ $i -lt 40 ]; do
    i=$((i + 1))

    if shizuku_alive; then
        echo "Shizuku ZATEN AYAKTA (tur $i) - $(date)" >> "$LOG"
        exit 0
    fi

    PORT=$(adb_port)
    if [ -n "$PORT" ]; then
        echo "ADB portu bulundu: $PORT (tur $i)" >> "$LOG"
        if start_shizuku "$PORT"; then
            if shizuku_alive; then
                echo "Shizuku BASLATILDI - $(date)" >> "$LOG"
                termux-notification -t "Shizuku hazir" -c "Ayricalikli capability'ler acik" 2>/dev/null
                exit 0
            fi
            echo "starter calisti ama servis gelmedi, tekrar denenecek" >> "$LOG"
        fi
    fi

    sleep 30
done

echo "ADB TCP dinleyicisi acilmadi - Gelistirici Secenekleri > Kablosuz hata ayiklama acilmali" >> "$LOG"
termux-notification -t "Shizuku baslatilamadi" \
    -c "Kablosuz hata ayiklamayi acarsan otomatik baglanir" 2>/dev/null
