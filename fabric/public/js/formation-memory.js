/* ═══════════════════════════════════════════════════════════════
   AI-OS · FORMATION MEMORY (Layer A deterministic primitive)
   ───────────────────────────────────────────────────────────────
   Bu dosya bir database, economic unit veya execution yolu DEGILDIR.
   Artifact'in taşınabilir formation kimliğini ve formation kümesinin
   deterministic JOIN işlemini tanımlar.

   Kimlik: content identity + canonical context + verification witness.
   createdAt, artifact id, session adı, cihaz kimliği, model metni veya
   similarity kimliğe girmez. Böylece aynı canonical input aynı formation
   identity'yi üretir; cihaz yalnızca kanıtı üreten bağlam olabilir.
   ═══════════════════════════════════════════════════════════════ */

export const FORMATION_SCHEMA = "aios.formation.v1";
export const FORMATION_MEMORY_SCHEMA = "aios.formation-memory.v1";

function canonicalValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonical sayi sonlu olmali");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = canonicalValue(value[key]);
    }
    return out;
  }
  throw new TypeError("canonical olmayan deger");
}

/** Nesne anahtarı ve dizi sırası korunarak deterministik JSON üretir. */
export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

async function sha256(value) {
  const text = typeof value === "string" ? value : canonicalJson(value);
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sortedStrings(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))].sort();
}

function artifactContent(artifact) {
  if (!artifact?.spec || typeof artifact.spec !== "object") throw new TypeError("formation icin ScreenSpec gerekli");
  return {
    title: typeof artifact.title === "string" ? artifact.title : "Artefakt",
    spec: artifact.spec,
  };
}

function formationContext(artifact, parents = []) {
  return {
    capabilities: sortedStrings(artifact?.capabilities),
    capabilitySetVersion: typeof artifact?.version === "string" ? artifact.version : null,
    provenanceKind: typeof artifact?.provenance === "string" ? artifact.provenance : "unknown",
    parents: sortedStrings(parents),
  };
}

async function rootWitness(contentId, contextId) {
  return {
    kind: "artifact-contract",
    contentId,
    contextId,
  };
}

function executionWitnessInput(execution, capabilities) {
  if (!execution || execution.kind !== "dispatcher-execution") {
    throw new TypeError("turetilmis formation icin dispatcher execution witness gerekli");
  }
  if (typeof execution.capability !== "string" || !capabilities.includes(execution.capability)) {
    throw new TypeError("execution witness capability formation sozlesmesinde olmali");
  }
  if (!("result" in execution)) throw new TypeError("execution witness sonucu gerekli");
  return execution;
}

async function makeFormation({ content, context, witness, verificationState }) {
  const contentId = "sha256:" + await sha256(content);
  const contextId = "sha256:" + await sha256(context);
  const normalizedWitness = canonicalValue(witness);
  const witnessId = "sha256:" + await sha256(normalizedWitness);
  const id = "formation:" + await sha256({ contentId, contextId, witnessId });
  return {
    schema: FORMATION_SCHEMA,
    id,
    contentId,
    contextId,
    witnessId,
    content: canonicalValue(content),
    context: canonicalValue(context),
    verification: { state: verificationState, witness: normalizedWitness },
  };
}

/** Yeni/legacy artifact için contract-doğrulanmış kök formation üretir. */
export async function createRootFormation(artifact) {
  const content = artifactContent(artifact);
  const context = formationContext(artifact);
  const contentId = "sha256:" + await sha256(content);
  const contextId = "sha256:" + await sha256(context);
  return makeFormation({
    content,
    context,
    witness: await rootWitness(contentId, contextId),
    verificationState: "contract-verified",
  });
}

/**
 * Yeni bir formation'in "derived" diyebilmesi için exact parent formation ve
 * dispatcher sonucu hash'lenmiş bir execution witness zorunludur. Bu saf
 * primitive journal'i kendisi okumaz; runtime'ın witness'ı completed task'tan
 * üretmesi ayrı execution bağlama işidir.
 */
