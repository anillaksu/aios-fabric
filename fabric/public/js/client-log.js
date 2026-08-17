/* AI-OS · ISTEMCI HATA BILDIRIMI (2026-08-18, sessiz catch denetimi)
   ───────────────────────────────────────────────────────────────
   Neden var: W6.L'nin ilk canli testinde onbellek yazmasi (putCached)
   sessizce basarisiz oldu, kimse gormedi - "ikinci sefer de bekledi"
   raporundan sonra teshis, tarayici konsoluna erisim OLMADAN (uzantı
   bagli degildi) gunlerce surebilirdi. Owner'in talimati: "hatalari
   sessizce yutan HERHANGI bir yer kabul edilemez."

   Bu fonksiyon HEM console.error HEM sunucudaki /client-error ucunu
   (journal'a yazar) kullanir - boylece bir hata, konsola erisim olmasa
   BILE curl ile journal okunarak gorulebilir (bu oturumda defalarca
   kullanilan, GERCEKTEN erisilebilir bir yol). */
export function logClientError(context, err) {
  const message = err && err.message ? err.message : String(err);
  console.error(`[${context}]`, err);
  try {
    fetch("/client-error", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ context, message: message.slice(0, 300) }),
    }).catch(() => {}); // bildirim ucunun kendisi basarisiz olursa yapacak baska bir sey yok - console.error zaten yazildi
  } catch { /* fetch/JSON.stringify cok nadir atabilir - console.error yeterli, sonsuz dongu olusturma */ }
}
