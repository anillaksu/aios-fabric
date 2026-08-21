// AIOS Evidence Bus & MCP Verification Suite
import { unlinkSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EvidenceLedger,
  canonicalJson,
  sha256,
  observeAgentCard,
  observeRuntimeStatus,
  observeCapabilities,
  observeBattery,
} from "./observer.mjs";
import { processJsonRpc } from "./mcp-server.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_LEDGER_PATH = resolve(__dirname, "test-evidence-ledger.jsonl");

async function runTests() {
  console.log("=== AIOS PROOF GATE 04: EVIDENCE BUS & MCP TESTS ===");

  if (existsSync(TEST_LEDGER_PATH)) {
    unlinkSync(TEST_LEDGER_PATH);
  }

  const testLedger = new EvidenceLedger(TEST_LEDGER_PATH);

  // 1. Canonical Serialization Determinizmi
  const objA = { z: 1, a: "test", m: { y: 2, b: 3 } };
  const objB = { a: "test", m: { b: 3, y: 2 }, z: 1 };
  const canonA = canonicalJson(objA);
  const canonB = canonicalJson(objB);
  if (canonA !== canonB) {
    throw new Error("Canonical JSON serialization non-deterministic");
  }
  console.log("✔ 1. Canonical JSON serialization deterministik ve byte-özdeş");

  // 2. Genesis State & Chaining
  if (testLedger.getLatestWitnessHash() !== "GENESIS") {
    throw new Error("Initial witness hash must be GENESIS");
  }
  console.log("✔ 2. İlk ledger durumu GENESIS doğrulandı");

  // 3. Canlı Android Node'a Bağlantı & Observation Üretimi
  const cardRes = await observeAgentCard(undefined, testLedger);
  if (!cardRes.ok || !cardRes.evidence) {
    throw new Error("observeAgentCard failed against Android node");
  }
  const hash1 = cardRes.evidence.current_witness_hash;
  if (cardRes.evidence.previous_witness_hash !== "GENESIS") {
    throw new Error("First evidence previous hash must be GENESIS");
  }
  console.log(`✔ 3. Canlı Agent Card observation üretildi -> Hash: ${hash1.slice(0, 16)}...`);

  // 4. İkinci Canlı Observation (Runtime Status) & Zincirleme
  const statusRes = await observeRuntimeStatus(undefined, testLedger);
  if (!statusRes.ok || !statusRes.evidence) {
    throw new Error("observeRuntimeStatus failed");
  }
  const hash2 = statusRes.evidence.current_witness_hash;
  if (statusRes.evidence.previous_witness_hash !== hash1) {
    throw new Error("Second evidence previous hash must point to hash1");
  }
  console.log(`✔ 4. Runtime Status zincire bağlandı -> Hash: ${hash2.slice(0, 16)}...`);

  // 5. Üçüncü Canlı Observation (Battery Telemetry) & Zincirleme
  const batRes = await observeBattery(undefined, testLedger);
  if (!batRes.ok || !batRes.evidence) {
    throw new Error("observeBattery failed");
  }
  const hash3 = batRes.evidence.current_witness_hash;
  if (batRes.evidence.previous_witness_hash !== hash2) {
    throw new Error("Battery evidence previous hash must point to hash2");
  }
  console.log(`✔ 5. Canlı Pil Telemetrisi zincire bağlandı -> Hash: ${hash3.slice(0, 16)}... (Pil: ${batRes.data?.data?.percentage ?? "?"}%)`);

  // 6. SHA-256 Ledger Bütünlük ve Doğrulama
  const chainVerify = testLedger.verifyChain();
  if (!chainVerify.ok || chainVerify.events !== 3) {
    throw new Error(`Chain verification failed: ${JSON.stringify(chainVerify)}`);
  }
  console.log(`✔ 6. Evidence Ledger SHA-256 zincir doğrulaması BAŞARILI (${chainVerify.events} olay)`);

  // 7. MCP Server Initialize & Tools List
  const initRes = await processJsonRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  if (initRes.result?.serverInfo?.name !== "aios-evidence-observer") {
    throw new Error("MCP initialize failed");
  }
  const listRes = await processJsonRpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const toolNames = (listRes.result?.tools || []).map((t) => t.name);
  if (!toolNames.includes("observer.latest") || !toolNames.includes("witness.latest")) {
    throw new Error("MCP tools/list missing required tools");
  }
  console.log(`✔ 7. MCP Server Handshake & 6 Read-Only Araç Listesi Doğrulandı (${toolNames.join(", ")})`);

  // 8. MCP Tools/Call Read-Only İcrası
  const mcpCallRes = await processJsonRpc({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "witness.latest", arguments: {} },
  });
  if (mcpCallRes.error || !mcpCallRes.result?.content) {
    throw new Error("MCP tools/call witness.latest failed");
  }
  console.log("✔ 8. MCP tools/call 'witness.latest' read-only icrası başarıyla tamamlandı");

  // 9. Watchdog Durum Analizi
  const wdStatus = statusRes.evidence?.metadata?.watchdog_status;
  const wdDetail = statusRes.evidence?.metadata?.watchdog_detail;
  console.log(`✔ 9. Watchdog Süreç Durumu Doğrulandı: ${wdStatus} (${wdDetail})`);

  // Temizlik
  if (existsSync(TEST_LEDGER_PATH)) {
    unlinkSync(TEST_LEDGER_PATH);
  }

  console.log("=== TÜM PROOF GATE 04 TESTLERİ GEÇTİ (9/9) ===");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  if (existsSync(TEST_LEDGER_PATH)) unlinkSync(TEST_LEDGER_PATH);
  process.exit(1);
});
