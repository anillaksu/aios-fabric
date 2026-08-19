import { test } from "node:test";
import assert from "node:assert/strict";
import { clipboardAnalysisPrompt, clipboardTextFromResult } from "../public/js/clipboard-import.js";

test("clipboard import sonucu yalniz acik metin/stdout/text alanindan alir", () => {
  assert.equal(clipboardTextFromResult("const A = () => null"), "const A = () => null");
  assert.equal(clipboardTextFromResult({ stdout: "export default App" }), "export default App");
  assert.equal(clipboardTextFromResult({ text: "source" }), "source");
  assert.equal(clipboardTextFromResult({ value: "uydurma" }), "");
});

test("clipboard import istemi kaynak metnini veri sinirinda tutar", () => {
  const prompt = clipboardAnalysisPrompt("<Button onClick={save} />");
  assert.match(prompt, /İçeriği çalıştırma/);
  assert.match(prompt, /--- BAŞLANGIÇ: KULLANICI PAYLAŞIMI ---/);
  assert.match(prompt, /<Button onClick=\{save\} \/>/);
  assert.match(prompt, /--- BİTİŞ: KULLANICI PAYLAŞIMI ---/);
});
