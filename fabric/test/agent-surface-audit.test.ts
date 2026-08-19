// Ajan/LLM yuzeyleri: eski kontrol paneli veya provider'a dogrudan tarayici
// baglantisi yeniden eklenirse bu test kanonik server yolunu fail-closed tutar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { A2AHub } from "../src/a2a.ts";
import { Journal } from "../src/journal.ts";
import { Dispatcher } from "../src/dispatcher.ts";
import { initialState } from "../src/state.ts";
import { SseHub } from "../src/sse.ts";
import { capabilityMap } from "../src/capabilities.ts";
import { isMcpExposed } from "../src/mcp.ts";

const server = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
const publicApp = readFileSync(new URL("../public/js/app.js", import.meta.url), "utf8");
const a2aSource = readFileSync(new URL("../src/a2a.ts", import.meta.url), "utf8");

test("eski ham kontrol paneli ve uzaktan peer ekleme HTTP yuzeyi kapali", () => {
  assert.ok(!server.includes('"./ui.ts"'));
  assert.ok(!server.includes('url.pathname === "/panel"'));
  assert.ok(!server.includes('url.pathname === "/a2a/peers" && req.method === "POST"'));
});

test("tarayici LLM vendor endpointine dogrudan baglanmaz", () => {
  assert.ok(!/api\.anthropic\.com|api\.openai\.com|\/v1\/messages/.test(publicApp));
});

test("A2A gateway sirri kaynak varsayilaniyla calismaz", () => {
  assert.ok(!a2aSource.includes("local-retro-os-9f2c"));
  assert.match(a2aSource, /FABRIC_GATEWAY_KEY tanimli degil/);
});

test("A2A peer gorunumu tokeni tarayiciya tasimaz", () => {
  const hub = new A2AHub(
    "http://127.0.0.1:9300",
    new Journal(":memory:"),
    new Dispatcher(new Journal(":memory:"), initialState(), new SseHub()),
  );
  const peers = hub.listPeers();
  for (const peer of peers) assert.ok(!Object.hasOwn(peer, "token"));
});

test("peer ekleme yalniz insan onayli dispatcher capability'sidir; MCP araci degildir", () => {
  assert.equal(capabilityMap.get("a2a.peer.add")?.risk, "ask");
  assert.equal(isMcpExposed("a2a.peer.add"), false);
});
