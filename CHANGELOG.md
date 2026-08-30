# Changelog

Format [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning
[SemVer](https://semver.org/). The CI changelog check fails a `src/**` change
that does not touch this file.

## [Unreleased]

### Fixed

- Bootstrap reads configuration after `app.init()`, so `config.toml` / env apply
  to the logger, bind address and tracing. (#4)
- `observability.log_format = "pretty"` renders one line per event via an
  in-house `pino` stream; `pino-pretty` dropped. (#38)
- `PrismaService.onModuleInit` treats a redundant `connect()` as success instead
  of crashing boot with `DRIVER.ALREADY_CONNECTED`. (#2)
- Integration specs booting `AppModule` configure infra via an
  `applyTestInfraConfig` helper instead of an untracked local `config.toml`. (#3)

### Added

- Application skeleton: NestJS 12 (ESM) on Bun, `core/` + `modules/` layout,
  graceful shutdown, `GET /healthz` liveness probe. (#1)
- Tooling: ESLint flat config with cross-feature import boundaries, Vitest
  (`unit` / `integration` projects), Testcontainers helper. (#1)
- Tooling: `lefthook` git hooks; `pre-commit` runs Prettier on staged files.
- Multi-stage `Dockerfile` (non-root, migrate-on-start) and `compose.yaml`
  (PostgreSQL 18 + Mailpit). (#1)
- GitHub Actions CI: typecheck, lint, tests, changelog check. (#1)
- Database access via Prisma 8: committed data contract, initial migration, and a
  `PrismaService` that verifies the schema marker on boot. (#2)
- HTTP conventions: `application/problem+json` (RFC 9457) exception filter with a
  `DomainError` base class, `ZodValidationPipe` (`422` + `errors`), per-request
  `AsyncLocalStorage` context with `X-Request-Id` echo, `@Public()` decorator and
  an allow-all global guard baseline. (#3)
- Structured JSON logging via `pino` as the Nest logger, with secret redaction
  and one access-log line per request (excluding `/healthz`, `/readyz`,
  `/metrics`). (#3, #38)
- Layered configuration system: TOML file + `${ENV}` interpolation +
  `EKOZ_<SECTION>__<KEY>` overrides + `settings` table, typed parameter registry,
  `ConfigService.get` / `.describe`, runtime-key hot-reload, and boot-time
  validation. `config.example.toml` documents the parameter set. (#4)
- `ConfigService.describe()` reports and masks secret values; `get()` returns the
  real value. (#4)
- Append-only audit log: `audit_log` table, `AuditService.record`, and an
  `expectAuditEntry` test helper. (#7)
- Observability module: OpenTelemetry meter provider with a Prometheus reader,
  `MetricsService` wrapper, baseline process / HTTP / database / email / blob
  instruments, guarded `GET /metrics` (off unless `observability.metrics_enabled`),
  and an OTLP tracing bootstrap inert until `observability.otlp_endpoint` is set. (#38)

### Notes

- Prisma 8 RC bug: a bare JSON string in a `Jsonb` column fails to decode — wrap
  scalar config values (`{ value: "invite" }`) until the upstream fix. (#4)
