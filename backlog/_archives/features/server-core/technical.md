# Server core — technical design

Foundational technical design for the `server` repository. Since the repository
is greenfield (only `AGENTS.md`, `LICENSE`, `NOTICE`, `CHANGELOG.md` at the time
of writing), this document establishes the initial structure rather than
referencing existing code.

Related: [server stack](../../../../docs/technical/server-stack.md),
[federation-protocol](../../../../docs/technical/federation-protocol.md),
[user-identifier](../../../../docs/technical/user-identifier.md),
[configuration-model](../../../../docs/technical/configuration-model.md),
[server-initialization](../../../../docs/technical/server-initialization.md),
[file-storage-and-quotas](../../../../docs/technical/file-storage-and-quotas.md),
[observability](../../../../docs/technical/observability.md).

## 1. Repository skeleton and tooling

```
server/
  src/
    core/                # cross-cutting infrastructure (this feature)
      config/            # TOML loader, registry, settings table, ConfigService
      prisma/            # PrismaService, prisma schema is at prisma/
      crypto/            # Ed25519 keypair, AES-GCM secret box, hashing helpers
      storage/           # StorageDriver interface + local driver + BlobService
      mail/              # Mailer interface + SMTP driver + templating
      audit/             # AuditService + audit_log
      bootstrap/         # init flow (first owner, setup token), lifecycle
      discovery/         # /.well-known/ekoz controller
      health/            # /healthz, /readyz
      observability/     # logger factory, OTel bootstrap, metrics registry, /metrics
      http/              # exception filter, problem+json, request context
    modules/             # functional features (identity, conversations, ...)
    main.ts
  prisma/
    schema.prisma
    migrations/
  prisma.config.ts
  test/                  # vitest setup, testcontainers helpers
  Dockerfile
  compose.yaml           # local dev: postgres + mailpit
```

- **Runtime**: Bun. `package.json` `"type": "module"`. Scripts run through Bun
  (`bun run`, `bun test` delegating to Vitest).
