# Architecture overview

This document summarises the structuring choices. Each one has a dedicated page
in this directory with the full context, alternatives and consequences.

## Repository layout

One Git repository, `marmotz/ekoz`, a Bun workspaces monorepo:

- `apps/server` — reference server.
- `apps/client-web` — React demonstration client (see [web client stack](web-client-stack.md)).
- `apps/admin` — admin console, deployed with the server.
- `packages/sdk` — `@ekozhq/sdk`, the protocol SDK (the only npm-published package).
- `docs/` — this documentation (functional, protocol, technical).
- `backlog/` — product and technical backlog.

The four parts were originally separate repositories (`spec`, `server`, `sdk-js`,
`client-web`); they were merged once it was clear they change together (a
protocol change touches all three; the admin console needs the server and the
SDK in one change).

## Server

- **Bun** runtime (execution and package management), types aligned with
  **Node 26**.
- **NestJS 12** (ESM), **Prisma 8** (starting on the `8.0.0-rc` line),
  **PostgreSQL** (exclusive), **Vitest** tests.
- Prisma: `prisma-client` generator, `@prisma/adapter-pg` driver adapter,
  connection through `prisma.config.ts` (no `url` in the schema).
- Full-text search via PostgreSQL FTS functions, in raw SQL where Prisma is
  limited.
- See [server stack](server-stack.md). Stack POC done on 2026-08-29, conclusive:
  [poc-nestjs12-prisma-bun.md](poc-nestjs12-prisma-bun.md).

## Web client (demonstration)

- **React** (latest), **Vite**, **TypeScript**, **Tailwind CSS 4**, **shadcn/ui**
  (components copied into the repo).
- **Bun** runtime/packages, **Vitest** + Testing Library.
- Network access only through `@ekozhq/sdk`. Server state via TanStack Query.
  Feature-first structure, no cross-feature imports.
- UI in French + English.
- See [web client stack](web-client-stack.md).

## Conversation data model

- Hierarchy of **spaces**, nestable with no hard limit (configurable soft limit,
  4 by default).
- A single **`room`** concept with a `type` discriminator: `space`, `channel`,
  `dm`, `group_dm`.
- One-to-one and private group conversations are not a separate object: they are
  `room`s of a type that bypasses the space hierarchy, the directory and the
  role hierarchy.
- See [conversation data model](conversation-data-model.md) and
  [permission model](permission-model.md).

## Events and real time

- Current state in normal relational tables (application reads).
- **In addition**, an append-only log per room:
  `room_events(room_id, seq, type, sender, content, created_at)`, `seq`
  monotonic per room. Source of truth for **ordering** and, later, **federation**.
- The home server of a room is **authoritative for ordering**; no DAG, no state
  resolution.
- Real-time transport: **SSE** (server→client) + **REST** (client→server). No
  WebSocket.
- Sync cursor: per-room `seq`. Reconnection = REST `/sync` reconciliation then
  live stream.
- See [event log and ordering](event-log-and-ordering.md) and
  [real-time transport](realtime-transport.md).

## Federation

- Minimal custom protocol (neither ActivityPub nor the Matrix model).
- Discovery via `/.well-known/ekoz`, per-server **Ed25519** signing keys, signed
  requests (HTTP Signatures).
- Generated at server initialization, even without active federation.
- See [federation protocol](federation-protocol.md).

## Identity

- Canonical public identifier: **`name/server`** (e.g. `alice/chat.example`),
  displayed with a leading `@`.
- `name`: lowercase, `[a-z0-9_.-]`, max 64, unique per server, unrelated to the
  display name.
- `server`: a real domain (no `localhost`; in development, a fake domain via
  `/etc/hosts`).
- See [user identifier](user-identifier.md),
  [identity account and token mechanics](identity-account-and-token-mechanics.md)
  and [identity lifecycle and abuse protection](identity-lifecycle-and-abuse-protection.md).

## Authentication

- Short-lived JWT access token + long-lived opaque refresh token (stored hashed).
- Named multi-device sessions, revocable by the user or the server (suspension).
- SSE stream authenticated with a **single-use, short-lived ticket** (works when
  the client and the server are on different domains).
- See [authentication and sessions](auth-and-sessions.md).

## Identifiers

- Generated entity ids are **ULID**, assigned application-side
  (`@default(ulid())`). Not the ordering mechanism — anything that needs order
  uses the per-room `seq` or an explicit cursor.
- See [entity identifier format](entity-identifier-format.md) and
  [HTTP API conventions](api-conventions.md).

## Configuration

- **TOML** file + environment variable interpolation.
- Precedence: `defaults < TOML file < database overrides (admin) < env (can lock)`.
- Each parameter is typed `infra` (file/env only) or `runtime` (overridable by
  the admin).
- The admin never writes to the file; it writes to a `settings` table.
- See [configuration model](configuration-model.md).

## Server initialization and secrets

- Non-interactive mode: `EKOZ_INITIAL_OWNER_EMAIL` set → only that email can
  create the first owner. Otherwise: the server prints a **single-use setup
  token** in the logs. After the first owner is created, the setup endpoint is
  closed permanently.
- Secrets at rest are sealed under the operator-provided `secret.key`
  (AES-256-GCM). Per-server Ed25519 signing key, generated lazily, rotatable with
  an overlap window.
- See [server initialization](server-initialization.md) and
  [server secret box and signing keys](server-secret-box-and-signing-keys.md).

## Files

- Modular storage driver: `local` and `s3`-like, extensible.
- Split between `blob` (physical content, content-hash deduplicated) and
  `attachment` (reference from a message or a profile). Avatars use the same
  system.
- Per-user quota, max size per file, global capacity. MIME `allowlist`/`blocklist`
  filtering by magic bytes.
- See [file storage and quotas](file-storage-and-quotas.md).

## Retention

- Default at the server level, overridable per space or room.
- On expiry: **hiding** (removed from the UI, kept in the database) or
  **deletion** (content erased, *tombstone* in the log — no `seq` gap).
- See [retention and tombstones](retention-and-tombstones.md).

## Observability

- JSON logs on stdout (`pino`), `requestId` on every line, one line per HTTP
  request. Prometheus `/metrics` (off by default), OpenTelemetry traces (exporter
  off by default). `/healthz` + `/readyz`.
- See [observability and instrumentation](observability.md).

## Email

- Modular driver (same principle as storage). **SMTP** only in the first
  increment. Configurable "email verification disabled" mode.

## Internationalisation

- API technical messages: **English only**.
- Web client: **French + English**. Emails: **English only** for now.

## Licensing and process

- **Apache-2.0** for the whole repository (`LICENSE`, `NOTICE`,
  `SPDX-License-Identifier` headers).
- Changelog discipline, contribution conventions and where design decisions live:
  see [CONTRIBUTING.md](../../CONTRIBUTING.md).
