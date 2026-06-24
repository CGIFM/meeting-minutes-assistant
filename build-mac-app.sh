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

# 复制前端构建产物
cp -r "$ROOT_DIR/dist/assets" "$RESOURCES_DIR/" 2>/dev/null || true
cp "$ROOT_DIR/dist/index.html" "$RESOURCES_DIR/" 2>/dev/null || true

# 复制后端
cp -r "$ROOT_DIR/backend" "$RESOURCES_DIR/backend"
rm -rf "$RESOURCES_DIR/backend/.venv"

chmod +x "$MACOS_DIR/MeetingMinutes"
codesign --force --deep --sign - "$APP_DIR" >/dev/null 2>&1 || true

echo "✅ Built: $APP_DIR"
echo "   运行: open \"$APP_DIR\""
echo ""
echo "   注意: 首次运行前需确保 Python 虚拟环境已创建:"
echo "   cd backend && source .venv/bin/activate"
