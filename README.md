# Glow Assistant

Local-first AI family workspace (Tauri 2 + React + SQLite) with Home / Code / Med modes.

First try: 

https://glowai-ashy.vercel.app/

## Run (Windows / desktop)

```bash
npm install
npm run dev          # UI at http://localhost:1420
npm run tauri:dev    # desktop window
npm run tauri:build  # produces .exe + NSIS setup
```

Installers after build:
- `dist-installers/Glow Assistant_0.1.0_x64-setup.exe` (NSIS)
- `dist-installers/Glow Assistant_0.1.0_x64_en-US.msi`
- `dist-installers/Glow Assistant.exe` (portable)

## iOS (Mac only)

Подробности в **[IOS.md](IOS.md)**.

```bash
# на Mac, после npm install и Team ID в tauri.conf.json
npm run ios:init
npm run ios:dev
npm run ios:build:release
```

## Notes

- Soft Claude-like light UI
- API key in `.env` / Settings — do not commit secrets
- Bundle id: `com.glowassistant.app`
