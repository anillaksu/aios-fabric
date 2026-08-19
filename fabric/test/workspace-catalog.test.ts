import { test } from "node:test";
import assert from "node:assert/strict";
import { WORKSPACE_CATEGORIES, entriesForCategory, foldWorkspaceText, searchWorkspaceEntries } from "../public/js/workspace-catalog.js";

// screens.js tarayıcı API istemcisini de yükler; Node testinde yalnız gerekli
// origin kabuğunu verip ekranı dinamik import ediyoruz. Katalog kendisi DOM/ağ
// bağımsız kalır.
globalThis.location = { origin: "http://localhost" } as Location;
const { S, androidAppsScreen, discoverScreen, hermesEmptyScreen, homeScreen, operatorDeckScreen, systemMapScreen } = await import("../public/js/screens.js");

test("Phone Workspace katalogu kisa Turkce aramayi deterministik metadata ile bulur", () => {
  assert.equal(foldWorkspaceText("CİHAZ AĞI"), "cihaz agi");
  const shortDeviceQuery = searchWorkspaceEntries("cih").map((entry) => entry.id);
  assert.equal(shortDeviceQuery[0], "device-status", "birincil cihaz yüzeyi ilk sırada kalır");
  assert.ok(shortDeviceQuery.includes("android-apps"), "cihazdaki uygulamalar ilgili ikincil sonuçtur");
  assert.deepEqual(searchWorkspaceEntries("pil").map((entry) => entry.id), ["device-status"]);
  assert.equal(searchWorkspaceEntries("ag")[0].id, "network-status");
  assert.equal(searchWorkspaceEntries("ses")[0].id, "sound-panel");
  assert.equal(searchWorkspaceEntries("yonetim")[0].id, "management");
  assert.equal(searchWorkspaceEntries("cihaz durum merkezi yap").length, 0, "LLM benzeri serbest yorum yapılmaz");
});

test("HOME ve KESFET ayni kategori metadata'sini kullanir; nesneler birbirine donusmez", () => {
  S.apps = [{ name: "Kamera", pkg: "com.android.camera" }];
  const home = homeScreen([], []);
  const workspace = home.sections.find((section) => section.title === "ÇALIŞMA ALANI");
  assert.deepEqual(workspace.children.map((tile) => tile.name), WORKSPACE_CATEGORIES.map((category) => category.id));
  assert.deepEqual(workspace.children.map((tile) => tile.icon), WORKSPACE_CATEGORIES.map((category) => category.icon));
  assert.ok(workspace.children.every((tile) => tile.value == null), "kategoriye giden kart AÇ metnini tekrar etmez");

  const discover = discoverScreen("", [], [], []);
  const discoverCategories = discover.sections.find((section) => section.title === "KEŞFET");
  assert.ok(discoverCategories.children.every((tile) => tile.value == null && tile.icon), "KEŞFET aynı ikon tabanlı kategori dilini kullanır");

  const device = discoverScreen("", [], [], [], "Cihaz");
  assert.equal(device.sections[0].children[0].title, "Cihaz Durum Merkezi");
  assert.equal(device.sections[0].children[0].action.type, "ui.referenceDeviceStatus");
  assert.equal(entriesForCategory("Uygulamalar")[0].action.payload.screen, "androidApps");
});

test("HOME arama gerektirmeden sistem haritasi, yonetim ve Android koprusune giris verir", () => {
  const home = homeScreen([], []);
  const quick = home.sections.find((section) => section.title === "HIZLI ERİŞİM");
  const rows = quick.children[0].children;
  assert.deepEqual(rows.map((row) => row.title), ["AIOS Sistem Haritası", "Yönetim Merkezi", "Telefon Uygulamaları"]);
  assert.equal(rows[0].action.payload.screen, "system-map");
});

test("HOME son kullanilan ApplicationEntry'yi artifact'ten ayri launcher kimligiyle gosterir", () => {
  const apps = [{ id: "app1", artifactId: "artifact1", title: "Cihaz Durum Merkezi", icon: "gauge", position: 0, lastOpenedAt: 100 }];
  const home = homeScreen([], apps);
  const recent = home.sections.find((section) => section.title === "SON KULLANILAN UYGULAMALAR");
  assert.equal(recent.children[0].action.type, "ui.application");
  assert.deepEqual(recent.children[0].action.payload, { applicationId: "app1", artifactId: "artifact1" });
});

test("legacy ApplicationEntry eksik ikonu HOME, KESFET ve Linhx'te ayni artifact metadata'sindan alir", () => {
  const artifacts = [{ id: "sound", title: "Ses", capabilities: ["volume.set"] }];
  const apps = [{ id: "app1", artifactId: "sound", title: "Ses", icon: "square_grid_2x2_fill", lastOpenedAt: 10 }];
  const home = homeScreen(artifacts, apps);
  const homeApps = home.sections.find((section) => section.title === "UYGULAMALAR");
  assert.equal(homeApps.children[0].icon, "speaker_2_fill");
  const discover = discoverScreen("ses", [], artifacts, apps);
  const discovered = discover.sections.find((section) => section.title === "UYGULAMALARIM");
  assert.equal(discovered.children[0].icon, "speaker_2_fill");
  const linhx = hermesEmptyScreen(artifacts, apps);
  const continuation = linhx.sections.find((section) => section.title === "NEREDEN DEVAM EDELİM?");
  assert.equal(continuation.children[0].icon, "speaker_2_fill");
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

test("iliski yuzeyi yalniz kalici uygulama/artefakt ve task izlerinden devam noktasi cikarir", () => {
  S.tasks = [{ id: "t1", type: "volume.set", status: "failed", error: "izin yok" }];
  const surface = hermesEmptyScreen(
    [{ id: "artifact-1", title: "Ses", createdAt: 5, pinned: true }],
    [{ id: "app-1", artifactId: "artifact-1", title: "Medya", icon: "music_note", lastOpenedAt: 9 }],
  );
  const continueSection = surface.sections.find((section) => section.title === "NEREDEN DEVAM EDELİM?");
  assert.equal(continueSection.children[0].action.type, "ui.application");
  const now = surface.sections.find((section) => section.title === "ŞU AN");
  assert.equal(now.children[0].children[0].trailing, "HATA");
  assert.ok(surface.sections.some((section) => section.title === "BİRLİKTE OLUŞTUR"));
});

test("Operator Deck klavyesiz altı gerçek AIOS alanını ve yalnız mevcut eylemleri projekte eder", () => {
  const root = operatorDeckScreen();
  const areas = root.sections.find((section) => section.title === "SİSTEM KATMANLARI");
  assert.equal(areas.children.length, 6);
  const runtime = operatorDeckScreen("runtime");
  const rows = runtime.sections[0].children[0].children;
  assert.equal(rows.length, 6);
  assert.ok(rows.every((row) => row.action.type === "ui.goto"), "operator listesi yeni capability icat etmez");
  const security = operatorDeckScreen("security");
  assert.equal(security.sections[0].children[0].children[0].action.type, "ui.control");
});

test("Sistem Haritasi yalniz mevcut UI hedeflerine navigasyon projeksiyonudur", () => {
  const map = systemMapScreen();
  const layers = map.sections.find((section) => section.title === "KATMANLAR");
  assert.ok(layers);
  assert.ok(layers.children.length >= 8);
  assert.ok(layers.children.every((tile) => tile.tap?.type === "ui.goto" || tile.tap?.type === "ui.control"));
  assert.ok(layers.children.some((tile) => tile.name === "Android Köprüsü"));
  assert.equal(JSON.stringify(map).includes("cap.execute"), false);
});
