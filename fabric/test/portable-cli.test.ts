import test from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../bin/aios.mjs";

function stream() { let text = ""; return { write: (chunk: string) => { text += chunk; }, text: () => text }; }
function response(status: number, value: unknown) { return { ok: status >= 200 && status < 300, status, json: async () => value }; }

test("taşınabilir CLI aynı argv/stdout/exit contract ile read-only Formation Memory okur", async () => {
  const out = stream(); const err = stream(); let requested = "";
  const code = await runCli(["--url", "http://example.test/", "--json", "formations"], {
    stdout: out as any, stderr: err as any,
    fetcher: async (url: string) => { requested = url; return response(200, { schema: "aios.formation-memory.v1", formations: [{ id: "formation:a", content: { title: "Ses" }, context: { capabilities: ["volume.set"] } }], provenanceEdges: [{ id: "provenance-edge:a", parent: { id: "formation:a" }, witness: { capability: "volume.set", taskId: "task-a" } }] }) as any; },
  });
  assert.equal(code, 0); assert.equal(requested, "http://example.test/formation-memory"); assert.equal(err.text(), "");
  assert.deepEqual(JSON.parse(out.text()), { schema: "aios.formation-memory.v1", formations: [{ id: "formation:a", title: "Ses", capabilities: ["volume.set"] }], provenanceEdges: [{ id: "provenance-edge:a", parentFormationId: "formation:a", capability: "volume.set", taskId: "task-a" }] });
});

test("CLI hatayı STDERR ve deterministik nonzero exit ile verir", async () => {
  const out = stream(); const err = stream();
  assert.equal(await runCli(["restart"], { stdout: out as any, stderr: err as any }), 2);
  assert.match(err.text(), /unknown command/);
  const unavailable = await runCli(["status"], { stdout: stream() as any, stderr: stream() as any, fetcher: async () => response(503, {}) as any });
  assert.equal(unavailable, 3);
});

test("node doctor mevcut A2A Agent Card ve read-only yüzeyleri doğrulamadan node kabul etmez", async () => {
  const out = stream(); const err = stream(); const seen: string[] = [];
  const values: Record<string, unknown> = {
    "/.well-known/agent-card.json": { protocolVersion: "1.0", name: "Fabric", version: "0.1.0", url: "http://node.test", skills: [{ id: "wifi.info", name: "Wi-Fi" }] },
    "/runtime-status": { observedAt: "2026-08-19T00:00:00.000Z", services: [] },
    "/capabilities": [{ name: "wifi.info", class: "REFLEX", risk: "safe" }],
  };
  const code = await runCli(["--url", "http://node.test", "--json", "node", "doctor"], {
    stdout: out as any, stderr: err as any,
    fetcher: async (url: string) => { seen.push(url); return response(200, values[url.replace("http://node.test", "")] ?? {}) as any; },
  });
  assert.equal(code, 0); assert.equal(err.text(), "");
  assert.deepEqual(seen, ["http://node.test/.well-known/agent-card.json", "http://node.test/runtime-status", "http://node.test/capabilities"]);
  const report = JSON.parse(out.text());
  assert.equal(report.endpoint, "http://node.test");
  assert.deepEqual(report.checks.map((check: { ok: boolean }) => check.ok), [true, true, true]);
});

test("node doctor eksik Agent Card bilgisinde fail-closed ve nonzero döner", async () => {
  const out = stream(); const err = stream();
  const code = await runCli(["node", "doctor"], {
    stdout: out as any, stderr: err as any,
    fetcher: async (url: string) => response(200, url.endsWith("agent-card.json") ? { name: "eksik-protocol" } : []) as any,
  });
  assert.equal(code, 3);
  assert.match(err.text(), /admission failed/);
});