export async function createDerivedFormation({ artifact, parents, execution }) {
  if (!Array.isArray(parents) || parents.length === 0) {
    throw new TypeError("turetilmis formation icin en az bir parent gerekli");
  }
  for (const parent of parents) {
    if (!(await verifyFormation(parent))) throw new TypeError("parent formation dogrulanamadi");
  }
  const parentIds = sortedStrings(parents.map((parent) => parent.id));
  const content = artifactContent(artifact);
  const context = formationContext(artifact, parentIds);
  const witness = executionWitnessInput(execution, context.capabilities);
  const resultDigest = "sha256:" + await sha256(witness.result);
  return makeFormation({
    content,
    context,
    witness: {
      kind: "dispatcher-execution",
      capability: witness.capability,
      resultDigest,
    },
    verificationState: "execution-witnessed",
  });
}

/** Formation kaydının content/context/witness kimliğiyle çelişmediğini denetler. */
export async function verifyFormation(formation) {
  try {
    if (!formation || formation.schema !== FORMATION_SCHEMA || !formation.content || !formation.context || !formation.verification?.witness) return false;
    const contentId = "sha256:" + await sha256(formation.content);
    const contextId = "sha256:" + await sha256(formation.context);
    const witnessId = "sha256:" + await sha256(formation.verification.witness);
    const id = "formation:" + await sha256({ contentId, contextId, witnessId });
    if (formation.id !== id || formation.contentId !== contentId || formation.contextId !== contextId || formation.witnessId !== witnessId) return false;
    const parents = formation.context.parents;
    if (!Array.isArray(parents) || canonicalJson(parents) !== canonicalJson(sortedStrings(parents))) return false;
    if (parents.length === 0) {
      const witness = formation.verification.witness;
      return formation.verification.state === "contract-verified"
        && witness.kind === "artifact-contract"
        && witness.contentId === contentId
        && witness.contextId === contextId;
    }
    const witness = formation.verification.witness;
    return formation.verification.state === "execution-witnessed"
      && witness.kind === "dispatcher-execution"
      && typeof witness.capability === "string"
      && formation.context.capabilities.includes(witness.capability)
      && typeof witness.resultDigest === "string";
  } catch {
    return false;
  }
}

function stableFormationOrder(formations) {
  return [...formations].sort((left, right) => left.id.localeCompare(right.id));
}

/** Set-union: idempotent, commutative ve associative deterministic JOIN. */
export async function joinFormationMemory(...memories) {
  const byId = new Map();
  for (const memory of memories) {
    for (const formation of memory || []) {
      if (!(await verifyFormation(formation))) throw new TypeError("gecersiz formation join edilemez");
      const existing = byId.get(formation.id);
      if (existing && canonicalJson(existing) !== canonicalJson(formation)) {
        throw new TypeError("ayni formation id farkli canonical kayitla birlesemez");
      }
      byId.set(formation.id, formation);
    }
  }
  return stableFormationOrder(byId.values());
}

/** Similarity yoktur: yalnız exact ID/content/context/capability sözleşmesiyle aday bulur. */
export function discoverFormations(memory, query = {}) {
  if (Object.hasOwn(query, "similarity") || Object.hasOwn(query, "threshold")) {
    throw new TypeError("semantic similarity formation identity yerine gecemez");
  }
  const requiredCapabilities = sortedStrings(query.capabilities);
  return stableFormationOrder(memory || []).filter((formation) => {
    if (query.id && formation.id !== query.id) return false;
    if (query.contentId && formation.contentId !== query.contentId) return false;
    if (query.contextId && formation.contextId !== query.contextId) return false;
    return requiredCapabilities.every((capability) => formation.context.capabilities.includes(capability));
  });
}

/** Taşınabilir paket zaman, cihaz, session veya rastgele artifact ID taşımaz. */
export async function exportFormationMemory(memory) {
  return {
    schema: FORMATION_MEMORY_SCHEMA,
    formations: await joinFormationMemory(memory),
  };
}

/** Başka ortamdan gelen paketi doğrular ve mevcut hafızaya deterministic JOIN uygular. */
export async function importFormationMemory(memory, portable) {
  if (!portable || portable.schema !== FORMATION_MEMORY_SCHEMA || !Array.isArray(portable.formations)) {
    throw new TypeError("gecersiz formation memory exportu");
  }
  return joinFormationMemory(memory, portable.formations);
}

