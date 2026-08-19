import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  canonicalJson,
  createRootFormation,
  createRuntimeProvenanceEdge,
  createRuntimeWitness,
} from "../public/js/formation-memory.js";
import {
  DEFAULT_FORMATION_CANVAS_LIMIT,
  formationCanvasSemanticProjection,
  projectFormationCanvas,
} from "../public/js/formation-canvas.js";

const artifact = {
  title: "Kaydırılabilir Ses Paneli",
  spec: { title: "Kaydırılabilir Ses Paneli", sections: [] },
  capabilities: ["volume.set"], version: "caps-v1", provenance: "reference",
};
const hash = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");

async function edgeFor(parent: any, taskId: string) {
  const witness = await createRuntimeWitness({
    parentFormationId: parent.id,
    completion: { type: "task.completed", taskId, correlationId: `corr-${taskId}`, capability: "volume.set", result: "" },
    ledger: {
      role: "fabric", status: "stable", eventHash: "sha256:" + "a".repeat(64), previousHash: "GENESIS",
      processWitness: "sha256:" + "b".repeat(64), sourceHash: "sha256:" + "c".repeat(64),
    },
  });
  return createRuntimeProvenanceEdge({ parent, witness });
}

test("Formation Canvas root -> reuse execution izlerini mevcut immutable veriden deterministik projekte eder", async () => {
  const parent = await createRootFormation(artifact);
  const first = await edgeFor(parent, "task-a");
  const second = await edgeFor(parent, "task-b");
  const left = await projectFormationCanvas([parent], [first, second]);
  const right = await projectFormationCanvas([parent], [second, first, first]);
  assert.deepEqual(formationCanvasSemanticProjection(left), formationCanvasSemanticProjection(right));
  assert.equal(left.nodes.filter((node) => node.kind === "root-formation").length, 1);
  assert.equal(left.nodes.filter((node) => node.kind === "reuse-execution").length, 2);
  assert.deepEqual(left.links.map((link) => link.kind), ["reuse", "reuse"]);
  assert.equal(hash(formationCanvasSemanticProjection(left)), hash(formationCanvasSemanticProjection(right)));
});

test("Canvas read-onlydir: kaynak formation ve edge dizilerini mutate etmez", async () => {
  const parent = await createRootFormation(artifact);
  const edge = await edgeFor(parent, "task-readonly");
  const formations = [structuredClone(parent)]; const edges = [structuredClone(edge)];
  const before = canonicalJson({ formations, edges });
  await projectFormationCanvas(formations, edges);
  assert.equal(canonicalJson({ formations, edges }), before);
});

test("viewport limiti deterministic kalir; gorunmeyen formation uydurulmaz", async () => {
  const first = await createRootFormation(artifact);
  const second = await createRootFormation({ ...artifact, title: "İkinci panel" });
  const projection = await projectFormationCanvas([second, first], [], { limit: 1 });
  assert.equal(projection.nodes.filter((node) => node.kind !== "reuse-execution").length, 1);
  assert.equal(projection.totalFormations, 2);
  assert.equal(projection.omittedFormations, 1);
  assert.equal(projection.limit, 1);
  assert.equal(DEFAULT_FORMATION_CANVAS_LIMIT, 48);
});

test("Canvas endpointi ve KEŞFET girişi yalnız read-only mevcut veriye baglidir", () => {
  const server = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
  const app = readFileSync(new URL("../public/js/app.js", import.meta.url), "utf8");
  const catalog = readFileSync(new URL("../public/js/workspace-catalog.js", import.meta.url), "utf8");
  assert.match(server, /url\.pathname === "\/formation-memory" && req\.method === "GET"/);
  assert.match(server, /exportFormationMemoryBundle\(formations, provenanceEdges\)/);
  assert.match(app, /secondary === "formation-canvas"/);
  assert.match(app, /getJSON\("\/formation-memory"\)/);
  assert.match(catalog, /id: "formation-canvas"/);
});
