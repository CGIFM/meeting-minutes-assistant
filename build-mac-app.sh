#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="会议纪要助手"
APP_DIR="$ROOT_DIR/dist/$APP_NAME.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"

rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"

# 编译 Swift 原生壳
swiftc \
  "$ROOT_DIR/native/main.swift" \
  -o "$MACOS_DIR/MeetingMinutes" \
  -framework Cocoa \
  -framework WebKit \
  -framework UniformTypeIdentifiers

# 复制 Info.plist
cp "$ROOT_DIR/native/Info.plist" "$CONTENTS_DIR/Info.plist"

# 复制前端构建产物到 Resources（只有 UI，不含 backend）
cp "$ROOT_DIR/dist/index.html" "$RESOURCES_DIR/index.html"
cp -r "$ROOT_DIR/dist/assets" "$RESOURCES_DIR/assets"

chmod +x "$MACOS_DIR/MeetingMinutes"
codesign --force --deep --sign - "$APP_DIR" >/dev/null 2>&1 || true

# 安装到 ~/Applications
rm -rf "$HOME/Applications/$APP_NAME.app"
cp -R "$APP_DIR" "$HOME/Applications/$APP_NAME.app"

echo "✅ Built & Installed: ~/Applications/$APP_NAME.app"
echo "   双击打开或运行: open ~/Applications/$APP_NAME.app"
