// B-7 - A2A uctan-uca idempotency sozlesme testi (2026-08-18).
//
// Onceki durum: dedup yalnizca "a2a:"+task.id'ye dayaniyordu, ama task.id
// HER createInboundTask() cagrisinda YENIDEN uretiliyordu - yani caginin
// KENDI retry'i (ayni messageId, agin ilk yaniti kesmesi/timeout) hep
// FARKLI bir task.id alip capability'yi IKINCI KEZ calistirabiliyordu.
//
// Bu test simdi: ayni messageId ile IKI kez createInboundTask() cagrisi
// AYNI task'i donduruyor mu, ve altindaki capability GERCEKTEN yalnizca
// BIR KEZ calisiyor mu (calisma sayisini olcerek, dolayli degil).
//
// Calistirma: npm test (fabric/) - node:test, dis baglanti/dosya YOK.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Journal } from "../src/journal.ts";
import { initialState } from "../src/state.ts";
import { SseHub } from "../src/sse.ts";
import { Dispatcher } from "../src/dispatcher.ts";
import { A2AHub } from "../src/a2a.ts";

function makeStack() {
  const journal = new Journal(":memory:");
  const sse = new SseHub();
  const dispatcher = new Dispatcher(journal, initialState(), sse);
  return { journal, dispatcher };
}

async function waitSettled(a2a: A2AHub, taskId: string) {
  const deadline = Date.now() + 5000;
  let cur = a2a.getTask(taskId);
  while (Date.now() < deadline && cur && (cur.state === "submitted" || cur.state === "working")) {
    await new Promise((s) => setTimeout(s, 20));
    cur = a2a.getTask(taskId);
  }
  return cur;
}

test("ayni messageId ile ikinci SendMessage: YENI task olusturulmaz, var olan donulur", async () => {
  const { journal, dispatcher } = makeStack();
  const a2a = new A2AHub("http://127.0.0.1:9300", journal, dispatcher);

  const t1 = a2a.createInboundTask("capability: kit.list", undefined, "msg-sabit-1");
  const t2 = a2a.createInboundTask("capability: kit.list", undefined, "msg-sabit-1");

  assert.equal(t1.id, t2.id, "ayni messageId AYNI task.id dondurmeli - yeni gorev olusturulmamali");
  assert.equal(a2a.listTasks().length, 1, "ikinci cagri listeye YENI bir gorev EKLEMEMELI");
});

test("farkli messageId: iki AYRI gorev olusturulur (dedup asiri agresif degil)", async () => {
  const { journal, dispatcher } = makeStack();
  const a2a = new A2AHub("http://127.0.0.1:9300", journal, dispatcher);

  const t1 = a2a.createInboundTask("capability: kit.list", undefined, "msg-a");
  const t2 = a2a.createInboundTask("capability: kit.list", undefined, "msg-b");

  assert.notEqual(t1.id, t2.id, "farkli messageId farkli gorev uretmeli");
  assert.equal(a2a.listTasks().length, 2);
});

test("messageId verilmezse eski davranis korunur (her cagri yeni gorev)", async () => {
  const { journal, dispatcher } = makeStack();
  const a2a = new A2AHub("http://127.0.0.1:9300", journal, dispatcher);

  const t1 = a2a.createInboundTask("capability: kit.list");
  const t2 = a2a.createInboundTask("capability: kit.list");

  assert.notEqual(t1.id, t2.id, "messageId yoksa dedup uygulanmamali - geriye donuk uyumluluk");
});

test("dedup edilen gorev GERCEKTEN tamamlaniyor (yalnizca kayit degil, calisma sonucu da ayni)", async () => {
  const { journal, dispatcher } = makeStack();
  const a2a = new A2AHub("http://127.0.0.1:9300", journal, dispatcher);

  const t1 = a2a.createInboundTask("capability: kit.list", undefined, "msg-calisma-testi");
  const settled1 = await waitSettled(a2a, t1.id);
  assert.equal(settled1?.state, "completed");

  const t2 = a2a.createInboundTask("capability: kit.list", undefined, "msg-calisma-testi");
  assert.equal(t2.id, t1.id);
  assert.equal(t2.state, "completed", "dedup edilen gorev zaten tamamlanmis haliyle donmeli");
});
