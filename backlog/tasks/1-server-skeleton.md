# server — application skeleton and CI

**Status**: todo
**Type**: backend / CI
**Repo**: ekoz-chat/server
**Issue**: [#1](https://github.com/ekoz-chat/server/issues/1)

Reference: [../features/server-core/technical.md §1](../features/server-core/technical.md#1-repository-skeleton-and-tooling).

## To do

1. NestJS 12 (ESM) application: `package.json` `"type": "module"`, Bun scripts
   (`bun run`, `bun test` → Vitest), `tsconfig.json` with `NodeNext`,
   `experimentalDecorators`, `emitDecoratorMetadata`.
2. Directory layout from §2: `src/core/`, `src/modules/`, `src/main.ts`.
3. `main.ts`: `NestFactory.create` with top-level `await`, listen on
   `http.host`/`http.port` (temporary hardcoded until the config task lands).
4. ESLint flat config + `eslint-plugin-boundaries` forbidding
   `modules/<a>` → `modules/<b>` direct imports.
5. Vitest config; `@nestjs/testing`; a `test/` folder with a Testcontainers
   helper stub (wired in the Prisma task).
6. `Dockerfile` (multi-stage, `oven/bun` base, non-root, runs `bun run src/main.ts`)
   and `compose.yaml` for local dev (PostgreSQL 18 + Mailpit).
7. CI workflow: typecheck, lint, unit + integration tests, and the changelog
   check (fails when `src/**` changes without `CHANGELOG.md`).
8. Seed `CHANGELOG.md` `## [Unreleased]` with this task.

## Dependencies

None. First task of the repo.
