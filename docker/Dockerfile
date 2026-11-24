# The cabinet web app: frontend + server in one small image. Build context = the repository root.
FROM node:22-bookworm-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json tsconfig.node.json vite.config.ts ./
COPY public public
COPY src src
RUN npm run build

FROM rust:1-bookworm AS server
WORKDIR /app
COPY src-tauri src-tauri
COPY database/schema.sql database/schema.sql
# no desktop (Tauri) libraries: the server only needs the commands and the database driver
RUN cd src-tauri && cargo build --release --no-default-features --bin cabinet_web

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=server /app/src-tauri/target/release/cabinet_web /app/cabinet_web
COPY --from=web /app/dist /app/dist
COPY database/updates /app/updates
ENV CABINET_WEB_DIR=/app/dist \
    CABINET_UPDATES_DIR=/app/updates \
    CABINET_CONFIG_DIR=/data \
    CABINET_BACKUP_DIR=/backups \
    CABINET_DB_HOST=mysql \
    CABINET_PORT=8080 \
    CABINET_DOCTOR_LOCAL_ONLY=0 \
    TZ=Africa/Casablanca
EXPOSE 8080
CMD ["/app/cabinet_web"]
