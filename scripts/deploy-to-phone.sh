#!/usr/bin/env bash
# Kanonik depodan telefona dagit + DOGRULA.
#
# Bu betik "kanoniklik kurali"nin uygulayicisidir: kaynak burasi, telefon
# hedef. Dagitim sonrasi md5 karsilastirmasi yapilir - iki taraf birebir ayni
# degilse betik HATA verir, "muhtemelen olmustur" demez.
#
# Kullanim:
#   bash scripts/deploy-to-phone.sh            # dagit + build + yeniden baslat + dogrula
#   bash scripts/deploy-to-phone.sh --check    # sadece karsilastir, hicbir sey degistirme
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEY="${PHONE_KEY:-$HOME/Desktop/Telefon_AI_Agent_Session_2026-08-16/keys/phone_termux_key}"
PHONE="${PHONE_HOST:-u0_a322@100.75.177.88}"
SSH="ssh -p 8022 -i $KEY -o StrictHostKeyChecking=no -o ConnectTimeout=15"
SCP="scp -P 8022 -i $KEY -o StrictHostKeyChecking=no"

say() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$1"; exit 1; }

# md5'i tek bicime indir: Windows md5sum dosya adina '*' ekliyor, Termux eklemiyor.
norm() { awk '{gsub(/^\*/,"",$2); print $1, $2}' | sort; }

# ─── DOGRULAMA KAPSAMI (2026-08-17'de genisletildi) ───
# Onceden md5 karsilastirmasi YALNIZCA src/*.ts uzerindeydi. Yani arayuzun
# giris noktasi (aios.html), tum CSS'i, service worker'i ve PWA manifest'i
# ne dagitiliyor ne dogrulaniyordu - "depo == telefon" iddiasi arayuz icin
# HIC kanitlanmamisti. UI bastan yazilacaksa (W6) bu delik once kapanmali.
# vendor/ ve icons/ ucuncu-parti/ikili varliklar: nadiren degisir, ayri
# kuruluma birakildi (her deploy'da 1.5MB md5'lemek anlamsiz).
REL_PATHS="fabric/src/*.ts fabric/test/*.test.ts fabric/package.json fabric/public/js/* fabric/public/css/* fabric/public/aios.html fabric/public/sw.js fabric/public/manifest.json scripts/start_hermes_os.sh scripts/10-aios.sh scripts/watchdog.sh scripts/provision-fabric-gateway-key.sh scripts/aios-admin-console.sh scripts/aios-workspace-map.sh"

