import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../src/prompt.ts";

test("canli Hermes promptu gecmis framework tanimini degil native PWA gercegini tasir", () => {
  const prompt = buildSystemPrompt(["sensor.battery.read"]);
  assert.match(prompt, /native Web Platform bileşenleriyle kurulu bir PWA/);
  assert.doesNotMatch(prompt, /Framework7 tabanli/);
});
