import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("premium component semantics merkezi token ve gorunur focus siniri kullanir", async () => {
  const [tokens, components, shell] = await Promise.all([
    readFile(new URL("../public/css/tokens.css", import.meta.url), "utf8"),
    readFile(new URL("../public/css/components.css", import.meta.url), "utf8"),
    readFile(new URL("../public/aios.html", import.meta.url), "utf8"),
  ]);
  for (const token of ["--surface:", "--surface-elevated:", "--text-primary:", "--border:", "--focus:", "--success:", "--touch-target:"]) {
    assert.match(tokens, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(components, /:focus-visible[\s\S]*var\(--focus\)/);
  assert.match(shell, /width: var\(--touch-target\)/);
  assert.doesNotMatch(tokens, /--f7-/);
});

test("kullanici metni ortak kart ve listelerde kesilmez; eylem satirlari erisilebilirdir", async () => {
  const [components, registry, app, screens] = await Promise.all([
    readFile(new URL("../public/css/components.css", import.meta.url), "utf8"),
    readFile(new URL("../public/js/registry.js", import.meta.url), "utf8"),
    readFile(new URL("../public/js/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/js/screens.js", import.meta.url), "utf8"),
  ]);
  assert.match(components, /\.c-title[\s\S]*white-space: normal[\s\S]*overflow-wrap: anywhere/);
  assert.match(components, /\.c-sub[\s\S]*white-space: normal[\s\S]*overflow-wrap: anywhere/);
  assert.doesNotMatch(components, /\.c-title[\s\S]{0,180}text-overflow: ellipsis/);
  assert.doesNotMatch(components, /\.c-app \.nm[\s\S]{0,220}-webkit-line-clamp/);
  assert.match(registry, /node\.setAttribute\("role", "button"\)/);
  assert.match(registry, /e\.key === "Enter" \|\| e\.key === " "/);
  assert.doesNotMatch(app, /a\.prompt \? a\.prompt\.slice\(0, 60\)/);
  assert.doesNotMatch(screens, /\(a\.prompt \|\| ""\)\.slice\(0, 70\)/);
  assert.doesNotMatch(screens, /value: "AÇ"/);
  assert.match(app, /b\.setAttribute\("aria-label", "Geri"\)/);
});
