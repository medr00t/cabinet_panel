#!/usr/bin/env bash
# Builds the web server for Windows (cabinet_web.exe + the web app) into ./release-web/ using Docker.
set -euo pipefail
cd "$(dirname "$0")/.."

docker build -t cabinet-win-builder -f build/windows.Dockerfile build

rm -rf release-web/cabinet-web && mkdir -p release-web/cabinet-web
docker run --rm \
  -v "$PWD":/work \
  -v cabinet-win-cargo:/usr/local/cargo/registry \
  -v cabinet-win-target:/work/src-tauri/target \
  -v cabinet-win-xwin:/root/.cache/cargo-xwin \
  -e XWIN_ACCEPT_LICENSE=1 \
  cabinet-win-builder bash -c '
    set -e
    npm ci
    npm run build
    cd src-tauri
    cargo xwin build --release --target x86_64-pc-windows-msvc --bin cabinet_web
    cd ..
    cp src-tauri/target/x86_64-pc-windows-msvc/release/cabinet_web.exe release-web/cabinet-web/
    cp -r dist release-web/cabinet-web/dist
    cp build/DEMARRER-CABINET.bat release-web/cabinet-web/
    chown -R '"$(id -u):$(id -g)"' release-web node_modules dist 2>/dev/null || true
  '
(cd release-web && rm -f cabinet-web.zip && python3 -c "import shutil;shutil.make_archive('cabinet-web','zip','.','cabinet-web')")
ls -lh release-web
