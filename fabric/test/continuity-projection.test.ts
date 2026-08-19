import test from "node:test";
import assert from "node:assert/strict";
import { continuityProjection } from "../public/js/continuity-projection.js";

test("continuity projection kalici uygulama/artefakt ve canli task izlerini tahmin etmeden birlestirir", () => {
  const projection = continuityProjection({
    applications: [{ id: "old", title: "Eski", lastOpenedAt: 5 }, { id: "new", title: "Medya", lastOpenedAt: 9 }],
    artifacts: [{ id: "a1", title: "Pil", createdAt: 2, pinned: true }, { id: "a2", title: "Ses", createdAt: 7, pinned: false }],
    tasks: [{ id: "r", status: "running" }, { id: "f", status: "failed" }, { id: "done", status: "completed" }],
  });
  assert.equal(projection.recentApplication?.id, "new");
  assert.equal(projection.recentArtifact?.id, "a2");
  assert.deepEqual(projection.pinnedArtifacts.map((artifact) => artifact.id), ["a1"]);
  assert.deepEqual(projection.activeTasks.map((task) => task.id), ["r"]);
  assert.deepEqual(projection.failedTasks.map((task) => task.id), ["f"]);
});

test("continuity projection kaynak yoksa sahte gecmis veya ilgi uretmez", () => {
  assert.deepEqual(continuityProjection(), {
    recentApplication: null, recentArtifact: null, pinnedArtifacts: [], activeTasks: [], failedTasks: [],
  });
});
