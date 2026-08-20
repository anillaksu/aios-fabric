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
  findFormationExplorerRecord,
  formationExplorerSemanticProjection,
  projectFormationExplorer,
} from "../public/js/formation-explorer.js";

// screens.js tarayici API istemcisini de yukler; workspace-catalog testindeki
// ayni desenle yalniz origin kabugu verilip ekran dinamik import edilir.
globalThis.location = { origin: "http://localhost" } as Location;
const { formationDetailScreen, formationExplorerScreen } = await import("../public/js/screens.js");
const { setAllowedActions, validateScreen } = await import("../public/js/renderer.js");
const { UI_META_ACTIONS } = await import("../public/js/ui-actions.js");

const artifact = {
  id: "reference-sound-panel-v1",
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

/** Spec agacindaki her dugumu duz listeye acar (bolum/list/button-row dahil). */
function flatten(node: any, out: any[] = []): any[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) { node.forEach((child) => flatten(child, out)); return out; }
  if (node.type) out.push(node);
  if (Array.isArray(node.children)) node.children.forEach((child: any) => flatten(child, out));
  return out;
}
const sectionTitles = (screen: any) => screen.sections.map((section: any) => section.title);
const sectionNamed = (screen: any, title: string) => screen.sections.find((section: any) => section.title === title);

test("Explorer exact formation -> artifact -> verified reuse izlerini deterministik projekte eder", async () => {
  const parent = await createRootFormation(artifact);
  const first = await edgeFor(parent, "task-a");
  const second = await edgeFor(parent, "task-b");
  const left = await projectFormationExplorer([parent], [first, second], [{ ...artifact, formation: parent }]);
  const right = await projectFormationExplorer([parent], [second, first, first], [{ ...artifact, formation: structuredClone(parent) }]);
  const record = findFormationExplorerRecord(left, parent.id);
  assert.ok(record);
  assert.equal(record.artifact?.id, artifact.id);
  assert.equal(record.verifiedUseCount, 2);
  assert.deepEqual(formationExplorerSemanticProjection(left), formationExplorerSemanticProjection(right));
  assert.equal(hash(formationExplorerSemanticProjection(left)), hash(formationExplorerSemanticProjection(right)));
});

test("Explorer CONTEXT'i kaynaktan aynen tasir; olmayan zaman bilgisini uydurmaz", async () => {
  const parent = await createRootFormation(artifact);
  const edge = await edgeFor(parent, "task-context");
  const projection = await projectFormationExplorer([parent], [edge], [{ ...artifact, formation: parent }]);
  const record = findFormationExplorerRecord(projection, parent.id);
  assert.ok(record);
  assert.equal(record.context.provenanceKind, parent.context.provenanceKind);
  assert.equal(record.context.capabilitySetVersion, parent.context.capabilitySetVersion);
  assert.deepEqual(record.context.parents, parent.context.parents);
  assert.equal(record.origin, "root");
  assert.equal(record.identitySummary, parent.id.replace(/^formation:/, "").slice(0, 12));

  // RuntimeWitness semasinda zaman/node alani YOKTUR; "son dogrulanmis
  // kullanim ANI" bu yuzden kanonik olarak bulunamaz. Bos birakilir, tahmin
  // edilmez - ve hicbir execution kaydina zaman alani sizmaz.
  assert.equal(record.lastVerifiedUseAt, null);
  const witnessFields = Object.keys(edge.witness);
  assert.ok(!witnessFields.some((field) => /at$|time|date|ts$/i.test(field)), "witness zaman alani tasimiyor");
  for (const execution of record.verifiedExecutions) {
    assert.deepEqual(Object.keys(execution).sort(), ["capability", "edgeId", "resultDigest", "taskId", "witnessId"]);
  }
});

test("Explorer yalniz exact capability veya formation kimligiyle filtreler; title/similarity kullanmaz", async () => {
  const parent = await createRootFormation(artifact);
  const byCapability = await projectFormationExplorer([parent], [], [{ ...artifact, formation: parent }], { filter: "cap:volume.set" });
  const byFormation = await projectFormationExplorer([parent], [], [{ ...artifact, formation: parent }], { filter: parent.id });
  assert.equal(byCapability.records.length, 1);
  assert.equal(byFormation.records[0].formationId, parent.id);
  await assert.rejects(() => projectFormationExplorer([parent], [], [], { filter: "Kaydırılabilir Ses Paneli" }), /exact formation/);
});

