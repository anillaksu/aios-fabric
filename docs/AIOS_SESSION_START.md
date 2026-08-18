# AIOS / aios-fabric — SESSION START (her ajan, her oturum)

> Repository = memory. Önce handoff'u oku, sonra kaynakları doğrula. Session
> hafızasına güvenme. Kanıtlanmayanı FACT kabul etme. Mevcut kararı yeniden
> icat etme. Owner kararını tahmin etme. Canlı test öncesi B-9 runtime
> kontrolü yap. Önce araştır, sonra minimum değişiklik.

Bu, Claude/Codex/başka herhangi bir ajan için **tek kanonik başlangıç
noktasıdır**. Önceki bir oturumun anlatımı, chat geçmişi ya da model
hafızası — DOĞRULAMA KAYNAĞI DEĞİLDİR. Aşağıdaki sırayla ilerle.

## 1. Oku (bu sırayla, önceki adım sonrakini doğrulamadan geçme)

1. `docs/AIOS_HANDOFF_CURRENT.md` — özet/index, buradan başla
2. `docs/CHECKLIST.md` — **tek doğruluk kaynağı**, madde bazlı durum
3. `docs/MIMARI_TEMEL.md` — mimari ilkeler değişmediyse atla, değiştiyse oku
4. `docs/STANDARTLAR.md` — S-maddeleriyle çalışacaksan oku
5. en son `docs/OTURUM_*.md` (dosya adı tarihe göre en büyük olan) — o günün ham kronolojisi
6. `git status` + `git rev-parse HEAD` + `git log --oneline -10`

**Çelişki bulursan:** kod/repository kanıtı kazanır, anlatı kaybeder.
Çelişkiyi kullanıcıya raporla, kendi başına "düzelt" ve sessizce geç.

## 2. Doğrula (kod, iddia değil)

- Handoff'ta bir capability/fonksiyon/endpoint adı geçiyorsa, dosyada
  gerçekten var mı grep'le. Yoksa handoff bayatlamış — kullanıcıya söyle.
- `npm test` (fabric/) çalıştır, sayıyı handoff'takiyle karşılaştır.
- B-9 KONTROLÜ — herhangi bir canlı/telefon testinden ÖNCE zorunlu:
  ```bash
  KEY="$HOME/Desktop/Telefon_AI_Agent_Session_2026-08-16/keys/phone_termux_key"
  ssh -p 8022 -i "$KEY" u0_a322@100.75.177.88 'ps -ef | grep -E "uvicorn|hermes gateway|node.*server.ts|watchdog" | grep -v grep'
  ```
  Dördü de yoksa: `nohup bash ~/start_hermes_os.sh > ~/start_hermes_os.out 2>&1 & disown`

## 3. Değişmez ilkeler (uygula, tartışma)

FÜTÜRİZM · MALİYET · KANIT İLKESİ (FACT›TEST-VERIFIED›REVIEW-VERIFIED›TARGET)
· STANDART TEMELİ (yeni protokol icat etme) · ÖZ ALMA. Tam metin:
`AIOS_HANDOFF_CURRENT.md` § "DEĞİŞMEZ AIOS İLKELERİ".

LLM authority değildir · `dispatcher.dispatch()` tek execution kapısı ·
AETHER execution sahibi değildir · sessiz hata kabul edilmez · owner ürün
kararı tahmin edilmez · büyük altyapı ölçek kanıtı olmadan kurulmaz.

## 4. Çalış

- Önce mevcut kod/standart kontrol edilir, sonra yazılır.
- Belirsiz bir ürün kararıysa (UI yeri, kapsam, öncelik) **sor**, tahmin etme.
- Her "bitti" iddiası: `BUILD_OK` + testler geçti + mümkünse canlı tek
  çağrıyla kanıt. Kanıt yoksa TEST-VERIFIED/REVIEW-VERIFIED de, FACT deme.

## 5. Kapat

Oturum sonunda üçü de güncel olmalı:

- `docs/CHECKLIST.md` (madde durumları)
- `docs/AIOS_HANDOFF_CURRENT.md` (CURRENT FACTS / OPEN DECISIONS / BLOCKED
  ITEMS / OPERATIONAL RISKS / NEXT SAFE ACTION bölümleri)
- `docs/OTURUM_YYYY-MM-DD.md` (o günün kaydı; varsa aynı günün dosyasına ekle)

Commit at, mesaj neyin neden değiştiğini anlatsın (owner "detaylı yaz" dedi).
