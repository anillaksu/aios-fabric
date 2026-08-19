import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { evaluateSetupDoctor, parseSetupDoctor } from "../bin/aios-setup-doctor.mjs";

const root = resolve("/repo");
const baseFiles = new Set([resolve(root, "fabric/package.json"), resolve(root, "fabric/bin/aios.mjs"), resolve(root, "fabric/src/server.ts")]);
const exists = (file: string) => baseFiles.has(file);

test("setup doctor observer rolunu yalniz Node + checkout contract ile kabul eder", () => {
  const report = evaluateSetupDoctor({ role: "observer", root, nodeVersion: "22.6.0", platform: "win32", home: "C:/Users/test", exists });
  assert.equal(report.accepted, true);
  assert.ok(report.checks.every((item) => item.ok || !item.required));
});

test("setup doctor Termux runtime'i desktop Node var diye kabul etmez", () => {
  const report = evaluateSetupDoctor({ role: "termux-runtime", root, nodeVersion: "22.8.0", platform: "linux", home: "/home/test", exists, hasCommand: () => true });
  assert.equal(report.accepted, false);
  assert.equal(report.checks.find((item) => item.name === "platform.android")?.ok, false);
});

test("setup doctor optional Shizuku eksigini safe runtime admission'a karistirmaz", () => {
  baseFiles.add(resolve(root, "scripts/start_hermes_os.sh")); baseFiles.add(resolve(root, "scripts/watchdog.sh"));
  const commands = new Set(["node", "termux-battery-status", "termux-volume", "termux-wifi-connectioninfo", "am", "pm", "proot-distro", "sshd", "termux-wake-lock"]);
  const report = evaluateSetupDoctor({ role: "termux-runtime", root, nodeVersion: "23.0.0", platform: "android", home: "/data/data/com.termux/files/home", exists, hasCommand: (name: string) => commands.has(name) });
  assert.equal(report.accepted, true);
  assert.equal(report.checks.find((item) => item.name === "termux.shizuku")?.ok, false);
});

test("setup doctor role olmadan fail-closed usage hatasi verir", () => {
  assert.throws(() => parseSetupDoctor([]), /--role/);
  assert.throws(() => parseSetupDoctor(["--role", "desktop"]), /--role/);
});
