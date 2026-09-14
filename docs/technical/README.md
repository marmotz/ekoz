# Technical documentation

Start with the [architecture overview](architecture.md). Each structuring choice
has its own page with full context, alternatives and consequences:

- [Server stack](server-stack.md) — Bun, NestJS 12, Prisma 8, PostgreSQL.
- [Web client stack](web-client-stack.md) — React, Vite, Tailwind 4, shadcn/ui.
- [Admin console Node entry point](admin-console-node-entry.md) — the `server.entry.mjs` adapter.
- [SDK packaging and protocol-version policy](sdk-packaging-and-protocol-policy.md).
- [HTTP API conventions](api-conventions.md) — problem+json, correlation, validation.
- [OpenAPI description and SDK types](openapi-description-and-sdk-types.md) — Zod-first spec, `/docs`, committed `openapi.json`.
- [Entity identifier format](entity-identifier-format.md) — ULID.
- [Conversation data model](conversation-data-model.md) — the single `room` concept.
- [Permission model](permission-model.md) — capability-based ACL.
- [Event log and ordering](event-log-and-ordering.md).
- [Real-time transport](realtime-transport.md) — SSE + REST.
- [Retention and tombstones](retention-and-tombstones.md).
- [Federation protocol](federation-protocol.md).
- [User identifier](user-identifier.md) — `name/server`.
- [Authentication and sessions](auth-and-sessions.md).
- [Shared auth guard](shared-auth-guard.md) — `AuthGuard` / `OwnerGuard` in `core/http`.
- [Identity account and token mechanics](identity-account-and-token-mechanics.md).
- [Identity lifecycle and abuse protection](identity-lifecycle-and-abuse-protection.md).
- [Configuration model](configuration-model.md).
- [Server initialization](server-initialization.md).
- [Server secret box and signing keys](server-secret-box-and-signing-keys.md).
- [File storage and quotas](file-storage-and-quotas.md).
- [Observability and instrumentation](observability.md).
- [Stack POC — NestJS 12 + Prisma + Bun](poc-nestjs12-prisma-bun.md).

Primary technical goal: favour a readable architecture, deployable with few
operational dependencies and extensible without reproducing the complexity of
Synapse.

Changelog discipline and where design decisions are recorded:
[CONTRIBUTING.md](../../CONTRIBUTING.md).
