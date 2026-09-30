#!/usr/bin/env bash
# SwingCalc 桌面版构建脚本
# 产物：dist/波段计算器.exe（Windows x64，无需安装 Node.js）
set -e
cd "$(dirname "$0")"
echo "安装 pkg..."
npm install --save-dev pkg
echo "打包 Windows 版..."
mkdir -p dist
./node_modules/.bin/pkg . --target node18-win-x64 --output dist/波段计算器.exe --compress GZip
echo ""
echo "✓ 打包完成：dist/波段计算器.exe"
echo "  把 dist/波段计算器.exe 发给对方即可，双击运行。"
