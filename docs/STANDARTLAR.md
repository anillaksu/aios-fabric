# STANDARDİZASYON TEMELİ

**2026-08-17 · "Yeni bir şeyi yoktan var etmek diye bir şey yok; her şeyin bir başlangıcı vardır, öz alınabilecek."**

Bu belge, AI-OS Fabric'in hangi mevcut standartların üzerine oturduğunu ve hangi
noktalarda kendi formatını icat ettiğini gösterir. İlke: **kendi format icat etmek
son çare, standarda uymak varsayılan.**

---

## 0. Kabul edilen ilkeler (Anıl, 2026-08-17)

1. **Koddan kanıtlanmayan doğru kabul edilmez.**
2. **Kanıttan türetilmeyen kodlanamaz.**
3. **Standardizasyon temel alınmayan çökmeye mahkûmdur.**
4. **Yoktan var etme yoktur — her şeyin öz alınabilecek bir başlangıcı vardır.**

---

## 1. Kıyaslama tablosunun kod denetimi

Sunulan rakip kıyaslama tablosu (Open-Canvas / Native-AI App Shell / Bolt.new)
"bizim sütunu" için beş iddia taşıyordu. İlke 1 gereği hepsi koda soruldu:

| Tablodaki iddia | `grep` sonucu | Gerçek |
|---|---|---|
| "Tam Karantina — Web Worker / Sandbox + PostMessage" | `postMessage` **0** · `new Worker` **0** · `sandbox` **0** | ❌ Bugün **hiç izolasyon yok** |
| "IndexedDB ile şablon saklama + sıfır token" | `indexedDB` **0** | ❌ Bugün `localStorage` (`app.js:34`), 30 kayıt sınırlı (`app.js:43`) |
| "Çapraz etkileşim — kartlar arası PostMessage" | **0** | ❌ Yok |
| "Grid/Pano + dikey iç düzen" | `mount()` → `container.innerHTML=""` (`renderer.js:118`) | ❌ Tek ekran, pencere katmanı yok |
| "Sohbetten bağımsız PWA" | `manifest.json` + `sw.js` var; artefakt üretimi `ask()` üzerinden | ⚠️ PWA gerçek, "sohbetten bağımsızlık" değil |

**Sonuç:** tablo bizim *hedefimizi* bugünkü *gerçeğimiz* gibi gösteriyor. W6 tamamlanana
kadar bu sütun bir **iddia**, kanıt değil. Rakip sütunları ise doğrulanamaz — onların
koduna erişimimiz yok, dolayısıyla ilke 1 gereği o satırlar da veri sayılmaz.

**Bu tablonun tek meşru kullanımı:** kendimize hedef koymak. Kıyaslama olarak kullanmak
ilke 1'i çiğner.

---

## 2. Standardizasyon haritası — neyin üzerine oturuyoruz

| Bizdeki yapı | Karşılık gelen standart | Durum | Aksiyon |
|---|---|---|---|
| `capability` (38 adet, `execute(payload)`) | **MCP** — `tools/list`, `tools/call` | Kendi formatımız | W4: MCP sunucusu olarak yayınla |
| Peer delegasyonu | **A2A v1.0** (JSON-RPC 2.0) | Kısmi uyum | W2: canonical Agent Card + task lifecycle |
| `Intent Envelope` `{source, raw, understood}` | **JSON-RPC 2.0** zarfı | Kendi formatımız | W5: zarfı JSON-RPC'ye hizala |
| `journal` olayları `{seq,id,ts,type,correlationId,causationId,payload}` | **CloudEvents** (CNCF) | Çok yakın, isimler farklı | Eşleme katmanı — `type`/`id`/`time`/`source`/`subject` |
| `correlationId` / `causationId` | **W3C Trace Context** (`traceparent`) | Aynı fikir, farklı ad | A2A çağrılarında `traceparent` taşı → dağıtık izleme standart olur |
| `ScreenSpec` (JSON UI) | **Adaptive Cards** (açık spec) · MCP UI resource | Kendi formatımız | W6: bileşen adlarında öz al; MCP resource olarak yayınla |
| `risk: safe\|notify\|ask` | **OAuth 2.0 scope** · **Permissions-Policy** deseni | Kendi formatımız | Kavramsal hizalama yeter |
| PWA kabuk | **Web App Manifest** (W3C) | ✅ Uyumlu | Koru |
| Widget izolasyonu | **HTML `iframe sandbox`** · **CSP** · **ShadowRealm** (TC39) | Henüz yok | W6.K |
| Widget ↔ kabuk köprüsü | **JSON-RPC 2.0 over postMessage** | Henüz yok | W6.4 — aşağıya bak |
| Bileşen modeli | **Custom Elements v1** (W3C) | Henüz yok | W6.J |

---

## 3. Tek protokol dili, üç sınır

En önemli bulgu: **zaten JSON-RPC 2.0 konuşuyoruz** (A2A, `server.ts:217`). Widget köprüsü
için yeni bir protokol icat etmeye gerek yok — aynı zarf, farklı taşıyıcı:

```
        ┌─────────────────────── JSON-RPC 2.0 ───────────────────────┐
        │                                                             │
  Uzak ajan ──HTTP──► A2A          Widget ──postMessage──► Kabuk      │
  (PC, LangChain,     (W2)         (sandbox/Worker)        (W6.4)     │
   CrewAI, ADK)                                                       │
                                   Dış istemci ──HTTP──► MCP (W4)     │
        └─────────────────────────────────────────────────────────────┘
```

Bu, Language Server Protocol'ün deseni (JSON-RPC over stdio) ve MCP'nin temeli ile
birebir aynı. Üç sınırda tek dil konuşmak, "yeni format icat etmemek" ilkesinin
somut karşılığıdır.

---

## 4. "Yeni bir standart çıkar" iddiasının gerçekçi hali

Yeni bir standart **icat etmek** ile bir standardın **referans uygulaması olmak** farklı
şeylerdir. İlke 4 ikincisini söylüyor ve gerçekçi olan da o:

- MCP bir **araç erişim** standardı — ama cihaz capability'leri için referans bir
  mobil uygulaması yok
- A2A bir **ajanlar arası** standart — ama telefon üzerinde çalışan bir uç yok
- Adaptive Cards bir **sunucu güdümlü UI** standardı — ama cihaz eylemlerine bağlı değil

**Boşluk şurada:** bu üçünü *aynı cihazda*, *risk kapısıyla*, *kalıcı journal üzerinde*
birleştiren bir katman yok. Değer yeni bir format icat etmekte değil, bu birleşimin
**çalışan ilk örneği** olmakta. Kanıtı da spesifikasyon değil, çalışan sistem olur.

---

## 5. Bu belgeden checklist'e giren maddeler

- **S-1** CloudEvents eşlemesi — journal olayları standart zarfa çevrilebilsin
- **S-2** W3C Trace Context — A2A çağrılarında `traceparent` taşınsın
- **S-3** ScreenSpec ↔ Adaptive Cards öz alımı — bileşen adları ve `body`/`actions` ayrımı
- **S-4** Widget köprüsü **JSON-RPC 2.0 over postMessage** olsun (yeni protokol icat edilmesin)
- **S-5** ScreenSpec'ler MCP **resource** olarak yayınlansın — dış istemciler de render edebilsin
- **S-6** Kıyaslama tablosundaki iddialar W6 bitene kadar **hedef** olarak etiketli kalsın
