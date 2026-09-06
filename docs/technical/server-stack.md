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