# Iki tarafta AYNI dosya listesi uzerinden md5 uretir (yol farki normalize).
# 2026-08-17 BULUNDU: package.json bu listede hic yoktu - "test" script'i
# eklendiginde telefon eski package.json'i tasidigi icin "npm test" -32601
# yerine "Missing script" ile patladi. Dagitim BURADA dogru sekilde durdu
# (sessizce gecmedi) ama kok neden buydu: dagitim kapsami TAM degildi.
phone_md5() {
    $SSH "$PHONE" 'cd ~/fabric && md5sum src/*.ts test/*.test.ts package.json public/js/* public/css/* public/aios.html public/sw.js public/manifest.json 2>/dev/null; md5sum ~/start_hermes_os.sh | awk "{print \$1, \"launcher/root\"}"; md5sum ~/.shortcuts/start_hermes_os.sh | awk "{print \$1, \"launcher/widget\"}"; md5sum ~/watchdog.sh | awk "{print \$1, \"launcher/watchdog\"}"; md5sum ~/.termux/boot/10-aios.sh | awk "{print \$1, \"launcher/boot\"}"; md5sum ~/.shortcuts/provision-fabric-gateway-key.sh | awk "{print \$1, \"launcher/provision-widget\"}"; md5sum ~/.shortcuts/aios-admin-console.sh | awk "{print \$1, \"launcher/admin-widget\"}"; md5sum ~/.shortcuts/aios-workspace-map.sh | awk "{print \$1, \"launcher/workspace-map-widget\"}"' | norm
}
repo_md5() {
    (cd "$REPO/fabric" && md5sum src/*.ts test/*.test.ts package.json public/js/* public/css/* public/aios.html public/sw.js public/manifest.json 2>/dev/null; md5sum "$REPO/scripts/start_hermes_os.sh" | awk '{print $1, "launcher/root"}'; md5sum "$REPO/scripts/start_hermes_os.sh" | awk '{print $1, "launcher/widget"}'; md5sum "$REPO/scripts/watchdog.sh" | awk '{print $1, "launcher/watchdog"}'; md5sum "$REPO/scripts/10-aios.sh" | awk '{print $1, "launcher/boot"}'; md5sum "$REPO/scripts/provision-fabric-gateway-key.sh" | awk '{print $1, "launcher/provision-widget"}'; md5sum "$REPO/scripts/aios-admin-console.sh" | awk '{print $1, "launcher/admin-widget"}'; md5sum "$REPO/scripts/aios-workspace-map.sh" | awk '{print $1, "launcher/workspace-map-widget"}') | norm
}

say "0) Telefona erisim"
$SSH "$PHONE" 'echo CANLI' >/dev/null 2>&1 || fail "Telefona ulasilamiyor (Tailscale? Termux sshd?)"
echo "erisim OK"

if [ "${1:-}" = "--check" ]; then
    say "Karsilastirma (degisiklik YAPILMIYOR)"
    phone_md5 > /tmp/_phone.md5
    repo_md5  > /tmp/_repo.md5
    if diff -q /tmp/_phone.md5 /tmp/_repo.md5 >/dev/null; then
        echo "✅ depo ve telefon BIREBIR AYNI ($(wc -l < /tmp/_repo.md5) dosya)"
    else
        echo "⚠ FARK VAR:"; diff /tmp/_phone.md5 /tmp/_repo.md5 || true
        echo
        echo "Telefonda elle degisiklik yapildiysa once geri cek:"
        echo "  scp -P 8022 -i \$KEY '$PHONE:~/fabric/src/*.ts' fabric/src/"
    fi
    exit 0
fi

say "1) Yedek (telefonda)"
$SSH "$PHONE" 'D=~/backup-$(date +%Y%m%d-%H%M%S); mkdir -p $D/css $D/test $D/shortcuts $D/boot && cp ~/fabric/src/*.ts ~/fabric/package.json ~/fabric/public/js/* ~/fabric/public/aios.html ~/fabric/public/sw.js ~/fabric/public/manifest.json ~/start_hermes_os.sh ~/watchdog.sh $D/ 2>/dev/null; cp ~/.shortcuts/start_hermes_os.sh ~/.shortcuts/provision-fabric-gateway-key.sh ~/.shortcuts/aios-admin-console.sh ~/.shortcuts/aios-workspace-map.sh $D/shortcuts/ 2>/dev/null; cp ~/.termux/boot/10-aios.sh $D/boot/ 2>/dev/null; cp ~/fabric/public/css/* $D/css/ 2>/dev/null; cp ~/fabric/test/*.test.ts $D/test/ 2>/dev/null; echo "$D ($(find $D -type f | wc -l) dosya)"'

say "2) Dagit"
$SCP "$REPO"/fabric/src/*.ts          "$PHONE":'~/fabric/src/'        >/dev/null || fail "src kopyalanamadi"
$SSH "$PHONE" 'mkdir -p ~/fabric/test' || fail "test dizini olusturulamadi"
$SCP "$REPO"/fabric/test/*.test.ts    "$PHONE":'~/fabric/test/'       >/dev/null || fail "test kopyalanamadi"
$SCP "$REPO"/fabric/package.json      "$PHONE":'~/fabric/'            >/dev/null || fail "package.json kopyalanamadi"
$SCP "$REPO"/fabric/public/js/*       "$PHONE":'~/fabric/public/js/'  >/dev/null || fail "js kopyalanamadi"
$SCP "$REPO"/fabric/public/css/*      "$PHONE":'~/fabric/public/css/' >/dev/null || fail "css kopyalanamadi"
$SCP "$REPO"/fabric/public/aios.html \
     "$REPO"/fabric/public/sw.js \
     "$REPO"/fabric/public/manifest.json "$PHONE":'~/fabric/public/'  >/dev/null || fail "kabuk dosyalari kopyalanamadi"
$SCP "$REPO"/scripts/start_hermes_os.sh "$REPO"/scripts/watchdog.sh "$REPO"/scripts/10-aios.sh "$REPO"/scripts/provision-fabric-gateway-key.sh "$REPO"/scripts/aios-admin-console.sh "$REPO"/scripts/aios-workspace-map.sh "$PHONE":'~/' || fail "kanonik baslaticilar kopyalanamadi"
$SSH "$PHONE" 'mkdir -p ~/.shortcuts ~/.termux/boot && cp ~/start_hermes_os.sh ~/.shortcuts/start_hermes_os.sh && cp ~/10-aios.sh ~/.termux/boot/10-aios.sh && cp ~/provision-fabric-gateway-key.sh ~/.shortcuts/provision-fabric-gateway-key.sh && cp ~/aios-admin-console.sh ~/.shortcuts/aios-admin-console.sh && cp ~/aios-workspace-map.sh ~/.shortcuts/aios-workspace-map.sh && chmod 700 ~/start_hermes_os.sh ~/watchdog.sh ~/.shortcuts/start_hermes_os.sh ~/.shortcuts/provision-fabric-gateway-key.sh ~/.shortcuts/aios-admin-console.sh ~/.shortcuts/aios-workspace-map.sh ~/.termux/boot/10-aios.sh' || fail "Widget/boot baslaticilari hazirlanamadi"
echo "kopyalandi (src + test + package.json + js + css + PWA kabugu + baslatici + watchdog + boot + provisioning widget)"

# Depoda olmayan bir dosya telefonda kalmis olabilir (orn. silinmis olu kod).
# B-8 (2026-08-17 bulundu, 2026-08-18 duzeltildi): onceden yalnizca src/*.ts
# kontrol edilir ve YALNIZCA UYARILIRDI, silinmezdi - Framework7 bundle'lari
# (vendor/ kapsam disi oldugu icin sessizce) ve js/components.css (md5
# dogrulamasini PATLATARAK) boyle telefonda ölü kaldi. Artik src/ + js/ + css/
# uzerinde kontrol edilir VE gercekten silinir (rsync --delete benzeri) -
# yalnizca bu betigin ZATEN yonettigi dizinlerde (vendor/icons'a DOKUNULMAZ).
say "3) Telefonda fazladan dosya var mi (src/js/css) - varsa SILINIR"
clean_extra() {
    local remote_dir="$1" local_dir="$2" pattern="$3"
    $SSH "$PHONE" "ls $remote_dir/$pattern 2>/dev/null" | xargs -n1 basename 2>/dev/null | sort > /tmp/_p.list
    (cd "$local_dir" && ls $pattern 2>/dev/null) | sort > /tmp/_r.list
    local extra
    extra=$(comm -23 /tmp/_p.list /tmp/_r.list)
    if [ -n "$extra" ]; then
        echo "$extra" | sed 's/^/  SILINIYOR: /'
        while IFS= read -r f; do
            # DIKKAT: remote_dir '~' ile basliyor - tek tirnak icine alinirsa
            # uzak shell tilde'yi GENISLETMEZ, rm sessizce hicbir sey silmez
            # (exit 0 ama etkisiz - bu hata canli testte YAKALANDI). Tirnaksiz
            # birakilir, uzak shell kendi tilde genislemesini yapar.
            [ -n "$f" ] && $SSH "$PHONE" "rm -f $remote_dir/$f"
        done <<< "$extra"
    fi
}
clean_extra '~/fabric/src' "$REPO/fabric/src" '*.ts'
clean_extra '~/fabric/public/js' "$REPO/fabric/public/js" '*'
clean_extra '~/fabric/public/css' "$REPO/fabric/public/css" '*'
echo "(temiz - fazla dosya kalmadi)"

say "4) Build"
$SSH "$PHONE" 'cd ~/fabric && npm run build 2>&1 | tail -2' | grep -q BUILD_OK || fail "BUILD basarisiz - dagitim yapildi ama sunucu yeniden BASLATILMADI"
echo "BUILD_OK"

say "4b) Sozlesme testleri (W4 kalicilastirmasi)"
# 2026-08-17: MCP'nin protokol-hatasi/isError ayrimi ve tools/list<->tools/call
# tutarliligi CANLI curl ile kanitlanmisti ama KALICI degildi - bir sonraki
# degisiklik sessizce bozabilirdi. fabric/test/*.test.ts artik her dagitimda
# CALISIR ve gecmezse dagitim BURADA durur (sunucu yeniden baslatilmaz).
TEST_OUT=$($SSH "$PHONE" 'cd ~/fabric && npm test 2>&1')
echo "$TEST_OUT" | tail -8
echo "$TEST_OUT" | grep -q "ℹ fail 0" || fail "sozlesme testleri BASARISIZ - dagitim durduruldu, sunucu yeniden baslatilmadi"
echo "testler gecti"

say "5) Yeniden baslat"
# ─── SSH ASKIDA KALMA DUZELTMESI (2026-08-17) ───
# Bu adim UC dagitimda ust uste takildi: sunucu GERCEKTEN yeniden basliyor
# (HTTP 200 doniyor) ama ssh oturumu kapanmiyordu, cunku arka plana atilan
# node sureci ssh kanalinin fd'lerini birakmiyor. `nohup`/`setsid`/`disown`
# ucu de tek basina yetmedi - kanalin kapanmasi icin ssh'in KENDI stdin/
# stdout/stderr'i de yonlendirilmeli (`-n` + </dev/null >/dev/null 2>&1).
# Ayrica: restart'in basarisi ssh'in donusuyle DEGIL, asagidaki HTTP 200
# kontroluyle olculur - o yuzden `timeout` ile sinirlayip devam ediyoruz.
timeout 25 $SSH -n "$PHONE" 'pkill -f "^node .*src/server\.ts"; sleep 1; cd $HOME/fabric && setsid nohup node --experimental-strip-types src/server.ts > $HOME/fabric.log 2>&1 < /dev/null &' </dev/null >/dev/null 2>&1 || true
sleep 7
CODE=$($SSH -n "$PHONE" 'curl -s -o /dev/null -w "%{http_code}" -m 5 http://127.0.0.1:9300/')
[ "$CODE" = "200" ] || fail "sunucu ayaga kalkmadi (HTTP $CODE) - log: ssh ... 'tail -20 ~/fabric.log'"
echo "sunucu 200"

say "6) DOGRULAMA (md5)"
phone_md5 > /tmp/_phone.md5
repo_md5  > /tmp/_repo.md5
diff -q /tmp/_phone.md5 /tmp/_repo.md5 >/dev/null \
  && echo "✅ depo == telefon ($(wc -l < /tmp/_repo.md5) dosya)" \
  || { diff /tmp/_phone.md5 /tmp/_repo.md5; fail "md5 uyusmuyor"; }

say "BITTI"
echo "Hatirlatma: davranis degisikligi CANLI bir cagriyla kanitlanmadan 'bitti' sayilmaz."
