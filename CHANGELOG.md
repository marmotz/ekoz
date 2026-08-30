# Changelog

Format [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning
[SemVer](https://semver.org/). The CI changelog check fails a `src/**` change
that does not touch this file.

## [Unreleased]

### Added

- Application skeleton: NestJS 12 (ESM) on Bun, `core/` + `modules/` layout,
  graceful shutdown, `GET /healthz` liveness probe. (#1)
- Tooling: ESLint flat config (cross-feature import boundaries), Vitest (`unit` /
  `integration` projects), Testcontainers helper. (#1)
- Multi-stage `Dockerfile` (bun, non-root, migrate-on-start) and `compose.yaml`
  (PostgreSQL 18 + Mailpit). (#1)
- GitHub Actions CI: typecheck, lint, tests, changelog check. (#1)
- Database access via Prisma 8 ("Prisma Next"): committed data contract and
  initial migration, `PrismaService` that connects and verifies the schema
  marker on boot (refuses to serve on a stale schema). (#2)

### Notes

- Prisma 8 RC bug: a bare JSON string in a `Jsonb` column fails to decode — wrap
  scalar config values (`{ value: "invite" }`) until the upstream fix. Affects
  task #4.
