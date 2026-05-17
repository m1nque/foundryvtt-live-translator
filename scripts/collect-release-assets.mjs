import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = process.cwd();
const companionDistDir = resolve(rootDir, "companion-app", "dist");
const releaseDir = resolve(rootDir, "dist", "release");
const releaseCompanionDir = resolve(releaseDir, "companion-app");
const macReleaseDir = resolve(releaseCompanionDir, "macos-apple-silicon");
const windowsReleaseDir = resolve(releaseCompanionDir, "windows-64bit");

rmSync(releaseCompanionDir, { recursive: true, force: true });
mkdirSync(macReleaseDir, { recursive: true });
mkdirSync(windowsReleaseDir, { recursive: true });

if (!existsSync(companionDistDir)) {
  console.log("No companion-app/dist directory found. Skipping companion asset collection.");
  process.exit(0);
}

const files = readdirSync(companionDistDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name);

for (const file of files) {
  const source = resolve(companionDistDir, file);

  if (isMacAppleSiliconAsset(file)) {
    cpSync(source, resolve(macReleaseDir, file));
    continue;
  }

  if (isWindows64Asset(file)) {
    cpSync(source, resolve(windowsReleaseDir, file));
  }
}

console.log(`Collected companion release assets into ${releaseCompanionDir}`);

function isMacAppleSiliconAsset(file) {
  return /arm64\.(dmg|zip|blockmap)$/i.test(file) || /arm64-mac\.zip(\.blockmap)?$/i.test(file);
}

function isWindows64Asset(file) {
  return /x64\.(exe|zip|blockmap)$/i.test(file) || /win.*x64/i.test(file);
}
