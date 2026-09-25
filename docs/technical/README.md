# Technical documentation

Start with the [architecture overview](architecture.md). Each structuring choice
has its own page with full context, alternatives and consequences:

- [Server stack](server-stack.md) — Bun, NestJS 12, Prisma 8, PostgreSQL.
- [Web client stack](web-client-stack.md) — React, Vite, Tailwind 4, shadcn/ui.
- [Web client bootstrap](web-client-bootstrap.md) — TanStack Start, shell, theme, i18n, session wiring, CI.
- [Web client authentication](web-client-auth.md) — `_app` / `_auth` layouts, guest-only pages, error mapping, generated forms.
- [Web client account](web-client-account.md): `/account` page, user-menu entries registry, avatar rendering, error mapping and the server changes behind it.
- [Web client chat](web-client-chat.md): room history, live sync, composer, `shared/realtime` stream and the server, protocol and SDK changes behind it.
- [Web client composer editor](web-client-composer-editor.md): TipTap 3 as the composer editor, restricted-Markdown schema, mention node.
- [Web client rooms](web-client-rooms.md): sidebar section slot and rooms tree, `RoomGate` states, rooms pages, query keys and the server, protocol and SDK changes behind them.
- [Web client members](web-client-members.md): shared members query and live refresh, authors who left, public profile card, members panel and the `GET /users?ids=` endpoint behind them.
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
- [Auth policy endpoint](auth-policy-endpoint.md) — public `GET /auth/policy`.
- [Identity account and token mechanics](identity-account-and-token-mechanics.md).
- [Identity lifecycle and abuse protection](identity-lifecycle-and-abuse-protection.md).
- [Configuration model](configuration-model.md).
- [Boot configuration summary](boot-config-summary.md) — resolved config logged at boot, secrets masked.
- [Server initialization](server-initialization.md).
- [Server secret box and signing keys](server-secret-box-and-signing-keys.md).
- [File storage and quotas](file-storage-and-quotas.md).
- [Observability and instrumentation](observability.md).
- [Server error reporting](error-reporting.md).
- [Stack POC — NestJS 12 + Prisma + Bun](poc-nestjs12-prisma-bun.md).

Primary technical goal: favour a readable architecture, deployable with few
operational dependencies and extensible without reproducing the complexity of
Synapse.

Changelog discipline and where design decisions are recorded:
[CONTRIBUTING.md](../../CONTRIBUTING.md).
