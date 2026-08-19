#!/usr/bin/env node
/*
 * Read-only bootstrap admission for a source checkout. It never creates a
 * token, starts a service, modifies a peer, or executes a capability.
 * Roles are deliberately separate: a portable observer is not an Android
 * device runtime merely because both run Node.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const ROLES = new Set(["observer", "pc-agent", "termux-runtime"]);
const MIN_NODE = [22, 6];

function usage() {
  return "Usage: node fabric/bin/aios-setup-doctor.mjs --role observer|pc-agent|termux-runtime [--json] [--root PATH]";
}

export function parseSetupDoctor(argv) {
  let role = ""; let json = false; let root = ROOT;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") json = true;
    else if (arg === "--role") role = argv[++index] || "";
    else if (arg === "--root") root = argv[++index] || "";
    else if (arg === "--help" || arg === "-h") return { help: true };
    else throw new TypeError(`unknown option: ${arg}`);
  }
  if (!ROLES.has(role)) throw new TypeError("--role observer|pc-agent|termux-runtime zorunludur");
  if (!root) throw new TypeError("--root boş olamaz");
  return { role, json, root: resolve(root) };
}

function nodeOk(version) {
  const match = /^(\d+)\.(\d+)/.exec(String(version || ""));
  if (!match) return false;
  const major = Number(match[1]); const minor = Number(match[2]);
  return major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1]);
}

function check(name, ok, detail, required = true) {
  return { name, ok: Boolean(ok), detail, required };
}

export function evaluateSetupDoctor({ role, root, nodeVersion, platform, home, exists = existsSync, hasCommand = () => false }) {
  const checks = [
    check("node", nodeOk(nodeVersion), `Node ${nodeVersion}; requires >=${MIN_NODE.join(".")}`),
    check("repository.fabric", exists(resolve(root, "fabric/package.json")), "fabric/package.json"),
    check("repository.cli", exists(resolve(root, "fabric/bin/aios.mjs")), "fabric/bin/aios.mjs"),
  ];
  if (role === "observer") {
    checks.push(check("observer.contract", exists(resolve(root, "fabric/src/server.ts")), "read-only CLI endpoint contract present"));
  }
  if (role === "pc-agent") {
    checks.push(
      check("pc-agent.server", exists(resolve(root, "pc-agent/server.ts")), "pc-agent/server.ts"),
      check("pc-agent.skills", exists(resolve(root, "pc-agent/skills.ts")), "pc-agent/skills.ts"),
    );
  }
  if (role === "termux-runtime") {
    checks.push(
      check("platform.android", platform === "android", `platform=${platform}; native device runtime is Termux/Android only`),
      check("termux.home", Boolean(home), "HOME is required for journal/artifact paths"),
      check("termux.node", hasCommand("node"), "node"),
      check("termux.api", hasCommand("termux-battery-status") && hasCommand("termux-volume") && hasCommand("termux-wifi-connectioninfo"), "Termux:API command set"),
      check("termux.android-tools", hasCommand("am") && hasCommand("pm"), "Android am + pm"),
      check("termux.lifecycle", hasCommand("proot-distro") && hasCommand("sshd") && hasCommand("termux-wake-lock"), "proot-distro + sshd + wake lock"),
      // Shizuku only gates its own privileged capabilities; it is not a setup
      // prerequisite for safe reads or the PWA shell.
      check("termux.shizuku", hasCommand("rish"), "optional: privileged Shizuku capabilities", false),
      check("termux.launchers", exists(resolve(root, "scripts/start_hermes_os.sh")) && exists(resolve(root, "scripts/watchdog.sh")), "canonical launcher + watchdog source"),
    );
  }
  const accepted = checks.filter((item) => item.required).every((item) => item.ok);
  return { role, root, platform, nodeVersion, checks, accepted };
}

function text(report) {
  return [
    `role\t${report.role}`,
    `platform\t${report.platform}`,
    ...report.checks.map((item) => `${item.ok ? "ok" : item.required ? "fail" : "optional-missing"}\t${item.name}\t${item.detail}`),
  ].join("\n");
}

export async function runSetupDoctor(argv, io = {}) {
  const stdout = io.stdout || process.stdout; const stderr = io.stderr || process.stderr;
  let options;
  try { options = parseSetupDoctor(argv); } catch (error) { stderr.write(`aios setup doctor: ${error.message}\n${usage()}\n`); return 2; }
  if (options.help) { stdout.write(usage() + "\n"); return 0; }
  const commandCache = new Map();
  const hasCommand = (name) => {
    if (!commandCache.has(name)) commandCache.set(name, false);
    return commandCache.get(name);
  };
  // Commands cannot be established portably without a shell. The executable
  // entry point provides a conservative check through PATH; tests inject the
  // same deterministic predicate. No command is run.
  const path = String(process.env.PATH || "").split(process.platform === "win32" ? ";" : ":");
  const suffixes = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  for (const name of ["node", "termux-battery-status", "termux-volume", "termux-wifi-connectioninfo", "am", "pm", "proot-distro", "sshd", "termux-wake-lock", "rish"]) {
    const found = path.some((dir) => suffixes.some((suffix) => existsSync(resolve(dir || ".", name + suffix))));
    commandCache.set(name, found);
  }
  const report = evaluateSetupDoctor({ ...options, nodeVersion: process.versions.node, platform: process.platform, home: process.env.HOME, hasCommand });
  stdout.write(options.json ? JSON.stringify(report) + "\n" : text(report) + "\n");
  if (!report.accepted) stderr.write("aios setup doctor: admission failed; no service, token, peer or capability was created\n");
  return report.accepted ? 0 : 3;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = await runSetupDoctor(process.argv.slice(2));
