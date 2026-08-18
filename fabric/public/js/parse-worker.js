/* ═══════════════════════════════════════════════════════════════
   AI-OS · PARSE WORKER (W6.K, 2026-08-18)
   ───────────────────────────────────────────────────────────────
   Karar (owner ile netlesen tasarim, docs/PLAN_W6_app-shell.md §1b
   adim 4 ve docs/CHECKLIST.md W6.K):
     UI            -> native/sandbox (ana thread, DOM)
     compute        -> Worker (BU DOSYA - parse/transform, privileged
                        capability CAGIRAMAZ)
     privileged action -> dispatcher/policy (sunucu tarafi, W1 risk kapisi)

   Bu worker LLM'in ham metnini alir, ```aios bloklarini ayiklar,
   validateScreen'den gecirir (W5.1/W5.2 istemci kopyasi) ve
   admitArtifact/M-7 sozlesme kapisindan gecirir. Hicbir capability.
   execute() cagrisi YOK, hicbir dispatcher erisimi YOK - yalnizca
   saf donusum. Sonuc ana threade postMessage ile doner, DOM'a
   yazma/capability cagirma islemi ORADA (parse-client.js -> app.js)
   kalir.
   ═══════════════════════════════════════════════════════════════ */

import { extractArtifacts } from "./artifact-parse.js";
import { admitArtifact } from "./artifact-contract.js";

self.onmessage = (ev) => {
  const { id, raw, actionableTypes, knownCapabilities, versionStamp } = ev.data || {};
  try {
    const { text, specs, rejected } = extractArtifacts(raw, actionableTypes);
    const admitted = [];
    const contractRejected = [];
    for (const s of specs) {
      const admit = admitArtifact(s, { knownCapabilities, versionStamp });
      if (!admit.ok) { contractRejected.push((s.title || "Artefakt") + " — " + admit.reason); continue; }
      admitted.push({ spec: s, contract: admit.contract });
    }
    self.postMessage({ id, ok: true, text, admitted, rejected, contractRejected });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
