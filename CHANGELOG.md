# Changelog

Format [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning
[SemVer](https://semver.org/). The CI changelog check fails a `src/**` change
that does not touch this file.

## [Unreleased]

### Fixed

- Bootstrap reads configuration after `app.init()`, so `config.toml` / env apply
  to the logger, bind address and tracing. (#4)
- `log_format = "pretty"` renders one line per event; `pino-pretty` dropped. (#38)
- `PrismaService.onModuleInit` no longer crashes boot on a redundant
  `connect()`. (#2)
- `AppModule` e2e specs configure their own infra instead of depending on a
  developer's local `config.toml`. (#3, #6)

### Added

- Application skeleton: NestJS 12 (ESM) on Bun, graceful shutdown, `GET
/healthz`. (#1)
- Tooling: ESLint import boundaries, Vitest projects, Testcontainers helper,
  `lefthook` git hooks. (#1)
- Multi-stage `Dockerfile` and `compose.yaml` (PostgreSQL + Mailpit). (#1)
- GitHub Actions CI: typecheck, lint, tests, changelog check. (#1)
- Database access via Prisma 8, with a schema-marker check that refuses to boot
  on a stale schema. (#2)
- HTTP conventions: RFC 9457 `problem+json` errors, Zod validation pipe,
  per-request context with `X-Request-Id` echo, `@Public()` decorator. (#3)
- Structured JSON logging via `pino` with secret redaction and one access-log
  line per request. (#3, #38)
- Layered configuration system (TOML + env + `settings` table) with a typed
  parameter registry and boot-time validation. (#4)
- `ConfigService.describe()` reports and masks secret values. (#4)
- Crypto helpers: `SecretBox` (AES-256-GCM), SHA-256 and Ed25519 helpers. (#5)
- `SigningService`: server Ed25519 signing keys with rotation and an overlap
  window. (#5)
- `GET /.well-known/ekoz`: public server discovery document. (#6)
- Boot guard: `server.domain` is validated and pinned; a later change is refused
  at startup. (#6)
- Append-only audit log: `audit_log` table and `AuditService.record`. (#7)
- Observability module: Prometheus `GET /metrics` (guarded, off by default) and
  an OTLP tracing bootstrap inert until an endpoint is configured. (#38)
- Object storage: content-addressed blob store with refcount GC and a public
  `GET /blobs/:id`. (#9)
- Outbound email: SMTP mailer with template rendering, dedupe guard and an
  in-process retry queue. (#10)
- Bootstrap: `SetupService` prints a single-use setup token until the first
  owner exists, then `SetupGuard` returns `410`. (#8)
- Health: `GET /readyz` checks database, schema, signing key and storage, wired
  into the Docker `HEALTHCHECK`. (#11)
- Local accounts: `user` / `user_profile` / `reserved_username` tables,
  identifier normalisation and availability rules, Argon2id password hashing
  with login-time rehash. (#12)
- Identity and auth runtime parameters: access / refresh token lifetimes, the
  per-user session cap, reserved usernames and username-change delays. (#12)
- Authentication: `POST /auth/login`, `/auth/refresh`, `/auth/logout` issuing an
  EdDSA access token plus a rotating opaque refresh token with reuse detection. (#13)
- `AuthGuard` / `OwnerGuard` and an in-memory revoked-session denylist. (#13)
- Session management: `GET /sessions`, `PATCH /sessions/:id`,
  `DELETE /sessions/:id`, `DELETE /sessions?all=true`, with device-name
  derivation from the User-Agent. (#14)

### Notes

- Prisma 8 RC bug: a bare JSON string in a `Jsonb` column fails to decode — wrap
  scalar config values (`{ value: "invite" }`) until the upstream fix. (#4)
