# FoundryVTT Live Translator App

Electron companion app scaffold for macOS and Windows.

## What It Owns

- Reverse proxy on `31000`
- DeepL translator service on `31001`
- Foundry upstream forwarding to `30000`
- Local, LAN, and public IP hints in the status UI

## Current State

- Electron app scaffold is implemented
- Reverse proxy logic is implemented in Node inside the Electron main process
- Translator service launch is wired into the companion app
- Packaging config for macOS and Windows is included

## Build

1. Install dependencies:

```bash
npm install
```

2. Start the app locally:

```bash
npm run start
```

3. Build installers:

```bash
npm run build
```

Platform-specific builds:

```bash
npm run build:mac
npm run build:win
```

- `build:mac` is intended for macOS packaging
- `build:win` is intended for Windows 64-bit packaging

## Routing Model

- `http://host:31000/` -> Foundry `http://127.0.0.1:30000/`
- `http://host:31000/live-translator/*` -> translator service `http://127.0.0.1:31001/*`

## Icon Attribution

- FoundryVTT app icon composition includes a translate icon with attribution:
  [아이콘 제작자: Pixel perfect - Flaticon](https://www.flaticon.com/kr/free-icons/)
