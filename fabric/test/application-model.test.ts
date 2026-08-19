import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_APPLICATION_ICON,
  APPLICATION_ENTRY_KIND,
  applicationIcon,
  applicationsForArtifact,
  canDeleteArtifact,
  createApplicationEntry,
  nextApplicationPosition,
  orderedApplications,
  recentApplications,
  recordApplicationOpen,
  updateApplicationEntry,
} from "../public/js/application-model.js";

test("ApplicationEntry artifact'i kopyalamaz: yalniz launcher identity + artifactId tasir", () => {
  const artifact = { id: "a1", title: "Pil", spec: { sections: [] }, capabilities: ["sensor.battery.read"] };
  const entry = createApplicationEntry({ id: "app1", artifact, position: 0 });
  assert.deepEqual(entry, {
    id: "app1", artifactId: "a1", title: "Pil", kind: APPLICATION_ENTRY_KIND,
    icon: "battery_75", iconSource: "artifact-derived", position: 0,
  });
  assert.equal("spec" in entry, false);
  assert.equal("capabilities" in entry, false);
});

test("ayni artifact birden cok launcher entry tasiyabilir", () => {
  const entries = [
    { id: "app1", artifactId: "a1", title: "Ana", icon: "x", position: 0 },
    { id: "app2", artifactId: "a1", title: "Araba", icon: "x", position: 1 },
  ];
  assert.equal(applicationsForArtifact(entries, "a1").length, 2);
  assert.equal(canDeleteArtifact(entries, "a1"), false);
  assert.equal(canDeleteArtifact(entries, "a2"), true);
});

test("position ekleme sirasini korur ve siralama deterministiktir", () => {
  const entries = [
    { id: "app2", artifactId: "a2", position: 4 },
    { id: "app1", artifactId: "a1", position: 1 },
  ];
  assert.equal(nextApplicationPosition(entries), 5);
  assert.deepEqual(orderedApplications(entries).map((x) => x.id), ["app1", "app2"]);
});

test("launcher adi ve ikonu artifact'i degistirmeden entry uzerinde duzenlenir", () => {
  const entries = [{ id: "app1", artifactId: "a1", title: "Pil", icon: "square_grid_2x2_fill", position: 0 }];
  const result = updateApplicationEntry(entries, "app1", { title: "Ev pili", icon: "battery_75" });
  assert.equal(result.changed, true);
  assert.deepEqual(result.entries[0], { id: "app1", artifactId: "a1", title: "Ev pili", icon: "battery_75", iconSource: "custom", position: 0 });
  assert.equal(entries[0].title, "Pil", "orijinal kayit mutasyona ugramaz");
});

test("eksik veya legacy varsayilan ikon artefakt metadata'sindan deterministik turetilir; kullanici ikonu korunur", () => {
  const sound = { id: "a-sound", title: "Ses Paneli", capabilities: ["volume.set"] };
  assert.equal(applicationIcon({ icon: DEFAULT_APPLICATION_ICON }, sound), "speaker_2_fill");
  assert.equal(applicationIcon({ icon: "star_fill", iconSource: "custom" }, sound), "star_fill");
});

test("son kullanilanlar yalniz launcher entry uzerinde deterministik tutulur", () => {
  const entries = [
    { id: "app1", artifactId: "a1", title: "Pil", position: 0 },
    { id: "app2", artifactId: "a2", title: "Ses", position: 1, lastOpenedAt: 40 },
  ];
  const result = recordApplicationOpen(entries, "app1", 60);
  assert.equal(result.changed, true);
  assert.equal(entries[0].lastOpenedAt, undefined, "orijinal entry mutasyona ugramaz");
  assert.deepEqual(recentApplications(result.entries).map((entry) => entry.id), ["app1", "app2"]);
  assert.equal("lastOpenedAt" in { id: "a1", spec: {} }, false, "artifact metadata'si degismez");
});
