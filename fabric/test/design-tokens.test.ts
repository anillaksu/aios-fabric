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
});
