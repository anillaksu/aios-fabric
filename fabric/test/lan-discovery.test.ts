// a2a.peer.discover capability'sinin temel taşı (lan-discovery.ts) icin
// sozlesme testleri. Calistirma: npm test (fabric/) - node:test, dis
// baglanti YOK (probeAgentCard testleri kendi baslattigi yerel http
// sunucusuna karsi calisir).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { candidateIPs, probeAgentCard } from "../src/lan-discovery.ts";

test("candidateIPs: /24 icin network/broadcast/localIp haric 253 adres uretir (192.168.x.x - ust bit set)", () => {
  const result = candidateIPs("192.168.1.10", 24);
  assert.equal(result.length, 253);
  assert.ok(!result.includes("192.168.1.0"), "network adresi disarida kalmali");
  assert.ok(!result.includes("192.168.1.255"), "broadcast adresi disarida kalmali");
  assert.ok(!result.includes("192.168.1.10"), "yerel IP kendisi disarida kalmali");
});

test("candidateIPs: /30 icin sadece 1 kullanilabilir host uretir (localIp haric)", () => {
  // ag: .4, yayin: .7 -> kullanilabilir host'lar .5 ve .6; .5 yerel IP -> sadece .6 kalir.
  assert.deepEqual(candidateIPs("192.168.1.5", 30), ["192.168.1.6"]);
});

test("candidateIPs: /24'ten daha genis (ornegin /16) GUVENLIK GEREGI bos dizi doner", () => {
  assert.deepEqual(candidateIPs("10.0.0.1", 16), []);
});

test("candidateIPs: REGRESYON - ust biti set IP'lerde (192.168.x.x) sonuc NEGATIF/sonsuz-dongu URETMEZ", () => {
  // Bu test, ayri bir projede (checkpoint-7-agent-discovery) yakalanan gercek
  // bir hatayi kilitliyor: `>>> 0` eksikligi network'un negatif cikmasina,
  // dongunun milyarlarca kez donup 4GB+ heap tuketip cokmesine sebep olmustu.
  // Burada ust biti set (ilk oktet >=128) bir IP ile makul surede/boyutta
  // sonuc dondugunu dogruluyoruz - takilirsa/OOM olursa test zaman asimina
  // ugrar ve bu regresyonu yakalar.
  const start = Date.now();
  const result = candidateIPs("192.168.1.10", 24);
  assert.ok(Date.now() - start < 1000, "candidateIPs 1sn icinde donmeli (OOM/sonsuz-dongu yok)");
  assert.equal(result.length, 253);
});

test("probeAgentCard: canli bir agent-card.json bulunur", async () => {
  const card = { name: "test-fabric", description: "test", url: "http://x", version: "0.1.0", protocolVersion: "1.0", supportedInterfaces: [], capabilities: { streaming: false, pushNotifications: false }, skills: [] };
  const server = createServer((req, res) => {
    if (req.url === "/.well-known/agent-card.json") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(card)); return; }
    res.writeHead(404).end();
  });
  server.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const found = await probeAgentCard("127.0.0.1", port);
    assert.ok(found);
    assert.equal(found?.card.name, "test-fabric");
  } finally {
    server.close();
  }
});

test("probeAgentCard: kapali/dinlemeyen bir port icin (kisa timeout) undefined doner, hata firlatmaz", async () => {
  const probe = createServer(() => {});
  probe.listen(0, "127.0.0.1");
  await new Promise((resolve) => probe.once("listening", resolve));
  const { port: closedPort } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));

  const found = await probeAgentCard("127.0.0.1", closedPort, 1000);
  assert.equal(found, undefined);
});
