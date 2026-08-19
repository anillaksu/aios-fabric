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
export const RUNTIME_WITNESS_SCHEMA = "aios.runtime-witness.v1";
export const RUNTIME_PROVENANCE_EDGE_SCHEMA = "aios.runtime-provenance-edge.v1";

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

function isSha256Id(value) {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function isLedgerPreviousHash(value) {
  return value === "GENESIS" || isSha256Id(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
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

/* ─── Runtime witness / immutable provenance edge ────────────────────────
 * Runtime Ledger fiziksel surec kanitini, dispatcher ise execution kanitini
 * tasir. Ikisi ayni sey degildir. Bu primitive yalniz bunlarin ikisi de
 * dogrulandiginda bir formation'a immutable edge baglar; root formation asla
 * degistirilmez ve ham capability sonucu saklanmaz.
 */
export async function createRuntimeWitness({ parentFormationId, completion, ledger }) {
  if (!isNonEmptyString(parentFormationId)) throw new TypeError("exact parent formation gerekli");
  if (!completion || completion.type !== "task.completed") throw new TypeError("yalniz task.completed runtime witness uretebilir");
  if (!isNonEmptyString(completion.taskId) || !isNonEmptyString(completion.correlationId) || !isNonEmptyString(completion.capability)) {
    throw new TypeError("completion task/correlation/capability gerekli");
  }
  if (!ledger || ledger.role !== "fabric" || !["started", "replaced", "stable"].includes(ledger.status)) {
    throw new TypeError("yalniz mevcut fabric ledger checkpoint witness olabilir");
  }
  if (!isSha256Id(ledger.eventHash) || !isLedgerPreviousHash(ledger.previousHash)
    || !isSha256Id(ledger.processWitness) || !isSha256Id(ledger.sourceHash)) {
    throw new TypeError("ledger checkpoint hash zinciri eksik veya gecersiz");
  }

  // completion.result yalniz bu saf hesapta kullanilir; witness'a ham veri
  // degil onun digest'i yazilir. Dispatcher hassas sonuc redaksiyonunu zaten
  // completion'a uygulamis olmalidir.
  const resultDigest = "sha256:" + await sha256(completion.result);
  const body = {
    schema: RUNTIME_WITNESS_SCHEMA,
    parentFormationId,
    taskId: completion.taskId,
    correlationId: completion.correlationId,
    capability: completion.capability,
    resultDigest,
    ledger: {
      eventHash: ledger.eventHash,
      previousHash: ledger.previousHash,
      processWitness: ledger.processWitness,
      sourceHash: ledger.sourceHash,
    },
  };
  return { ...body, id: "runtime-witness:" + await sha256(body) };
}

export async function verifyRuntimeWitness(witness) {
  try {
    if (!witness || witness.schema !== RUNTIME_WITNESS_SCHEMA || !isNonEmptyString(witness.id)
      || !isNonEmptyString(witness.parentFormationId) || !isNonEmptyString(witness.taskId)
      || !isNonEmptyString(witness.correlationId) || !isNonEmptyString(witness.capability)
      || !isSha256Id(witness.resultDigest)) return false;
    const ledger = witness.ledger;
    if (!ledger || !isSha256Id(ledger.eventHash) || !isLedgerPreviousHash(ledger.previousHash)
      || !isSha256Id(ledger.processWitness) || !isSha256Id(ledger.sourceHash)) return false;
    const body = {
      schema: RUNTIME_WITNESS_SCHEMA,
      parentFormationId: witness.parentFormationId,
      taskId: witness.taskId,
      correlationId: witness.correlationId,
      capability: witness.capability,
      resultDigest: witness.resultDigest,
      ledger: {
        eventHash: ledger.eventHash,
        previousHash: ledger.previousHash,
        processWitness: ledger.processWitness,
        sourceHash: ledger.sourceHash,
      },
    };
    return witness.id === "runtime-witness:" + await sha256(body);
  } catch {
    return false;
  }
}

export async function createRuntimeProvenanceEdge({ parent, witness }) {
  if (!(await verifyFormation(parent))) throw new TypeError("exact parent formation dogrulanamadi");
  if (!(await verifyRuntimeWitness(witness))) throw new TypeError("runtime witness dogrulanamadi");
  if (parent.id !== witness.parentFormationId) throw new TypeError("runtime witness exact parent ile eslesmiyor");
  if (!parent.context.capabilities.includes(witness.capability)) {
    throw new TypeError("runtime witness capability parent formation sozlesmesinde degil");
  }
  const parentRef = {
    id: parent.id,
    contentId: parent.contentId,
    contextId: parent.contextId,
    witnessId: parent.witnessId,
  };
  const body = { schema: RUNTIME_PROVENANCE_EDGE_SCHEMA, parent: parentRef, witness };
  return { ...body, id: "provenance-edge:" + await sha256(body) };
}

export async function verifyRuntimeProvenanceEdge(edge, parent = null) {
  try {
    if (!edge || edge.schema !== RUNTIME_PROVENANCE_EDGE_SCHEMA || !isNonEmptyString(edge.id)
      || !edge.parent || !(await verifyRuntimeWitness(edge.witness))) return false;
    const parentRef = edge.parent;
    if (![parentRef.id, parentRef.contentId, parentRef.contextId, parentRef.witnessId].every(isNonEmptyString)
      || parentRef.id !== edge.witness.parentFormationId) return false;
    const body = { schema: RUNTIME_PROVENANCE_EDGE_SCHEMA, parent: parentRef, witness: edge.witness };
    if (edge.id !== "provenance-edge:" + await sha256(body)) return false;
    if (!parent) return true;
    return (await verifyFormation(parent))
      && parent.id === parentRef.id
      && parent.contentId === parentRef.contentId
      && parent.contextId === parentRef.contextId
      && parent.witnessId === parentRef.witnessId
      && parent.context.capabilities.includes(edge.witness.capability);
  } catch {
    return false;
  }
}

/** Immutable edge set-union: formation JOIN ile ayni cebirsel semantik. */
export async function joinRuntimeProvenance(...collections) {
  const byId = new Map();
  for (const collection of collections) {
    for (const edge of collection || []) {
      if (!(await verifyRuntimeProvenanceEdge(edge))) throw new TypeError("gecersiz runtime provenance edge join edilemez");
      const existing = byId.get(edge.id);
      if (existing && canonicalJson(existing) !== canonicalJson(edge)) {
        throw new TypeError("ayni provenance edge id farkli canonical kayitla birlesemez");
      }
      byId.set(edge.id, edge);
    }
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

/** Formation ve edge'leri ayni portable pakette, exact parent kontroluyla tasir. */
export async function exportFormationMemoryBundle(formations, provenanceEdges) {
  const joinedFormations = await joinFormationMemory(formations);
  const joinedEdges = await joinRuntimeProvenance(provenanceEdges);
  const parents = new Map(joinedFormations.map((formation) => [formation.id, formation]));
  for (const edge of joinedEdges) {
    if (!(await verifyRuntimeProvenanceEdge(edge, parents.get(edge.parent.id)))) {
      throw new TypeError("portable provenance edge exact parent olmadan export edilemez");
    }
  }
  return { schema: FORMATION_MEMORY_SCHEMA, formations: joinedFormations, provenanceEdges: joinedEdges };
}

export async function importFormationMemoryBundle(formations, provenanceEdges, portable) {
  if (!portable || portable.schema !== FORMATION_MEMORY_SCHEMA || !Array.isArray(portable.formations)
    || !Array.isArray(portable.provenanceEdges)) throw new TypeError("gecersiz formation provenance paketi");
  const joinedFormations = await joinFormationMemory(formations, portable.formations);
  const joinedEdges = await joinRuntimeProvenance(provenanceEdges, portable.provenanceEdges);
  const parents = new Map(joinedFormations.map((formation) => [formation.id, formation]));
  for (const edge of joinedEdges) {
    if (!(await verifyRuntimeProvenanceEdge(edge, parents.get(edge.parent.id)))) {
      throw new TypeError("import provenance edge exact parent olmadan kabul edilemez");
    }
  }
  return { formations: joinedFormations, provenanceEdges: joinedEdges };
}
