/* Node tabanli build denetimi: Termux/bash, PowerShell/CMD, zsh ve Linux
 * shell farklarindan bagimsizdir. Uygulamayi calistirmaz veya ag erisimi yapmaz. */
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sourceDir = new URL("../src/", import.meta.url);
const files = [
  ...readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => new URL(`../src/${entry.name}`, import.meta.url)),
  new URL("../public/js/app.js", import.meta.url),
  new URL("../public/js/api.js", import.meta.url),
  new URL("../bin/aios.mjs", import.meta.url),
];

for (const file of files) {
  const isTypeScript = file.pathname.endsWith(".ts");
  const result = spawnSync(process.execPath, [
    ...(isTypeScript ? ["--experimental-strip-types"] : []),
    "--check", fileURLToPath(file),
  ], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("BUILD_OK");
