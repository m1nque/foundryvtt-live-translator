# FoundryVTT Live Translator

FoundryVTT PF2e module workspace for a GM-hosted DeepL translation module with a companion app reverse proxy.

## What It Does

- The Foundry client sends translation requests to a host-side companion service
- The host-side service runs on the GM or Foundry host machine
- The host-side service uses the GM host's DeepL API key
- A reverse proxy on port `31000` fronts both Foundry and the translator service
- The host-side service keeps a shared translation cache so repeat requests from other users can reuse the same translation
- Translation results are cached in a browser database so repeat lookups are faster
- Adds a `Translate` button to PF2e `Item Sheet` headers
- Opens a translated overlay for item name and description

## Quick Start

1. Install the module into Foundry at `Data/modules/foundryvtt-live-translator`
2. Launch the `FoundryVTT Live Translator` companion app
3. Enter the `DeepL API Key`
4. Click `Save and Restart`
5. Enable the `FoundryVTT Live Translator` module in Foundry
6. Keep the module `Service Path` setting at the default `/live-translator`
7. Open a PF2e item sheet and use the `Translate` button

## Build Your Own Companion App

### macOS (Apple Silicon)

1. Move into `companion-app/`
2. Run `npm install`
3. Build the app with `npm run build:mac`
4. Output files will appear under `companion-app/dist/`

Typical macOS outputs:

- `FoundryVTT Live Translator-<version>-arm64.dmg`
- `FoundryVTT Live Translator-<version>-arm64-mac.zip`

### Windows (64-bit)

1. Open the project on a Windows machine
2. Move into `companion-app/`
3. Run `npm install`
4. Build the app with `npm run build:win`
5. Output files will appear under `companion-app/dist/`

Typical Windows outputs:

- `FoundryVTT Live Translator Setup <version>.exe`
- `FoundryVTT Live Translator-<version>-win.zip`

## Automated GitHub Releases

- GitHub Actions workflow: `.github/workflows/release.yml`
- Trigger:
  - Push a tag like `v0.1.0`
  - Or run the workflow manually from the Actions tab
- What it builds:
  - Foundry module release assets
  - Companion app for macOS (Apple Silicon)
  - Companion app for Windows (64-bit)
- What happens on tag push:
  - A GitHub Release is created or updated
  - Built artifacts are uploaded to that Release automatically

## Release Layout

- Foundry module release assets are built to `dist/release/`
- Run `npm run build:release` at the project root to rebuild the module and collect companion app assets into the release folder
- Upload these to a GitHub Release:
  - `module.json`
  - `foundryvtt-live-translator-v<version>.zip`
- Companion app installers are collected under:
  - `dist/release/companion-app/macos-apple-silicon/`
  - `dist/release/companion-app/windows-64bit/`
- Companion app installers can be uploaded to the same GitHub Release as separate assets
- Recommended release flow:
  - Use GitHub Actions to build macOS Apple Silicon and Windows 64-bit companion app artifacts
  - Keep `dist/release/` as the local staging layout that mirrors the release asset structure
- The module manifest is configured for the GitHub repository:
  - Repository URL: `https://github.com/m1nque/foundryvtt-live-translator`
  - Manifest URL: `https://github.com/m1nque/foundryvtt-live-translator/releases/latest/download/module.json`
  - Download URL: `https://github.com/m1nque/foundryvtt-live-translator/releases/latest/download/foundryvtt-live-translator-v<version>.zip`

## Notes

- This version calls a GM-hosted service rather than calling DeepL directly from the browser
- Players do not need their own companion app if they can reach the GM/host reverse proxy on port `31000`
- The cache currently uses IndexedDB for a buildable browser-side database without extra dependencies

## Icon Attribution

- Companion app icon includes a translate icon with attribution:
  [아이콘 제작자: Pixel perfect - Flaticon](https://www.flaticon.com/kr/free-icons/)
