# server — Prisma 8 setup and database access

**Status**: done
**Type**: backend
**Issue**: — (implemented before the monorepo consolidation)

Reference: [../features/server-core/technical.md §3](../../features/server-core/technical.md#3-database-and-prisma)
and [POC](../../../docs/technical/poc-nestjs12-prisma-bun.md).

## To do

1. Add Prisma on the `8.0.0-rc` line: `prisma` (dev) + `@prisma/client` +
   `@prisma/adapter-pg`.
2. `prisma.config.ts`: load `.env` explicitly, `schema` path, datasource url from
   env.
3. `prisma/schema.prisma`: `prisma-client` generator with
   `output = "../src/core/prisma/generated"` (committed), `postgresql` datasource
   without `url`.
4. `PrismaService` (extends generated `PrismaClient`, constructed with
   `new PrismaPg({ connectionString })`, `$connect` on module init,
   `$disconnect` on destroy).
5. Migration workflow: `bun run db:migrate` (dev) / `db:deploy` (prod entrypoint);
   the app verifies the schema is current on boot and refuses to serve otherwise.
6. Testcontainers helper: spin a real PostgreSQL for integration tests, run
   `migrate deploy`, expose a per-test transactional rollback or schema reset.
7. Conventions: `snake_case` tables/columns via `@@map`/`@map`, `PascalCase`
   models, ULID ids via `@default(ulid())` (dash-free, time-ordered).

## Dependencies

- [1-server-skeleton](server-1-server-skeleton.md)
