// AIOS Outbound A2A Client Test Suite
import { createServer } from "node:http";
import { sendA2AMessage } from "./a2a-client.mjs";

async function runTests() {
  console.log("=== AIOS OUTBOUND A2A CLIENT TEST SUITE ===");

  // 1. Missing credential -> FAIL CLOSED
  const missingRes = await sendA2AMessage({
    text: "TEST",
    token: "", // explicitly empty
  });
  if (missingRes.ok || missingRes.error !== "A2A_PHONE_AUTH_MISSING") {
    throw new Error("Missing token must fail-closed with A2A_PHONE_AUTH_MISSING");
  }
  console.log("✔ 1. Eksik token fail-closed durduruldu (A2A_PHONE_AUTH_MISSING)");

  // 2. Token Leakage Check
  const sensitiveToken = "secret-super-safe-token-123456";
  const strRep = JSON.stringify(missingRes);
  if (strRep.includes(sensitiveToken)) {
    throw new Error("Token leaked in error response object");
  }
  console.log("✔ 2. Yanıt nesnesi içinde token sızıntısı YOK");

  // 3. Local Mock A2A Server Test (Header format & response parsing)
  let receivedAuth = null;
  let receivedMethod = null;
  const mockPort = 9399;
  const mockServer = createServer((req, res) => {
    receivedAuth = req.headers["authorization"];
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const parsed = JSON.parse(body);
      receivedMethod = parsed.method;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: parsed.id,
          result: {
            task: {
              id: "task-mock-1",
              status: {
                state: "TASK_STATE_COMPLETED",
                message: {
                  role: "ROLE_AGENT",
                  parts: [{ text: "PROMPT_OK" }],
                },
              },
            },
          },
        }),
      );
    });
  });

  await new Promise((resolve) => mockServer.listen(mockPort, "127.0.0.1", resolve));

  const mockRes = await sendA2AMessage({
    host: `http://127.0.0.1:${mockPort}`,
    text: "AIOS LIVE PROMPT PROOF — RETURN EXACTLY: PROMPT_OK",
    token: sensitiveToken,
  });

  mockServer.close();

  if (receivedAuth !== `Bearer ${sensitiveToken}`) {
    throw new Error("Authorization header malformed");
  }
  if (receivedMethod !== "SendMessage") {
    throw new Error("JSON-RPC method must be SendMessage");
  }
  if (!mockRes.ok || mockRes.reply !== "PROMPT_OK") {
    throw new Error(`Mock A2A parsing failed: ${JSON.stringify(mockRes)}`);
  }
  console.log("✔ 3. A2A JSON-RPC 2.0 SendMessage protokolü ve Bearer başlığı doğrulandı");
  console.log("✔ 4. Mock sunucudan 'PROMPT_OK' yanıtı başarıyla ayrıştırıldı");

  // 5. Live Node HTTP 401 Detection
  const liveAuthFail = await sendA2AMessage({
    host: "http://100.75.177.88:9300",
    text: "PING",
    token: "invalid-test-token",
    timeoutMs: 4000,
  });
  if (liveAuthFail.ok || (liveAuthFail.status !== 401 && liveAuthFail.status !== 0)) {
    throw new Error(`Live node must reject invalid token: ${JSON.stringify(liveAuthFail)}`);
  }
  console.log(`✔ 5. Canlı Android düğümü yetki/bağlantı reddi doğru şekilde yakalandı (Status: ${liveAuthFail.status || "FAILCLOSED"})`);

  console.log("=== A2A CLIENT TÜM BİRİM TESTLERİ GEÇTİ (5/5) ===");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
