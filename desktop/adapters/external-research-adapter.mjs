import { readFileSync, existsSync } from "node:fs";
import { canonicalJson, sha256, defaultLedger } from "../observer.mjs";
import { calculateNodeIdentity } from "../attestation.mjs";

// Provider surface: D:\dev\ai_browser is AdSentinel + Playwright, not a
// research engine. It does not (yet) expose Google AI Mode automation.
// This adapter consumes a structured observation artifact the provider
// *would* write, mirroring the existing browser-adapter.mjs pattern. Until
// that artifact exists, readExternalObservation() reports NOT_AVAILABLE
// rather than fabricating a live path.
const DEFAULT_OBSERVATION_PATH = "D:\\dev\\ai_browser\\proof\\external-observation-latest.json";
const STALE_TTL_MS = 60 * 60 * 1000; // 1 saat
const SCHEMA = "aios.external-observation.v1";

const SUPPORT_VALUES = ["SUPPORTED", "CONTRADICTED", "UNRESOLVED"];

const OBSERVATION_FIELDS = [
  "observationId", "requestId", "observerNodeId", "query", "observedAt",
  "sources", "claims", "contradictions", "status", "externalDigest",
];
const SOURCE_FIELDS = [
  "sourceId", "url", "title", "publishedAt", "retrievedAt",
  "sourceClass", "contentDigest", "retrievalStatus",
];
const CLAIM_FIELDS = ["claimId", "claim", "sourceRefs", "support", "extractionDigest"];

/**
 * Web'den gelen her metin alanı UNTRUSTED_CONTENT'tir: yalnızca string
 * olarak saklanır, asla eval/exec/tool-call/shell komutuna dönüşmez. Bu
 * kontrol onu garanti eden tek yer - obje/fonksiyon geçemez, sadece string.
 */
function isUntrustedString(v) {
  return typeof v === "string";
}

function validateSource(s, i, errors) {
  if (!s || typeof s !== "object") { errors.push(`sources[${i}]: not an object`); return; }
  for (const f of SOURCE_FIELDS) {
    if (!(f in s)) errors.push(`sources[${i}].${f}: missing`);
  }
  for (const f of ["url", "title", "sourceClass", "retrievalStatus", "contentDigest", "sourceId"]) {
    if (f in s && !isUntrustedString(s[f])) errors.push(`sources[${i}].${f}: must be string (UNTRUSTED_CONTENT)`);
  }
}

function validateClaim(c, i, sourceIds, errors) {
  if (!c || typeof c !== "object") { errors.push(`claims[${i}]: not an object`); return; }
  for (const f of CLAIM_FIELDS) {
    if (!(f in c)) errors.push(`claims[${i}].${f}: missing`);
  }
  if ("claim" in c && !isUntrustedString(c.claim)) errors.push(`claims[${i}].claim: must be string (UNTRUSTED_CONTENT)`);
  if ("support" in c && !SUPPORT_VALUES.includes(c.support)) {
    errors.push(`claims[${i}].support: must be one of ${SUPPORT_VALUES.join("/")}`);
  }
  if ("sourceRefs" in c) {
    if (!Array.isArray(c.sourceRefs)) {
      errors.push(`claims[${i}].sourceRefs: must be array`);
    } else {
      for (const ref of c.sourceRefs) {
        if (!sourceIds.has(ref)) errors.push(`claims[${i}].sourceRefs: unresolved reference "${ref}"`);
      }
    }
  }
}

/**
 * aios.external-observation.v1 şemasını doğrular. Provenance (claim ->
 * source) ve support enum'unu da kontrol eder. Hiçbir alan asla tool-call
 * veya komut olarak yorumlanmaz - sadece veri.
 */
export function validateExternalObservation(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["observation: not an object"] };
  if (raw.schema && raw.schema !== SCHEMA) errors.push(`schema: expected ${SCHEMA}, got ${raw.schema}`);

  for (const f of OBSERVATION_FIELDS) {
    if (!(f in raw)) errors.push(`${f}: missing`);
  }
  if (!Array.isArray(raw.sources)) errors.push("sources: must be array");
  if (!Array.isArray(raw.claims)) errors.push("claims: must be array");
  if (!Array.isArray(raw.contradictions)) errors.push("contradictions: must be array");

  const sourceIds = new Set();
  if (Array.isArray(raw.sources)) {
    raw.sources.forEach((s, i) => {
      validateSource(s, i, errors);
      if (s && typeof s.sourceId === "string") sourceIds.add(s.sourceId);
    });
  }
  if (Array.isArray(raw.claims)) {
    raw.claims.forEach((c, i) => validateClaim(c, i, sourceIds, errors));
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Bir provider zaman damgasını epoch-ms'e çevirir - birimi ASLA tahmin
 * etmeden. Yalnızca iki durum güvenli kabul edilir:
 *   1) ISO 8601 string (Date.parse başarılı)
 *   2) sayısal deger + acik `unitHint` ("ms" | "s")
 * Bare bir sayı (unitHint yok) - saniye mi milisaniye mi belirsiz - ASLA
 * *1000 veya /1000 ile "duzeltilmez"; NOT_PROVEN doner. Bu, PATCH
 * SPECIFICATION'ın "otomatik donusum yapma, belirsizse NOT_PROVEN birak"
 * kuralının birebir uygulanmasidir.
 */
