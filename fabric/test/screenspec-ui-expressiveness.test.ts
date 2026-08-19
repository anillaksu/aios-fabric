import { test } from "node:test";
import assert from "node:assert/strict";
import { validateScreen as validateServer } from "../src/screenspec.ts";
import { validateScreen as validateClient, setAllowedActions } from "../public/js/renderer.js";
import { meetsUiRequirements } from "../public/js/ui-requirements.js";
import { SCROLLABLE_SOUND_PANEL, SOUND_PANEL_REQUIREMENTS, musicVolumeFromResponse, soundPanelWithMusicVolume, DEVICE_STATUS_PANEL, DEVICE_STATUS_PANEL_REQUIREMENTS, deviceStatusWithLiveData } from "../public/js/reference-artifacts.js";

const range = {
  type: "range", label: "Müzik", min: 0, max: 15, value: 7, step: 1, valueKey: "value",
  action: { type: "volume.set", payload: { stream: "music" } }, ignored: "drop-me",
};
const screen = { id: "s", title: "Ses", sections: [{ type: "section", children: [
  { type: "scroll-region", maxHeight: 240, children: [{ type: "stack", direction: "column", gap: 3, align: "stretch", children: [range] }] },
] }] };

test("ScreenSpec 2.0: server/client range-scroll-stack contractini ayni kabul eder", () => {
  setAllowedActions(["volume.set"]);
  const server = validateServer(screen);
  const client = validateClient(screen);
  assert.ok(server);
  assert.ok(client);
  const serverRange = server!.sections[0].children![0].children![0].children![0] as Record<string, unknown>;
  const clientRange = client!.sections[0].children[0].children[0].children[0];
  assert.equal(serverRange.valueKey, "value");
  assert.equal(clientRange.valueKey, "value");
  assert.equal("ignored" in serverRange, false, "bilinmeyen alan fail-closed atilir");
});

test("range: sinirlar, pozitif step ve capability binding gecersizse node reddedilir", () => {
  const invalid = (patch: Record<string, unknown>) => {
    const candidate = { ...screen, sections: [{ type: "section", children: [{ ...range, ...patch }] }] };
    const server = validateServer(candidate);
    const client = validateClient(candidate);
    assert.deepEqual(client!.sections[0].children, [], "client de ayni node'u reddeder");
    return server!.sections[0].children;
  };
  assert.deepEqual(invalid({ min: 10, max: 0 }), []);
  assert.deepEqual(invalid({ value: 20 }), []);
  assert.deepEqual(invalid({ step: 0 }), []);
  assert.deepEqual(invalid({ valueKey: "not-valid-key!" }), []);
  assert.deepEqual(invalid({ action: { type: "ui.goto" } }), []);
  assert.deepEqual(invalid({ action: { type: "unknown.action" } }), []);
});

test("stack ve scroll-region sinirli alanlari disinda deger kabul etmez", () => {
  const badScroll = validateServer({ id: "x", title: "x", sections: [{ type: "scroll-region", maxHeight: 20 }] });
  const badStack = validateServer({ id: "x", title: "x", sections: [{ type: "stack", gap: 9 }] });
  const badScrollClient = validateClient({ id: "x", title: "x", sections: [{ type: "scroll-region", maxHeight: 20 }] });
  const badStackClient = validateClient({ id: "x", title: "x", sections: [{ type: "stack", gap: 9 }] });
  assert.deepEqual(badScroll!.sections, []);
  assert.deepEqual(badStack!.sections, []);
  assert.deepEqual(badScrollClient!.sections, []);
  assert.deepEqual(badStackClient!.sections, []);
});

test("ikon-düğme görünürde metni tekrar etmez ama erişilebilir label'ını contract'ta korur", () => {
  const candidate = { id: "icon-button", title: "İkon", sections: [{ type: "section", children: [{
    type: "button", label: "Ana ekran", icon: "house_fill", iconOnly: true,
    action: { type: "ui.goto", payload: { tab: "home" } },
  }] }] };
  const serverButton = validateServer(candidate)?.sections[0]?.children?.[0];
  const clientButton = validateClient(candidate)?.sections[0]?.children?.[0];
  for (const button of [serverButton, clientButton]) {
    assert.equal(button?.iconOnly, true);
    assert.equal(button?.label, "Ana ekran");
    assert.equal(button?.icon, "house_fill");
  }
});

