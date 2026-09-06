# syntax=docker/dockerfile:1
#
# Build context is the MONOREPO ROOT, not apps/server:
#   docker build -f apps/server/Dockerfile -t ekoz-server .

# ---- deps: install the workspace with dev deps for the build/emit step ----
FROM oven/bun:1.4.0-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/package.json
COPY apps/client-web/package.json apps/client-web/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY packages/sdk/package.json packages/sdk/package.json
RUN bun install --frozen-lockfile --ignore-scripts

# ---- build: emit the Prisma contract, prune to production deps ----
FROM deps AS build
WORKDIR /app
COPY . .
RUN cd apps/server && bun run db:contract
RUN bun install --frozen-lockfile --production --ignore-scripts

# ---- runtime: non-root, no toolchain beyond Bun ----
FROM oven/bun:1.4.0-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/package.json ./package.json
# tsconfig.json is load-bearing at runtime: Bun reads `experimentalDecorators`
# from it, without which the NestJS decorators throw. It extends the repo base.
COPY --from=build /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/tsconfig.json ./apps/server/tsconfig.json
COPY --from=build /app/apps/server/prisma.config.ts ./apps/server/prisma.config.ts
COPY --from=build /app/apps/server/prisma ./apps/server/prisma
COPY --from=build /app/apps/server/src ./apps/server/src
COPY --from=build /app/apps/server/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /app/apps/server
# Local blob storage default (`storage.local.path = ./var/blobs`) resolves from
# this WORKDIR; create it writable by the runtime user and mark it a volume so a
# stock `docker run` reaches a ready state without an explicit mount.
RUN mkdir -p var/blobs && chown -R bun:bun var
VOLUME /app/apps/server/var
USER bun
EXPOSE 3010

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --quiet --spider "http://127.0.0.1:${EKOZ_HTTP__PORT:-3010}/readyz" || exit 1

# `prisma db migrate` runs here as an init step, never inside the app process.
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["bun", "run", "src/main.ts"]
