# AIOS İlişki Yüzeyi — Çalışma Kaydı

Bu çalışma Hermes adlı prototip sohbetini, kullanıcıyı yalnız komut yazan biri
olarak değil, AIOS ile birlikte oluşum üreten bir kişi olarak karşılayan yüzeye
dönüştürür. Hedef yapay bir kişilik veya sahte hatıra değildir. Hedef,
kullanıcının **gerçek tercihleri, gerçekleştirdiği işler ve doğrulanmış
oluşumları** üzerinden geri yansıma yapan kalıcı bir ilişki deneyimidir.

## Görünen kimlik kararı — 2026-08-19

Kullanıcıdaki ilişki, devamlılık ve yeni oluşum yüzeyinin kanonik adı
**Linhx**'tir. `Hermes` yalnız model/gateway/servis altyapısının teknik adı
olarak kalır; kullanıcı bunun için Hermes adına veya teknik model adına maruz
kalmaz. Bu ad değişimi execution, capability, policy ya da A2A kimliğini
değiştirmez.

Linhx bir rol yapma ya da kullanıcıdan gizli psikolojik profil değildir:
gösterdiği her devamlılık işareti mevcut artifact, ApplicationEntry, journal
ve kullanıcının açık seçimiyle doğrulanabilir olmalıdır.

## Koddan doğrulanan başlangıç

| Alan | Kod karşılığı | Kanıt seviyesi | Kullanıcı etkisi |
|---|---|---|---|
| Sohbet mesajları | `app.js:chat` | REVIEW-VERIFIED | yalnız RAM; yeniden açılışta kaybolur |
| Model bağlamı | `ask()` son 7 metin, `capabilities.ts` son 8 mesaj | REVIEW-VERIFIED | oturum içi kısa bağlam; kalıcı ilişki değil |
| Artefakt | sunucu birincil `artifact-store.js` + `/artifacts` | FACT zinciri mevcut | oluşturulan iş tekrar açılır |
| ApplicationEntry | `application-model.js` + `/applications` | TEST/FACT zinciri ayrı | tekrar kullanılan launcher kimliği |
| Gerçek eylem izi | SQLite WAL `journal.ts` | FACT | tamamlanan/başarısız işler kanıtlanabilir |
| Formation kökü | `formation-memory.js` | TEST-VERIFIED | deterministik oluşum kimliği; canlı derived akış yok |
| Keşfet | `workspace-catalog.js` | FACT | deterministik işlev/uygulama bulma, ilişki kurma değil |
| Hermes sistem promptu | `prompt.ts` | REVIEW-VERIFIED | cihaz asistanı/artefakt üreticisi; kişisel hafıza sözleşmesi yok |

## Değişmez sınırlar

- LLM kişisel hafıza, gerçek eylem, approval veya FACT otoritesi değildir.
- "Seni hatırlıyorum" yalnız persistence ve kaynak açıkça gösterilebiliyorsa
  söylenebilir.
- Journal hassas payload/sonucu redakte eder; ilişki yüzeyi redaksiyonu delmez.
- Kullanıcının serbest sohbet metni, açık izin/retention/delete sözleşmesi
  olmadan kalıcı profile dönüştürülmez.
- UI eylemi yine envelope → dispatcher → policy → capability zincirindedir.
- Yeni wire protocol, Layer B, semantic similarity identity, ekonomi veya
  AETHER execution eklenmez.

## Kullanıcı deneyimi katmanları — önem sırası

### R0 — Dürüst devamlılık

Kullanıcı açtığında üç soru anında cevaplanmalı:

1. Son birlikte ne oluştu?
2. Şu anda AIOS'ta ne canlı/yarım/bekleyen?
3. Nereden devam edebilirim?

Kaynak yalnız artefakt/ApplicationEntry, görev/journal, approval ve gerçek
runtime durumudur. Bu katman yeni kişisel veri deposu gerektirmez.

### R1 — Karşılıklı konuşma hissi

Sohbet yalnız boş input + öneri listesi olmamalı:

- kullanıcı mesajı, sistemin anladığı iş ve oluşan sonuç görsel olarak
  birbirine bağlanmalı;
- bir artefakt, uygulama veya görev sonucu konuşmaya geri bağlanmalı;
- "oluştur", "aç", "doğrula", "devam et" aynı ilişki akışında kalmalı;
- hata, modelin mazereti değil açık sistem durumu ve sonraki doğru eylem
  olarak görünmeli.

Bu katmanda LLM metni ilişki hissi taşıyabilir; ancak iddialar R0 kanıtına
dayanır.

### R2 — Kullanıcının kendi gelişim aynası

İlgi veya yönelim ancak şu açık kaynaklardan türetilir:

- kullanıcının sabitlediği/açtığı ApplicationEntry'ler,
- kalıcı artefakt başlıkları ve capability contract'ları,
- kullanıcı tarafından açıkça kaydedilmiş tercih/kural.

İz kaynağı, zaman aralığı ve silme denetimi görünür olmalıdır. Modelin
çıkarımı tek başına preference değildir.

### R3 — İlişki hafızası (owner + gizlilik kararı gerekir)

Serbest sohbetten kalıcı tercih/amaç çıkarma; saklama süresi, yerel/sunucu
konumu, dışa aktarım, silme ve kullanıcı onayı olmadan yazılmaz. Bu çalışma
R0/R1'i tamamlamadan açılmaz.

## Keşfet'in rolü

KEŞFET, insanın AIOS ile bağ kurduğu **işlev/oluşum keşif yüzeyidir**:

```
İhtiyaç veya kısa kelime
  → deterministik kategori / mevcut uygulama / mevcut artefakt
  → aç ve kullan
  → yoksa İlişki Yüzeyinde yeni oluşum iste
  → doğrulanmış artefakt/ApplicationEntry
  → HOME ve KEŞFET'te yeniden bulunabilirlik
```

KEŞFET model tabanlı "beni anladı" araması değildir. Kısa Türkçe metadata
eşleşmesi, artifact/application başlığı ve kanıtlı capability görünürlüğü
korunur. İlişki Yüzeyi üretim ve anlamlandırma kapısıdır; KEŞFET tekrar
kullanım/bağlantı kapısıdır.

## İlk kod dilimi

R0 için mevcut kalıcı gerçeklerden saf bir `continuity projection` çıkar:

- son açılan ApplicationEntry,
- son artefakt ve formation kökü varsa kimlik,
- pinlenen işler,
- aktif/başarısız görev özeti,
- geçerli insan onayları,
- canlı runtime durumu.

Bu projection yalnız veri gösterir ve mevcut yüzeylere gider. Yeni profile,
kişilik puanı, ilgi tahmini, sohbet kaydı veya LLM çağrısı üretmez.

## Kabul kanıtı

1. Aynı artifact/application yeniden açıldığında ilişki yüzeyi bunu gerçek
   kalıcı kaynaktan gösterir.
2. Yeni görev/başarısızlık/approval yüzeye gerçek veri olarak yansır.
3. Kaynak yoksa boş durum açıkça görünür; geçmiş veya ilgi uydurulmaz.
4. KEŞFET'te kısa arama mevcut uygulama/artefakta gider; LLM çağrısı gerekmez.
5. Yeni oluşum isteği İlişki Yüzeyi → Hermes gateway → artefakt contract →
   persistence hattından geçer; execution yine dispatcher/policy'dedir.
6. Telefon canlı kabulü olmadan FACT yazılmaz.
