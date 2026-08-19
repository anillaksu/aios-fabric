import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tokens = readFileSync(new URL("../public/css/tokens.css", import.meta.url), "utf8");
const themes = readFileSync(new URL("../public/css/themes.css", import.meta.url), "utf8");
const components = readFileSync(new URL("../public/css/components.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/js/app.js", import.meta.url), "utf8");

test("atmosphere ortak tokenlarla baglidir; Night City secilebilir temadir", () => {
  for (const token of ["--atmo-sky-a", "--atmo-grid", "--atmo-glow"]) assert.match(tokens, new RegExp(token));
  assert.match(themes, /data-theme="nightcity"/);
  assert.match(app, /id: "nightcity"/);
  assert.match(components, /#shell::before/);
});

test("atmosphere reduced-motion ve Paper okunabilirlik sinirini korur", () => {
  assert.match(components, /prefers-reduced-motion: reduce/);
  assert.match(themes, /data-theme="paper"[\s\S]*--atmo-glow:none/);
});
