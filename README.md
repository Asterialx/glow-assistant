# Glow Assistant

Local-first AI family workspace (Tauri 2 + React + SQLite) with Home / Code / Med modes.

## Run

```bash
npm install
npm run dev          # UI at http://localhost:1420
npm run tauri:dev    # desktop window
npm run tauri:build  # produces .exe + NSIS setup in src-tauri/target/release/bundle/
```

Installers after build:
- `dist-installers/Glow Assistant_0.1.0_x64-setup.exe` (NSIS)
- `dist-installers/Glow Assistant_0.1.0_x64_en-US.msi`
- `dist-installers/Glow Assistant.exe` (portable)

(Also under `src-tauri/target/release/bundle/` when not using a custom Cargo target dir.)

## Notes

- Soft Claude-like light UI
- API key in `.env` / Settings — do not commit secrets
