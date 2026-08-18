import { test } from "node:test";
import assert from "node:assert/strict";
import { validateScreen as validateServer } from "../src/screenspec.ts";
import { validateScreen as validateClient, setAllowedActions } from "../public/js/renderer.js";
import { meetsUiRequirements } from "../public/js/ui-requirements.js";
import { SCROLLABLE_SOUND_PANEL, SOUND_PANEL_REQUIREMENTS } from "../public/js/reference-artifacts.js";

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
    const clean = validateServer({ ...screen, sections: [{ type: "section", children: [{ ...range, ...patch }] }] });
    return clean!.sections[0].children;
  };
  assert.deepEqual(invalid({ min: 10, max: 0 }), []);
  assert.deepEqual(invalid({ value: 20 }), []);
  assert.deepEqual(invalid({ step: 0 }), []);
  assert.deepEqual(invalid({ valueKey: "not-valid-key!" }), []);
  assert.deepEqual(invalid({ action: { type: "ui.goto" } }), []);
});

test("stack ve scroll-region sinirli alanlari disinda deger kabul etmez", () => {
  const badScroll = validateServer({ id: "x", title: "x", sections: [{ type: "scroll-region", maxHeight: 20 }] });
  const badStack = validateServer({ id: "x", title: "x", sections: [{ type: "stack", gap: 9 }] });
  assert.deepEqual(badScroll!.sections, []);
  assert.deepEqual(badStack!.sections, []);
});

test("meetsUiRequirements dogal dil degil, yalniz belirtilen yapisal gereksinimleri kontrol eder", () => {
  assert.equal(meetsUiRequirements(SCROLLABLE_SOUND_PANEL, SOUND_PANEL_REQUIREMENTS), true);
  assert.equal(meetsUiRequirements(SCROLLABLE_SOUND_PANEL, ["capability:script.run"]), false);
  assert.equal(meetsUiRequirements({ sections: [{ type: "button", action: { type: "volume.set" } }] }, ["range"]), false);
  assert.equal(meetsUiRequirements(SCROLLABLE_SOUND_PANEL, ["kaydirilabilir ses paneli"]), false);
});
