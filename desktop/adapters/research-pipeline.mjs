// AIOS External Research Pipeline — Provider Abstraction + Fact Binding + Comparator
//
// Google'ın canlı arama otomasyon yolu bu ortamdan KANITLANMIŞ şekilde
// engellenmiştir (2026-08-22, iki bağımsız canlı deneme: udm=50 AI Mode
// sorgusu VE düz "hello world" sorgusu, aynı IP, ilk istekte
// google.com/sorry/index bot-tespit duvarı - oturum kurulmadan, sorgu
// bağımsız). Bu dosya o gerçeği DEĞİŞTİRMEZ, tekrar canlı denemez, ve
// hiçbir stealth/fingerprint-spoof/proxy/CAPTCHA-bypass içermez.
//
// Mevcut external-research-adapter.mjs YENİDEN YAZILMADI - yalnızca
// exported saf fonksiyonları (validateExternalObservation,
// computeExternalDigest) ve ExternalResearchAdapter sınıfı tüketiliyor.
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "../observer.mjs";
import {
  validateExternalObservation,
  computeExternalDigest,
  defaultExternalResearchAdapter,
} from "./external-research-adapter.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEMMA_READINESS_PATH = resolve(__dirname, "..", "..", "artifacts-catalog", "gemma-readiness-checklist.json");

// FACT_IDENTITY_INPUT (sources[].publishedAt, gerçek yayın tarihleri) SABİTTİR.
// OBSERVATION_TIME (observedAt/retrievedAt) ise bilerek CANLI bırakılır:
// computeExternalDigest() bu iki alanı digest'ten HARİÇ TUTAR (dosya başındaki
// external-research-adapter.mjs docstring'i, satır 122-128), dolayısıyla
// observedAt'i "şimdi" yapmak digest determinizmini BOZMAZ, yalnızca
// fixture'ın her koşuda taze bir gözlem olarak (staleTtlMs içinde)
// değerlendirilmesini sağlar - kalıcı olarak STALE'e düşen bir demo yerine.

export const PROVIDER_STATE = Object.freeze({
  AVAILABLE: "AVAILABLE",
  BLOCKED: "BLOCKED",
  FIXTURE: "FIXTURE",
});

/**
 * Google AI Mode connector. Canlı bir ağ isteği ATMAZ - bu oturumda zaten
 * kanıtlanmış BLOCKED durumunu sabit olarak raporlar (bkz. dosya başı not).
 * Gerçek durum değişirse (örn. resmi API anahtarı sağlanırsa) bu sınıf
 * güncellenmeden önce yeni bir kanıtlanmış deneme gerekir.
 */
export class GoogleAIModeProvider {
  constructor() {
    this.providerId = "google-ai-mode";
  }

  async execute() {
    return {
      ok: false,
      providerId: this.providerId,
      providerState: PROVIDER_STATE.BLOCKED,
      reason: "GOOGLE_SEARCH_AUTOMATION_PATH_BLOCKED",
      detail:
        "Google bot-detection returned /sorry/index on first request, verified session-independent " +
        "and query-independent via two live probes on 2026-08-22 from this environment's egress IP. " +
        "Not retried; no bypass attempted.",
      observedAt: new Date().toISOString(),
    };
  }
}

/**
 * Deterministik fixture provider - gerçek dış gözlem artifact formatıyla
 * (aios.external-observation.v1) AYNI contract'ı üretir. Kaynaklar gerçek,
 * yayında olan resmi Google dokümantasyon URL'leridir (içerik metni
 * fixture'dır, canlı bir fetch YAPILMAZ).
 */
export class FixtureResearchProvider {
  constructor() {
    this.providerId = "fixture-research-provider";
  }

