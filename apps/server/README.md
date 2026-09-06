# Ekoz reference server

Reference implementation of the Ekoz chat server. NestJS 12 (ESM) on the Bun
runtime, PostgreSQL via Prisma 8 ("Prisma Next").

## Requirements

- [Bun](https://bun.sh) ≥ 1.4.0
- Docker (local dev dependencies + integration tests)

## Getting started

```bash
bun install
cp .env.example .env
docker compose up -d          # PostgreSQL 18 (host :5432) + Mailpit (:1025 SMTP, :8025 UI)
bun run db:migrate            # apply migrations to the dev database
bun run start:dev
curl localhost:3010/healthz   # {"status":"ok"}
```

## Layout

```
src/
  core/        cross-cutting infrastructure (prisma, health, ...)
  modules/     functional features (identity, conversations, ...) — added later
  main.ts
prisma/migrations/   on-disk Prisma Next migrations (committed)
src/core/prisma/
  contract.prisma    the data contract (edit this)
  generated/         emitted contract.json + contract.d.ts (committed, do not edit)
  db.ts              runtime client factory
```

Feature modules never import one another directly; `eslint-plugin-boundaries`
enforces it.

Specs live next to the code they cover: `*.spec.ts` (unit) and `*.e2e-spec.ts`
(integration — boots a Nest app, may spin a PostgreSQL container).

## Scripts

| Script                | What it does                                              |
| --------------------- | --------------------------------------------------------- |
| `bun run start:dev`   | watch-mode server                                         |
| `bun run typecheck`   | `tsc --noEmit`                                            |
| `bun run lint`        | ESLint                                                    |
| `bun run test`        | unit + integration (Vitest)                               |
| `bun run test:unit`   | unit only                                                 |
| `bun run db:contract` | re-emit `generated/` from `contract.prisma`               |
| `bun run db:plan`     | plan a migration from contract changes                    |
| `bun run db:migrate`  | apply pending migrations                                  |
| `bun run db:verify`   | check the DB marker matches the contract                  |
| `bun run db:reset`    | drop every schema then replay migrations (local dev only) |

## Database workflow (Prisma Next)

1. Edit `src/core/prisma/contract.prisma`.
2. `bun run db:contract` — regenerates the committed `generated/` artefacts.
3. `bun run db:plan --name <slug>` — writes a migration under
   `prisma/migrations/app/`.
4. `bun run db:migrate` — applies it.

Commit `generated/` and `prisma/migrations/` together with the contract change.
