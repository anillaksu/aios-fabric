// MCP sozlesme testleri (W4 KALICILASTIRMA, 2026-08-17).
//
// NEDEN: W4'te 10 canli curl testi calistirildi ama hicbiri KALICI degildi -
// bir sonraki degisiklik onlari sessizce bozabilirdi. Owner acikca istedi:
// "-32602 ile isError:true ayriminin contract test olarak kalicilastirilmasi;
// tools/list ve tools/call'un AYNI isMcpExposed() kararini paylastiginin
// regresyon testiyle guvenceye alinmasi." Bu dosya tam olarak o ikisini yapar.
//
// Calistirma: node --experimental-strip-types --test fabric/test/mcp.test.ts
// Disaridan hicbir sey (telefon/ag/gercek dosya sistemi) gerektirmez -
// Journal ':memory:' ile acilir, hicbir capability'nin GERCEK yan etkisi
// tetiklenmez (yalnizca parametre eksikligi gibi zararsiz hata yollari test
// edilir - bkz. app.open testi).

import { test } from "node:test";
import assert from "node:assert/strict";
import { Journal } from "../src/journal.ts";
import { initialState } from "../src/state.ts";
import { SseHub } from "../src/sse.ts";
import { Dispatcher } from "../src/dispatcher.ts";
import { capabilityMap } from "../src/capabilities.ts";
import { isMcpExposed, mcpExposedNames, handleMcpRequest } from "../src/mcp.ts";

function makeDispatcher(): Dispatcher {
  return new Dispatcher(new Journal(":memory:"), initialState(), new SseHub());
}

async function initSession(dispatcher: Dispatcher): Promise<string> {
  const r = await handleMcpRequest({ jsonrpc: "2.0", id: 0, method: "initialize" }, dispatcher, undefined);
  assert.equal(r.httpStatus, 200);
  assert.ok(r.sessionId, "initialize bir Mcp-Session-Id URETMELI");
  return r.sessionId!;
}

// ─── REGRESYON 1: isMcpExposed() TEK karar - tools/list ve tools/call ───
// AYNI capability seti icin AYNI sonucu vermeli. W1.9/W1.10'da tam olarak
// bunun tersi (iki ayri kontrol, biri unutulur) yasanmisti.
test("tools/list, isMcpExposed() ile ayni seti dondurur (drift olamaz)", async () => {
  const dispatcher = makeDispatcher();
  const sid = await initSession(dispatcher);
  const r = await handleMcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }, dispatcher, sid);
  assert.equal(r.httpStatus, 200);
  const listed = ((r.body as { result: { tools: { name: string }[] } }).result.tools).map((t) => t.name).sort();
  const expected = mcpExposedNames().sort();
  assert.deepEqual(listed, expected, "tools/list, isMcpExposed()'in dondurdugu setle BIREBIR eslesmeli");
  // Bagimsiz capity: capabilityMap'i dogrudan tarayip AYNI sonuca ulasmali -
  // isMcpExposed()'in KENDISI de yanlissa yukaridaki karsilastirma boslukta kalir.
  for (const [name, cap] of capabilityMap.entries()) {
    const shouldExpose = (cap.risk ?? "ask") === "safe";
    assert.equal(isMcpExposed(name), shouldExpose, `${name}: risk=${cap.risk} icin isMcpExposed() yanlis karar verdi`);
  }
});

// ─── REGRESYON 2: risk:"ask" hem discovery'de YOK hem doğrudan cagrida REDDEDILIYOR ───
test("risk:ask capability ne listede ne dogrudan cagrida gorunur", async () => {
  const dispatcher = makeDispatcher();
  const sid = await initSession(dispatcher);

  // script.run'in bugun risk:"ask" oldugunu VARSAYMIYORUZ - dogruluyoruz.
  // (Varsayim yanlissa test anlamsizlasir; K8 ilkesi kod testine de uygulanir.)
  const cap = capabilityMap.get("script.run");
  assert.ok(cap, "script.run capability registry'de bulunamadi - test varsayimi gecersiz");
  assert.equal(cap!.risk, "ask", "script.run artik risk:ask degil - bu testin varsayimi guncellenmeli");

  const listR = await handleMcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" }, dispatcher, sid);
  const names = ((listR.body as { result: { tools: { name: string }[] } }).result.tools).map((t) => t.name);
  assert.ok(!names.includes("script.run"), "script.run (risk:ask) tools/list'te GORUNMEMELI");

  const callR = await handleMcpRequest(
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "script.run", arguments: { cmd: "echo hi" } } },
    dispatcher, sid,
  );
  const body = callR.body as { error?: { code: number } };
  assert.ok(body.error, "risk:ask bir tool cagrildiginda JSON-RPC 'error' alani OLMALI (result degil)");
  assert.equal(body.error!.code, -32602, "risk:ask reddi PROTOKOL hatasi olmali (-32602)");
});

