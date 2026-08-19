/* AIOS Formation Canvas projection.
 * Bu modul graph depolamaz, identity uretmez ve mutation yapmaz. Yalniz
 * dogrulanmis Formation Memory + immutable runtime provenance verisini
 * kararlı bir gorunur projeksiyona cevirir. */

import {
  canonicalJson,
  joinFormationMemory,
  joinRuntimeProvenance,
  verifyRuntimeProvenanceEdge,
} from "./formation-memory.js";

export const FORMATION_CANVAS_SCHEMA = "aios.formation-canvas.v1";
export const DEFAULT_FORMATION_CANVAS_LIMIT = 48;

function text(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function shortId(id) {
  return String(id || "").replace(/^[^:]+:/, "").slice(0, 12);
}

/** Saf, read-only ve sira-bagimsiz graph projection. */
export async function projectFormationCanvas(formations, provenanceEdges, { limit = DEFAULT_FORMATION_CANVAS_LIMIT } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError("formation canvas limiti pozitif tam sayi olmali");
  const joinedFormations = await joinFormationMemory(formations || []);
  const selected = joinedFormations.slice(0, limit);
  const parentById = new Map(selected.map((formation) => [formation.id, formation]));
  const joinedEdges = await joinRuntimeProvenance(provenanceEdges || []);
  const visibleEdges = [];
  for (const edge of joinedEdges) {
    const parent = parentById.get(edge.parent?.id);
    if (parent && await verifyRuntimeProvenanceEdge(edge, parent)) visibleEdges.push(edge);
  }

  const edgeGroups = new Map(selected.map((formation) => [formation.id, []]));
  for (const edge of visibleEdges) edgeGroups.get(edge.parent.id).push(edge);
  for (const list of edgeGroups.values()) list.sort((left, right) => left.id.localeCompare(right.id));

  const nodes = [];
  const links = [];
  const positions = new Map();
  let y = 40;
  for (const [index, formation] of selected.entries()) {
    const x = 36 + (index % 2) * 360;
    if (index > 0 && index % 2 === 0) y += 250;
    const formationNode = {
      id: formation.id,
      kind: (formation.context?.parents || []).length ? "derived-formation" : "root-formation",
      title: text(formation.content?.title, shortId(formation.id)),
      subtitle: `${(formation.context?.capabilities || []).length} capability · ${shortId(formation.id)}`,
      formationId: formation.id,
      contentId: formation.contentId,
      contextId: formation.contextId,
      witnessId: formation.witnessId,
      capabilities: [...(formation.context?.capabilities || [])],
      position: { x, y },
    };
    nodes.push(formationNode);
    positions.set(formation.id, formationNode.position);
    const group = edgeGroups.get(formation.id) || [];
    group.forEach((edge, edgeIndex) => {
      const executionId = `execution:${edge.id}`;
      const executionNode = {
        id: executionId,
        kind: "reuse-execution",
        title: edge.witness.capability,
        subtitle: `task ${shortId(edge.witness.taskId)} · ${shortId(edge.id)}`,
        formationId: formation.id,
        edgeId: edge.id,
        witnessId: edge.witness.id,
        taskId: edge.witness.taskId,
        resultDigest: edge.witness.resultDigest,
        position: { x: x + 26, y: y + 104 + edgeIndex * 76 },
      };
      nodes.push(executionNode);
      links.push({ id: `reuse:${edge.id}`, kind: "reuse", from: formation.id, to: executionId });
    });
  }

  for (const formation of selected) {
    for (const parentId of formation.context?.parents || []) {
      if (positions.has(parentId)) links.push({ id: `derived:${parentId}:${formation.id}`, kind: "derived", from: parentId, to: formation.id });
    }
  }
  links.sort((left, right) => left.id.localeCompare(right.id));
  const width = selected.length > 1 ? 760 : 396;
  const maxExecutions = Math.max(0, ...[...edgeGroups.values()].map((group) => group.length));
  const height = Math.max(300, y + 160 + maxExecutions * 76);
  const projection = {
    schema: FORMATION_CANVAS_SCHEMA,
    limit,
    totalFormations: joinedFormations.length,
    omittedFormations: Math.max(0, joinedFormations.length - selected.length),
    nodes,
    links,
    bounds: { width, height },
  };
  // Bu satir projection'in kanonik serialize edilebilirligini erkenden zorlar.
  canonicalJson(projection);
  return projection;
}

export function formationCanvasSemanticProjection(projection) {
  if (!projection || projection.schema !== FORMATION_CANVAS_SCHEMA) throw new TypeError("gecersiz formation canvas projection");
  return {
    schema: projection.schema,
    limit: projection.limit,
    totalFormations: projection.totalFormations,
    omittedFormations: projection.omittedFormations,
    nodes: projection.nodes.map(({ id, kind, formationId, edgeId, witnessId, taskId, resultDigest }) => ({ id, kind, formationId, edgeId, witnessId, taskId, resultDigest })),
    links: projection.links.map(({ id, kind, from, to }) => ({ id, kind, from, to })),
  };
}
