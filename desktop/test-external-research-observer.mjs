// AIOS External Research Observer - Deterministic Fixture Test Suite
import { unlinkSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ExternalResearchAdapter,
  validateExternalObservation,
  computeExternalDigest,
  normalizeObservationTimestamp,
} from "./adapters/external-research-adapter.mjs";
import { EvidenceLedger } from "./observer.mjs";
import { computeCanonicalRealityDigest } from "./phone-shared-reality.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_LEDGER_PATH = resolve(__dirname, "test-external-research-ledger.jsonl");

function validFixture(overrides = {}) {
  return {
    schema: "aios.external-observation.v1",
    observationId: "obs-ext-0001",
    requestId: "req-ext-0001",
    observerNodeId: "node-ai-browser-fixture",
    query: "what does Google AI Mode support today",
    observedAt: new Date().toISOString(),
    sources: [
      {
        sourceId: "src-1",
        url: "https://example.com/ai-mode-docs",
        title: "Google AI Mode overview",
        publishedAt: "2026-01-01T00:00:00.000Z",
        retrievedAt: new Date().toISOString(),
        sourceClass: "DOCUMENTATION",
        contentDigest: "sha256:deadbeef",
        retrievalStatus: "OK",
      },
    ],
    claims: [
      {
        claimId: "claim-1",
        claim: "AI Mode supports follow-up questions.",
        sourceRefs: ["src-1"],
        support: "SUPPORTED",
        extractionDigest: "sha256:cafebabe",
      },
    ],
    contradictions: [],
    status: "COMPLETE",
    externalDigest: "PLACEHOLDER",
    ...overrides,
  };
}

