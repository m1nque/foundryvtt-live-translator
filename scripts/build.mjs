import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const moduleId = "foundryvtt-live-translator";
const sourceModuleDir = resolve(rootDir, moduleId);
const distDir = resolve(rootDir, "dist");
const distModulesDir = resolve(distDir, "modules");
const outputModuleDir = resolve(distModulesDir, moduleId);
const releaseDir = resolve(distDir, "release");
const releaseManifestPath = resolve(releaseDir, "module.json");

if (!existsSync(sourceModuleDir)) {
  console.error(`Missing module source directory: ${sourceModuleDir}`);
  process.exit(1);
}

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distModulesDir, { recursive: true });
cpSync(sourceModuleDir, outputModuleDir, { recursive: true });
mkdirSync(releaseDir, { recursive: true });

const manifest = JSON.parse(readFileSync(resolve(outputModuleDir, "module.json"), "utf8"));
const version = String(manifest.version ?? "0.0.0").trim();
const releaseZipName = `${moduleId}-v${version}.zip`;
const releaseZipPath = resolve(releaseDir, releaseZipName);

writeFileSync(releaseManifestPath, JSON.stringify(manifest, null, 2), "utf8");
execFileSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", outputModuleDir, releaseZipPath]);

writeFileSync(
  resolve(distDir, "README.txt"),
  [
    "Build completed.",
    "",
    `Foundry module output: ${outputModuleDir}`,
    `Release manifest: ${releaseManifestPath}`,
    `Release zip: ${releaseZipPath}`
  ].join("\n"),
  "utf8"
);

console.log(`Built module to ${outputModuleDir}`);
