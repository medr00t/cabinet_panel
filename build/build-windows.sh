#!/usr/bin/env bash
# Builds the Windows installer into ./release-windows/ using Docker (no Windows machine needed).
set -euo pipefail
cd "$(dirname "$0")/.."

docker build -t cabinet-win-builder -f build/windows.Dockerfile build

mkdir -p release-windows
docker run --rm \
  -v "$PWD":/work \
  -v cabinet-win-cargo:/usr/local/cargo/registry \
  -v cabinet-win-target:/work/src-tauri/target \
  -v cabinet-win-xwin:/root/.cache/cargo-xwin \
  -e XWIN_ACCEPT_LICENSE=1 \
  cabinet-win-builder bash -c '
    set -e
    npm ci
    npx tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc
    cp src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe release-windows/
    chown -R '"$(id -u):$(id -g)"' release-windows node_modules dist 2>/dev/null || true
  '
ls -lh release-windows
