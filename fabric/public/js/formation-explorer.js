/* AIOS Formation Reuse Explorer projection.
 *
 * Yeni bir hafiza/graph formati degildir. Mevcut canonical Formation Memory
 * paketini, artefakt deposundaki exact backing artifact ile eslestirip
 * kullanicinin gezebilecegi salt-okunur bir urun projeksiyonuna cevirir.
 * Reuse burada execution degildir: kullanici yalniz mevcut artifact'i acmak
 * icin onay verir; capability eylemi sonradan mevcut artifact renderer'i ->
 * dispatcher yolunda gerceklesir.
 */

import {
  canonicalJson,
  discoverFormations,
  joinFormationMemory,
  joinRuntimeProvenance,
  verifyRuntimeProvenanceEdge,
} from "./formation-memory.js";

export const FORMATION_EXPLORER_SCHEMA = "aios.formation-explorer.v1";

function text(value, fallback = "—") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function shortId(id) {
  return String(id || "").replace(/^[^:]+:/, "").slice(0, 12);
}

function parseFilter(filter) {
  if (!filter) return { kind: "all" };
  if (typeof filter !== "string") throw new TypeError("formation explorer filtresi metin olmali");
  if (filter.startsWith("cap:")) {
    const capability = filter.slice(4);
    if (!capability) throw new TypeError("capability filtresi bos olamaz");
    return { kind: "capability", capability };
  }
  if (!filter.startsWith("formation:")) throw new TypeError("formation explorer filtresi exact formation veya capability olmali");
  return { kind: "formation", formationId: filter };
}

/** Artifact baglantisi yalniz ayni canonical formation kaydiysa kabul edilir. */
function exactArtifactByFormation(artifacts, formation) {
  const matches = (artifacts || []).filter((artifact) => artifact?.formation?.id === formation.id
    && canonicalJson(artifact.formation) === canonicalJson(formation));
  if (matches.length > 1) throw new TypeError("bir formation birden fazla exact artifact kaydina baglanamaz");
  return matches[0] || null;
}

/**
 * Saf, deterministic ve read-only reuse projection.
 * Title/prompt/similarity aday secmez; filtre yalniz exact formation ID veya
 * formation contract'indaki exact capability adidir.
 */
export async function projectFormationExplorer(formations, provenanceEdges, artifacts, { filter = null } = {}) {
  const parsed = parseFilter(filter);
  const joinedFormations = await joinFormationMemory(formations || []);
  const selected = parsed.kind === "formation"
    ? discoverFormations(joinedFormations, { id: parsed.formationId })
    : parsed.kind === "capability"
      ? discoverFormations(joinedFormations, { capabilities: [parsed.capability] })
      : joinedFormations;

  const parents = new Map(joinedFormations.map((formation) => [formation.id, formation]));
  const joinedEdges = await joinRuntimeProvenance(provenanceEdges || []);
  const edgesByFormation = new Map(selected.map((formation) => [formation.id, []]));
  for (const edge of joinedEdges) {
    const parent = parents.get(edge.parent?.id);
    if (!(await verifyRuntimeProvenanceEdge(edge, parent))) {
      throw new TypeError("gecersiz provenance edge explorer projeksiyonuna giremez");
    }
    if (edgesByFormation.has(edge.parent.id)) edgesByFormation.get(edge.parent.id).push(edge);
  }
  for (const edges of edgesByFormation.values()) edges.sort((left, right) => left.id.localeCompare(right.id));

  const records = selected.map((formation) => {
    const artifact = exactArtifactByFormation(artifacts, formation);
    const executions = (edgesByFormation.get(formation.id) || []).map((edge) => ({
      edgeId: edge.id,
      witnessId: edge.witness.id,
      taskId: edge.witness.taskId,
      capability: edge.witness.capability,
      resultDigest: edge.witness.resultDigest,
    }));
    const parentIds = [...(formation.context?.parents || [])];
    return {
      formationId: formation.id,
      // Kullanicinin listede okuyabilecegi kisa kimlik ozeti. Bu bir isim
      // degil, exact formation ID'sinin kisaltmasidir; eslesme her zaman tam
      // ID uzerinden yapilir.
      identitySummary: shortId(formation.id),
      title: text(formation.content?.title, shortId(formation.id)),
      origin: parentIds.length ? "derived" : "root",
      contentId: formation.contentId,
      contextId: formation.contextId,
      witnessId: formation.witnessId,
      capabilities: [...(formation.context?.capabilities || [])].sort(),
      // CONTEXT identity'nin bir parcasidir ve IDENTITY hash listesinden
      // ayri okunur: hangi capability kumesi surumunde, hangi kaynaktan ve
      // hangi exact parent'lardan turedigi. Alan kaynakta yoksa uydurulmaz.
      context: {
        provenanceKind: text(formation.context?.provenanceKind),
        capabilitySetVersion: text(formation.context?.capabilitySetVersion),
        parents: parentIds,
      },
      artifact: artifact ? { id: artifact.id, title: text(artifact.title, text(formation.content?.title)) } : null,
      verifiedExecutions: executions,
      verifiedUseCount: executions.length,
      provenanceStatus: "verified",
      // Witness semasi zaman/node alani tasimaz (createRuntimeWitness body'si:
      // schema/parent/task/correlation/capability/resultDigest/ledger). Bu
      // yuzden "son dogrulanmis kullanim ANI" kanonik olarak YOKTUR ve
      // uydurulmaz; yalnizca dogrulanmis kullanim SAYISI gosterilir.
      lastVerifiedUseAt: null,
      portability: "per-formation-proof-unavailable",
    };
  });
  const projection = {
    schema: FORMATION_EXPLORER_SCHEMA,
    filter: parsed,
    totalFormations: joinedFormations.length,
    records,
  };
  canonicalJson(projection);
  return projection;
}

export function formationExplorerSemanticProjection(projection) {
  if (!projection || projection.schema !== FORMATION_EXPLORER_SCHEMA) throw new TypeError("gecersiz formation explorer projection");
  return {
    schema: projection.schema,
    filter: projection.filter,
    totalFormations: projection.totalFormations,
    records: projection.records.map((record) => ({
      formationId: record.formationId,
      origin: record.origin,
      capabilities: record.capabilities,
      provenanceKind: record.context.provenanceKind,
      capabilitySetVersion: record.context.capabilitySetVersion,
      parents: record.context.parents,
      artifactId: record.artifact?.id || null,
      edgeIds: record.verifiedExecutions.map((execution) => execution.edgeId),
    })),
  };
}

export function findFormationExplorerRecord(projection, formationId) {
  if (!projection || projection.schema !== FORMATION_EXPLORER_SCHEMA) return null;
  return projection.records.find((record) => record.formationId === formationId) || null;
}