export function normalizeObservationTimestamp(rawValue, unitHint) {
  if (rawValue == null) return { ok: false, reason: "MISSING" };
  if (typeof rawValue === "string") {
    const parsed = Date.parse(rawValue);
    if (Number.isFinite(parsed)) return { ok: true, ms: parsed, unit: "iso-string" };
    return { ok: false, reason: "UNPARSEABLE_STRING" };
  }
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    if (unitHint === "ms") return { ok: true, ms: rawValue, unit: "explicit-ms" };
    if (unitHint === "s") return { ok: true, ms: rawValue * 1000, unit: "explicit-s" };
    return { ok: false, reason: "AMBIGUOUS_NUMERIC_UNIT" };
  }
  return { ok: false, reason: "UNSUPPORTED_TYPE" };
}

/**
 * Kanonik içerik özeti - query + sources + claims + contradictions üzerinden,
 * yerel/geçici alanlar (retrievedAt/observedAt) hariç. Aynı içerik her
 * zaman aynı digest'i üretir (determinism). ÖNEMLİ DEĞİŞMEZ: bu fonksiyona
 * hiçbir zaman canlı/yerel bir saat (observedAt, retrievedAt, Date.now())
 * girmez - FACT_IDENTITY_INPUT ile OBSERVATION_TIME arasındaki ayrım burada
 * uygulanır. Test: computeExternalDigest testleri (aşağıda #2, #10-#13).
 */
export function computeExternalDigest(observation) {
  const canonicalPayload = {
    query: observation.query,
    sources: (observation.sources || []).map((s) => ({
      sourceId: s.sourceId, url: s.url, title: s.title, publishedAt: s.publishedAt,
      sourceClass: s.sourceClass, contentDigest: s.contentDigest, retrievalStatus: s.retrievalStatus,
    })),
    claims: (observation.claims || []).map((c) => ({
      claimId: c.claimId, claim: c.claim, sourceRefs: c.sourceRefs,
      support: c.support, extractionDigest: c.extractionDigest,
    })),
    contradictions: observation.contradictions || [],
  };
  return sha256(canonicalJson(canonicalPayload));
}

export class ExternalResearchAdapter {
  constructor(options = {}) {
    this.observationPath = options.observationPath || DEFAULT_OBSERVATION_PATH;
    this.ledger = options.ledger || defaultLedger;
    this.staleTtlMs = options.staleTtlMs || STALE_TTL_MS;
  }

  /** Adapter'ın kendi (tüketici tarafı) node kimliği - AIOS canonical. */
  getNodeIdentity() {
    return calculateNodeIdentity({
      agentName: "external-research-observer",
      agentVersion: "1.0.0",
      arch: "x64",
      endpoint: "browser://chromium/external-research",
      platform: "browser",
    });
  }

  getAgentCard() {
    return {
      protocolVersion: "1.0",
      name: "external-research-observer",
      version: "1.0.0",
      nodeId: this.getNodeIdentity(),
      platform: "browser",
      runtime: "chromium",
      url: "browser://chromium/external-research",
      skills: [
        {
          id: "skill-external-research-observe",
          name: "External Research Observation (read-only)",
          description: "Reads provider-generated aios.external-observation.v1 artifacts. Not canonical reality.",
        },
      ],
      capabilities: [
        { name: "external.research.observe", class: "REFLEX", risk: "safe" },
      ],
    };
  }

