// Premium audit bulgusu (2026-08-20, ikinci iterasyon): api.js:getJSON ag/fetch
// hatasinda sessizce `null` doner. capabilitiesScreen/journalScreen/
// automationsScreen/intentHistoryScreen bunu `|| []`/`|| {}` ile varsayilan
// degere indirgeyip GERCEKTEN BOS veri ile FETCH BASARISIZ OLDU durumunu
// gorsel olarak ayirt etmiyordu - kullanici "capability yok" ile "Fabric'e
// ulasilamiyor" arasindaki farki goremiyordu (goal §5/§18). connectionsScreen
// ve managementScreen'de bu ayrim zaten dogru yapiliyordu; bu test o deseni
// diger okuma ekranlarina da tasiyan degisikligi dogrular - hem YANLIS
// NEGATIF (fetch basarisizken hala "bos" gosterme) hem YANLIS POZITIF
// (gercekten bos veriye "hata" damgasi vurma) yonunde.

import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.location = { origin: "http://localhost" } as Location;

type FetchStub = (path: string) => { ok: boolean; status?: number; json: () => Promise<unknown> } | null;

function stubFetch(stub: FetchStub) {
  const original = globalThis.fetch;
  // @ts-expect-error - test ortaminda basitlestirilmis fetch yer tutucusu
  globalThis.fetch = async (url: string) => {
    const path = new URL(String(url)).pathname + new URL(String(url)).search;
    const result = stub(path);
    if (!result) throw new Error(`beklenmeyen fetch: ${path}`);
    if (!result.ok) throw new Error(`ag hatasi: ${path}`);
    return result as Response;
  };
  return () => { globalThis.fetch = original; };
}

function flatten(node: any, out: any[] = []): any[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) { node.forEach((child) => flatten(child, out)); return out; }
  if (node.type) out.push(node);
  if (Array.isArray(node.children)) node.children.forEach((child: any) => flatten(child, out));
  return out;
}

test("capabilitiesScreen: fetch tamamen basarisiz olunca 'error-state' gosterir, sahte '0 capability' listesi degil", async () => {
  const restore = stubFetch(() => null); // her istek reddedilir -> getJSON null doner
  try {
    const { capabilitiesScreen } = await import("../public/js/screens.js");
    const screen = await capabilitiesScreen();
    const nodes = flatten(screen.sections);
    const errorNode = nodes.find((n) => n.type === "error-state");
    assert.ok(errorNode, "fetch basarisizliginda error-state gorunmeli");
    assert.equal(errorNode.action.type, "ui.goto");
    assert.equal(errorNode.action.payload.screen, "capabilities");
    // Sahte grup basliklari (orn. "VOLUME", "TORCH") olusmamali.
    assert.ok(!nodes.some((n) => n.type === "list"), "fetch basarisizken capability grubu listelenmemeli");
  } finally { restore(); }
});

test("automationsScreen: fetch basarisiz olunca error-state gosterir; GERCEKTEN bos kural listesi hala kendi empty-state'ini korur", async () => {
  const restoreFail = stubFetch(() => null);
  try {
    const { automationsScreen } = await import("../public/js/screens.js");
    const screen = await automationsScreen();
    const nodes = flatten(screen.sections);
    const errorNode = nodes.find((n) => n.type === "error-state");
    assert.ok(errorNode, "fetch basarisizliginda error-state gorunmeli");
    assert.ok(!nodes.some((n) => n.title === "Kural yok"), "fetch basarisizken yanlislikla 'Kural yok' (bos) mesaji gosterilmemeli");
  } finally { restoreFail(); }

  const restoreEmpty = stubFetch((path) => {
    if (path.startsWith("/automations")) return { ok: true, json: async () => [] };
    return null;
  });
  try {
    // Modul onbellegi ES module olarak tek instance; import zaten yukarida
    // yapildigi icin fonksiyonu tekrar cagirmak yeterli, yeniden import
    // gerekmiyor - screens.js saf fonksiyon, ic durum tutmuyor bu ekranda.
    const { automationsScreen } = await import("../public/js/screens.js");
    const screen = await automationsScreen();
    const nodes = flatten(screen.sections);
    assert.ok(!nodes.some((n) => n.type === "error-state"), "gercekten bos kural listesi 'error' olarak damgalanmamali");
    assert.ok(nodes.some((n) => n.title === "Kural yok"), "gercekten bos durumda kendi empty-state'i korunmali");
  } finally { restoreEmpty(); }
});

