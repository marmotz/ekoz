# Changelog

Format [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning
[SemVer](https://semver.org/). The CI changelog check fails a `src/**` change
that does not touch this file.

## [Unreleased]

### Fixed

- Boot failures and crashes print one readable report (cause, fix, hint) instead of a raw dump repeated per module.
- 5xx log lines include the cause chain.

- CORS now allows the `X-Ekoz-Protocol` header, which every SDK request sends. (#16)
- Bootstrap reads configuration after `app.init()`, so `config.toml` / env apply
  to the logger, bind address and tracing. (#4)
- `log_format = "pretty"` renders one line per event; `pino-pretty` dropped. (#38)
- `PrismaService.onModuleInit` no longer crashes boot on a redundant
  `connect()`. (#2)
- `AppModule` e2e specs configure their own infra instead of depending on a
  developer's local `config.toml`. (#3, #6)
- `setAvatar` rejects an account with no display name instead of returning a
  broken avatar URL. (#40)

### Changed

- Capability resolution now reads real `Membership` rows (own or inherited
  from an ancestor space) instead of the provisional public-room-only rule. (#4)
- `AuthGuard` / `OwnerGuard` moved to `core/http`, usable by any feature
  module. (#1)

### Added

- Public `GET /auth/policy` exposing the registration mode, the email-verification requirement and the minimum password length. (#90)
- Local moderation: kick, ban/unban and delete-any-message now also write an
  audit trail, exposed at `GET /rooms/:id/moderation-log`. (#13)
- Retention policies (server default, space/room overrides) with a periodic
  worker that hides or deletes messages past their rule's age. (#12)
- Presence heartbeats and typing signals, fanned out live over the SSE stream
  to co-members and `dm` partners. (#10)
- `GET /sync` per-room catch-up, the per-account feed fan-out, and the
  `GET /events` SSE stream authenticated by a single-use ticket. (#11)
- Reactions and monotonic per-room read markers. (#9)
- Message edit, delete and tombstones (the original event is rewritten so a
  deleted body never lingers in the log). (#8)
- Messages: restricted-Markdown validation, structured mentions, replies,
  pinned messages. (#7)
- Public room directory: listing, full-text search, publish/unpublish. (#6)
- Direct and group conversations, with per-user hide/archive for `dm`s. (#5)
- Membership lifecycle: join/leave public rooms, invitations, invite-only
  join requests, kick, ban/unban, role change with authority capping. (#4)
- Room hierarchy: spaces and channels, closure-table ancestry, move and
  soft-delete. (#1)
- Per-room event log with a gap-free monotonic `seq`. (#2)
- Capability-based permission ACL with role defaults, per-node and per-user
  overrides, and a resolver endpoint. (#3)
- Admin account list, detail and owner-triggered password reset. (#14)
- Public setup-state probe and configurable CORS allow-list. (#15)
- OpenAPI description of the HTTP API, with a Swagger UI at `/docs` and the JSON
  at `/docs/json`. (#43)
- Shared `problem+json` response schema and an error-response decorator for
  controllers. (#44)
- Committed `openapi.json`, regenerated offline by `bun run openapi:emit`. (#47)
- Cross-cutting design page for the OpenAPI description and SDK type generation. (#49)
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
- Registration: `POST /auth/register` honouring the `open` / `invite` / `admin`
  `registration.mode`, with a minimal password policy. (#15)
- Owner account creation for `admin` mode: `POST /admin/users`. (#15)
- Invitations: `POST /invitations`, `GET /invitations`, `DELETE /invitations/:id`
  for owners, with hashed single-use tokens. (#15)
- Email verification: `POST /auth/verify-email` and `/auth/verify-email/resend`,
  with login blocked until the address is verified. (#16)
- Email change: `POST /me/email` applies the new address only once verified and
  notifies the previous one. (#16)
- First-owner setup: `POST /setup/owner`, email- or token-pinned, creating the
  initial owner account and session and emitting `server.initialized`. (#18)
- Runtime parameters `email.verification_ttl` and `invitation.ttl`. (#15, #16)
- Password reset: `POST /auth/password-reset/request` (always `202`) and
  `/auth/password-reset/confirm`, which resets the hash and revokes every
  session. (#17)
- Profile: `GET /me`, `GET /users/:identifier`, `PATCH /me/profile`. (#19)
- Avatars: `PUT /me/avatar` (multipart, real-type sniff), `DELETE /me/avatar`,
  and `GET /users/:identifier/avatar` streamed with a content-addressed `ETag`. (#19)
- Identifier change: `PATCH /me/username` driven by
  `identity.username_change_policy`, plus the owner review endpoints under
  `/admin/username-requests`. (#20)
- Account lifecycle for owners: `POST /admin/users/:id/suspend` / `unsuspend`,
  `DELETE /admin/users/:id`, self-service `DELETE /me`, and `/admin/owners`
  management with a last-owner guard. (#21)
- A suspended account now gets `403 identity.account_suspended` on any
  authenticated request. (#21)
- Narrow in-memory throttle on `POST /auth/login`, `/auth/register`,
  `/auth/password-reset/request` and `/auth/verify-email/resend` — a deliberate
  minimal exception to deferred general rate limiting. (#22)
- Runtime parameters `auth.password_reset_ttl` and `auth.sensitive_throttle`. (#17, #22)
- Authenticated `POST /stream/ticket`: single-use short-lived ticket bound to the
  caller's session for the SSE stream, behind a swappable store interface. (#23)
- Runtime parameter `auth.stream_ticket_ttl`. (#23)

### Notes

- Prisma 8 RC bug: a bare JSON string in a `Jsonb` column fails to decode — wrap
  scalar config values (`{ value: "invite" }`) until the upstream fix. (#4)
