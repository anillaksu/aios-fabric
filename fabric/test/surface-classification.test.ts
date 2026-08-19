import { test } from "node:test";
import assert from "node:assert/strict";
import { SURFACE_KIND, classifyAndroidPackage, classifyApplication, classifyArtifact, classifySystemSurface } from "../public/js/surface-classification.js";

test("artifact, ApplicationEntry, sistem yuzeyi ve Android paketi ayni nesne degildir", () => {
  const artifact = { id: "a1", provenance: "hermes" };
  assert.deepEqual(classifyArtifact(artifact), { kind: SURFACE_KIND.ARTIFACT, id: "a1", provenance: "hermes" });
  assert.deepEqual(classifyApplication({ id: "app1", artifactId: "a1" }, artifact), { kind: SURFACE_KIND.APPLICATION_ENTRY, id: "app1", artifactId: "a1", linked: true });
  assert.deepEqual(classifySystemSurface("settings"), { kind: SURFACE_KIND.SYSTEM_SURFACE, id: "settings" });
  assert.deepEqual(classifyAndroidPackage("com.android.camera"), { kind: SURFACE_KIND.ANDROID_PACKAGE, packageName: "com.android.camera" });
});
