# syntax=docker/dockerfile:1

# ---------- deps: full install for building ----------
FROM node:22-bookworm-slim AS deps
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app
# Copy only manifests first for cached installs.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------- build: shared -> client -> server ----------
FROM deps AS build
WORKDIR /app
COPY . .
RUN pnpm --filter @ra/shared build \
 && pnpm --filter @ra/client build \
 && pnpm --filter @ra/server build

# ---------- runtime: slim, prod deps, native rebuild ----------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV DATABASE_PATH=/data/data.sqlite
ENV PORT=3000
RUN corepack enable
WORKDIR /app

# Build toolchain only needed if a better-sqlite3 prebuilt is unavailable for
# this Node/ABI; node:22-bookworm-slim normally fetches a prebuilt.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Manifests for the prod install.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

# Install prod deps for server (+ its workspace deps) and ensure the
# better-sqlite3 native binding matches THIS image's Node/ABI/arch.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @ra/server... \
 && pnpm --filter @ra/server rebuild better-sqlite3

# Built artifacts from the build stage.
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/drizzle ./server/drizzle
COPY --from=build /app/client/dist ./client/dist

# Entrypoint (migrate -> exec server).
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# The server runs from server/ so node resolves better-sqlite3 from
# server/node_modules and relative paths line up with the bundle.
WORKDIR /app/server

# Serve the built SPA and resolve migrations from the image layout.
ENV STATIC_DIR=/app/client/dist
ENV MIGRATIONS_DIR=/app/server/drizzle

RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 3000
ENTRYPOINT ["/app/entrypoint.sh"]
