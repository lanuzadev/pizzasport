# syntax=docker/dockerfile:1

# ── Etapa build: compila el binario nativo de sqlite3 ──
# node:*-bookworm-slim no trae toolchain de compilación; se instala solo
# aquí y no viaja a la imagen final.
FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# --build-from-source: evita el binario prebuilt de sqlite3 (compilado
# contra una glibc más nueva que la de esta imagen -> ERR_DLOPEN_FAILED
# GLIBC_2.38 en bookworm) y lo compila aquí mismo con el toolchain de arriba,
# quedando enlazado contra la glibc real de la imagen final.
RUN npm ci --omit=dev --build-from-source

# ── Etapa runtime: solo lo necesario para correr el servidor ──
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/database.sqlite \
    BACKUPS_DIR=/app/data/backups

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY server.js package.json ./
COPY index.html manifest.json sw.js ./
COPY css ./css
COPY js ./js
COPY assets ./assets
COPY img ./img

# /app/data es el volumen de datos (BD + backups); se crea con dueño "node"
# (usuario no-root incluido en la imagen oficial) antes de bajar privilegios.
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/login-users').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
