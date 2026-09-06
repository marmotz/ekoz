# Server technology stack

## Context

The server must be maintainable by a majority of developers, deployable as a
Docker image with few operational dependencies, and must not drift into
spaghetti. The author is proficient with Node.js/TypeScript.

## Decision

- **Runtime**: Bun (execution and package management). Types aligned with
  Node 26.8.1.
- **Framework**: NestJS 12 (ESM) — enforced structure, modules, dependency
  injection.
- **ORM**: Prisma 8, starting directly on the `8.0.0-rc` line (the final release
  is imminent and will land during Ekoz development). `prisma-client` generator
  (emits `.ts`), `@prisma/adapter-pg` driver adapter, connection configured
  through `prisma.config.ts` (no `url` in the schema `datasource` block; load
  `.env` explicitly in `prisma.config.ts`). Full-text search via PostgreSQL FTS
  functions, in raw SQL (`$queryRaw`) where Prisma is limited.
- **Database**: PostgreSQL, exclusive. No multi-database abstraction.
- **Tests**: Vitest.
- Always target the latest versions of the tools.
- Distribution: Docker image. No single binary (the `bun build --compile` option
  is kept for later if a need arises).

## Consequences

- **Stack POC done on 2026-08-29 — conclusive.** NestJS 12 (ESM) boots under
  Bun, `emitDecoratorMetadata` and type-based dependency injection work under
  Bun and under Vitest, Prisma + `@prisma/adapter-pg` runs queries, `db push`
  and `migrate dev` against PostgreSQL 18. Details and pitfalls in
  [poc-nestjs12-prisma-bun.md](poc-nestjs12-prisma-bun.md).
- PostgreSQL covers the relational model, the JSONB event log and text search: a
  single data dependency.

## Container image

- `apps/server/Dockerfile` builds from the **monorepo root** as context
  (`docker build -f apps/server/Dockerfile -t ekoz-server .`). Multi-stage:
  `deps` installs the workspace, `build` emits the Prisma contract and prunes to
  production dependencies, `runtime` carries only Bun plus the server sources.
  Verified end to end on 2026-09-06 (#41): image builds, migrates and boots
  against the `compose.yaml` Postgres, `/readyz` returns 200.
- The image ships **no `config.toml`**. Every infra parameter is supplied from
  the environment as `EKOZ_<SECTION>__<KEY>`
  ([configuration-model.md](configuration-model.md)). Required at boot:
  `EKOZ_DATABASE__URL` (or `DATABASE_URL`, which the entrypoint mirrors to it),
  `EKOZ_SECRET__KEY`, `EKOZ_SERVER__DOMAIN`, `EKOZ_SERVER__API_URL`,
  `EKOZ_SERVER__WEB_URL`.
- `docker/entrypoint.sh` runs `prisma db migrate --no-interactive` as an init
  step before `exec`-ing the app, and reconciles `DATABASE_URL` /
  `EKOZ_DATABASE__URL` so Prisma and the config resolver agree.
- CI (`.github/workflows/ci.yml`) builds the image on every push and pull
  request via `docker/build-push-action` with a GitHub Actions layer cache.
