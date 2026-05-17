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

1. Run `npm run build`
2. Copy `dist/modules/foundryvtt-live-translator` into Foundry `Data/modules/foundryvtt-live-translator`
3. On the GM/host machine, copy `services/live-translator-service/.env.example` to `.env`
4. Set `DEEPL_API_KEY`
5. Run `npm run start:service`
6. Start the companion app reverse proxy so public port `31000` fronts Foundry `30000` and translator service `31001`
7. Enable the module
8. Open `Game Settings -> Configure Settings -> Module Settings`
9. Keep `Service Path` as `/live-translator`

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

## Release Layout

- Foundry module release assets are built to `dist/release/`
- Run `npm run build:release` at the project root to rebuild the module and collect companion app assets into the release folder
- Upload these to a GitHub Release:
  - `module.json`
  - `foundryvtt-live-translator.zip`
- Companion app installers are collected under:
  - `dist/release/companion-app/macos-apple-silicon/`
  - `dist/release/companion-app/windows-64bit/`
- Companion app installers can be uploaded to the same GitHub Release as separate assets
- The module manifest is configured for the GitHub repository:
  - Repository URL: `https://github.com/m1nque/foundryvtt-live-translator`
  - Manifest URL: `https://github.com/m1nque/foundryvtt-live-translator/releases/latest/download/module.json`
  - Download URL: `https://github.com/m1nque/foundryvtt-live-translator/releases/latest/download/foundryvtt-live-translator.zip`

## Notes

- This version calls a GM-hosted service rather than calling DeepL directly from the browser
- Players do not need their own companion app if they can reach the GM/host reverse proxy on port `31000`
- The cache currently uses IndexedDB for a buildable browser-side database without extra dependencies

## Icon Attribution

- Companion app icon includes a translate icon with attribution:
  [아이콘 제작자: Pixel perfect - Flaticon](https://www.flaticon.com/kr/free-icons/)
