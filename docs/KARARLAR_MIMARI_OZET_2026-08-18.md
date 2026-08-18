# MİMARİ KARARLAR — KONSOLİDE ÖZET (2026-08-18)

**Bu dosya yeni karar İÇERMEZ.** Owner'ın bu oturumda verdiği, önceden
netleşmiş kararların kapsamlı bir özeti — dağınık halde `CHECKLIST.md`,
`PLAN_W6_app-shell.md` ve `MIMARI_TEMEL.md` içinde geçen kararları TEK
yerde toplar, gelecek oturumların hepsini yeniden kazmasına gerek kalmasın
diye. **Çelişki olursa o üç dosya kazanır** (özellikle `CHECKLIST.md` —
tek doğruluk kaynağı budur, bu dosya değil).

---

## W6 temel kararları (KARAR-1/2/3)

1. **KARAR-1 — Telefon yüzeyi: Hibrit.** Ana ekran ızgara/pano; widget
   açılınca tam ekran odaklı yüzey. Masaüstü tarzı üst üste binen pencere
   yok. `WindowManager` yüzeyden bağımsız — başka bir surface (örn.
   masaüstü) sonradan eklenebilsin diye.
2. **KARAR-2 — Katman B (serbest kod) varsayılanı: `ask`.** İlk çalıştırma
   onay ister; aynı artefakt + aynı capability kapsamı tekrar kullanılınca
   tekrar sorulmaz. Kapsam genişlerse yeniden onay gerekir. Onay,
   artefakt/hash + capability kapsamıyla ilişkilendirilir.
3. **KARAR-3 — Model değişmiyor.** `llm_bridge` zaten ChatGPT hesabına
   gidiyor (harici), provider/model abstraction için şimdilik sebep yok.
   OmniRoute (`aether://project/omniroute`) hazır olunca yönlendirme oraya
   taşınabilir — ayrı proje, ayrı zaman çizelgesi.

## Artifact modeli

4. **Artifact = yeniden birleştirilebilir çalışma birimi**, son seviye
   değil: artifact → daha büyük artifact → application → composite
   application → workspace/system şeklinde ilerleyebilir.
5. **Artifact yalnız UI değildir** — UI/Action/Data/Workflow/Automation/
   Device/Application sınıfları ileride aynı composability modeline
   bağlanabilir (henüz kodlanmadı, kavramsal çerçeve).
6. **Ephemeral Execution Graph ≠ Persistent Artifact.** Geçici execution
   önce çalışır; her execution kalıcı olmak zorunda değil. Terfi sistemi
   şimdilik ağır bir compiler/promotion engine olarak KURULMAYACAK.
7. **Artifact Compiler/Optimizer ertelendi** (silinmedi) —
   `PLAN_W6_app-shell.md §W6.5d`. Tetikleyiciler: artefakt sayısı 200+,
   ölçülebilir structural repetition, multi-device/multi-user ölçek. Ucuz/
   gerçek değerli üç parça şimdi alındı: exact dedup (W6.L), structure+
   parameters ayrımı (W6.L'ye eklendi, henüz L1'de yok), capability
   minimal closure (W6.W, kapandı).
8. **Structure + Parameters ayrımı** hedefleniyor ama bugünkü ölçekte
   büyük bir compiler altyapısına çevrilmiyor (madde 7 ile aynı gerekçe).
9. **Capability minimal closure** — artefakt bildirilen değil GERÇEKTEN
   kullandığı capability'leri taşır. `usedActionTypes()`/`admitArtifact()`
   ile W6.W olarak kapandı.

## Composability

10. `CanCompose(A,B)` tek başına yeterli değil — bağlama/policy bağlı:
    `CanCompose(A,B,Γ,Π)`. Uyumluluk boyutları: Schema, Capability,
    Policy, Lifecycle, Version.
11. **Bu formül şu an kod fonksiyonu DEĞİL.** Gerçek bir A/B composition
    senaryosu ortaya çıkmadan boş bir `CanCompose()` yazılmayacak.
12. **Yeni wire protocol yok.** JSON-RPC 2.0 temel mesaj dili;
    `postMessage` yalnız binding/transport. A2A/MCP/CloudEvents/W3C Trace
    Context kendi semantiklerini korur.
13. **AETHER execution sahibi değil.** Execution sahibi `dispatcher.
    dispatch()`. AETHER'ın rolü governance/approval/policy/promotion.
    AIOS, AETHER olmadan offline çalışabilmeli; AETHER erişilemezken
    execution durmamalı.

## W6 App Shell (A–K, kod durumuyla birlikte)

