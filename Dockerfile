# syntax=docker/dockerfile:1

# ---- deps: install with dev deps for the build/emit step ----
FROM oven/bun:1.4.0-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

# ---- build: emit the Prisma contract, prune to production deps ----
FROM deps AS build
WORKDIR /app
COPY . .
RUN bun run db:contract
RUN bun install --frozen-lockfile --production --ignore-scripts

# ---- runtime: non-root, no toolchain beyond Bun ----
FROM oven/bun:1.4.0-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
# tsconfig.json is load-bearing at runtime: Bun reads `experimentalDecorators`
# from it, without which the NestJS decorators throw.
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER bun
EXPOSE 3000
# `prisma db migrate` runs here as an init step, never inside the app process
# (technical.md §1: avoids races between replicas; the app only *checks* the
# schema is current, via `verifyMarker` in db.ts).
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["bun", "run", "src/main.ts"]
