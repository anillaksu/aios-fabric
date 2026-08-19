#!/usr/bin/env node
/* AIOS portable read-only CLI contract.
 * Node 22+ bulunan Termux, Windows, macOS ve Linux'ta aynı argv/stream/exit
 * semantiğiyle çalışır. Android/Termux execution adaptörlerini çağırmaz. */

import { fileURLToPath } from "node:url";

const DEFAULT_URL = process.env.AIOS_URL || "http://127.0.0.1:9300";

function usage() {
  return [
    "Usage: aios [--url URL] [--json] <command>", "",
    "Commands:",
    "  status         Read runtime status", "  capabilities   List registered capabilities",
    "  artifacts      List persisted artifact summaries", "  formations     List read-only Formation Memory summary",
    "  agent-card     Read the standard A2A Agent Card",
    "  node doctor    Report local runtime and remote read-only admission checks",
  ].join("\n");
}

function parse(argv) {
  let url = DEFAULT_URL; let json = false; const rest = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") json = true;
    else if (arg === "--url") { url = argv[++index] || ""; }
    else if (arg === "--help" || arg === "-h") return { help: true };
    else if (arg.startsWith("-")) throw new TypeError(`unknown option: ${arg}`);
    else rest.push(arg);
  }
  return { url: url.replace(/\/$/, ""), json, command: rest[0], extra: rest.slice(1) };
}

function project(command, data) {
  if (command === "status") return { observedAt: data?.observedAt ?? null, services: Array.isArray(data?.services) ? data.services.map(({ id, status, detail }) => ({ id, status, detail })) : [] };
  if (command === "capabilities") return Array.isArray(data) ? data.map(({ name, class: klass, risk }) => ({ name, class: klass, risk })) : [];
  if (command === "artifacts") return Array.isArray(data) ? data.map(({ id, title, provenance, formation }) => ({ id, title, provenance, formationId: formation?.id ?? null })) : [];
  if (command === "formations") return {
    schema: data?.schema ?? null,
    formations: Array.isArray(data?.formations) ? data.formations.map((formation) => ({ id: formation.id, title: formation.content?.title ?? null, capabilities: formation.context?.capabilities ?? [] })) : [],
    provenanceEdges: Array.isArray(data?.provenanceEdges) ? data.provenanceEdges.map((edge) => ({ id: edge.id, parentFormationId: edge.parent?.id ?? null, capability: edge.witness?.capability ?? null, taskId: edge.witness?.taskId ?? null })) : [],
  };
  if (command === "agent-card") return {
    protocolVersion: data?.protocolVersion ?? null,
    name: data?.name ?? null,
    version: data?.version ?? null,
    url: data?.url ?? null,
    skills: Array.isArray(data?.skills) ? data.skills.map((skill) => ({
      id: skill?.id ?? null, name: skill?.name ?? null,
    })) : [],
  };
  throw new TypeError(`unknown command: ${command || "(missing)"}`);
}

function text(command, value) {
  if (command === "status") return value.services.map((service) => `${service.id}\t${service.status}\t${service.detail}`).join("\n") || "no services";
  if (command === "capabilities") return value.map((capability) => `${capability.name}\t${capability.class}\t${capability.risk}`).join("\n") || "no capabilities";
  if (command === "artifacts") return value.map((artifact) => `${artifact.id}\t${artifact.title || "—"}\t${artifact.provenance || "unknown"}\t${artifact.formationId || "no-formation"}`).join("\n") || "no artifacts";
  if (command === "agent-card") return [`name\t${value.name || "unknown"}`, `version\t${value.version || "unknown"}`, `protocol\t${value.protocolVersion || "unknown"}`, `skills\t${value.skills.length}`].join("\n");
  return [`formations\t${value.formations.length}`, `provenanceEdges\t${value.provenanceEdges.length}`, ...value.provenanceEdges.map((edge) => `${edge.parentFormationId}\t${edge.capability}\t${edge.taskId}`)].join("\n");
}

async function readCheck(name, path, fetcher, baseUrl) {
  try {
    const response = await fetcher(baseUrl + path, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return { name, path, ok: false, error: `HTTP ${response.status}` };
    const data = await response.json();
    if (name === "agentCard") return { name, path, ok: Boolean(data?.protocolVersion && data?.name), detail: project("agent-card", data) };
    if (name === "capabilities") return { name, path, ok: Array.isArray(data), detail: { count: Array.isArray(data) ? data.length : 0 } };
    return { name, path, ok: Boolean(data && typeof data === "object"), detail: project("status", data) };
  } catch (err) {
    return { name, path, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function runNodeDoctor(options, { fetcher, stdout, stderr }) {
  const checks = [];
  // Sıra sabittir; herhangi biri doğrulanamazsa node kabul edilmez. Bu rapor
  // bir onboarding otoritesi veya capability kaydı değildir, yalnız gözlemdir.
  for (const [name, path] of [["agentCard", "/.well-known/agent-card.json"], ["runtime", "/runtime-status"], ["capabilities", "/capabilities"]]) {
    checks.push(await readCheck(name, path, fetcher, options.url));
  }
  const report = {
    localRuntime: { node: process.versions.node, platform: process.platform, arch: process.arch },
    endpoint: options.url,
    checks,
  };
  const accepted = checks.every((check) => check.ok);
  if (options.json) stdout.write(JSON.stringify(report) + "\n");
  else {
    stdout.write(`local\t${report.localRuntime.platform}/${report.localRuntime.arch}\tnode ${report.localRuntime.node}\n`);
    for (const check of checks) stdout.write(`${check.ok ? "ok" : "fail"}\t${check.name}\t${check.path}${check.error ? `\t${check.error}` : ""}\n`);
  }
  if (!accepted) stderr.write("aios: node doctor admission failed; no node was registered or authorized\n");
  return accepted ? 0 : 3;
}

export async function runCli(argv, { fetcher = fetch, stdout = process.stdout, stderr = process.stderr } = {}) {
  let options;
  try { options = parse(argv); } catch (err) { stderr.write(`aios: ${err.message}\n`); return 2; }
  if (options.help || !options.command) { stdout.write(usage() + "\n"); return options.help ? 0 : 2; }
  if (options.command === "node") {
    if (options.extra.length !== 1 || options.extra[0] !== "doctor") { stderr.write("aios: usage: aios node doctor\n"); return 2; }
    return runNodeDoctor(options, { fetcher, stdout, stderr });
  }
  if (options.extra.length) { stderr.write("aios: command accepts no positional arguments\n"); return 2; }
  const paths = { status: "/runtime-status", capabilities: "/capabilities", artifacts: "/artifacts", formations: "/formation-memory", "agent-card": "/.well-known/agent-card.json" };
  if (!paths[options.command]) { stderr.write(`aios: unknown command: ${options.command}\n`); return 2; }
  try {
    const response = await fetcher(options.url + paths[options.command], { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) { stderr.write(`aios: ${options.command} HTTP ${response.status}\n`); return 3; }
    const value = project(options.command, await response.json());
    stdout.write(options.json ? JSON.stringify(value) + "\n" : text(options.command, value) + "\n");
    return 0;
  } catch (err) {
    stderr.write(`aios: ${options.command} failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return 3;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await runCli(process.argv.slice(2));
}
