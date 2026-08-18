# AIOS Admin Workspace — Ürün Öncelik Kaydı

Bu dosya, AIOS'un Termux/başlatıcı yüzeyi ile Phone Workspace yüzeyini
tek bir kullanıcı deneyimi olarak büyütürken izlenecek çalışma kaydıdır.
Amaç küçük teknik menüler biriktirmek değil; cihaz sahibinin **gördüğü,
anladığı ve yönettiği** gerçek AIOS yüzeylerini birbirine bağlamaktır.

Bu dosya karar özeti değildir. Her dilim önce aşağıdaki kaynaklardan kod
kanıtı alır; sonra test, telefon dağıtımı ve görünür kabul gelir.

## Değişmez sınırlar

- LLM önerir; execution, policy ve approval otoritesi değildir.
- UI eylemi → envelope → `dispatcher.dispatch()` → policy → capability.
- `/read` yalnız `risk:safe + readOnly` dar read facade'ıdır.
- AETHER continuity/governance katmanıdır; execution sahibi değildir.
- Yeni RPC, yeni wire protocol, Layer B, pub/sub, generic state store,
  compiler/DAG veya ekonomi bu işin parçası değildir.
- FACT = commit + ilgili test + telefon canlı kanıtı. Kanıt yoksa
  TEST-VERIFIED veya TARGET yazılır.

## Önce okunacak gerçek kaynaklar

1. `docs/CHECKLIST.md` — kanıt seviyesi ve açık işler
2. `docs/MIMARI_TEMEL.md` — otorite ve UI sınırları
3. `docs/STANDARTLAR.md` — Web Platform/standard karşılıkları
4. `fabric/public/js/app.js` — shell, tablar, artifact/application açılışı
5. `fabric/public/js/screens.js` — HOME, KEŞFET, yönetim ekranları
6. `fabric/public/js/navigation-state.js` — back/history davranışı
7. `fabric/public/js/workspace-catalog.js` — deterministic keşif modeli
8. `fabric/public/js/application-model.js` — ApplicationEntry kimliği/lifecycle
9. `fabric/public/js/artifact-store.js` ve `artifact-contract.js` — artefact
   kalıcılığı ve sözleşme
10. `fabric/public/js/renderer.js`, `registry.js`, `reference-artifacts.js` —
    Layer A gerçek UI kapasitesi
11. `fabric/src/capabilities.ts`, `dispatcher.ts`, `approval.ts`, `journal.ts`,
    `server.ts` — gerçek cihaz eylemi, izin, kanıt ve veri uçları
12. `fabric/test/workspace-catalog.test.ts`, `navigation-state.test.ts`,
    `application-model.test.ts`, `design-tokens.test.ts` — bugün korunan
    kullanıcı davranışları
13. `scripts/start_hermes_os.sh`, `scripts/watchdog.sh`,
    `scripts/deploy-to-phone.sh` — yönetici/operasyon yüzeyinin gerçek sınırı

## Öncelik sırası

### P0 — Mevcut deneyimi doğru envanterle

Koddan, her kullanıcıya görünen ve yönetilebilen yüzeyi tek tabloda çıkar:

- HOME / KEŞFET / ARTIFACT / AKTİF / HERMES / Control Center
- kategori, arama, son kullanılanlar, sabitlenenler, ApplicationEntry
- artefact yaşam döngüsü ve referans uygulamalar
- cihaz, medya, ağ, sistem ve AIOS read/action yüzeyleri
- görev, journal, retry, approval, hata ve loading durumları
- Termux başlatıcı, B-9 servis sağlığı, log ve kurtarma yüzeyi

Çıktı: var olan şey, kullanıcı yüzeyinde görünmeyen şey ve eksik bağlantı
ayrı listelenir. Bu liste olmadan yeni menü/console yazılmaz.

### P1 — Tek kullanıcı zihinsel modeli

Kullanıcı için roller ayrıştırılır, fakat kopmaz:

```
AIOS PWA / Phone Workspace
  HOME       günlük çalışma alanı
  KEŞFET     işlev ve uygulama keşfi
  UYGULAMA   ApplicationEntry → artifact deneyimi
  YÖNETİM    görevler, izinler, servis sağlığı, kurtarma
  HERMES     yeni yetenek isteme
```

Termux Admin Terminal bu modelin dar, operatör düzeyi girişidir; PWA'nın
yerine geçmez. Hangi gerçek durumların burada ve hangi durumların PWA
YÖNETİM yüzeyinde olacağı, P0 kod envanterinden sonra belirlenir.

### P2 — Yönetim yüzeyini kanıtlı verilerden kur

Yeni yönetim yüzeyi yalnız aşağıdaki kanıtlı kaynaklardan veri gösterir:

- Fabric / llm_bridge / Hermes gateway / watchdog anlık sağlık
- journal görevleri, başarısızlık ve retry
- approval/İZİNLER
- artefact ve ApplicationEntry yaşam döngüsü
- deploy eşitliği / son doğrulama sonucu
- gerçek capability registry ve risk açıklamaları

Her kart için `loading → ready | empty | error` davranışı, kullanıcıya
anlaşılır geri dönüş ve ilgili doğru eylem gerekir. Sahte "online", sahte
metadata veya logdan türetilmemiş yönetim iddiası yasaktır.

### P3 — Başlatıcı deneyimini ürün yüzeyine bağla

Termux:Widget açılışında boş ekran yerine anında anlaşılır durum görülmeli.
Ancak kalıcı tasarım, P2 veri haritası tamamlanmadan küçük sabit menü
olmayacaktır. Hedef davranış:

- başlatma evresi ve gerçek servis durumu
- AIOS'a geçiş
- hata varsa açıklama ve güvenli kurtarma seçeneği
- operatör için kanıtlı durum/log erişimi
- günlük kullanıcı için AIOS PWA'ya engelsiz geçiş

`7c82efc` içindeki ilk terminal menüsü yalnız **TEST-VERIFIED geçici
prototiptir**; P0–P2 tasarımının kabul edilmiş ürünü değildir ve FACT
sayılmaz.

### P4 — Bütün akışı telefonda kanıtla

Kabul senaryosu:

1. Widget → anlaşılır başlatma/yönetim görünümü.
2. HOME → kategori → ApplicationEntry → artefact → back.
3. KEŞFET kısa Türkçe arama → doğru mevcut uygulama.
4. Gerçek cihaz eylemi → dispatcher/policy/journal sonucu.
5. Approval gereken eylem → insan onayı → sonuç/revoke davranışı.
6. Başarısız servis/veri → açık hata + doğru kurtarma yönü.
7. AIOS yeniden açılışı → kalıcı artefact/application ve deterministik
   davranış korunur.

Her kabulden sonra commit, test/build, telefon dağıtımı ve canlı kanıt aynı
dilimde kaydedilir.

## Şimdi yapılacak iş

P0 kod envanteri tamamlanacak; ardından P1 için en küçük **yeterli** yönetim
ve Workspace yüzeyi belirlenecek. Component veya terminal komutu, ancak bu
envanterde karşılığı ve kullanıcı akışında yeri varsa yazılacaktır.