  async execute(request) {
    const query = String(request?.query || "");
    const requestId = String(request?.requestId || "req-ext-fixture");
    const observationId = "obs-ext-" + sha256(query).slice(0, 16);
    const observationTime = new Date().toISOString();

    const sources = [
      {
        sourceId: "src-android-gemma-1",
        url: "https://ai.google.dev/gemma/docs/integrations/android",
        title: "Gemma on Android — official integration guide",
        publishedAt: "2025-06-01T00:00:00.000Z",
        retrievedAt: observationTime,
        sourceClass: "OFFICIAL_DOCUMENTATION",
        contentDigest: "sha256:fixture-gemma-android-doc-v1",
        retrievalStatus: "OK",
      },
      {
        sourceId: "src-android-gemma-2",
        url: "https://developers.google.com/ai-edge/mediapipe/solutions/genai/llm_inference/android",
        title: "MediaPipe LLM Inference API for Android — on-device Gemma execution",
        publishedAt: "2025-05-01T00:00:00.000Z",
        retrievedAt: observationTime,
        sourceClass: "OFFICIAL_DOCUMENTATION",
        contentDigest: "sha256:fixture-mediapipe-llm-doc-v1",
        retrievalStatus: "OK",
      },
    ];

    const claims = [
      {
        claimId: "claim-1",
        claim:
          "Gemma models can run fully on-device on Android via the MediaPipe LLM Inference API / LiteRT-LM " +
          "runtime; this requires an app to bundle the runtime and model weights explicitly - it is not a " +
          "capability present on stock Android out of the box.",
        sourceRefs: ["src-android-gemma-1", "src-android-gemma-2"],
        support: "SUPPORTED",
        extractionDigest: "sha256:" + sha256("claim-1:" + query).slice(0, 16),
      },
    ];

    const observation = {
      schema: "aios.external-observation.v1",
      observationId,
      requestId,
      observerNodeId: "node-fixture-research-provider",
      query,
      observedAt: observationTime,
      sources,
      claims,
      contradictions: [],
      status: "COMPLETE",
    };

    const externalDigest = computeExternalDigest(observation);
    const full = { ...observation, externalDigest };
    const { ok, errors } = validateExternalObservation(full);

    return {
      ok,
      errors,
      providerId: this.providerId,
      providerState: PROVIDER_STATE.FIXTURE,
      observation: full,
      providerEvidenceDigest: externalDigest,
      providerObservedAt: new Date().toISOString(),
    };
  }
}

/**
 * Provider seçimi: önce Google (kanıtlanmış BLOCKED durumu, canlı istek
 * atmadan), sonra fixture'a düşer. Yeni bir "en iyi sağlayıcı" mantığı
 * icat etmez - iki durumlu, açık, fail-closed bir seçim.
 */
export async function selectResearchProvider() {
  const google = new GoogleAIModeProvider();
  const googleResult = await google.execute();
  if (googleResult.ok) {
    return { provider: google, providerResult: googleResult };
  }
  const fixture = new FixtureResearchProvider();
  return { provider: fixture, providerResult: null, googleBlocked: googleResult };
}

/** AIOS'un bu konudaki MEVCUT tek gerçeklik kaynağı - yeni bir fact icat etmez. */
export function readGemmaReadinessReality() {
  if (!existsSync(GEMMA_READINESS_PATH)) {
    return { ok: false, reason: "GEMMA_READINESS_ARTIFACT_NOT_FOUND" };
  }
  try {
    const raw = JSON.parse(readFileSync(GEMMA_READINESS_PATH, "utf8"));
    return { ok: true, readiness: raw };
  } catch (err) {
    return { ok: false, reason: `PARSE_ERROR: ${err.message}` };
  }
}

/**
 * Comparator (P/O/R): Provider'ın iddiası (claim.support) ile AIOS'un
 * kendi ölçülmüş gerçekliğini (gemma-readiness-checklist.json) karşılaştırır.
 * Semantik eşdeğerlik kanıtlanamıyorsa NOT_COMPARABLE - asla SUPPORTED
 * varsayılmaz.
 */
