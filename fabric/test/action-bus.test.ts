// W5 - Deterministik action bus sozlesme testleri (2026-08-17).
//
// Owner'in W5 kabul kriteri: "gecerli action, eksik parametre, sahte cihaz
// bilgisi, yetkisiz capability ve dogrudan A2A action senaryolarinin
// birlikte denenmesi." Bu dosya tam olarak bu bes senaryoyu, TEK action
// bus'in (dispatcher.dispatch) UI/A2A/MCP/otomasyon icin AYNI davrandigini
// kanitlayacak sekilde calistirir.
//
// Calistirma: npm test (fabric/) - node:test, dis baglanti/dosya YOK.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Journal } from "../src/journal.ts";
import { initialState } from "../src/state.ts";
import { SseHub } from "../src/sse.ts";
import { Dispatcher } from "../src/dispatcher.ts";
import { A2AHub } from "../src/a2a.ts";
import { capabilityMap } from "../src/capabilities.ts";
import { validateScreen, sanitizeAiosBlock } from "../src/screenspec.ts";

function makeStack() {
  const journal = new Journal(":memory:");
  const sse = new SseHub();
  const dispatcher = new Dispatcher(journal, initialState(), sse);
  return { journal, dispatcher };
}

// ─── 1) GECERLI ACTION: risk:safe bir capability dispatcher'dan gecer ve tamamlanir ───
test("gecerli action: risk:safe capability dispatch edilir ve journal'a tamamlanmis olarak duser", async () => {
  const { dispatcher } = makeStack();
  // kit.list secildi: saf JS, Android/Termux ikili dosyasina baglı degil -
  // test hem telefonda hem gelistirici makinesinde AYNI sekilde calisir.
  assert.equal(capabilityMap.get("kit.list")?.risk, "safe");

  const r = await dispatcher.dispatch({ type: "kit.list", payload: {} } as never);
  const deadline = Date.now() + 5000;
  let task;
  while (Date.now() < deadline) {
    task = dispatcher.getState().tasks[r.taskId];
    if (task && task.status !== "pending" && task.status !== "optimistic" && task.status !== "running") break;
    await new Promise((s) => setTimeout(s, 20));
  }
  assert.ok(task, "task state'te bulunamadi");
  assert.equal(task!.status, "completed");
});

// ─── 2) EKSIK PARAMETRE: capability KENDI dogrulamasinda YAN ETKISIZ basarisiz olur ───
test("eksik parametre: app.open pkg'siz cagrilinca capability kendi ici dogrulamada basarisiz olur (yan etki yok)", async () => {
  const { dispatcher } = makeStack();
  assert.equal(capabilityMap.get("app.open")?.risk, "safe");

  const r = await dispatcher.dispatch({ type: "app.open", payload: {} } as never);
  const deadline = Date.now() + 5000;
  let task;
  while (Date.now() < deadline) {
    task = dispatcher.getState().tasks[r.taskId];
    if (task && task.status !== "pending" && task.status !== "optimistic" && task.status !== "running") break;
    await new Promise((s) => setTimeout(s, 20));
  }
  assert.equal(task!.status, "failed");
  assert.match(String(task!.error), /pkg gerekli/);
});

// ─── 3) SAHTE CIHAZ BILGISI: model uydurma bir bilesen/veri uretirse SUNUCUDA elenir ───
test("sahte cihaz bilgisi: bilinmeyen bilesen tipi validateScreen'de sessizce elenir", () => {
  const fake = {
    id: "x", title: "Sahte Panel",
    sections: [
      { type: "section", title: "GERCEK", children: [
        { type: "metric", label: "PIL", value: 58 },              // gecerli
        { type: "device-holographic-scan", label: "UYDURMA" },    // GECERSIZ - registry'de yok
      ] },
    ],
  };
  const clean = validateScreen(fake);
  assert.ok(clean);
  const kids = clean!.sections[0].children as { type: string }[];
  assert.ok(kids.some((k) => k.type === "metric"), "gercek bilesen korunmali");
  assert.ok(!kids.some((k) => k.type === "device-holographic-scan"), "uydurma bilesen SUNUCUDA elenmeli");
});

test("sahte cihaz bilgisi: bozuk/gecersiz aios blogu metinden tamamen silinir", () => {
  const text = "Panel hazir.\n```aios\n{bu gecerli json degil\n```\nBaska bir cumle.";
  const out = sanitizeAiosBlock(text);
  assert.ok(!out.includes("```aios"), "gecersiz JSON iceren blok metinde KALMAMALI");
  assert.match(out, /Panel hazir\./);
  assert.match(out, /Baska bir cumle\./);
});