test("Explorer artifact eslemesini exact canonical formation kaydina baglar ve kaynaklari mutate etmez", async () => {
  const parent = await createRootFormation(artifact);
  const edge = await edgeFor(parent, "task-readonly");
  const formations = [structuredClone(parent)];
  const edges = [structuredClone(edge)];
  const mismatchedArtifact = { ...artifact, formation: { ...parent, contentId: "formation-content:forged" } };
  const before = canonicalJson({ formations, edges, mismatchedArtifact });
  const projection = await projectFormationExplorer(formations, edges, [mismatchedArtifact]);
  assert.equal(projection.records[0].artifact, null);
  assert.equal(canonicalJson({ formations, edges, mismatchedArtifact }), before);
});

test("Formation detay yuzeyi ayri bloklara ayrilir; ham kimlik yigini ana yuzeyde degildir", async () => {
  const parent = await createRootFormation(artifact);
  const edge = await edgeFor(parent, "task-detail");
  const projection = await projectFormationExplorer([parent], [edge], [{ ...artifact, formation: parent }]);
  const record = findFormationExplorerRecord(projection, parent.id)!;
  const screen = formationDetailScreen(record);

  assert.deepEqual(sectionTitles(screen), ["FORMATION", "ARTIFACT", "CAPABILITIES", "CONTEXT", "EXECUTIONS", "KİMLİK VE KANIT"]);

  // Ham hash'ler ana yuzeyde degil, teknik kimlik sayfasindadir.
  const surface = JSON.stringify(screen);
  assert.ok(!surface.includes(record.contentId), "CONTENT ID ana yuzeyde gorunmemeli");
  assert.ok(!surface.includes(record.contextId), "CONTEXT ID ana yuzeyde gorunmemeli");
  assert.ok(!surface.includes(record.witnessId), "WITNESS ana yuzeyde gorunmemeli");
  assert.ok(!surface.includes(edge.id), "PROVENANCE EDGE kimligi ana yuzeyde gorunmemeli");

  const nodes = flatten(screen.sections);
  const actions = nodes.map((node: any) => node.action).filter(Boolean);
  // §11: capability UI tarafindan dogrudan calistirilmaz. Detay yuzeyindeki
  // her eylem bir UI gezinme/onay eylemidir; dispatcher yolu artifact
  // renderer'inda kalir.
  for (const action of actions) assert.match(action.type, /^ui\./, `beklenmeyen eylem: ${action.type}`);

  // FORMATION -> CANVAS bagi (Canvas -> FORMATION DETAIL zaten mevcut).
  const formationSection = sectionNamed(screen, "FORMATION");
  const canvasLink = flatten(formationSection.children).find((node: any) => node.action?.payload?.screen === "formation-canvas");
  assert.ok(canvasLink, "formation detayindan Canvas'a gecis olmali");

  // Teknik kimlik ayri sayfa olarak acilir.
  const identityButton = flatten(sectionNamed(screen, "KİMLİK VE KANIT").children)
    .find((node: any) => node.action?.type === "ui.formationIdentity");
  assert.ok(identityButton, "teknik kimlik ayri sheet eylemiyle acilmali");
  assert.equal(identityButton.action.payload.formationId, record.formationId);

  // CONTEXT bloku kaynaktaki gercek degerleri gosterir.
  const contextRows = flatten(sectionNamed(screen, "CONTEXT").children).filter((node: any) => node.type === "list-row");
  assert.deepEqual(contextRows.map((row: any) => row.title), ["KAYNAK", "CAPABILITY SÜRÜMÜ", "PARENT"]);
  assert.equal(contextRows[0].trailing, record.context.provenanceKind);
  assert.equal(contextRows[1].trailing, record.context.capabilitySetVersion);
  assert.equal(contextRows[2].trailing, "0");

  // ARTIFACT bloku: kart exact artifact'i acar, reuse ayri ve acik eylemdir.
  const artifactNodes = flatten(sectionNamed(screen, "ARTIFACT").children);
  assert.ok(artifactNodes.some((node: any) => node.type === "action-card" && node.action.type === "ui.artifact"));
  assert.ok(artifactNodes.some((node: any) => node.action?.type === "ui.formationReuse"));

  // CAPABILITIES her biri ilgili formation listesine goturur.
  const capabilityRows = flatten(sectionNamed(screen, "CAPABILITIES").children).filter((node: any) => node.type === "list-row");
  assert.deepEqual(capabilityRows.map((row: any) => row.action.payload.filter), record.capabilities.map((c: string) => "cap:" + c));

  // EXECUTIONS gercek witness sayisini tasir.
  const executionRows = flatten(sectionNamed(screen, "EXECUTIONS").children).filter((node: any) => node.type === "list-row");
  assert.equal(executionRows.length, record.verifiedUseCount);
});