  /**
   * Provider'ın (D:\dev\ai_browser) ürettiği yapılandırılmış gözlem
   * artefaktını okur, doğrular, digest'ini hesaplar/karşılaştırır.
   * customObservation verilirse (fixture/test) dosya okunmaz.
   */
  readExternalObservation(customObservation = null) {
    const consumerNodeId = this.getNodeIdentity();
    const base = {
      consumerNodeId,
      observedAt: new Date().toISOString(),
      untrustedContent: true,
    };
    let raw = customObservation;

    if (!raw) {
      if (!existsSync(this.observationPath)) {
        return {
          ok: false, adapterStatus: "NOT_AVAILABLE",
          error: "OBSERVATION_ARTIFACT_NOT_FOUND",
          detail: "Provider (D:\\dev\\ai_browser) has no Google AI Mode automation surface yet; no artifact was written.",
          ...base,
        };
      }
      try {
        raw = JSON.parse(readFileSync(this.observationPath, "utf8"));
      } catch (err) {
        return { ok: false, adapterStatus: "REJECTED", error: `PARSE_ERROR: ${err.message}`, ...base };
      }
    }

    const { ok, errors } = validateExternalObservation(raw);
    if (!ok) {
      return { ok: false, adapterStatus: "REJECTED", error: "SCHEMA_VALIDATION_FAILED", errors, ...base };
    }

    const computedDigest = computeExternalDigest(raw);
    const digestMatch = raw.externalDigest === computedDigest;

    // FACT_IDENTITY_INPUT (provider'ın kendi zaman iddiası, raw.observedAt)
    // ile OBSERVATION_TIME (bu adapter'ın artefaktı ŞU AN okuduğu canlı an,
    // base.observedAt) burada kasıtlı olarak AYRI tutulur - önceki sürüm
    // ...base spread'i ile ikisini "observedAt" adı altında çakıştırıyor ve
    // provider'ın orijinal zaman damgasını çağırana hiç sızdırmıyordu.
    const factTimestamp = normalizeObservationTimestamp(raw.observedAt, raw.observedAtUnit);
    // Birim belirsizse (AMBIGUOUS_NUMERIC_UNIT/UNPARSEABLE/MISSING) tazelik
    // KANITLANAMAZ - otomatik donusumle "taze" varsaymak yerine, bu
    // kod tabanindaki diger butun "PASS+stale asla Dogrulandi degildir"
    // orneklerindeki fail-closed ilkesiyle tutarli olarak stale=true kabul
    // edilir.
    const isStale = !factTimestamp.ok || (Date.now() - factTimestamp.ms) > this.staleTtlMs;
    const ageMs = factTimestamp.ok ? Date.now() - factTimestamp.ms : null;

    const adapterStatus = isStale ? "STALE" : "OBSERVED";
    const evidenceRef = `ext-obs-wit-${computedDigest.slice(0, 20)}`;

    return {
      ok: true,
      adapterStatus,
      stale: isStale,
      ageMs,
      timestampStatus: factTimestamp.ok ? "PROVEN" : "NOT_PROVEN",
      timestampUnresolvedReason: factTimestamp.ok ? null : factTimestamp.reason,
      // Provider'ın kendi fact-zaman iddiası - kayıpsız, işlenmemiş geçirilir.
      factObservedAtRaw: raw.observedAt,
      factObservedAtMs: factTimestamp.ok ? factTimestamp.ms : null,
      observationId: raw.observationId,
      requestId: raw.requestId,
      observerNodeId: raw.observerNodeId,
      query: raw.query,
      providerStatus: raw.status,
      sourcesCount: raw.sources.length,
      claimsCount: raw.claims.length,
      contradictionsCount: raw.contradictions.length,
      contradictions: raw.contradictions,
      externalDigest: raw.externalDigest,
      computedDigest,
      digestMatch,
      evidenceRef,
      ...base,
    };
  }

  /**
   * EXISTING EvidenceLedger'a bağlar - yeni bir ledger yok. externalDigest
   * asla realityDigest hesaplamasına karışmaz (bkz. phone-shared-reality.mjs);
   * bu event yalnızca kendi operation adıyla zincire eklenir.
   */
  recordObservationEvidence(observation) {
    if (!observation || !observation.ok) return null;

    const event = {
      operation: "external.research_observed",
      http_status: 200,
      success: true,
      response_data: {
        consumerNodeId: observation.consumerNodeId,
        observerNodeId: observation.observerNodeId,
        requestId: observation.requestId,
        observationId: observation.observationId,
        adapterStatus: observation.adapterStatus,
        externalDigest: observation.externalDigest,
        computedDigest: observation.computedDigest,
        digestMatch: observation.digestMatch,
        evidenceRef: observation.evidenceRef,
        stale: observation.stale,
      },
      metadata: {
        source: "external-research-observer",
        query: observation.query,
        observedAt: observation.observedAt,
        untrustedContent: true,
      },
    };

    this.ledger.append(event);
    return observation.evidenceRef;
  }

  /**
   * A2A Inbound Message Dispatcher - sadece read capability. Web içeriği
   * hiçbir koşulda instruction/tool-call/shell komutu olarak yorumlanmaz;
   * yalnızca `result.parts[].data` altında veri olarak döner.
   */
  async handleA2AMessage(a2aRequest = {}) {
    const { method, params = {} } = a2aRequest;

    if (method === "agent/card" || method === "agent.card") {
      return { jsonrpc: "2.0", result: this.getAgentCard() };
    }

    const capability = params.capability || params.operation;
    const allowedCaps = ["external.research.observe"];

    if (!allowedCaps.includes(capability)) {
      return {
        jsonrpc: "2.0",
        error: {
          code: -32601,
          message: `UNKNOWN_OR_DISALLOWED_CAPABILITY: ${capability || "NONE"}. external-research-observer is strictly read-only.`,
        },
      };
    }

    const observation = this.readExternalObservation(params.customObservation);
    this.recordObservationEvidence(observation);

    return {
      jsonrpc: "2.0",
      result: {
        parts: [
          { text: `External Research Observation: ${observation.adapterStatus}` },
          { data: observation },
        ],
      },
    };
  }
}

export const defaultExternalResearchAdapter = new ExternalResearchAdapter();