test("meetsUiRequirements dogal dil degil, yalniz belirtilen yapisal gereksinimleri kontrol eder", () => {
  assert.equal(meetsUiRequirements(SCROLLABLE_SOUND_PANEL, SOUND_PANEL_REQUIREMENTS), true);
  assert.equal(meetsUiRequirements(SCROLLABLE_SOUND_PANEL, ["capability:script.run"]), false);
  assert.equal(meetsUiRequirements({ sections: [{ type: "button", action: { type: "volume.set" } }] }, ["range"]), false);
  assert.equal(meetsUiRequirements(SCROLLABLE_SOUND_PANEL, ["kaydirilabilir ses paneli"]), false);
});

test("referans ses paneli yalniz gercek termux-volume music cevabini ScreenSpec'e baglar", () => {
  const music = musicVolumeFromResponse([
    { stream: "alarm", volume: 4, max_volume: 7 },
    { stream: "music", volume: 10, max_volume: 150 },
  ]);
  assert.deepEqual(music, { value: 10, max: 150 });
  const panel = soundPanelWithMusicVolume(music);
  const range = panel.sections[0].children[0].children[0].children[0];
  assert.equal(range.type, "range");
  assert.equal(range.value, 10);
  assert.equal(range.max, 150);
  assert.match(range.label, /10 \/ 150/);
  assert.equal(meetsUiRequirements(panel, SOUND_PANEL_REQUIREMENTS), true);
  const playPause = panel.sections[0].children[0].children[0].children[2].children[1];
  assert.equal(playPause.label, "OYNAT / DURAKLAT");
  assert.equal(playPause.action.type, "media.control");
  assert.equal(playPause.action.payload.action, "toggle");
});

test("bozuk veya music stream'i olmayan volume cevabi fake slider uretmez", () => {
  assert.equal(musicVolumeFromResponse({ music: 10 }), null);
  assert.equal(musicVolumeFromResponse([{ stream: "music", volume: 9, max_volume: 0 }]), null);
  const panel = soundPanelWithMusicVolume(null);
  const state = panel.sections[0].children[0].children[0].children[0];
  assert.equal(state.type, "empty-state");
});

test("Cihaz Durum Merkezi yalniz gercek battery ve Wi-Fi alanlarini mevcut ScreenSpec'e map eder", () => {
  const panel = deviceStatusWithLiveData({
    battery: { percentage: 31, temperature: 29.2, voltage: 3782, cycle: 1100, status: "DISCHARGING", health: "GOOD", plugged: "UNPLUGGED", technology: "Li-poly", current: 130000 },
    wifi: { ssid: "DESKTOP-BLDNDGB 1875", ip: "192.168.137.69", rssi: -9, frequency_mhz: 2437, link_speed_mbps: 144 },
    appCount: 63,
    fabricReachable: true,
  });
  const stack = panel.sections[0].children[0].children[0];
  assert.equal(stack.type, "stack");
  assert.equal(stack.children[0].children[0].value, 31);
  assert.equal(stack.children[0].children[2].value, "3.78");
  assert.equal(stack.children[0].children[4].value, 63);
  assert.equal(stack.children[2].children[0].children[0].subtitle, "DESKTOP-BLDNDGB 1875");
  assert.equal(stack.children[3].children[0].children[0].chip.label, "ERİŞİLEBİLİR");
  assert.equal(stack.children[4].action.type, "ui.artifact");
  assert.equal(meetsUiRequirements(panel, DEVICE_STATUS_PANEL_REQUIREMENTS), true);
  setAllowedActions(["ui.artifact"]);
  assert.ok(validateServer(panel));
  assert.ok(validateClient(panel));
});

test("Cihaz Durum Merkezi veri yoksa sayi uydurmaz", () => {
  const panel = deviceStatusWithLiveData();
  const stack = panel.sections[0].children[0].children[0];
  assert.equal(stack.children[0].children[0].type, "empty-state");
  assert.equal(stack.children[3].children[0].children[0].chip.label, "ÖLÇÜLMEDİ");
  assert.equal(DEVICE_STATUS_PANEL.id, "reference-device-status-v1");
});