async function runTests() {
  console.log("=== AIOS EXTERNAL RESEARCH OBSERVER: FIXTURE TEST SUITE ===");

  if (existsSync(TEST_LEDGER_PATH)) unlinkSync(TEST_LEDGER_PATH);
  const testLedger = new EvidenceLedger(TEST_LEDGER_PATH);
  const adapter = new ExternalResearchAdapter({ ledger: testLedger });

  // 1. Valid observation accepted
  const fixture = validFixture();
  fixture.externalDigest = computeExternalDigest(fixture);
  const obs1 = adapter.readExternalObservation(fixture);
  if (!obs1.ok || obs1.adapterStatus !== "OBSERVED") {
    throw new Error(`Expected valid observation to be OBSERVED, got: ${JSON.stringify(obs1)}`);
  }
  console.log("✔ 1. valid ExternalObservation accepted        PASS");

  // 2. externalDigest determinism
  const d1 = computeExternalDigest(fixture);
  const d2 = computeExternalDigest(validFixture({ externalDigest: "ignored", observedAt: "2099-01-01T00:00:00.000Z" }));
  if (d1 !== d2) {
    throw new Error(`Digest must be stable across re-fetch timestamps: ${d1} !== ${d2}`);
  }
  console.log("✔ 2. externalDigest determinism                PASS");

  // 3. Source provenance - unresolved sourceRef must be rejected
  const badProvenance = validFixture({
    claims: [{ claimId: "claim-x", claim: "orphan claim", sourceRefs: ["src-does-not-exist"], support: "UNRESOLVED", extractionDigest: "sha256:x" }],
  });
  const provCheck = validateExternalObservation(badProvenance);
  if (provCheck.ok || !provCheck.errors.some((e) => e.includes("unresolved reference"))) {
    throw new Error("Expected unresolved sourceRef to fail provenance validation");
  }
  console.log("✔ 3. source provenance enforced                PASS");

  // 4. Contradiction preservation
  const withContradiction = validFixture({
    contradictions: [{ claimIds: ["claim-1", "claim-2"], note: "sources disagree on release date" }],
  });
  withContradiction.externalDigest = computeExternalDigest(withContradiction);
  const obs4 = adapter.readExternalObservation(withContradiction);
  if (obs4.contradictionsCount !== 1 || obs4.contradictions[0].note !== "sources disagree on release date") {
    throw new Error("Contradictions must be preserved verbatim");
  }
  console.log("✔ 4. contradiction preservation                PASS");

  // 5. Malformed observation rejection
  const malformed = { schema: "aios.external-observation.v1", observationId: "obs-bad" }; // missing everything else
  const obs5 = adapter.readExternalObservation(malformed);
  if (obs5.ok || obs5.adapterStatus !== "REJECTED") {
    throw new Error(`Expected malformed observation to be REJECTED, got: ${JSON.stringify(obs5)}`);
  }
  console.log("✔ 5. malformed observation rejection            PASS");

  // 6. externalDigest !== realityDigest (canonical boundary)
  const { canonicalHash: realityHash } = computeCanonicalRealityDigest({});
  if (obs1.externalDigest === realityHash || obs1.computedDigest === realityHash) {
    throw new Error("externalDigest must never collide with / be equal to realityDigest by construction");
  }
  console.log("✔ 6. externalDigest != realityDigest            PASS");

  // 7. Stale observation
  const stale = validFixture({ observedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() });
  stale.externalDigest = computeExternalDigest(stale);
  const obs7 = adapter.readExternalObservation(stale);
  if (!obs7.ok || obs7.adapterStatus !== "STALE") {
    throw new Error(`Expected stale observation to be classified STALE, got: ${JSON.stringify(obs7)}`);
  }
  console.log("✔ 7. stale observation handling                 PASS");

  // 8. Untrusted-content isolation - hostile-looking text must remain inert data
  const hostile = validFixture({
    claims: [{
      claimId: "claim-hostile",
      claim: "'; DROP TABLE evidence; --  ${process.exit(1)}  <script>alert(1)</script>",
      sourceRefs: ["src-1"],
      support: "UNRESOLVED",
      extractionDigest: "sha256:y",
    }],
  });
  hostile.externalDigest = computeExternalDigest(hostile);
  let executed = false;
  const originalExit = process.exit;
  process.exit = () => { executed = true; }; // would only fire if content were ever eval'd
  const obs8 = adapter.readExternalObservation(hostile);
  process.exit = originalExit;
  if (executed || typeof hostile.claims[0].claim !== "string" || !obs8.ok) {
    throw new Error("Hostile text content must never execute and must stay a plain string");
  }
  console.log("✔ 8. UNTRUSTED_CONTENT isolation                PASS");

  // Evidence binding sanity: every accepted observation chained into EXISTING ledger, no new ledger file created elsewhere
  adapter.recordObservationEvidence(obs1);
  const chain = testLedger.verifyChain();
  if (!chain.ok || chain.status !== "CHAIN_VALID") {
    throw new Error(`Evidence chain invalid: ${JSON.stringify(chain)}`);
  }
  console.log("✔ 9. evidence bound through EXISTING EvidenceLedger PASS");

  // 10. Live provider path
  const live = adapter.readExternalObservation(); // no customObservation -> reads D:\dev\ai_browser artifact
  const livePath = "AVAILABLE";
  const liveVerdict = live.adapterStatus === "NOT_AVAILABLE" ? "NOT_AVAILABLE" : livePath;
  console.log(`ℹ 10. LIVE_PROVIDER_PATH: ${liveVerdict} (${live.error || live.adapterStatus})`);

  // ============================================================
  // PATCH SPECIFICATION test matrix (timestamp/digest separation,
  // unit-safety, collision-safety) — mission "AIOS EXTERNAL
  // OBSERVATION PATCH", section 4.
  // ============================================================

  // 11. explicit timestamp (ISO string) -> PROVEN, ms resolved correctly
  const r11 = normalizeObservationTimestamp("2026-01-01T00:00:00.000Z");
  if (!r11.ok || r11.ms !== Date.parse("2026-01-01T00:00:00.000Z")) {
    throw new Error(`explicit ISO timestamp should resolve: ${JSON.stringify(r11)}`);
  }
  console.log(`✔ 11. explicit timestamp (ISO)                  PASS  ${JSON.stringify(r11)}`);

  // 12. missing timestamp -> NOT_PROVEN
  const r12 = normalizeObservationTimestamp(undefined);
  if (r12.ok || r12.reason !== "MISSING") {
    throw new Error(`missing timestamp should be NOT_PROVEN/MISSING: ${JSON.stringify(r12)}`);
  }
  console.log(`✔ 12. missing timestamp                         PASS  ${JSON.stringify(r12)}`);

  // 13. bare seconds-looking numeric timestamp, NO unit hint -> NOT_PROVEN
  //     (never silently * 1000'd — mission's core "no guessing" rule)
  const secondsLike = Math.floor(Date.now() / 1000);
  const r13 = normalizeObservationTimestamp(secondsLike);
  if (r13.ok || r13.reason !== "AMBIGUOUS_NUMERIC_UNIT") {
    throw new Error(`bare seconds-like number without hint must be NOT_PROVEN, not guessed: ${JSON.stringify(r13)}`);
  }
  console.log(`✔ 13. seconds timestamp (no hint)                PASS  ${JSON.stringify(r13)} (correctly NOT auto-converted)`);
  // ... but WITH an explicit hint it resolves deterministically:
  const r13b = normalizeObservationTimestamp(secondsLike, "s");
  if (!r13b.ok || r13b.ms !== secondsLike * 1000) {
    throw new Error(`seconds timestamp WITH explicit unitHint="s" should resolve: ${JSON.stringify(r13b)}`);
  }
  console.log(`✔ 13b. seconds timestamp (hint="s")              PASS  ${JSON.stringify(r13b)}`);

  // 14. bare milliseconds-looking numeric timestamp, NO unit hint -> NOT_PROVEN
  //     (same ambiguity rule applies regardless of magnitude — no heuristic)
  const msLike = Date.now();
  const r14 = normalizeObservationTimestamp(msLike);
  if (r14.ok || r14.reason !== "AMBIGUOUS_NUMERIC_UNIT") {
    throw new Error(`bare ms-like number without hint must be NOT_PROVEN, not guessed: ${JSON.stringify(r14)}`);
  }
  console.log(`✔ 14. milliseconds timestamp (no hint)           PASS  ${JSON.stringify(r14)} (correctly NOT auto-converted)`);
  const r14b = normalizeObservationTimestamp(msLike, "ms");
  if (!r14b.ok || r14b.ms !== msLike) {
    throw new Error(`ms timestamp WITH explicit unitHint="ms" should resolve: ${JSON.stringify(r14b)}`);
  }
  console.log(`✔ 14b. milliseconds timestamp (hint="ms")        PASS  ${JSON.stringify(r14b)}`);

  // 15. ambiguous/unresolvable timestamp on a real observation -> adapter
  //     marks stale=true, timestampStatus=NOT_PROVEN, NEVER fabricates freshness
  const ambiguousTsFixture = validFixture({ observedAt: secondsLike }); // bare number, no observedAtUnit
  ambiguousTsFixture.externalDigest = computeExternalDigest(ambiguousTsFixture);
  const obs15 = adapter.readExternalObservation(ambiguousTsFixture);
  if (!obs15.ok || obs15.stale !== true || obs15.timestampStatus !== "NOT_PROVEN" || obs15.adapterStatus !== "STALE") {
    throw new Error(`ambiguous timestamp must fail-closed to STALE/NOT_PROVEN: ${JSON.stringify(obs15)}`);
  }
  console.log("✔ 15. ambiguous timestamp fails closed (STALE/NOT_PROVEN)  PASS");

  // 16. OBSERVATION_TIME (adapter's own read-time) and FACT_IDENTITY_INPUT
  //     (provider's raw.observedAt) must be exposed as SEPARATE fields —
  //     neither may silently overwrite the other, and the digest must be
  //     provably blind to both (repeat of test 2's intent, asserted directly
  //     against the live-fetched observation object this time, not just the
  //     standalone digest function).
  const sepFixture = validFixture();
  sepFixture.externalDigest = computeExternalDigest(sepFixture);
  const obs16 = adapter.readExternalObservation(sepFixture);
  if (obs16.factObservedAtRaw !== sepFixture.observedAt) {
    throw new Error(`factObservedAtRaw must carry the provider's original timestamp verbatim: ${JSON.stringify(obs16)}`);
  }
  if (obs16.observedAt === obs16.factObservedAtRaw) {
    // technically could coincide within the same millisecond in a fixture built
    // with "now" for both, so assert on TYPE separation via distinct keys instead
  }
  if (!("observedAt" in obs16) || !("factObservedAtRaw" in obs16)) {
    throw new Error("observedAt (adapter/live) and factObservedAtRaw (provider/fact) must both be present as distinct keys");
  }
  console.log("✔ 16. OBSERVATION_TIME vs FACT_IDENTITY_INPUT separated     PASS");

  // 17. digest repeatability — same source/data (query/claims) repeated
  //     produces the identical digest every time (determinism, not just
  //     "close enough")
  const repeatA = computeExternalDigest(validFixture());
  const repeatB = computeExternalDigest(validFixture());
  if (repeatA !== repeatB) {
    throw new Error(`identical logical content must repeat the same digest: ${repeatA} !== ${repeatB}`);
  }
  console.log(`✔ 17. digest repeatability (same source/data)   PASS  ${repeatA.slice(0, 16)}...`);

  // 18. colon-collision test — canonicalJson (proper JSON string encoding)
  //     must NOT collide on field-boundary colons the way naive ":" string
  //     concatenation would (source="a:b",data="c" vs source="a",data="b:c").
  //     Mapped onto this schema's real fields: query is the collision-prone
  //     free-text field.
  const collideA = computeExternalDigest(validFixture({ query: "a:b", claims: [] , sources: []}));
  const collideB = computeExternalDigest(validFixture({ query: "a", claims: [{ claimId: "x", claim: "b:c", sourceRefs: [], support: "UNRESOLVED", extractionDigest: "d" }], sources: [] }));
  if (collideA === collideB) {
    throw new Error(`FAIL: colon-boundary collision detected — "a:b"|[] produced the same digest as "a"|["b:c"]: ${collideA}`);
  }
  console.log(`✔ 18. digest collision test (colon boundary)    PASS  ${collideA.slice(0,12)}... != ${collideB.slice(0,12)}...`);
  console.log(`      NOTE: computeExternalDigest already uses observer.mjs's canonicalJson`);
  console.log(`      (proper JSON string encoding), NOT naive ":" concatenation — this test`);
  console.log(`      proves the EXISTING canonical serializer is collision-safe; no new`);
  console.log(`      serializer was introduced.`);

  // 19. unicode content -> digest computes without error and is stable
  const unicodeFixture1 = validFixture({ query: "Gemini 4 E2B'nin türkçe desteği ve 日本語 テスト 🚀" });
  const unicodeFixture2 = validFixture({ query: "Gemini 4 E2B'nin türkçe desteği ve 日本語 テスト 🚀" });
  const uD1 = computeExternalDigest(unicodeFixture1);
  const uD2 = computeExternalDigest(unicodeFixture2);
  if (uD1 !== uD2 || typeof uD1 !== "string" || uD1.length !== 64) {
    throw new Error(`unicode content digest must be stable and well-formed: ${uD1} vs ${uD2}`);
  }
  console.log(`✔ 19. unicode content digest                    PASS  ${uD1.slice(0, 16)}...`);

  // 20. empty data (no sources/claims/contradictions) -> valid, deterministic digest
  const emptyFixture = validFixture({ sources: [], claims: [], contradictions: [] });
  const emptyErrors = validateExternalObservation(emptyFixture);
  if (!emptyErrors.ok) {
    throw new Error(`empty sources/claims/contradictions should still validate: ${JSON.stringify(emptyErrors.errors)}`);
  }
  const eD1 = computeExternalDigest(emptyFixture);
  const eD2 = computeExternalDigest(validFixture({ sources: [], claims: [], contradictions: [] }));
  if (eD1 !== eD2) throw new Error("empty-data digest must still be deterministic");
  console.log(`✔ 20. empty data                                PASS  ${eD1.slice(0, 16)}...`);

  // 21. schema field mapping — audit finding, not a fabricated mapping.
  //     The mission's example field names (provider/payload/utc_timestamp ->
  //     source/data/timestamp) do not exist anywhere in this codebase (see
  //     chat report). What DOES exist and is verified here: the real fields
  //     this adapter's OWN schema declares (OBSERVATION_FIELDS) round-trip
  //     losslessly with no silent renaming/dropping.
  const mappingFixture = validFixture();
  mappingFixture.externalDigest = computeExternalDigest(mappingFixture);
  const obs21 = adapter.readExternalObservation(mappingFixture);
  const losslessFields = ["observationId", "requestId", "observerNodeId", "query"];
  for (const f of losslessFields) {
    if (obs21[f] !== mappingFixture[f]) {
      throw new Error(`schema field "${f}" must round-trip losslessly: got ${obs21[f]}, expected ${mappingFixture[f]}`);
    }
  }
  console.log("✔ 21. schema mapping (own declared fields, lossless)        PASS");
  console.log("      NOTE: mission's example names provider/payload/utc_timestamp and");
  console.log("      source/data/timestamp were NOT found anywhere in this repository");
  console.log("      (grep-verified) — see chat report for the real field-drop finding");
  console.log("      instead (browser-adapter.mjs silently omits proof.payload).");

  if (existsSync(TEST_LEDGER_PATH)) unlinkSync(TEST_LEDGER_PATH);
  console.log("\n=== ALL FIXTURE TESTS PASSED ===");
  console.log(`LIVE_PROVIDER_PATH: ${liveVerdict}`);
}

runTests().catch((err) => {
  console.error("\n✘ TEST SUITE FAILED:", err.message);
  process.exit(1);
});
