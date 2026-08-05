# Glow Assistant — iOS (собрать на Mac)

iOS **нельзя** собрать на Windows. Здесь уже подготовлен конфиг; на Mac только init + build.

## 1. На Mac один раз

```bash
# Xcode из App Store (полный IDE, не только CLT)
xcode-select --install
sudo xcodebuild -license accept

# CocoaPods
brew install cocoapods

# Rust + iOS targets
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios

# Node
brew install node
```

В Xcode → **Settings → Accounts** войди в Apple ID.  
Скопируй **Team ID** (10 символов).

## 2. Подставь Team ID

В двух местах замени `YOUR_APPLE_TEAM_ID`:

- [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) → `bundle.iOS.developmentTeam`
- [`src-tauri/tauri.ios.conf.json`](src-tauri/tauri.ios.conf.json) → `bundle.iOS.developmentTeam`

Bundle id: `com.glowassistant.app`

## 3. Клонируй / скопируй проект и собери

```bash
cd /path/to/Claude2.0
npm install
cp .env.example .env   # вставь свой VITE_SMARTAPI_KEY

# Первый раз — сгенерирует Xcode-проект в src-tauri/gen/apple
npm run ios:init

# Симулятор / устройство (dev)
npm run ios:dev

# Release IPA / открыть в Xcode
npm run ios:build:release
# или
npm run ios:open
```

IPA обычно здесь: `src-tauri/gen/apple/build/arm64/*.ipa`

## 4. Права (уже в Info.ios.plist)

- Микрофон + Speech Recognition (диктовка)
- Фото / камера (вложения)

## 5. Ограничения на iOS

- **Game Mode** (слежение за процессами) — desktop only
- **Shell / Chrome agent / MCP spawn** — недоступны или урезаны
- **Диктовка:** Web Speech (`continuous: false`) без параллельного MediaRecorder; если Speech API нет — PCM→WAV→Whisper
- Чат, Med (PII/biomarkers), файлы — должны работать

## Troubleshooting

| Проблема | Что сделать |
|----------|-------------|
| `pod: command not found` | `brew install cocoapods`, новый терминал |
| Signing error | Team ID + Automatic signing в Xcode |
| Dev server не виден с устройства | одна Wi‑Fi сеть; `tauri ios dev` сам пробрасывает host |
| Диктовка молчит / пустой текст | Разреши Микрофон + Speech Recognition; первый Whisper качает модель (~40MB) |
| Product name / пробелы | display name «Glow Assistant» ок; id без пробелов |

## App icons (iPhone)

After `npm run ios:init`, generate the full AppIcon set from the master PNG:

```bash
# from project root — uses src-tauri/icons/icon.png (1024×1024 ideal)
npx tauri icon src-tauri/icons/icon.png
```

Then rebuild / open Xcode. Custom icons live under `src-tauri/icons/ios/`.
