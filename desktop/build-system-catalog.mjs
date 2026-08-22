// Track D — canonical catalog for the 8 initial system artifacts.
// Only artifacts with a REAL, independently-produced build output get a real
// sha256/buildId. The rest of AIOS's conceptual components currently live
// BUNDLED inside the com.aios.nodeagent APK (see docs/android-foundation/
// 08-VERTICAL-SLICE-STATUS.md) — they are honestly marked bundled/DESIGN_ONLY
// rather than assigned a fabricated hash for a build that doesn't exist.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, sha256 } from "./observer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const CATALOG_DIR = resolve(REPO_ROOT, "artifacts-catalog");
const NODE_AGENT_CATALOG = resolve(CATALOG_DIR, "com.aios.nodeagent.json");
const NATIVE_SO = process.argv[2] || resolve(
  REPO_ROOT, "native-core", "target", "aarch64-linux-android", "release", "libaios_core_native.so"
);

function realCoreNativeEntry() {
  if (!existsSync(NATIVE_SO)) {
    throw new Error(`libaios_core_native.so not found at ${NATIVE_SO} — build it first (cargo build --release --target aarch64-linux-android --lib --features android-jni)`);
  }
  const bytes = readFileSync(NATIVE_SO);
  const digest = sha256(bytes);
  const buildId = `build-core-${digest.slice(0, 12)}`;
  const identityPayload = { type: "core-native", platform: "android-arm64", buildId };
  const artifactId = "art-" + sha256(canonicalJson(identityPayload)).slice(0, 32);
  return {
    artifactId,
    name: "AIOS Core",
    type: "core-native",
    version: "0.1.0-design",
    platform: "android-arm64",
    sha256: digest,
    buildId,
    sizeBytes: bytes.length,
    createdAt: new Date().toISOString(),
    status: "DISCOVERED",
    note: "Real cross-compiled cdylib (native-core/src/*), independently verifiable file, not yet catalogued as an installable AIOS Artifact (no manifest wrapper on the .so itself).",
  };
}

function nodeAgentEntry() {
  if (!existsSync(NODE_AGENT_CATALOG)) {
    throw new Error(`${NODE_AGENT_CATALOG} not found — run build-artifact-catalog.mjs first`);
  }
  const catalog = JSON.parse(readFileSync(NODE_AGENT_CATALOG, "utf8"));
  const latest = catalog.artifacts[catalog.artifacts.length - 1];
  return { ...latest, name: "AIOS Node Agent" };
}

function bundledPlaceholder(name, type, bundledIn) {
  return {
    artifactId: null,
    name,
    type,
    version: null,
    platform: "android",
    sha256: null,
    buildId: null,
    createdAt: null,
    status: "DESIGN_ONLY",
    note: `Bundled inside ${bundledIn} — not yet an independently-built/installable artifact. No fabricated hash.`,
  };
}

function buildSystemCatalog() {
  const artifacts = [
    realCoreNativeEntry(),
    bundledPlaceholder("AIOS Runtime", "runtime-service", "com.aios.nodeagent (RuntimeService.kt)"),
    nodeAgentEntry(),
    bundledPlaceholder("AIOS Control Surface", "control-surface", "com.aios.nodeagent (MainActivity.kt + Screens.kt)"),
    bundledPlaceholder("AIOS Evidence Vault", "evidence-vault", "com.aios.nodeagent (RuntimeState.kt evidence log)"),
    bundledPlaceholder("AIOS Artifact Store", "artifact-store", "com.aios.nodeagent (ArtifactStore.kt)"),
    bundledPlaceholder("AIOS Installer", "installer", "com.aios.nodeagent (AiosInstaller.kt)"),
    bundledPlaceholder("AIOS Device Bridge", "capability-bridge", "com.aios.nodeagent (CapabilityDispatch.kt)"),
  ];
  const catalogDigest = sha256(canonicalJson(artifacts));
  const catalog = {
    schema: "aios.system.catalog.v1",
    generatedAt: new Date().toISOString(),
    realArtifactCount: artifacts.filter((a) => a.status !== "DESIGN_ONLY").length,
    designOnlyCount: artifacts.filter((a) => a.status === "DESIGN_ONLY").length,
    catalogDigest,
    artifacts,
  };
  if (!existsSync(CATALOG_DIR)) mkdirSync(CATALOG_DIR, { recursive: true });
  const path = resolve(CATALOG_DIR, "system-catalog.json");
  writeFileSync(path, JSON.stringify(catalog, null, 2) + "\n", "utf8");
  return { path, catalog };
}

const isMain = resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] || "");
if (isMain) {
  const { path, catalog } = buildSystemCatalog();
  console.log(JSON.stringify(catalog, null, 2));
  console.log(`\nreal: ${catalog.realArtifactCount}  design-only: ${catalog.designOnlyCount}`);
  console.log(`written: ${path}`);
}
