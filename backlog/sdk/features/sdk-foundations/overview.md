# SDK foundations

**Status**: technical design — see [technical.md](./technical.md)

## Context

The `sdk-js` repository is empty. Per
[web client stack](../../../../docs/technical/web-client-stack.md),
no Ekoz client may call `fetch` directly: every network access goes through this
SDK. The reference server has shipped its identity layer (registration, login,
sessions, email verification, password reset, profile, admin account
operations), and two clients now need to consume it: the demonstration
[web client](https://github.com/ekoz-chat/client-web) and the server
[admin console](https://github.com/ekoz-chat/server/blob/main/backlog/features/server-administration/overview.md).

This feature is the SDK's first increment: enough surface to build and test
account creation end to end, nothing tied to conversations yet.

## Goal

Provide a typed TypeScript SDK that encapsulates all client to server REST access
for the identity surface, with token lifecycle handled internally, ready to be
consumed by `client-web` and the admin console through a local `npm link` (no
publish yet).

## Decisions made

- Scope of this increment: transport core plus the identity and setup endpoints
  the server already exposes. No SSE stream, no `/sync`, no conversation
  bindings; those come with the conversations increment.
- Transport core: a single configured HTTP client (base URL, protocol version
  header), `application/problem+json` parsing into typed errors, request context
  propagation.
- Token lifecycle is internal to the SDK: it stores the access and rotating
  refresh tokens, refreshes on 401, surfaces refresh reuse as a distinct error,
  and exposes hooks for the consumer to persist and restore the session.
- Endpoint bindings for this increment: `POST /setup/owner`; `auth/register`
  (all registration modes), `auth/login`, `auth/refresh`, `auth/logout`;
  `auth/verify-email` and resend; `auth/password-reset` request and confirm;
  `me` profile read and update, avatar, email change, username; `sessions`
  list / rename / revoke; `invitations`; the `admin/users`, `admin/owners` and
  `admin/username-requests` operations.
- End-to-end typing is aligned with the targeted protocol version; a discrepancy
  with `spec/docs/protocol/` is fixed in `spec`, not worked around here.
- Distribution during this increment: consumed via `npm link` / `bun link` from
  a sibling checkout. No npm publish, no changesets release until the surface
  stabilises. A `docs/technical/` page records the SDK packaging and protocol-version policy.
- Stack per the repo `AGENTS.md`: TypeScript, Bun, Vitest, no heavy runtime
  dependency.
- Public API shape: a single client instance built by `createClient(config)`,
  exposing resource namespaces (`sdk.auth.*`, `sdk.me.*`, `sdk.sessions.*`,
  `sdk.admin.*`, ...). Token and session state live on the instance.
- Error model: the SDK throws typed error classes (validation, problem+json
  categories, refresh-reuse as a distinct type). No `Result` return wrapper.
- Runtime targets: standard `fetch` on both browser and Bun/Node. The SDK stays
  storage-agnostic and uses no browser-only API, so it can back an SSR or CLI
  admin console as well as `client-web`.
- Session persistence: the consumer passes a storage adapter
  (`load` / `save` / `clear`, sync or async) to `createClient`; the SDK calls
  `save` on every token rotation and `clear` when the session ends.
- Session lifecycle: the client is also an event emitter (`on` / `off`) for
  lifecycle events, including session-invalid reasons (refresh reuse, failed
  refresh, logout), so a consumer can redirect to login without inspecting
  every call site.
- Build output: ESM + CJS from this increment on (both current consumers are
  ESM, CJS is shipped to avoid closing the door). Recorded in the packaging design page.

## Dependencies

- Server identity and profiles feature (shipped): the endpoints this SDK binds.
- [`spec/docs/protocol/`](https://github.com/ekoz-chat/spec/blob/main/docs/protocol/)
  for the wire contract and version range.

## Feature order

- The conversations increment will add the SSE stream, `/sync` reconciliation
  (jittered backoff) and the conversation bindings on top of this core.
- [Web client foundations](https://github.com/ekoz-chat/client-web/blob/main/backlog/features/web-client-foundations/overview.md)
  and the
  [admin console](https://github.com/ekoz-chat/server/blob/main/backlog/features/server-administration/overview.md)
  consume this increment.
