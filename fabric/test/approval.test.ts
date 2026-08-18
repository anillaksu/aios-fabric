// B-13 - Approval Contract sozlesme testleri (2026-08-18).
//
// KARAR-2'nin ("ilk kullanimda sor, ayni capability kapsamiyla tekrar
// sorma, kapsam degisince yeniden sor") calisma zamani karsiligi. Scope
// bugun CAPABILITY-DUZEYINDE (bkz. src/approval.ts basindaki not) -
// artefakt-duzeyi kapsam (capabilitySetVersion'a bagli invalidation)
// Katman B/DAG gelene kadar TARGET, burada test edilmiyor.
//
// Calistirma: npm test (fabric/) - node:test, dis baglanti/dosya YOK.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Journal } from "../src/journal.ts";
import { initialState } from "../src/state.ts";
import { SseHub } from "../src/sse.ts";
import { Dispatcher } from "../src/dispatcher.ts";
import { capabilityMap } from "../src/capabilities.ts";
import { isApproved } from "../src/approval.ts";

function makeStack() {
  const journal = new Journal(":memory:");
  const sse = new SseHub();
  const dispatcher = new Dispatcher(journal, initialState(), sse);
  return { journal, dispatcher };
}

async function waitDone(dispatcher: Dispatcher, taskId: string) {
  const deadline = Date.now() + 5000;
  let task;
  while (Date.now() < deadline) {
    task = dispatcher.getState().tasks[taskId];
    if (task && !["pending", "optimistic", "running"].includes(task.status)) break;
    await new Promise((s) => setTimeout(s, 20));
  }
  return task!;
}

// ─── 1) risk:safe -> approval gerekmez ───
test("risk:safe capability approval kaydi olmadan calisir", async () => {
  const { dispatcher } = makeStack();
  assert.equal(capabilityMap.get("kit.list")?.risk, "safe");
  const r = await dispatcher.dispatch({ type: "kit.list", payload: {} } as never);
  const task = await waitDone(dispatcher, r.taskId);
  assert.equal(task.status, "completed");
});

// ─── 2) risk:ask + approval yok -> reddedilir ───
test("risk:ask capability approval yokken reddedilir", async () => {
  const { dispatcher } = makeStack();
  assert.equal(capabilityMap.get("script.run")?.risk, "ask");
  const r = await dispatcher.dispatch({ type: "script.run", payload: { cmd: "echo hi" } } as never);
  const task = dispatcher.getState().tasks[r.taskId];
  assert.equal(task.status, "failed");
  assert.match(String(task.error), /onay gerektirir/);
});

// script.run gercek execute()'u Termux'a ozel sabit bir bash yoluna
// bagli (/data/data/com.termux/...) - PC gelistirme ortaminda ENOENT ile
// basarisiz olur, bu B-13'un DEGIL script.run'in platform sinirlamasidir.
// Onay sozlesmesinin dogru kaniti: task ARTIK approval-red mesajiyla degil,
// approval'i GECIP capability'nin KENDI calisma hatasiyla basarisiz olmasi -
// yani risk kapisinin gercekten acildigi.
function assertPastApprovalGate(task: { error?: string }) {
  assert.ok(!task.error || !/onay gerektirir/.test(task.error),
    "approval verildikten sonra hala onay-red mesajiyla basarisiz oluyor - kapi acilmadi");
}

// ─── 3) gecerli approval -> execution'a izin verilir (risk kapisi acilir) ───
test("grantApproval sonrasi risk:ask capability onay kapisini gecer", async () => {
  const { dispatcher } = makeStack();
  dispatcher.grantApproval("script.run");
  const r = await dispatcher.dispatch({ type: "script.run", payload: { cmd: "echo hi" } } as never);
  const task = await waitDone(dispatcher, r.taskId);
  assertPastApprovalGate(task);
});

// ─── 4) ayni capability -> ikinci cagirida tekrar approval istenmez ───
test("ayni capability icin ikinci dispatch approval'i tekrar sormaz", async () => {
  const { dispatcher } = makeStack();
  dispatcher.grantApproval("script.run");
  const r1 = await dispatcher.dispatch({ type: "script.run", payload: { cmd: "echo bir" } } as never);
  const task1 = await waitDone(dispatcher, r1.taskId);
  assertPastApprovalGate(task1);
  const r2 = await dispatcher.dispatch({ type: "script.run", payload: { cmd: "echo iki" } } as never);
  const task2 = await waitDone(dispatcher, r2.taskId);
  assertPastApprovalGate(task2);
});

