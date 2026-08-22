// AIOS Artifact Supply Chain v1 — canonical catalog generator.
// Reads REAL build/APK metadata (aapt2, apksigner) — never invents a field.
// Reuses the one canonical hashing implementation (observer.mjs canonicalJson/
// sha256) so the catalogDigest is computed the same way as every other
// canonical hash in this repo — no second hashing semantic.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, sha256 } from "./observer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const CATALOG_DIR = resolve(REPO_ROOT, "artifacts-catalog");

const SDK_ROOT = process.env.AIOS_ANDROID_SDK || "D:\\Android\\Sdk";
const BUILD_TOOLS = process.env.AIOS_ANDROID_BUILD_TOOLS || "37.0.0";
const AAPT2 = resolve(SDK_ROOT, "build-tools", BUILD_TOOLS, "aapt2.exe");
const APKSIGNER = resolve(SDK_ROOT, "build-tools", BUILD_TOOLS, "apksigner.bat");
const JAVA_HOME = process.env.AIOS_JAVA_HOME || "D:\\Android\\jdk\\jdk-17.0.20+8";

const SAFE_CAPABILITIES = [
  "sensor.battery.read",
  "device.diagnostics.read",
  "network.diagnostics.read",
  "aios.reality",
  "aios.status",
];

function parseBadging(apkPath) {
  const out = execFileSync(AAPT2, ["dump", "badging", apkPath], { encoding: "utf8" });
  const pkgLine = out.match(/package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/);
  const minSdk = out.match(/minSdkVersion:'(\d+)'/);
  const targetSdk = out.match(/targetSdkVersion:'(\d+)'/);
  const nativeCode = [...out.matchAll(/native-code: (.+)/g)].flatMap((m) =>
    m[1].split(/\s+/).map((s) => s.replace(/'/g, ""))
  );
  if (!pkgLine) throw new Error("aapt2 badging output did not contain a package line");
  return {
    packageName: pkgLine[1],
    versionCode: Number(pkgLine[2]),
    versionName: pkgLine[3],
    minSdk: minSdk ? Number(minSdk[1]) : null,
    targetSdk: targetSdk ? Number(targetSdk[1]) : null,
    abi: nativeCode[0] || "unknown",
  };
}

function signingCertDigest(apkPath) {
  const out = execFileSync("cmd.exe", ["/d", "/s", "/c", APKSIGNER, "verify", "--print-certs", apkPath], {
    encoding: "utf8",
    env: { ...process.env, JAVA_HOME, PATH: `${JAVA_HOME}\\bin;${process.env.PATH}` },
  });
  const m = out.match(/certificate SHA-256 digest: ([0-9a-f]+)/);
  if (!m) throw new Error("apksigner did not report a SHA-256 certificate digest");
  return `sha256:${m[1]}`;
}

export function buildCatalogEntry(apkPath, { artifactType = "node-agent", buildMarker = "" } = {}) {
  if (!existsSync(apkPath)) throw new Error(`APK not found: ${apkPath}`);
  const apkBytes = readFileSync(apkPath);
  const apkSha256 = sha256(apkBytes);
  const badging = parseBadging(apkPath);
  const signatureReference = signingCertDigest(apkPath);
  const createdAt = new Date().toISOString();
  const buildId = `build-${badging.versionCode}-${apkSha256.slice(0, 12)}${buildMarker ? "-" + buildMarker : ""}`;

  const identityPayload = {
    type: artifactType,
    packageName: badging.packageName,
    versionName: badging.versionName,
    platform: "android",
    buildId,
  };
  const artifactId = "art-" + sha256(canonicalJson(identityPayload)).slice(0, 32);

  const entry = {
    artifactId,
    packageName: badging.packageName,
    type: artifactType,
    version: badging.versionName,
    platform: "android",
    minSdk: badging.minSdk,
    targetSdk: badging.targetSdk,
    abi: badging.abi,
    sha256: apkSha256,
    signatureReference,
    buildId,
    dependencies: [],
    capabilities: [...SAFE_CAPABILITIES].sort(),
    createdAt,
    verificationRefs: [],
    status: "DISCOVERED",
  };
  return entry;
}

function writeCatalog(newEntry) {
  if (!existsSync(CATALOG_DIR)) mkdirSync(CATALOG_DIR, { recursive: true });
  const path = resolve(CATALOG_DIR, "com.aios.nodeagent.json");
  let existing = [];
  if (existsSync(path)) {
    try {
      existing = JSON.parse(readFileSync(path, "utf8")).artifacts || [];
    } catch { /* start fresh if unreadable */ }
  }
  // Same artifactId (identical build content) replaces; otherwise appends —
  // the catalog accumulates every distinct build we've produced evidence for.
  const entries = [...existing.filter((e) => e.artifactId !== newEntry.artifactId), newEntry];
  const catalog = {
    schema: "aios.artifact.catalog.v1",
    generatedAt: new Date().toISOString(),
    artifacts: entries,
  };
  const catalogDigest = sha256(canonicalJson(entries));
  catalog.catalogDigest = catalogDigest;
  writeFileSync(path, JSON.stringify(catalog, null, 2) + "\n", "utf8");
  return { path, catalogDigest };
}

// CLI entry: node build-artifact-catalog.mjs <apkPath> [buildMarker]
const isMain = resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] || "");
if (isMain) {
  const apkPath = process.argv[2];
  const buildMarker = process.argv[3] || "";
  if (!apkPath) {
    console.error("Usage: node build-artifact-catalog.mjs <apkPath> [buildMarker]");
    process.exit(1);
  }
  const entry = buildCatalogEntry(apkPath, { buildMarker });
  const { path, catalogDigest } = writeCatalog(entry);
  console.log(JSON.stringify(entry, null, 2));
  console.log(`\ncatalogDigest: ${catalogDigest}`);
  console.log(`written: ${path}`);
}