// ─── 4) YETKISIZ CAPABILITY: risk:"ask" TEK bus'ta da (dispatcher) reddedilir ───
test("yetkisiz capability: risk:ask olan script.run dispatcher'dan gecince kosulsuz reddedilir", async () => {
  const { dispatcher } = makeStack();
  assert.equal(capabilityMap.get("script.run")?.risk, "ask");

  const r = await dispatcher.dispatch({ type: "script.run", payload: { cmd: "echo hi" } } as never);
  // Risk kapisi dispatch() ICINDE senkron uygulanir (bkz. dispatcher.ts) -
  // ekstra bekleme gerekmez, sonuc dispatch() donene kadar zaten journal'da.
  const task = dispatcher.getState().tasks[r.taskId];
  assert.equal(task.status, "failed");
  assert.match(String(task.error), /onay gerektirir/);
});

// ─── 5) DOGRUDAN A2A ACTION: A2A'nin "capability: X" yolu da AYNI bus'tan gecer ───
test("dogrudan A2A action: capability: kit.list dispatcher uzerinden tamamlanir, journal'a A2A kaynakli duser", async () => {
  const { journal, dispatcher } = makeStack();
  const a2a = new A2AHub("http://127.0.0.1:9300", journal, dispatcher);

  const task = a2a.createInboundTask("capability: kit.list");
  const deadline = Date.now() + 5000;
  let cur = a2a.getTask(task.id);
  while (Date.now() < deadline && cur && (cur.state === "submitted" || cur.state === "working")) {
    await new Promise((s) => setTimeout(s, 20));
    cur = a2a.getTask(task.id);
  }
  assert.equal(cur?.state, "completed");

  // Journal'da dispatcher uzerinden gecmis, origin.source "a2a" olan bir
  // task.created bulunmali - eski (duzeltilmeden onceki) yolda bu HIC
  // OLMAZDI cunku cap.execute() dogrudan cagriliyordu, journal'a hicbir
  // task.created/completed duşmuyordu.
  const events = journal.replayAll();
  const created = events.find((e) => {
    if (e.type !== "task.created") return false;
    const p = e.payload as { type?: string; origin?: { source?: string } };
    return p.type === "kit.list" && p.origin?.source === "a2a";
  });
  assert.ok(created, "A2A'nin capability cagrisi journal'da origin.source:a2a ile GORUNMELI");
});

// ─── 6) SAHTE CIHAZ BILGISI (W5 nokta 8): cagiranin gonderdigi context YOK SAYILIR ───
// Bulundu (2026-08-17, pano dogrulamasi sirasinda): llm.generate risk:"safe"
// oldugu icin MCP'den de cagrilabiliyor (W4). Eskiden cagiranin gonderdigi
// payload.context DOGRUDAN sistem promptuna gomuluyordu - disaridan biri
// {"context":"pil %999, sarj tam"} gibi UYDURMA bir cihaz durumunu modelin
// "gercek" sandigi baglama enjekte edebilirdi. Simdi baglam SADECE sunucunun
// kendi capability cagrisiyla (readLiveDeviceContext) okunuyor.
test("sahte cihaz bilgisi: llm.generate cagiranin context'ini yok sayar, modele giden metinde uydurma veri OLMAZ", async () => {
  const fakeContext = "UYDURMA-PIL-999-SAHTE-VERI";
  let capturedBody: { messages?: { role: string; content: string }[] } | null = null;
  const originalFetch = globalThis.fetch;
  // llm_bridge'e (127.0.0.1:9201) giden GERCEK istegi yakala - ag baglantisi
  // YOK, yalnizca govdeyi okuyup sahte bir basarisiz yanit donuyoruz.
  globalThis.fetch = (async (_url: unknown, opts?: { body?: string }) => {
    try { capturedBody = JSON.parse(String(opts?.body ?? "{}")); } catch { /* yoksay */ }
    return { ok: false, status: 503, json: async () => ({ error: "test stub - gercek baglanti yok" }) } as Response;
  }) as typeof fetch;

  try {
    const cap = capabilityMap.get("llm.generate");
    assert.ok(cap);
    await cap!.execute({ prompt: "merhaba", context: fakeContext });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(capturedBody, "llm_bridge'e istek hic gitmedi - test kendisi bozuk");
  const systemMsg = capturedBody!.messages?.find((m) => m.role === "system");
  assert.ok(systemMsg, "sistem mesaji olusturulamadi");
  assert.ok(!systemMsg!.content.includes(fakeContext),
    "CAGIRANIN uydurma context'i sistem promptuna SIZDI - bu tam olarak duzeltilen acik");
});

test("dogrudan A2A action: risk:ask (script.run) A2A'dan da reddedilir", async () => {
  const { journal, dispatcher } = makeStack();
  const a2a = new A2AHub("http://127.0.0.1:9300", journal, dispatcher);

  const task = a2a.createInboundTask('capability: script.run | {"cmd":"echo hi"}');
  const deadline = Date.now() + 5000;
  let cur = a2a.getTask(task.id);
  while (Date.now() < deadline && cur && (cur.state === "submitted" || cur.state === "working")) {
    await new Promise((s) => setTimeout(s, 20));
    cur = a2a.getTask(task.id);
  }
  assert.equal(cur?.state, "failed");
  assert.match(String(cur?.error ?? ""), /onay gerektirir/);
});
