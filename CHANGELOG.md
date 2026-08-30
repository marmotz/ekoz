# Changelog

Format [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning
[SemVer](https://semver.org/). The CI changelog check fails a `src/**` change
that does not touch this file.

## [Unreleased]

### Fixed

- Bootstrap reads configuration only after `app.init()`, so `config.toml` / env
  actually apply to the logger, bind address and tracing (they silently fell
  back to code defaults before).
- `observability.log_format = "pretty"` renders one line per event
  (`[time] LEVEL [context] message key=value …`) through an in-house `pino`
  stream; `pino-pretty` dependency dropped.
- `PrismaService.onModuleInit` no longer crashes boot with
  `DRIVER.ALREADY_CONNECTED` when another module's init hook (e.g. `ConfigService`
  reading the `settings` table) has already opened the connection pool lazily; a
  redundant `connect()` is now treated as success.
- Integration specs that boot the full `AppModule` (`prisma.e2e-spec`,
  `metrics.e2e-spec`) now provide their own infra configuration via a
  `applyTestInfraConfig` test helper, instead of relying on an untracked local
  `config.toml`; they were failing on CI where no such file exists. (#3)

### Added

- Application skeleton: NestJS 12 (ESM) on Bun, `core/` + `modules/` layout,
  graceful shutdown, `GET /healthz` liveness probe. (#1)
- Tooling: ESLint flat config (cross-feature import boundaries), Vitest (`unit` /
  `integration` projects), Testcontainers helper. (#1)
- Tooling: `lefthook` git hooks (`prepare` script installs them); `pre-commit`
  runs Prettier on staged files and restages the results.
- Multi-stage `Dockerfile` (bun, non-root, migrate-on-start) and `compose.yaml`
  (PostgreSQL 18 + Mailpit). (#1)
- GitHub Actions CI: typecheck, lint, tests, changelog check. (#1)
- Database access via Prisma 8 ("Prisma Next"): committed data contract and
  initial migration, `PrismaService` that connects and verifies the schema
  marker on boot (refuses to serve on a stale schema). (#2)
- HTTP conventions: `application/problem+json` (RFC 9457) exception filter with a
  `DomainError` base class, `ZodValidationPipe` (`422` + `errors` array),
  per-request `AsyncLocalStorage` context with `X-Request-Id` echo, `@Public()`
  decorator and an allow-all global guard baseline. (#3)
- Structured JSON logging via `pino` as the Nest logger, with a secret-redaction
  path list and one access-log line per completed request (excluding `/healthz`,
  `/readyz`, `/metrics`). (#3, #38)
- Layered configuration system (TOML file + `${ENV}` interpolation +
  `EKOZ_<SECTION>__<KEY>` overrides + `settings` table): typed parameter
  registry, `ConfigService.get` / `.describe`, runtime-key hot-reload cache, and
  boot-time validation that aborts on any invalid infra parameter.
  `config.example.toml` documents the parameter set. (#4)
- Append-only audit log: `audit_log` table, `AuditService.record` (actor / IP
  from the request context), and an `expectAuditEntry` test helper. (#7)
- Observability module: OpenTelemetry meter provider with a pull-based
  Prometheus reader, `MetricsService` wrapper, baseline process / HTTP /
  database / email / blob instruments, `GET /metrics` (disabled unless
  `observability.metrics_enabled`, bearer-token or private-bind guarded), and an
  OTLP tracing bootstrap — inert until `observability.otlp_endpoint` is set, then
  auto-instrumenting HTTP, Express and `pg` (Prisma's driver). (#38)
- `ConfigService.describe()` reports `secret` and masks secret values; `get()`
  still returns the real value for internal use. (#4)

### Notes

- Prisma 8 RC bug: a bare JSON string in a `Jsonb` column fails to decode — wrap
  scalar config values (`{ value: "invite" }`) until the upstream fix. Affects
  task #4.
- Observability, deferred to the feature that owns the subsystem: SMTP spans and
  the live email/blob metric values (email and storage features), and the
  database pool gauges — the instrument names and feed hooks
  (`MetricsService.registerDbPoolStats` / `recordDbQuery` / `setEmailQueueDepth`
  / `setBlobStats`) are in place, but the Prisma Next runtime does not yet expose
  its `pg` pool, so `db_client_connections_*` read 0 until it does. (#38)