export function compareClaimAgainstReality(claim, readinessResult) {
  if (!readinessResult?.ok) return "NOT_COMPARABLE";
  const r = readinessResult.readiness;
  if (!claim) return "NOT_COMPARABLE";
  if (claim.support === "UNRESOLVED") return "UNRESOLVED";

  // Claim'in konuştuğu alan: cihazın kendisi + Android sürümü (ölçülmüş) VE
  // gerçek Gemma çalışma-zamanı (LiteRT-LM/model varlığı - NOT_MEASURED).
  const deviceMeasured = r.device?.measured === true && r.androidVersion?.measured === true;
  const runtimeMeasured = r.liteRtLmVersionCandidate?.status === "MEASURED" && r.modelVariant?.status === "MEASURED";

  if (!deviceMeasured) return "NOT_COMPARABLE";
  // Cihaz/OS ölçülmüş ama gerçek Gemma çalışma-zamanı bu cihazda hiç
  // ÖLÇÜLMEMİŞ (mission Part 12 - NOT_MEASURED). Provider'ın "çalıştırılabilir"
  // iddiası bu YÜZDEN bu spesifik cihazda ne doğrulanabilir ne çürütülebilir -
  // fail-closed NOT_COMPARABLE, asla otomatik SUPPORTED'a yükseltilmez.
  if (!runtimeMeasured) return "NOT_COMPARABLE";

  if (claim.support === "SUPPORTED") return "SUPPORTED";
  if (claim.support === "CONTRADICTED") return "CONTRADICTED";
  return "UNRESOLVED";
}

/**
 * Uçtan uca dikey dilim: provider seçimi -> fixture/blocked gözlem ->
 * mevcut adapter üzerinden normalizasyon/digest -> comparator -> görünür
 * yüzey alanları. Her aşamanın gerçek duvar-saati gecikmesi ölçülür.
 */
export async function runResearchPipeline({ query, requestId }) {
  const t0 = performance.now();

  const { provider, providerResult, googleBlocked } = await selectResearchProvider();
  const t1 = performance.now();

  if (provider instanceof GoogleAIModeProvider) {
    // Bu koda hiç girilmemesi beklenir (selectResearchProvider zaten
    // BLOCKED durumunda fixture'a düşer) - yine de fail-closed bırakılır.
    return {
      ok: false,
      providerState: PROVIDER_STATE.BLOCKED,
      googleBlocked: providerResult,
      comparator: "NOT_COMPARABLE",
    };
  }

  const providerExec = await provider.execute({ query, requestId });
  const t2 = performance.now();

  if (!providerExec.ok) {
    return { ok: false, providerState: providerExec.providerState, errors: providerExec.errors, googleBlocked };
  }

  // Mevcut adapter'ı YENİDEN YAZMADAN, tam olduğu gibi tüket - normalizasyon,
  // staleness, digest-match kontrolü hep adapter'ın kendi mantığıyla yapılır.
  const ingested = defaultExternalResearchAdapter.readExternalObservation(providerExec.observation);
  const t3 = performance.now();

  const readinessResult = readGemmaReadinessReality();
  const primaryClaim = providerExec.observation.claims[0] || null;
  const comparator = ingested.stale ? "STALE" : compareClaimAgainstReality(primaryClaim, readinessResult);
  const t4 = performance.now();

  return {
    ok: true,
    googleBlocked,
    providerId: providerExec.providerId,
    providerState: providerExec.providerState,
    query,
    requestId,
    sources: providerExec.observation.sources,
    claims: providerExec.observation.claims,
    contradictions: providerExec.observation.contradictions,
    providerEvidenceDigest: providerExec.providerEvidenceDigest,
    observationDigest: ingested.computedDigest,
    digestMatch: ingested.digestMatch,
    ingestedStatus: ingested.adapterStatus,
    ingestedStale: ingested.stale,
    evidenceRef: ingested.evidenceRef,
    readiness: readinessResult.ok ? readinessResult.readiness : null,
    readinessError: readinessResult.ok ? null : readinessResult.reason,
    comparator,
    metrics: {
      providerSelectionMs: Math.round((t1 - t0) * 100) / 100,
      providerExecutionMs: Math.round((t2 - t1) * 100) / 100,
      normalizationMs: Math.round((t3 - t2) * 100) / 100,
      comparatorMs: Math.round((t4 - t3) * 100) / 100,
      totalPipelineMs: Math.round((t4 - t0) * 100) / 100,
    },
  };
}
