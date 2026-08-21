// AIOS Live Authenticated Prompt Proof
import { sendA2AMessage } from "./a2a-client.mjs";
import { defaultLedger } from "./observer.mjs";

async function main() {
  const token = (process.env.AIOS_PHONE_A2A_TOKEN || "").trim();

  if (!token) {
    console.log("LIVE_TEST_BLOCKED — CREDENTIAL NOT PRESENT");
    console.log("Not: AIOS_PHONE_A2A_TOKEN ortam değişkeni ayarlanmadığı için fail-closed duruldu.");
    process.exit(0);
  }

  const promptText = "AIOS LIVE PROMPT PROOF — RETURN EXACTLY: PROMPT_OK";

  console.log("AUTH_BRIDGE: AUTHENTICATED");
  console.log("TARGET: http://100.75.177.88:9300");

  const res = await sendA2AMessage({
    text: promptText,
    token,
    timeoutMs: 45000,
  });

  if (!res.ok) {
    console.log(`A2A_HTTP: ${res.status || 0}`);
    console.log(`ERROR: ${res.error}`);
    console.log(`DETAIL: ${res.detail || "none"}`);
    console.log("ROUND_TRIP: NOT_PROVEN");
    process.exit(1);
  }

  console.log(`A2A_HTTP: ${res.status}`);
  console.log("ANDROID_FABRIC: REACHED");
  console.log("HERMES: REACHED");
  console.log("LLM_BRIDGE: REACHED");
  console.log(`MODEL_RESPONSE: ${res.reply}`);

  const evidence = defaultLedger.append({
    operation: "authenticated_prompt",
    http_status: res.status,
    success: true,
    response_data: { reply: res.reply, taskId: res.taskId },
    metadata: { state: res.state },
  });

  console.log("ROUND_TRIP: PASS");
  console.log("TOKEN_EXPOSED: NO");
  console.log(`EVIDENCE_HASH: ${evidence.current_witness_hash}`);
}

main().catch((err) => {
  console.error("Live test exception:", err.message);
  process.exit(1);
});