test("Detay ve liste ekranlari istemci validator'undan eylemleri kaybetmeden gecer", async () => {
  // Bu kapi telefonda gorulmeden bulunamayacak bir hatayi yakalar: ekran
  // uretilse bile renderer.js:validateScreen izin listesinde olmayan bir
  // eylemi SESSIZCE dusurur ve dugme tiklanamaz hale gelir.
  setAllowedActions(["volume.set", "media.control", ...UI_META_ACTIONS]);
  const parent = await createRootFormation(artifact);
  const edge = await edgeFor(parent, "task-validate");
  const projection = await projectFormationExplorer([parent], [edge], [{ ...artifact, formation: parent }]);
  const record = findFormationExplorerRecord(projection, parent.id)!;

  const detail = validateScreen(formationDetailScreen(record));
  assert.ok(detail);
  assert.deepEqual(sectionTitles(detail), ["FORMATION", "ARTIFACT", "CAPABILITIES", "CONTEXT", "EXECUTIONS", "KİMLİK VE KANIT"]);
  const detailActions = flatten(detail.sections).map((node: any) => node.action?.type).filter(Boolean).sort();
  assert.deepEqual([...new Set(detailActions)], ["ui.artifact", "ui.formationIdentity", "ui.formationReuse", "ui.goto"]);
  const identity = flatten(detail.sections).find((node: any) => node.action?.type === "ui.formationIdentity");
  assert.equal(identity.action.payload.formationId, record.formationId);
  const contextRows = flatten(detail.sections).filter((node: any) => node.title === "KAYNAK" || node.title === "CAPABILITY SÜRÜMÜ");
  assert.deepEqual(contextRows.map((row: any) => row.trailing), [record.context.provenanceKind, record.context.capabilitySetVersion]);

  const list = validateScreen(formationExplorerScreen(projection));
  const listRow = flatten(list.sections).find((node: any) => node.action?.payload?.screen === "formation-detail");
  assert.ok(listRow, "liste satiri validator sonrasi da detay eylemini tasimali");
  assert.equal(listRow.action.payload.filter, parent.id);
});

test("Explorer listesi ayni baslikli formation'lari exact kimlik ozetiyle ayirir", async () => {
  const parent = await createRootFormation(artifact);
  const projection = await projectFormationExplorer([parent], [], [{ ...artifact, formation: parent }]);
  const screen = formationExplorerScreen(projection);
  const rows = flatten(screen.sections).filter((node: any) => node.type === "list-row");
  assert.equal(rows.length, 1);
  assert.ok(rows[0].subtitle.startsWith(projection.records[0].identitySummary));
  assert.equal(rows[0].action.payload.screen, "formation-detail");
  assert.equal(rows[0].action.payload.filter, parent.id);
});

test("Reuse UI yalniz existing artifact'i acma onayi verir; execution mevcut formation dispatcher zincirinde kalir", () => {
  const app = readFileSync(new URL("../public/js/app.js", import.meta.url), "utf8");
  const canvas = readFileSync(new URL("../public/js/formation-canvas-view.js", import.meta.url), "utf8");
  const catalog = readFileSync(new URL("../public/js/workspace-catalog.js", import.meta.url), "utf8");
  assert.match(app, /secondary === "formations"/);
  assert.match(app, /secondary === "formation-detail"/);
  assert.match(app, /openFormationReuseConfirmation/);
  assert.match(app, /openArtifact\(record\.artifact\.id\)/);
  // Teknik kimlik sheet'i edge ve witness kimliklerini gosteren tek yerdir.
  assert.match(app, /openFormationIdentitySheet/);
  assert.match(app, /addRow\("EDGE", execution\.edgeId\)/);
  assert.match(app, /addRow\("WITNESS", execution\.witnessId\)/);
  assert.match(app, /formation-identity-detail/);
  assert.match(canvas, /onBrowse/);
  assert.match(canvas, /Math\.max\(0\.24, Math\.min\(1\.8/);
  assert.match(catalog, /id: "formations"/);
});

test("Dock secondary navigation'i WindowManager kaydina donusturmeden gorunur geri baglami olarak projekte eder", () => {
  const app = readFileSync(new URL("../public/js/app.js", import.meta.url), "utf8");
  assert.match(app, /function currentWorkspaceRoute\(\)/);
  assert.match(app, /Artifact ≠ ApplicationEntry ≠ navigation/);
  assert.match(app, /appendRouteDockSlot/);
  assert.match(app, /inline: "center"/);
  assert.match(app, /performance\.now\(\) - openedAt < 180/);
});
