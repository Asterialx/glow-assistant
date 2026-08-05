#!/usr/bin/env bash
# Run on macOS only — prepares toolchains and initializes the Xcode project.
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script must run on a Mac."
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Checking rustup iOS targets"
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios

if ! command -v pod >/dev/null 2>&1; then
  echo "CocoaPods (pod) not found. Install: brew install cocoapods"
  exit 1
fi

if grep -q "YOUR_APPLE_TEAM_ID" src-tauri/tauri.conf.json; then
  echo "WARNING: Replace YOUR_APPLE_TEAM_ID in src-tauri/tauri.conf.json (and tauri.ios.conf.json)"
  echo "         Xcode → Settings → Accounts → Team ID"
fi

echo "==> npm install"
npm install

echo "==> tauri ios init"
npm run ios:init

echo ""
echo "Done. Next:"
echo "  npm run ios:dev           # simulator / device"
echo "  npm run ios:build:release # release build"
echo "  npm run ios:open          # open in Xcode"