// ─── 5/6/7) artefakt/capability-set/structureHash duzeyinde invalidation ───
// TARGET - bugun scope capability-duzeyinde (bkz. approval.ts), artefakt
// kapsami Katman B/DAG gelmeden test edilemez. Bilerek burada YOK.

// ─── 8) expired approval -> reddedilir ───
test("suresi dolmus approval reddedilir", async () => {
  const { dispatcher } = makeStack();
  dispatcher.grantApproval("script.run", Date.now() - 1000); // gecmiste bitmis
  const r = await dispatcher.dispatch({ type: "script.run", payload: { cmd: "echo hi" } } as never);
  const task = dispatcher.getState().tasks[r.taskId];
  assert.equal(task.status, "failed");
  assert.match(String(task.error), /onay gerektirir/);
});

// ─── 9) revoked approval -> reddedilir ───
test("geri alinmis (revoked) approval reddedilir", async () => {
  const { dispatcher } = makeStack();
  dispatcher.grantApproval("script.run");
  dispatcher.revokeApproval("script.run");
  const r = await dispatcher.dispatch({ type: "script.run", payload: { cmd: "echo hi" } } as never);
  const task = dispatcher.getState().tasks[r.taskId];
  assert.equal(task.status, "failed");
});

// ─── 9b) denied approval -> reddedilir (grant yerine deny senaryosu) ───
test("reddedilmis (denied) approval capability'yi calistirmaz", async () => {
  const { dispatcher } = makeStack();
  dispatcher.denyApproval("script.run");
  const r = await dispatcher.dispatch({ type: "script.run", payload: { cmd: "echo hi" } } as never);
  const task = dispatcher.getState().tasks[r.taskId];
  assert.equal(task.status, "failed");
});

// ─── 10) LLM/A2A/MCP approval grant olusturamaz ───
// Yapisal garanti: approval.granted/denied/revoked capabilityMap'te YOK,
// yani dispatch() (tools/call'un TEK giris noktasi) uzerinden ASLA
// uretilemez - dispatch("approval.granted", ...) capabilityMap.get() ile
// eslesmedigi icin AGENT placeholder'a duser, approvals state'i degismez.
test("dispatch() uzerinden approval.granted intent'i gonderilse bile approval verilmez", async () => {
  const { dispatcher } = makeStack();
  assert.equal(capabilityMap.has("approval.granted"), false, "approval.granted bir capability OLMAMALI");
  await dispatcher.dispatch({ type: "approval.granted", payload: { capability: "script.run" } } as never);
  assert.equal(isApproved(dispatcher.getState(), "script.run", Date.now()), false);
});

// ─── 11) approval olmadan dispatcher bypass edilemez ───
// action-bus.test.ts'teki A2A/MCP senaryolariyla ayni bus - burada dogrudan
// dispatcher uzerinden tekrarlanir: risk:ask capability HANGI kaynaktan
// gelirse gelsin (payload/origin farketmeksizin) approval kontrolunden gecer.
test("approval olmadan risk:ask hicbir origin ile calismaz", async () => {
  const { dispatcher } = makeStack();
  const r = await dispatcher.dispatch({
    type: "script.run",
    payload: { cmd: "echo hi" },
    origin: { source: "mcp", raw: "test", by: "deterministic", envelopeId: "e1" },
  } as never);
  const task = dispatcher.getState().tasks[r.taskId];
  assert.equal(task.status, "failed");
});

// ─── 12) journal/audit approval lifecycle'ini ayirt edebilir ───
test("approval event'leri journal'da kendi tipleriyle ayirt edilebilir", async () => {
  const { journal, dispatcher } = makeStack();
  dispatcher.grantApproval("script.run");
  dispatcher.denyApproval("torch.set");
  dispatcher.revokeApproval("script.run");
  const events = journal.replayAll();
  assert.ok(events.some((e) => e.type === "approval.granted"));
  assert.ok(events.some((e) => e.type === "approval.denied"));
  assert.ok(events.some((e) => e.type === "approval.revoked"));
});