14. **A — Zero-token navigation.** Menü/sekme/pencere aç-kapa local
    deterministic, LLM'e gitmez. *(kod: `app.js:243` — büyük ölçüde var)*
15. **B — WindowManager yüzeyden bağımsız**, DOM'a dokunmaz, lifecycle/
    focus/state yönetir, grid bilgisi doğrudan gömülmez. *(FACT)*
16. **C — Model tüm sayfayı üretmez**, shell sabit kalır, yalnızca ilgili
    pencerenin içi üretilir. *(FACT)*
17. **D — Mikro-artifact.** Tüm sayfa yerine tek widget. *(REVIEW-
    VERIFIED — 12 bölüm sert tavan var ama prompt'ta açık kısıt yok)*
18. **E — Sandbox.** Serbest kod için iframe sandbox + postMessage, yeni
    wire protocol yok, Worker ile karıştırılmaz. *(TARGET, Katman B'ye
    bağımlı)*
19. **F — IndexedDB.** M-9 ile: server → primary, IndexedDB → offline/
    hızlı-açılış önbelleği. *(FACT — göç + temel okuma/yazma)*
20. **H — Dar context.** Widget'a yalnızca gerekli veri gider, tüm sohbet
    geçmişi taşınmaz; `YENİLE` narrow context ile çalışır. *(TEST-
    VERIFIED)*
21. **I — Framework7 kaldırıldı**, native Web Platform. *(FACT, ~%90
    shell küçülmesi ölçüldü)*
22. **J — Modern Web Platform.** Web Components, Container Queries, View
    Transitions — framework ancak gerçek ihtiyaçla. *(TARGET)*
23. **K — Worker.** Worker → compute/transform/parse; privileged
    capability → dispatcher/policy; üç yol ayrı: `UI → native/sandbox` ·
    `compute → Worker` · `privileged action → dispatcher/policy`.
    **✅ FACT (2026-08-18, bu oturumda kapandı)** —
    `public/js/{artifact-parse,parse-worker,parse-client}.js`, bkz.
    `CHECKLIST.md` W6.K.

## W6.L — Prompt cache (zaten FACT, kararların özeti)

24. İlk normalizasyon muhafazakâr: lowercase + Unicode NFKC + whitespace
    sadeleştirme, **dolgu kelimesi silme yok** (yanlış pozitif riski).
25. Cache key dört bileşenli: normalized prompt · capability+risk seti ·
    registry version · model profile.
26. Context'li (history taşıyan) konuşmalar cache'lenmez — yalnızca
    narrow/geçmişsiz çağrılar.
27. Cache hit `prompt.cache.hit` olarak journal'a düşer, ölçülebilir.
28. **Sessiz hata yutma kabul edilemez** — her `catch` ya loglar ya
    gerekçesini açıkça yazar (bu oturumda 34 örnek bulunup düzeltildi).

## Güvenlik/Policy

29. `risk:safe` ≠ authorization — risk sınıfı ile permission/scope/policy
    ayrı kavramlar, discovery filtresi güvenlik sınırı değildir.
30. `tools/list` ile `tools/call` AYNI policy gerçeğini kullanır
    (`isMcpExposed()`, W4).
31. **LLM authority değil.** Model önerir, AIOS doğrular/yetkilendirir,
    runtime yürütür.
32. Execution graph policy-aware olacak (node/capability bazında
    sınırlandırma) — sandbox/dispatcher/capability katmanları ayrı kalır.

## Henüz karar verilmemiş / owner onayı ya da Katman B bekleyen

W6.G (artifact→application), W6.N (pub/sub izin modeli), W6.O (widget
kalıcı veri sahipliği), W6.P (paylaşılan state politikası), W6.R/U
(sürüm geri alma / erişilebilirlik), W6.V (performans bütçesi), W6.Y
(serbest kodun statik denetimi), W6.Z (AETHER governance kaydı), W6.E/
S-8 (Katman B sandbox ayrıntıları), agresif semantic cache, büyük
Artifact Compiler/DAG/GC/promotion engine. **Bunların ertelenmesi
eksiklik değil, bilinçli karar** — otonom tahmin yürütülmeyecek, owner'a
sorulacak.

## Ortak mimari kural (en kısa hali)

> LLM yeni dünya kurmaz; mevcut contract'lı yapı taşlarından öneri yapar.
> AIOS bunu doğrular, policy'den geçirir, deterministic runtime'da
> çalıştırır, journal'a bağlar ve ancak kanıtlandığında yeniden
> kullanılabilir bir artifact olarak değerlendirir.

Değişmez filtre sırası: **Fütürizm → Maliyet → Kanıt → Standart → Öz alma.**