- **NestJS 12** (ESM). `tsconfig.json`: `module`/`moduleResolution` = `NodeNext`,
  `experimentalDecorators` + `emitDecoratorMetadata` (validated by the
  [stack POC](https://github.com/marmotz/ekoz/blob/develop/docs/technical/poc-nestjs12-prisma-bun.md)).
- **Prisma 8** (`8.0.0-rc` line): `prisma-client` generator with
  `output = "../src/core/prisma/generated"`, `@prisma/adapter-pg`, connection via
  `prisma.config.ts` (loads `.env` explicitly). Generated client is committed.
- **Vitest** + `@nestjs/testing`. Integration tests run against a real
  PostgreSQL and a real SMTP sink (Mailpit) via Testcontainers; no mocking of
  Prisma in integration tests.
- **Lint**: ESLint flat config, `eslint-plugin-boundaries` to forbid
  `modules/<a>` importing `modules/<b>` directly (they talk through explicit
  provider interfaces or events).
- **CI**: typecheck, lint, unit + integration tests, and the changelog check
  (fails when `src/**` changes without `CHANGELOG.md`).
- **Docker image**: multi-stage, `oven/bun` base, non-root, runs
  `bun run src/main.ts`. `prisma migrate deploy` runs as an init step / entrypoint
  hook, not inside the app process.

## 2. Configuration system

Layered precedence (lowest to highest), per
[configuration model](../../../../docs/technical/configuration-model.md):

```
code defaults  <  TOML file  <  settings table (admin)  <  environment
```

### Parameter registry

A single typed registry (`src/core/config/registry.ts`) declares every
parameter: `key`, `kind` (`infra` | `runtime`), `schema` (Zod), `default`,
`hotReloadable` (bool), `secret` (bool).

- `infra` parameters resolve from **file + env only**. Never read from the
  settings table.
- `runtime` parameters resolve from **file default, then settings table override,
  then an env value that also _locks_ the parameter** (admin sees it read-only).

Initial parameters:

| key                                | kind          | notes                                                                |
| ---------------------------------- | ------------- | -------------------------------------------------------------------- |
| `server.domain`                    | infra         | required, FQDN, not `localhost`/IP, lowercased                       |
| `server.api_url`                   | infra         | public base URL of the API (may differ from `server.domain`)         |
| `server.web_url`                   | infra         | public base URL of the demo web client (for links in emails)         |
| `http.host` / `http.port`          | infra         | bind address                                                         |
| `database.url`                     | infra, secret | PostgreSQL connection string                                         |
| `secret.key`                       | infra, secret | 32-byte base64; key-encryption key for secret box                    |
| `storage.driver`                   | infra         | `local` \| `s3` (only `local` implemented now)                       |
| `storage.local.path`               | infra         | blob root directory                                                  |
| `storage.s3.*`                     | infra, secret | endpoint, region, bucket, credentials (schema only)                  |
| `email.driver`                     | infra         | `smtp`                                                               |
| `email.smtp.*`                     | infra, secret | host, port, secure, user, pass                                       |
| `email.from`                       | infra         | `From` header                                                        |
| `registration.mode`                | runtime       | `open` \| `invite` \| `admin` (default `invite`)                     |
| `email.verification_required`      | runtime       | bool (default `true`)                                                |
| `identity.username_change_policy`  | runtime       | `immutable` \| `available` \| `approval` (default `immutable`)       |
| `profile.bio_max_length`           | runtime       | int (default `500`)                                                  |
| `avatar.max_size_bytes`            | runtime       | int (default `2_000_000`)                                            |
| `avatar.allowed_mime`              | runtime       | list (default `["image/png","image/jpeg","image/webp","image/gif"]`) |
| `observability.log_level`          | runtime       | `trace`..`fatal` (default `info`)                                    |
| `observability.log_format`         | infra         | `json` \| `pretty` (default `json`, `pretty` for local dev)          |
| `observability.metrics_enabled`    | runtime       | bool (default `false`)                                               |
| `observability.metrics_token`      | infra, secret | bearer token guarding `/metrics` when set                            |
| `observability.otlp_endpoint`      | infra         | OTLP traces exporter target (unset = tracing off)                    |
| `observability.trace_sample_ratio` | runtime       | float `0`..`1` (default `0`)                                         |

### Loader

- TOML parsed with `smol-toml`.
- String values support `${ENV_VAR}` interpolation at load time.
- Additionally, any parameter can be overridden by `EKOZ_<SECTION>__<KEY>`
  (double underscore = nesting), 12-factor style. An env override on a `runtime`
  parameter marks it **locked**.
- `settings` table: `key text primary key`, `value jsonb`, `updated_at`,
  `updated_by`. Only `runtime` keys allowed. Validated against the registry
  schema on write.
- `ConfigService.get(key)` returns the resolved, validated value.
  `ConfigService.describe(key)` returns `{ value, source, locked, hotReloadable }`
  for the future admin UI.
- Changes to hot-reloadable `runtime` keys take effect without restart (the
  service caches with a short TTL / an invalidation signal); others are flagged
  "restart required".

## 3. Database and Prisma

- Single PostgreSQL database. Prisma migrations are the only schema authority.
- `PrismaService` extends the generated `PrismaClient`, constructs it with
  `new PrismaPg({ connectionString: config infra database.url })`, `$connect` on
  module init.
- Raw SQL (`$queryRaw` / `$executeRaw`) is allowed for: full-text search,
  recursive/closure queries, and advisory locks. Wrapped in small typed
  repository methods, never scattered.
- Naming: tables and columns `snake_case` via `@@map` / `@map`; Prisma models
  `PascalCase`.

## 4. Server identity

### Domain

`server.domain` is validated at boot (FQDN, not an IP, not `localhost`, not a
bare hostname). In development the operator adds a fake domain to `/etc/hosts`.
It is immutable for the lifetime of a deployment (changing it would break every
`name/server` identifier); a guard refuses to start if it changed while users
exist.

### Signing keypair

- Table `server_signing_key`:
  `id` (key id, short random), `algorithm` (`ed25519`), `public_key` (base64),
  `private_key_enc` (bytea, AES-256-GCM sealed with `secret.key`),
  `created_at`, `activated_at`, `retired_at` (nullable).
- Generated at initialization with `crypto.generateKeyPair('ed25519')` (works
  under Bun). Exactly one active key; rotation inserts a new key, keeps the old
  one published until `retired_at` + overlap window.
- `SigningService.sign(bytes)` / `verify(keyId, bytes, sig)`.
- Until federation exists, the active key also signs the refresh-token pepper /
  internal tokens if useful; not exposed otherwise.

### Discovery document

`GET /.well-known/ekoz` (unauthenticated, cacheable):

```json
{
  "server": "chat.example",
  "api": "https://api.chat.example",
  "web": "https://chat.example",
  "protocol_versions": ["0"],
  "signing_keys": {
    "<keyId>": { "public_key": "<base64>", "valid_from": "<iso8601>", "valid_until": null }
  }
}
```

## 5. Bootstrap / initialization

Per [server initialization](../../../../docs/technical/server-initialization.md).

On start, `BootstrapService`:

1. Validates infra config; aborts with a clear message on any missing/invalid
   `infra` parameter.
2. Runs pending migrations check (in prod, migrations are applied by the
   entrypoint before the app starts; the app refuses to serve if the schema is
   behind).
3. Ensures a signing key exists (generates one otherwise).
4. Determines **setup state**:
   - if an `owner` user exists → setup closed.
   - else if `EKOZ_INITIAL_OWNER_EMAIL` is set → setup open, _email-pinned_.
   - else → setup open, _token-pinned_: rotate the single-use token on every
     boot while setup is open (drop the previous unconsumed one, generate a
     fresh one, print it to stdout at `level=warn`, store only its hash in
     `setup_token`). Only the hash is persisted, so a missed log line is
     recovered by a restart rather than being unrecoverable.
5. Exposes setup endpoints only while setup is open:
   - `POST /setup/owner` `{ email, password, name, displayName }`
     - email-pinned: `email` must equal `EKOZ_INITIAL_OWNER_EMAIL`.
     - token-pinned: body must carry the matching `token`.
     - creates the first `User` with `is_owner = true`, email marked verified,
       an initial `Session`, writes an `audit_log` entry (`server.initialized`).
   - after success, all `/setup/*` routes return `410 Gone` for the process
     lifetime and forever after (guard checks "owner exists").

`setup_token`: `token_hash`, `created_at`, `consumed_at`. Single row.

## 6. Object storage

Per [file storage and quotas](../../../../docs/technical/file-storage-and-quotas.md).
First increment ships the schema, the `local` driver and deduplication.
Per-user quota, MIME filtering by magic bytes and message attachments come with
[content and sharing](../../../features/content-and-sharing/overview.md).

### Driver interface

```ts
interface StorageDriver {
  put(key: string, body: ReadableStream, contentType: string): Promise<void>;
  get(key: string): Promise<ReadableStream>;
  delete(key: string): Promise<void>;
  presignGet?(key: string, ttlSeconds: number): Promise<string | null>;
}
```

- `local`: writes under `storage.local.path`, key = `blobs/<hash[0:2]>/<hash>`.
  `presignGet` returns `null` (downloads always proxied through the API for
  access control).
- `s3`: schema/config only for now.

### Blob model

- Table `blob`: `id`, `hash` (sha-256 hex, **unique**), `size_bytes` (`int4`;
  the avatar consumer this increment ships is capped well under the 2 GiB
  ceiling — message attachments revisit the width alongside per-user quotas),
  `content_type`, `storage_key`, `created_at`, `ref_count` (int, default 0).
- `BlobService.ingest(stream, { declaredType }) -> Blob`:
  streams to a temp location while hashing, then:
  - if `hash` exists → discard temp, return existing blob.
  - else → move into the driver at the content-addressed key, insert row.
- Referencing: `BlobService.retain(blobId)` / `release(blobId)` adjust `ref_count`
  inside the caller's transaction.
- GC: a periodic sweep deletes driver objects + rows for blobs with
  `ref_count = 0` older than a grace period (default 1 h), to avoid races with
  in-flight references.
- Download: `GET /blobs/:id` — authenticated; the concrete access policy is
  enforced by the referencing feature (e.g. identity checks the blob is the
  caller's-visible avatar; content-and-sharing checks room membership). Serves
  with strong caching + `ETag = hash`.

## 7. Outbound email

- `Mailer` is the transport port (`send` / `verify`); the `smtp` driver runs on
  `nodemailer`, config from `email.smtp.*`, sender `email.from`. `MailService`
  sits above it: template resolution, the `email_message` record and the retry
  queue.
- **Templates** are `{ subject, text, html }` units of `${var}` format strings,
  English, no template engine, wrapped by a shared layout (`render` +
  `wrapText` / `wrapHtml`, fed `server.domain` / `server.web_url`). Each is
  **registered by the feature that owns it** (`MailService.registerTemplate`,
  called from that feature's module) — server-core ships the layout and the
  mechanism, not the message content (identity registers verification / reset).
  This keeps `core/mail` free of any domain feature's copy (feature-first
  boundaries).
- **Owner customization (deferred)**: owners must be able to change the wording,
  colours and look of every outbound email. `MailService` resolves a template
  through an override store consulted _before_ the registered default; the store
  (a table keyed by template name, plus a branding block for colours / product
  name / logo feeding the layout) and its admin surface land with
  [server administration](../server-administration/overview.md). The registered
  templates are the fallback defaults. A `docs/technical/` page is owed for this model.
- `email_message` table: `id`, `to`, `template`, `category`, `sent_at`,
  `dedupe_key` (nullable, unique-per-window). Used now for a coarse
  anti-duplication guard; the real rate-limiting policy is
  [notifications](../../../features/notifications/overview.md).
- Failures: retried with backoff by a small in-process queue; after N attempts,
  logged + an `audit_log`-adjacent `email.failed` record. No external broker in
  the first increment.

## 8. Audit log

- Table `audit_log` (append-only): `id`, `at`, `actor_user_id` (nullable = system),
  `actor_ip` (nullable), `action` (string), `target_type` (nullable),
  `target_id` (nullable), `metadata jsonb`.
- `AuditService.record(entry)` — called by features. No update/delete API.
- Retention/rotation of the audit log itself is out of scope here (revisited in
  [server administration](../server-administration/overview.md)).

## 9. Health

- `GET /healthz`: process is up (no dependencies checked).
- `GET /readyz`: DB reachable, migrations current, signing key present, storage
  driver writable. Returns `503` with a per-check breakdown otherwise.

## 10. Cross-cutting HTTP conventions

- **Errors**: `application/problem+json` (RFC 9457):
  `{ type, title, status, detail, code }`. `code` is a stable machine string
  (e.g. `identity.username_taken`). A global Nest exception filter maps domain
  errors and validation errors to this shape. Messages in English.
- **Validation**: Zod schemas at the edge (a `ZodValidationPipe`), inferred types
  flow inward.
- **Request context**: a per-request store (`AsyncLocalStorage`) carrying
  `requestId`, authenticated `userId`/`sessionId` (when present), client IP.
  `requestId` is echoed in the `X-Request-Id` header and included in logs.
- **Logging**: structured JSON (pino), one line per request, plus explicit
  domain events. No secrets in logs. Full contract in section 11.
- **Time**: all timestamps UTC, ISO-8601 in payloads, `timestamptz` in the DB.
- **IDs**: ULID (`id` columns), via Prisma's `@default(ulid())` — generated
  client-side, 26-char Crockford base32, `text` column. Dash-free (one
  double-click to select in a URL or log line). The ms-timestamp prefix (as in
  UUID v7) buys insert locality in the PK B-tree and "roughly newest first"
  listings — **not** a reliable order: across instances / under clock skew,
  same-ms ids sort by their random tail. Authoritative ordering is the per-room
  `seq` ([the event log and ordering design] / §… event log); feed cursors carry their own monotonic key.
  Natural keys (`settings.key`) and content-addressed keys (`blob.hash`) keep
  their own scheme. See [entity identifier format](../../../../docs/technical/entity-identifier-format.md).

## 11. Observability and instrumentation

Per [observability and instrumentation](../../../../docs/technical/observability.md).
Server-core ships the emission side (logs, metrics, traces, health); the
operator-facing supervision screens belong to
[server administration](../server-administration/overview.md) and only consume
what is defined here.

### Logging

- One `pino` logger, built by a factory in `observability/`, injected as the Nest
  logger. Level from `observability.log_level`, format from
  `observability.log_format` (`pretty` = an in-house one-line `pino` renderer,
  dev only; `json` otherwise).
- Every line within a request carries `requestId` from the `AsyncLocalStorage`
  context (section 10); background jobs carry a generated `jobId`. Authenticated
  lines also carry `userId`.
- A Nest interceptor emits **one line per completed request**: method, matched
  route, status, duration ms, `requestId`, `userId?`. `/healthz`, `/readyz`,
  `/metrics` are excluded.
- Redaction: the logger is configured with a `redact` path list covering
  `req.headers.authorization`, `req.headers.cookie`, `password`, `token`,
  `*.privateKey`, `email.smtp.pass`, `secret*`. New secret-bearing fields are
  added to the list as they appear; message bodies and email contents are never
  passed to the logger.

### Metrics

- `GET /metrics`, Prometheus text format, **disabled unless**
  `observability.metrics_enabled`. When `observability.metrics_token` is set the
  route requires `Authorization: Bearer <token>`; when unset the route is served
  only on the loopback / private bind. Excluded from the request access log.
- Instrumentation goes through the **OpenTelemetry** metrics SDK with the
  Prometheus exporter, so an OTLP push can be added later without touching call
  sites. A thin `MetricsService` wraps counter/histogram/gauge creation.
- Baseline instruments registered by server-core:
  - process: RSS, heap used, event-loop lag, GC pause, open FDs, uptime
  - HTTP: `http_server_requests_total{route,status_class}`,
    `http_server_request_duration_seconds` histogram
  - database: Prisma pool size / in-use / wait time, query duration histogram
  - email: `email_queue_depth`, `email_send_attempts_total`,
    `email_send_failures_total`
  - blob storage: `blob_bytes_total`, `blob_count`, `blob_dedup_ratio`
- **Domain metrics are owned by the feature that introduces the subsystem**, not
  by server-core. Reserved names, to keep them consistent:
  - conversations: `ekoz_sse_connections` (gauge),
    `ekoz_sse_connection_events_total{event=open|close|reconnect}`,
    `ekoz_sse_fanout_dropped_total`, `ekoz_room_event_lag_seconds`,
    event-bus publish/consume counters and lag
  - any feature with background jobs: `job_runs_total{job}`,
    `job_duration_seconds{job}`, `job_failures_total{job}`
  - federation: peer reachability gauge, outbound-queue depth, delivery latency

### Traces

- OpenTelemetry tracing, exporter **off by default**. Setting
  `observability.otlp_endpoint` turns on OTLP export for HTTP handler, Prisma
  query and outbound (SMTP, later federation) spans. Head-based sampling ratio
  from `observability.trace_sample_ratio` (default `0`).

### Health

- Unchanged from section 9: `GET /healthz` (liveness) and `GET /readyz`
  (DB, migrations, signing key, storage driver; `503` + per-check breakdown).

## 12. Consolidated Prisma schema (server-core slice)

```prisma
model Setting {
  key       String   @id
  value     Json
  updatedAt DateTime @updatedAt
  updatedBy String?
  @@map("settings")
}

model ServerSigningKey {
  id             String    @id
  algorithm      String    @default("ed25519")
  publicKey      String
  privateKeyEnc  Bytes
  createdAt      DateTime  @default(now())
  activatedAt    DateTime?
  retiredAt      DateTime?
  @@map("server_signing_key")
}

model SetupToken {
  id         String    @id @default(ulid())
  tokenHash  String
  createdAt  DateTime  @default(now())
  consumedAt DateTime?
  @@map("setup_token")
}

model Blob {
  id          String   @id @default(ulid())
  hash        String   @unique
  sizeBytes   Int // int4; widened when message attachments land (see §6)
  contentType String
  storageKey  String
  refCount    Int      @default(0)
  createdAt   DateTime @default(now())
  @@index([refCount])
  @@map("blob")
}

model EmailMessage {
  id         String   @id @default(ulid())
  to         String
  template   String
  category   String
  dedupeKey  String?
  sentAt     DateTime?
  createdAt  DateTime @default(now())
  @@unique([dedupeKey])
  @@map("email_message")
}

model AuditLog {
  id          String   @id @default(ulid())
  at          DateTime @default(now())
  actorUserId String?
  actorIp     String?
  action      String
  targetType  String?
  targetId    String?
  metadata    Json     @default("{}")
  @@index([at])
  @@index([actorUserId])
  @@map("audit_log")
}
```

(`User` / `Session` are defined by
[identity and profiles](../../../features/identity-and-profiles/overview.md).)

## 13. Alternatives considered

| Point                       | Retained                                 | Rejected                                | Why                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------- | ---------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Config format               | TOML (`smol-toml`)                       | YAML, JSON, env-only                    | Operator-facing, unambiguous types, comments; env-only does not scale to nested structure ([configuration model](../../../../docs/technical/configuration-model.md))                                                                                                                                                            |
| Admin edits config          | `settings` table overriding file         | Rewrite the TOML file                   | File often read-only in containers, comments lost, concurrent writes                                                                                                                                                                                                                                                                                          |
| Private signing key at rest | AES-256-GCM in DB, KEK from `secret.key` | Plaintext file, KMS                     | Simple, no extra dependency; KMS is a later option                                                                                                                                                                                                                                                                                                            |
| Blob keys                   | content-addressed (`hash`)               | random UUID key                         | Free deduplication, idempotent writes                                                                                                                                                                                                                                                                                                                         |
| Blob deletion               | deferred GC sweep at `ref_count = 0`     | immediate delete on release             | Avoids races with concurrent new references                                                                                                                                                                                                                                                                                                                   |
| Error format                | RFC 9457 problem+json                    | ad-hoc `{error}`                        | Standard, good for third-party SDK consumers                                                                                                                                                                                                                                                                                                                  |
| Email queue                 | in-process retry queue                   | Redis/BullMQ, external broker           | First increment stays single-process; broker is added only if needed                                                                                                                                                                                                                                                                                          |
| ID scheme                   | ULID (`@default(ulid())`)                | UUID v7, UUID v4, auto-increment, CUID2 | Non-enumerable + insert locality like UUID v7 but dash-free. Neither v7 nor ULID gives a cross-instance total order (that is `seq`'s job). CUID2 rejected: no timestamp (no locality), non-standard JS-only, slow. v4 rejected: fully random. See [entity identifier format](../../../../docs/technical/entity-identifier-format.md) |
| Migrations at deploy        | entrypoint step before app start         | app runs migrations on boot             | Avoids races between replicas; app only _checks_ schema is current                                                                                                                                                                                                                                                                                            |
| Metrics stack               | OpenTelemetry SDK + Prometheus exporter  | `prom-client` directly                  | Traces and OTLP push add later without rewriting instrumentation call sites ([observability and instrumentation](../../../../docs/technical/observability.md))                                                                                                                                                            |
| `/metrics` exposure         | opt-in, token- or bind-guarded           | always on, public                       | Internal metrics must not leak on a public bind by default                                                                                                                                                                                                                                                                                                    |
| Log shipping                | JSON to stdout, platform collects        | in-process shipper                      | Keeps the process single-purpose; every host platform collects stdout                                                                                                                                                                                                                                                                                         |

## 14. Consequences

- Nothing to migrate (greenfield). This feature creates the initial schema and
  the CI pipeline.
- `identity-and-profiles` depends on: `ConfigService`, `PrismaService`,
  `BlobService` (avatars), `Mailer` (verification + reset), `AuditService`,
  the bootstrap `is_owner` seed, and the problem+json + request-context
  conventions.
- `conversations` additionally introduces the per-room event log and the SSE
  stream; server-core deliberately does not ship an event bus or SSE endpoint
  yet (nothing to stream).
- `server-administration` will build its supervision screens on
  `ConfigService.describe`, `audit_log`, `readyz` checks and the `/metrics`
  endpoint; it introduces no new telemetry pipeline.
- `conversations`, `notifications` and `federation` each own the domain metrics
  and domain log events for the subsystem they add, following the naming
  reserved in section 11.
- The `s3` storage driver and a real email rate-limiting policy are explicitly
  deferred but their config/schema surface is reserved now.

## Implementation task breakdown

GitHub issues live in `marmotz/ekoz`. Order below is the dependency order.

1. [ — server skeleton and CI (done)](../../tasks/done/server-1-server-skeleton.md)
2. [ — Prisma 8 setup and database access (done)](../../tasks/done/server-2-prisma-setup.md)
3. [ — HTTP conventions (problem+json, validation, context, logging) (done)](../../tasks/done/server-3-http-conventions.md)
4. [ — layered configuration system (done)](../../tasks/done/server-4-config-system.md)
5. [ — crypto helpers and server signing keys (done)](../../tasks/done/server-5-crypto-and-signing-keys.md)
6. [ — server identity and discovery document (done)](../../tasks/done/server-6-server-identity-and-discovery.md)
7. [ — audit log (done)](../../tasks/done/server-7-audit-log.md)
8. [ — bootstrap and setup state machine (done)](../../tasks/done/server-8-bootstrap-initialization.md)
9. [ — object storage with deduplication (local driver) (done)](../../tasks/done/server-9-object-storage.md)
10. [ — outbound email (SMTP driver) (done)](../../tasks/done/server-10-outbound-email.md)
11. [ — health and readiness endpoints (done)](../../tasks/done/server-11-health-endpoints.md)
12. [ — observability module (logs, metrics, traces) (done)](../../tasks/done/server-38-observability-module.md)
