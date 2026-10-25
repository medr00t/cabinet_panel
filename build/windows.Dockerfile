# Cross-compiles the Windows installer (NSIS .exe) from Linux, as documented by Tauri
# ("Cross-compile from Linux/macOS to Windows"): cargo-xwin + NSIS + LLVM.
FROM rust:1-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
      nsis lld llvm clang curl ca-certificates xz-utils pkg-config file \
    && rm -rf /var/lib/apt/lists/*

# Node 22 for the frontend build
RUN curl -fsSL https://nodejs.org/dist/v22.11.0/node-v22.11.0-linux-x64.tar.xz | tar -xJ -C /usr/local --strip-components=1

RUN rustup target add x86_64-pc-windows-msvc \
 && cargo install --locked cargo-xwin

# Vite 7 needs Node >= 22.12 (kept as a late layer so the Rust layers above stay cached)
RUN curl -fsSL https://nodejs.org/dist/v22.12.0/node-v22.12.0-linux-x64.tar.xz | tar -xJ -C /usr/local --strip-components=1

WORKDIR /work
