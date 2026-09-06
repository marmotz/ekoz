# Architecture overview

This document summarises the structuring choices. Each choice is detailed in a
dedicated ADR under [`adr/`](adr/).

## Decision process

Every design decision or notable change is recorded in an ADR under [`adr/`](adr/),
at the time it is made. See [ADR 0015](adr/0015-decisions-are-recorded-as-adrs.md).

## Repositories

One repository per domain, no global monorepo — see [ADR 0001](adr/0001-repository-layout.md).

- `spec`: everything written here.
- `server`: reference server.
- `sdk-js`: protocol SDK.
- `client-web`: React demonstration client (see [ADR 0016](adr/0016-web-client-stack.md)).

## Server

- **Bun** runtime (execution and package management), types aligned with
  **Node 26.8.1**.
- **NestJS 12** (ESM), **Prisma 8** (starting on the `8.0.0-rc` line, final
  release imminent), **PostgreSQL** (exclusive), **Vitest** tests.
- Prisma: `prisma-client` generator, `@prisma/adapter-pg` driver adapter,
  connection through `prisma.config.ts` (no `url` in the schema).
- Full-text search via PostgreSQL FTS functions, in raw SQL where Prisma is
  limited.
- See [ADR 0002](adr/0002-server-stack.md). Stack POC done on 2026-08-29,
  conclusive: [poc-nestjs12-prisma-bun.md](poc-nestjs12-prisma-bun.md).

## Web client (demonstration)

- **React** (latest), **Vite**, **TypeScript**, **Tailwind CSS 4**, **shadcn/ui**
  (components copied into the repo).
- **Bun** runtime/packages, **Vitest** + Testing Library.
- Network access only through `sdk-js`. Server state via TanStack Query.
  Feature-first structure, no cross-feature imports.
- UI in French + English.
- See [ADR 0016](adr/0016-web-client-stack.md).

## Conversation data model

- Hierarchy of **spaces**, nestable with no hard limit (configurable soft limit,
  4 by default).
- A single **`room`** concept with a `type` discriminator: `space`, `channel`,
  `dm`, `group_dm`.
- One-to-one and private group conversations are not a separate object: they are
  `room`s of a type that bypasses the space hierarchy, the directory and the
  role hierarchy.
- See [ADR 0003](adr/0003-conversation-data-model.md).

## Events and real time

- Current state in normal relational tables (application reads).
- **In addition**, an append-only log per room:
  `room_events(room_id, seq, type, sender, content, created_at)`, `seq`
  monotonic per room. It is the source of truth for **ordering** and, later, for
  **federation**.
- The home server of a room is **authoritative for ordering**; no DAG, no state
  resolution.
- Real-time transport: **SSE** (server→client) + **REST** (client→server). No
  WebSocket.
- Sync cursor: per-room `seq`. Reconnection = REST `/sync` reconciliation then
  live stream.
- See [ADR 0004](adr/0004-event-log-and-ordering.md) and
  [ADR 0005](adr/0005-realtime-transport.md).

## Federation

- Minimal custom protocol (neither ActivityPub nor the Matrix model).
- Discovery via `/.well-known/ekoz`, per-server **Ed25519** signing keys, signed
  requests (HTTP Signatures).
- Generated at server initialization, even without active federation.
- See [ADR 0006](adr/0006-federation-protocol.md).

## Identity

- Canonical public identifier: **`name/server`** (e.g. `alice/chat.example`),
  displayed with a leading `@`.
- `name`: lowercase, `[a-z0-9_.-]`, max 64, unique per server, unrelated to the
  display name.
- `server`: a real domain (no `localhost`; in development, a fake domain via
  `/etc/hosts`).
- See [ADR 0007](adr/0007-user-identifier.md).

## Authentication

- Short-lived JWT access token + long-lived opaque refresh token (stored hashed).
- Named multi-device sessions, revocable by the user or the server (suspension).
- SSE stream authenticated with a **single-use, short-lived ticket** (works when
  the client and the server are on different domains).
- See [ADR 0008](adr/0008-auth-and-sessions.md).

## Configuration

- **TOML** file + environment variable interpolation.
- Precedence: `defaults < TOML file < database overrides (admin) < env (can lock)`.
- Each parameter is typed `infra` (file/env only) or `runtime` (overridable by
  the admin).
- The admin never writes to the file; it writes to a `settings` table.
- See [ADR 0009](adr/0009-configuration-model.md).

## Server initialization

- Non-interactive mode: `EKOZ_INITIAL_OWNER_EMAIL` set → only that email can
  create the first owner.
- Otherwise: the server prints a **single-use setup token** in the logs,
  required to register the owner.
- After the first owner is created, the setup endpoint is closed permanently.
- See [ADR 0010](adr/0010-server-initialization.md).

## Files

- Modular storage driver: `local` and `s3`-like, extensible.
- Split between `blob` (physical content, content-hash deduplicated) and
  `attachment` (reference from a message or a profile).
- Avatars are files attached to a profile, same system.
- Per-user quota, max size per file, global capacity. MIME `allowlist`/`blocklist`
  filtering by magic bytes.
- An attachment's retention is aligned with its message.
- See [ADR 0011](adr/0011-file-storage-and-quotas.md).

## Retention

- Default at the server level, overridable per space or room (permissions
  required).
- On expiry: **hiding** (removed from the UI, kept in the database) or
  **deletion** (content erased, *tombstone* in the log).
- See [ADR 0012](adr/0012-retention-and-tombstones.md).

## Email

- Modular driver (same principle as storage). **SMTP** only in the first
  increment.
- Configurable "email verification disabled" mode at the server level.

## Internationalisation

- API technical messages: **English only**.
- Web client: **French + English**.
- Emails: **English only** for now.

## Licensing

- **Apache-2.0** for the four repositories. `SPDX-License-Identifier: Apache-2.0`
  header, `NOTICE` file.
- See [ADR 0013](adr/0013-licensing.md).

## Changelog

- One `CHANGELOG.md` per repository, *Keep a Changelog* format + SemVer, a
  `## [Unreleased]` section always at the top.
- Any task touching `src/` updates the changelog; a CI check enforces it.
- SDK: *Changesets* tool.
- See [ADR 0014](adr/0014-changelog-discipline.md).