// ─── REGRESYON 3 (W4.8): protokol hatasi vs tool calisma hatasi AYRIMI ───
// Spec (modelcontextprotocol.io/specification/2025-03-26/server/tools):
//   bilinmeyen/izinsiz tool -> JSON-RPC error (-32602)
//   tool'un KENDI calisma hatasi -> normal result icinde isError:true
// Bu iki sekil KARISTIRILIRSA istemciler (Claude Desktop dahil) yanlis
// yorumlar - biri "bu arac yok" derken digeri "arac calisti ama basarisiz oldu" der.
test("bilinmeyen tool protokol hatasi, tool'un KENDI hatasi ise isError:true doner", async () => {
  const dispatcher = makeDispatcher();
  const sid = await initSession(dispatcher);

  // (a) bilinmeyen tool -> PROTOKOL hatasi (result degil, error)
  const unknownR = await handleMcpRequest(
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "boyle.bir.sey.yok", arguments: {} } },
    dispatcher, sid,
  );
  const unknownBody = unknownR.body as { error?: { code: number }; result?: unknown };
  assert.ok(unknownBody.error, "bilinmeyen tool 'error' alani URETMELI");
  assert.equal(unknownBody.error!.code, -32602);
  assert.equal(unknownBody.result, undefined, "bilinmeyen tool icin 'result' alani OLMAMALI");

  // (b) taninan, safe bir capability - ama GECERSIZ parametreyle (pkg eksik).
  // app.open kendi ic dogrulamasinda pkg yoksa YAN ETKISIZ basarisiz olur
  // (capabilities.ts: "if (!pkg) return { ok:false, error:'pkg gerekli' }")
  // - bu yuzden bu test cihazda GERCEK bir eylem TETIKLEMEZ.
  assert.equal(capabilityMap.get("app.open")?.risk, "safe", "app.open artik risk:safe degil - test varsayimi guncellenmeli");
  const failR = await handleMcpRequest(
    { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "app.open", arguments: {} } },
    dispatcher, sid,
  );
  const failBody = failR.body as { error?: unknown; result?: { isError: boolean; content: { text: string }[] } };
  assert.equal(failBody.error, undefined, "tool CALISTI (bulundu, izinliydi) - protokol hatasi OLMAMALI");
  assert.ok(failBody.result, "tool'un kendi hatasi normal 'result' icinde donmeli");
  assert.equal(failBody.result!.isError, true, "capability basarisiz oldugunda isError:true olmali");
  assert.match(failBody.result!.content[0].text, /pkg gerekli/);
});

// ─── REGRESYON 4: oturum zorunlulugu (initialize disinda) ───
test("initialize disinda oturumsuz istek reddedilir, gecerli oturum kabul edilir", async () => {
  const dispatcher = makeDispatcher();
  const noSession = await handleMcpRequest({ jsonrpc: "2.0", id: 6, method: "tools/list" }, dispatcher, undefined);
  assert.equal(noSession.httpStatus, 400);

  const badSession = await handleMcpRequest({ jsonrpc: "2.0", id: 7, method: "tools/list" }, dispatcher, "olmayan-oturum-id");
  assert.equal(badSession.httpStatus, 404);

  const sid = await initSession(dispatcher);
  const ok = await handleMcpRequest({ jsonrpc: "2.0", id: 8, method: "tools/list" }, dispatcher, sid);
  assert.equal(ok.httpStatus, 200);
});
