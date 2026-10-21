#!/usr/bin/env bash
# Builds build/Kotone.app: the Solid UI (web/dist) inside a ~300-line Swift WKWebView shell.
# ARCH picks the CPU (default: this Mac's); releases are arm64, for Apple Silicon.
set -euo pipefail
cd "$(dirname "$0")/.."

APP=build/Kotone.app
pnpm -s build:web
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
swiftc -O -swift-version 5 -target "${ARCH:-$(uname -m)}-apple-macos13.0" macos/Sources/*.swift -o "$APP/Contents/MacOS/Kotone"
cp macos/Info.plist "$APP/Contents/Info.plist"
cp -R web/dist "$APP/Contents/Resources/web"
if [ -f macos/AppIcon.icns ]; then cp macos/AppIcon.icns "$APP/Contents/Resources/"; fi
codesign --force --sign - "$APP" >/dev/null 2>&1
echo "✓ $APP"