test("journalScreen: fetch basarisiz olunca error-state gosterir, 'Journal boş' ile karistirmaz", async () => {
  const restoreFail = stubFetch(() => null);
  try {
    const { journalScreen } = await import("../public/js/screens.js");
    const screen = await journalScreen(undefined);
    const nodes = flatten(screen.sections);
    assert.ok(nodes.some((n) => n.type === "error-state"), "fetch basarisizliginda error-state gorunmeli");
    assert.ok(!nodes.some((n) => n.title === "Kayıt yok"), "fetch basarisizken 'Kayıt yok' (bos) mesaji gosterilmemeli");
  } finally { restoreFail(); }

  const restoreEmpty = stubFetch((path) => {
    if (path.startsWith("/journal")) return { ok: true, json: async () => ({ events: [], total: 0 }) };
    return null;
  });
  try {
    const { journalScreen } = await import("../public/js/screens.js");
    const screen = await journalScreen(undefined);
    const nodes = flatten(screen.sections);
    assert.ok(!nodes.some((n) => n.type === "error-state"), "gercekten bos journal 'error' olarak damgalanmamali");
    assert.ok(nodes.some((n) => n.title === "Kayıt yok"), "gercekten bos durumda kendi empty-state'i korunmali");
  } finally { restoreEmpty(); }
});

test("intentHistoryScreen: journal fetch basarisiz olunca error-state gosterir (hata ayiklama araci icin ozellikle kritik)", async () => {
  const restoreFail = stubFetch((path) => {
    if (path.startsWith("/artifacts")) return { ok: true, json: async () => [] };
    return null; // /journal reddedilir
  });
  try {
    const { intentHistoryScreen } = await import("../public/js/screens.js");
    const screen = await intentHistoryScreen(undefined);
    const nodes = flatten(screen.sections);
    assert.ok(nodes.some((n) => n.type === "error-state"), "journal fetch basarisizliginda error-state gorunmeli");
    assert.ok(!nodes.some((n) => n.title === "Kayıt yok"), "fetch basarisizken 'Kayıt yok' (bos) mesaji gosterilmemeli");
  } finally { restoreFail(); }

  const restoreEmpty = stubFetch((path) => {
    if (path.startsWith("/journal")) return { ok: true, json: async () => ({ events: [], total: 0 }) };
    if (path.startsWith("/artifacts")) return { ok: true, json: async () => [] };
    return null;
  });
  try {
    const { intentHistoryScreen } = await import("../public/js/screens.js");
    const screen = await intentHistoryScreen(undefined);
    const nodes = flatten(screen.sections);
    assert.ok(!nodes.some((n) => n.type === "error-state"), "gercekten bos journal 'error' olarak damgalanmamali");
    assert.ok(nodes.some((n) => n.title === "Kayıt yok"), "gercekten bos durumda kendi empty-state'i korunmali");
  } finally { restoreEmpty(); }
});

test("fetchFailedSection: her cagrida ayni gorsel sozlesmeyi tasir (icon/aksiyon tutarliligi, goal §16)", async () => {
  const restore = stubFetch(() => null);
  try {
    const { capabilitiesScreen, automationsScreen } = await import("../public/js/screens.js");
    const a = flatten((await capabilitiesScreen()).sections).find((n) => n.type === "error-state");
    const b = flatten((await automationsScreen()).sections).find((n) => n.type === "error-state");
    assert.equal(a.icon, b.icon);
    assert.equal(a.actionLabel, b.actionLabel);
    assert.equal(a.action.type, "ui.goto");
    assert.equal(b.action.type, "ui.goto");
  } finally { restore(); }
});
