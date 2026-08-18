import { test } from "node:test";
import assert from "node:assert/strict";
import { WORKSPACE_CATEGORIES, entriesForCategory, foldWorkspaceText, searchWorkspaceEntries } from "../public/js/workspace-catalog.js";

// screens.js tarayıcı API istemcisini de yükler; Node testinde yalnız gerekli
// origin kabuğunu verip ekranı dinamik import ediyoruz. Katalog kendisi DOM/ağ
// bağımsız kalır.
globalThis.location = { origin: "http://localhost" } as Location;
const { S, androidAppsScreen, discoverScreen, homeScreen } = await import("../public/js/screens.js");

test("Phone Workspace katalogu kisa Turkce aramayi deterministik metadata ile bulur", () => {
  assert.equal(foldWorkspaceText("CİHAZ AĞI"), "cihaz agi");
  const shortDeviceQuery = searchWorkspaceEntries("cih").map((entry) => entry.id);
  assert.equal(shortDeviceQuery[0], "device-status", "birincil cihaz yüzeyi ilk sırada kalır");
  assert.ok(shortDeviceQuery.includes("android-apps"), "cihazdaki uygulamalar ilgili ikincil sonuçtur");
  assert.deepEqual(searchWorkspaceEntries("pil").map((entry) => entry.id), ["device-status"]);
  assert.equal(searchWorkspaceEntries("ag")[0].id, "network-status");
  assert.equal(searchWorkspaceEntries("ses")[0].id, "sound-panel");
  assert.equal(searchWorkspaceEntries("cihaz durum merkezi yap").length, 0, "LLM benzeri serbest yorum yapılmaz");
});

test("HOME ve KESFET ayni kategori metadata'sini kullanir; nesneler birbirine donusmez", () => {
  S.apps = [{ name: "Kamera", pkg: "com.android.camera" }];
  const home = homeScreen([], []);
  const workspace = home.sections.find((section) => section.title === "ÇALIŞMA ALANI");
  assert.deepEqual(workspace.children.map((tile) => tile.name), WORKSPACE_CATEGORIES.map((category) => category.id));

  const device = discoverScreen("", [], [], [], "Cihaz");
  assert.equal(device.sections[0].children[0].title, "Cihaz Durum Merkezi");
  assert.equal(device.sections[0].children[0].action.type, "ui.referenceDeviceStatus");
  assert.equal(entriesForCategory("Uygulamalar")[0].action.payload.screen, "androidApps");
});

test("HOME son kullanilan ApplicationEntry'yi artifact'ten ayri launcher kimligiyle gosterir", () => {
  const apps = [{ id: "app1", artifactId: "artifact1", title: "Cihaz Durum Merkezi", icon: "gauge", position: 0, lastOpenedAt: 100 }];
  const home = homeScreen([], apps);
  const recent = home.sections.find((section) => section.title === "SON KULLANILAN UYGULAMALAR");
  assert.equal(recent.children[0].action.type, "ui.application");
  assert.deepEqual(recent.children[0].action.payload, { applicationId: "app1", artifactId: "artifact1" });
});

test("telefon uygulamalari loading, empty ve error durumlarini ayirt eder ve retry UI action kullanir", () => {
  S.apps = [];
  S.appsLoadState = "loading";
  assert.equal(androidAppsScreen().sections[0].children[0].type, "skeleton");

  S.appsLoadState = "error";
  const failed = androidAppsScreen().sections[0].children[0];
  assert.equal(failed.type, "error-state");
  assert.equal(failed.action.type, "ui.refreshApps");

  S.appsLoadState = "ready";
  const empty = androidAppsScreen().sections[0].children[0];
  assert.equal(empty.type, "empty-state");
  assert.equal(empty.action.type, "ui.refreshApps");
});
